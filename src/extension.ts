/**
 * This file contains the main activation logic for the Python Docstring Generator extension.
 * 
 * The code has been refactored to improve structure, readability, and type safety.
 * Key improvements include:
 * - Centralized and more robust configuration and error handling.
 * - Breaking down the main logic into smaller, single-responsibility methods.
 * - Introducing TypeScript interfaces for API payloads and internal state for better type safety.
 */
import * as vscode from 'vscode';
import fetch, { Response } from 'node-fetch'; // Using node-fetch v2 for CommonJS compatibility

// --- Language-specific configurations ---

/**
 * Defines the configuration for a specific language.
 */
interface LanguageConfig {
  languageIds: string[];
  definitionKeywords: RegExp;
  commentStyle: {
    start: string;
    end: string;
    linePrefix?: string;
  };
  promptSettings: {
    subject: string;
    style: string;
    rules: string[];
    emptyCodeResponse: string;
  };
}

/**
 * A map of language configurations, keyed by a representative language ID.
 */
const LANGUAGE_CONFIGS: Map<string, LanguageConfig> = new Map([
  ['python', {
    languageIds: ['python'],
    definitionKeywords: /^\s*((async\s)?def|class)\s+/,
    commentStyle: {
      start: '"""',
      end: '"""',
    },
    promptSettings: {
      subject: 'function or class',
      style: "Google's style for Python docstrings",
      rules: [
        'Use triple quotes.',
        'Do not exceed 88 characters per line, including indentation.',
      ],
      emptyCodeResponse: 'Generic __init__.py.',
    },
  }],
  ['powershell', {
    languageIds: ['powershell'],
    definitionKeywords: /^\s*(function|filter|workflow|configuration)\s+([a-zA-Z0-9_-]+)(?:\s*\(.*?\))?\s*/i,
    commentStyle: {
      start: '<#',
      end: '#>',
      linePrefix: '  ',
    },
    promptSettings: {
      subject: 'function',
      style: 'PowerShell comment-based help',
      rules: [
        'Use <# and #> block comment.',
        'Include .SYNOPSIS, .DESCRIPTION, .PARAMETER, .EXAMPLE, and .NOTES sections.',
        'Block MUST have ONLY one <#, at the start, and ONLY one #>, at the end.'
      ],
      emptyCodeResponse: '.SYNOPSIS\n  A brief summary of the function.',
    },
  }],
]);

// --- Constants for configuration and commands ---
const EXTENSION_CONFIG_KEY = 'aidocswriter';
const MODEL_KEY = 'model';
const API_KEY_KEY = 'apiKey';
const COMMAND_ID = 'aidocswriter.generateDocstring';
const CHANGE_MODEL_COMMAND_ID = 'aidocswriter.changeModel';

let modelStatusBarItem: vscode.StatusBarItem;
let availableModels: string[] = [];

// --- Type definitions for API interaction ---

/**
 * Defines the structure for the Gemini API request body.
 */
interface GeminiRequestBody {
  contents: {
    parts: {
      text: string;
    }[];
  }[];
}

/**
 * Defines the structure for a successful Gemini API response.
 */
interface GeminiResponse {
  candidates: {
    content: {
      parts: {
        text: string;
      }[];
    };
  }[];
}

/**
 * Defines the structure for an error response from the Gemini API.
 */
interface GeminiErrorResponse {
  error: {
    message: string;
  };
}

/**
 * Represents the code selection to be documented.
 */
interface CodeContext {
  code: string;
  isModuleLevel: boolean;
  range: vscode.Range;
  indentation: string;
  definitionLine: number;
}

/**
 * Main activation function for the VS Code extension.
 * This is called once when the extension is activated.
 */
export function activate(context: vscode.ExtensionContext) {
  // Register the command that will trigger the docstring generation.
  const disposable = vscode.commands.registerCommand(COMMAND_ID, generateDocstring);
  context.subscriptions.push(disposable);

  // Get the list of available models from package.json
  try {
    availableModels = context.extension.packageJSON.contributes.configuration.properties[`${EXTENSION_CONFIG_KEY}.${MODEL_KEY}`].enum;
  } catch (error) {
    console.error('Could not read available models from package.json', error);
  }

  // Register the command to change the model
  context.subscriptions.push(
    vscode.commands.registerCommand(CHANGE_MODEL_COMMAND_ID, changeModel)
  );

  // Create and show the status bar item
  modelStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  modelStatusBarItem.command = CHANGE_MODEL_COMMAND_ID;
  context.subscriptions.push(modelStatusBarItem);

  // Update status bar item initially and on config change
  updateStatusBar();
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration(EXTENSION_CONFIG_KEY)) {
        updateStatusBar();
      }
    })
  );
}

/**
 * Command handler for changing the AI model.
 */
async function changeModel() {
  const config = vscode.workspace.getConfiguration(EXTENSION_CONFIG_KEY);

  const selectedModel = await vscode.window.showQuickPick(availableModels, {
    placeHolder: 'Select a Gemini model',
  });

  if (selectedModel) {
    await config.update(MODEL_KEY, selectedModel, vscode.ConfigurationTarget.Workspace);
    vscode.window.showInformationMessage(`Switched to model: ${selectedModel}`);
  }
}

/**
 * Updates the status bar item with the current model.
 */
function updateStatusBar() {
  const config = vscode.workspace.getConfiguration(EXTENSION_CONFIG_KEY);
  const model = config.get<string>(MODEL_KEY);
  if (model) {
    modelStatusBarItem.text = `$(chip) ${model}`;
    modelStatusBarItem.tooltip = `Gemini Model: ${model} (Click to change)`;
    modelStatusBarItem.show();
  } else {
    modelStatusBarItem.hide();
  }
}

/**
 * Command handler for generating a docstring.
 * Orchestrates the entire process from user action to inserting the docstring.
 */
async function generateDocstring() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active editor found.');
    return;
  }

  const languageId = editor.document.languageId;
  const languageConfig = Array.from(LANGUAGE_CONFIGS.values()).find(config =>
    config.languageIds.includes(languageId)
  );

  if (!languageConfig) {
    vscode.window.showWarningMessage(`Docstring generation is not supported for '${languageId}' files.`);
    return;
  }

  try {
    // 1. Get configuration
    const config = vscode.workspace.getConfiguration(EXTENSION_CONFIG_KEY);
    const model = config.get<string>(MODEL_KEY);
    const apiKey = config.get<string>(API_KEY_KEY);

    if (!model || !apiKey) {
      vscode.window.showErrorMessage(`Please set '${EXTENSION_CONFIG_KEY}.${MODEL_KEY}' and '${EXTENSION_CONFIG_KEY}.${API_KEY_KEY}' in your settings.`);
      return;
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    // 2. Get the code to document from the editor
    const codeContext = getCodeToDocument(editor, languageConfig);
    if (!codeContext) {
      vscode.window.showErrorMessage('Could not determine the code to document. Please select a function/class or place your cursor inside one.');
      return;
    }

    // If the file is empty and it's a module-level docstring, return the hardcoded docstring.
    if (editor.document.getText().trim() === '' && codeContext.isModuleLevel) {
      await insertDocstring(editor, languageConfig.promptSettings.emptyCodeResponse, codeContext, languageConfig);
      vscode.window.showInformationMessage('Docstring generated successfully!');
      return;
    }

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Window,
      title: 'Generating docstring...',
    }, async () => {
      // 3. Build the prompt for the API
      const prompt = buildPrompt(codeContext.code, codeContext.isModuleLevel, languageConfig);

      // 4. Call the API to get the docstring
      const docstring = await callGeminiAPI(endpoint, apiKey, prompt);

      // 5. Insert the docstring into the editor
      await insertDocstring(editor, docstring, codeContext, languageConfig);
    });

    vscode.window.showInformationMessage('Docstring generated successfully!');
  } catch (error) {
    // Display a user-friendly error message
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    vscode.window.showErrorMessage(`Error generating docstring: ${errorMessage}`);
  }
}

/**
 * Gets the language configuration for the given language ID.
 * @param languageId The language ID to look up.
 * @returns The LanguageConfig object for the language, or undefined if not found.
 */
function getLanguageConfig(languageId: string): LanguageConfig | undefined {
  for (const config of LANGUAGE_CONFIGS.values()) {
    if (config.languageIds.includes(languageId)) {
      return config;
    }
  }
  return undefined;
}

/**
 * Determines the relevant code block (module, function, or class) to document
 * based on the user's cursor position or selection.
 * @param editor The active text editor.
 * @param languageConfig The configuration for the current language.
 * @returns A CodeContext object or null if no valid code block is found.
 */
function getCodeToDocument(editor: vscode.TextEditor, languageConfig: LanguageConfig): CodeContext | null {
  const doc = editor.document;
  const selection = editor.selection;

  // Case 1: Module-level docstring (cursor at the start of the file)
  if (selection.isEmpty && selection.active.line === 0 && selection.active.character === 0) {
    return {
      code: doc.getText(),
      isModuleLevel: true,
      range: new vscode.Range(doc.getWordRangeAtPosition(new vscode.Position(0, 0))?.start || new vscode.Position(0, 0), doc.lineAt(doc.lineCount - 1).range.end),
      indentation: '',
      definitionLine: 0,
    };
  }

  // Case 2: User has selected a block of code
  if (!selection.isEmpty) {
    const selectedText = doc.getText(selection);
    const defLine = doc.lineAt(selection.start.line);
    const indentation = defLine.text.match(/^(\s*)/)?.[1] || '';
    return {
      code: selectedText,
      isModuleLevel: false,
      range: selection,
      indentation,
      definitionLine: selection.start.line,
    };
  }

  // Case 3: Cursor is inside a function or class, but nothing is selected
  if (selection.isEmpty) {
    const cursorLineNum = selection.active.line;
    let startLineNum = cursorLineNum;
    let lastLineNum = cursorLineNum;

    // Find the start of the function/class definition
    while (startLineNum >= 0) {
      const lineText = doc.lineAt(startLineNum).text;
      if (languageConfig.definitionKeywords.test(lineText)) {
        break;
      }
      if (! lineText.endsWith(',') && ! lineText.endsWith(':') && lineText.trim().length > 0 )  {
            throw new Error('Could not find a definition.');
      }
      startLineNum--;
    }
    


    if (startLineNum < 0) {
      return null; // No definition found above the cursor
    }

    const defLine = doc.lineAt(startLineNum);
    const defIndent = defLine.firstNonWhitespaceCharacterIndex;
    let endLineNum = startLineNum + 1;

    // Find the end of the function/class block
    while (endLineNum < doc.lineCount) {
      const line = doc.lineAt(endLineNum);
      // Stop if we hit a line that is less or equally indented and is not empty
      if (!line.isEmptyOrWhitespace && line.firstNonWhitespaceCharacterIndex <= defIndent) {
        break;
      }
      endLineNum++;
    }

    const range = new vscode.Range(startLineNum, 0, endLineNum, 0);
    const indentation = defLine.text.match(/^(\s*)/)?.[1] || '';
    return {
      code: doc.getText(range),
      isModuleLevel: false,
      range,
      indentation,
      definitionLine: startLineNum,
    };
  }

  return null;
}

/**
 * Inserts the generated docstring into the editor at the correct position.
 * @param editor The active text editor.
 * @param docstring The docstring to insert.
 * @param context The context of the code being documented.
 */
async function insertDocstring(editor: vscode.TextEditor, docstring: string, context: CodeContext, languageConfig: LanguageConfig) {
  await editor.edit(editBuilder => {
    if (context.isModuleLevel) {
      // For module-level, insert after shebang or at the top
      const firstLine = editor.document.lineAt(0).text;
      const insertLine = firstLine.startsWith('#!') ? 1 : 0;
      const insertPos = new vscode.Position(insertLine, 0);
      editBuilder.insert(insertPos, `${languageConfig.commentStyle.start}\n${docstring}\n${languageConfig.commentStyle.end}\n\n`);
    } else {
      // For functions/classes, find the end of the signature to insert after
      let signatureEndLine = context.definitionLine;

      // Determine the end of the signature based on language
      if (languageConfig.languageIds.includes('python')) {
        while (
          signatureEndLine < editor.document.lineCount - 1 &&
          !editor.document.lineAt(signatureEndLine).text.includes(':')
        ) {
          signatureEndLine++;
        }
      } else if (languageConfig.languageIds.includes('powershell')) {
        while (
          signatureEndLine < editor.document.lineCount - 1 &&
          !editor.document.lineAt(signatureEndLine).text.includes('{')
        ) {
          signatureEndLine++;
        }
      }

      const insertPos = new vscode.Position(signatureEndLine + 1, 0);
      const bodyIndent = context.indentation + '    '; // Standard 4-space indent
      const commentLinePrefix = languageConfig.commentStyle.linePrefix || '';

      const indentedDocstring = 
        `${bodyIndent}${languageConfig.commentStyle.start}\n` +
        docstring
          .split(/\r?\n/)
          .map(line => (line.trim() === '' ? '' : `${bodyIndent}${commentLinePrefix}${line}`))
          .join('\n') +
        `\n${bodyIndent}${languageConfig.commentStyle.end}\n\n`;

      editBuilder.insert(insertPos, indentedDocstring);
    }
  });
}

/**
 * Builds the prompt to be sent to the Gemini API.
 * @param code The source code to be documented.
 * @param isModuleLevel Whether the code is a module.
 * @returns The formatted prompt string.
 */
function buildPrompt(code: string, isModuleLevel: boolean, languageConfig: LanguageConfig): string {
  const subject = isModuleLevel ? 'module' : languageConfig.promptSettings.subject;
  const style = languageConfig.promptSettings.style;
  const rules = languageConfig.promptSettings.rules.map(rule => `- ${rule}`).join('\n');
  const emptyCodeResponseRule = languageConfig.promptSettings.emptyCodeResponse;

  return `Write a ${languageConfig.languageIds[0]} docstring for the following ${subject}.
- Use ${style}.
${rules}

${isModuleLevel ? 'Module' : 'Function/class'} code:
${code}

- If there is no code provided above, the docstring content MUST be '${emptyCodeResponseRule}'.

Output only the docstring content, not including the comment markers. CRITICALLY IMPORTANT: Do NOT repeat the original code in your response.`;
}

/**
 * Calls the Gemini API to generate a docstring.
 * @param endpoint The API endpoint URL.
 * @param apiKey The API key for authentication.
 * @param prompt The prompt containing the code to document.
 * @returns The generated docstring text.
 */
async function callGeminiAPI(endpoint: string, apiKey: string, prompt: string): Promise<string> {
  const body: GeminiRequestBody = {
    contents: [{ parts: [{ text: prompt }] }],
  };

  const response: Response = await fetch(`${endpoint}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API request failed with status ${response.status}: ${errorText}`);
  }

  const json = (await response.json()) as GeminiResponse | GeminiErrorResponse;

  if ('error' in json) {
    throw new Error(`API returned an error: ${json.error.message}`);
  }

  const candidate = json.candidates?.[0];
  const docstring = candidate?.content?.parts?.[0]?.text;

  if (typeof docstring !== 'string') {
    throw new Error('Unexpected API response format. Could not extract docstring.');
  }

  // Clean up markdown fences and comment markers that the model might add
  let cleanedDocstring = docstring.replace(/```(?:python|powershell)\s*|```/g, '').trim();

  if (cleanedDocstring.startsWith('"""') && cleanedDocstring.endsWith('"""')) {
    cleanedDocstring = cleanedDocstring.substring(3, cleanedDocstring.length - 3).trim();
  }

  // For PowerShell, the model is more likely to add extra content.
  // 1. Remove the leading comment marker if it exists.
  if (cleanedDocstring.startsWith('<#')) {
    cleanedDocstring = cleanedDocstring.substring(2).trim();
  }

  // 2. Find the last closing comment marker and truncate everything after it.
  // This helps remove duplicated code that the model might append.
  const lastClosingIndex = cleanedDocstring.lastIndexOf('#>');
  if (lastClosingIndex !== -1) {
    cleanedDocstring = cleanedDocstring.substring(0, lastClosingIndex).trim();
  }


  return cleanedDocstring;
}

/**
 * Deactivation function for the extension.
 * This is called when the extension is deactivated.
 */
export function deactivate() {}