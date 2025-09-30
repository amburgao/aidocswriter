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

// --- Constants for configuration and commands ---
const EXTENSION_CONFIG_KEY = 'geminiDoc';
const API_ENDPOINT_KEY = 'apiEndpoint';
const API_KEY_KEY = 'apiKey';
const COMMAND_ID = 'aidocswriter.generateDocstring';

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

  if (editor.document.languageId !== 'python') {
    vscode.window.showWarningMessage('This command is intended for Python files.');
    return;
  }

  try {
    // 1. Get configuration
    const config = vscode.workspace.getConfiguration(EXTENSION_CONFIG_KEY);
    const endpoint = config.get<string>(API_ENDPOINT_KEY);
    const apiKey = config.get<string>(API_KEY_KEY);

    if (!endpoint || !apiKey) {
      vscode.window.showErrorMessage(`Please set '${EXTENSION_CONFIG_KEY}.${API_ENDPOINT_KEY}' and '${EXTENSION_CONFIG_KEY}.${API_KEY_KEY}' in your settings.`);
      return;
    }

    // 2. Get the code to document from the editor
    const codeContext = getCodeToDocument(editor);
    if (!codeContext) {
      vscode.window.showErrorMessage('Could not determine the code to document. Please select a function/class or place your cursor inside one.');
      return;
    }

    // If the file is empty and it's a module-level docstring, return the hardcoded docstring.
    if (editor.document.getText().trim() === '' && codeContext.isModuleLevel) {
      await insertDocstring(editor, '"""Generic __init__.py."""', codeContext);
      vscode.window.showInformationMessage('Docstring generated successfully!');
      return;
    }

    // 3. Build the prompt for the API
    const prompt = buildPrompt(codeContext.code, codeContext.isModuleLevel);

    // 4. Call the API to get the docstring
    const docstring = await callGeminiAPI(endpoint, apiKey, prompt);

    // 5. Insert the docstring into the editor
    await insertDocstring(editor, docstring, codeContext);

    vscode.window.showInformationMessage('Docstring generated successfully!');
  } catch (error) {
    // Display a user-friendly error message
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    vscode.window.showErrorMessage(`Error generating docstring: ${errorMessage}`);
  }
}

/**
 * Determines the relevant code block (module, function, or class) to document
 * based on the user's cursor position or selection.
 * @param editor The active text editor.
 * @returns A CodeContext object or null if no valid code block is found.
 */
function getCodeToDocument(editor: vscode.TextEditor): CodeContext | null {
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

    // Find the start of the function/class definition
    while (startLineNum >= 0) {
      const lineText = doc.lineAt(startLineNum).text;
      if (/^\s*((async)?\s*def|class)\s+/.test(lineText)) {
        break;
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
async function insertDocstring(editor: vscode.TextEditor, docstring: string, context: CodeContext) {
  await editor.edit(editBuilder => {
    if (context.isModuleLevel) {
      // For module-level, insert after shebang or at the top
      const firstLine = editor.document.lineAt(0).text;
      const insertLine = firstLine.startsWith('#!') ? 1 : 0;
      const insertPos = new vscode.Position(insertLine, 0);
      editBuilder.insert(insertPos, `${docstring}\n\n`);
    } else {
      // For functions/classes, find the end of the signature to insert after
      let signatureEndLine = context.definitionLine;
      while (
        signatureEndLine < editor.document.lineCount - 1 &&
        !editor.document.lineAt(signatureEndLine).text.includes(':')
      ) {
        signatureEndLine++;
      }

      const insertPos = new vscode.Position(signatureEndLine + 1, 0);
      const bodyIndent = context.indentation + '    '; // Standard 4-space indent
      const indentedDocstring = docstring
        .split(/\r?\n/)
        .map(line => (line.trim() === '' ? '' : bodyIndent + line))
        .join('\n') + '\n';

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
function buildPrompt(code: string, isModuleLevel: boolean): string {
  const subject = isModuleLevel ? 'module' : 'function or class';
  return `Write a Python docstring for the following ${subject}.
- Use triple quotes.
- Follow Google's style for Python docstrings.
- Do not exceed 88 characters per line, including indentation.

${isModuleLevel ? 'Module' : 'Function/class'} code:
${code}

- If there is no code provided above, the docstring MUST be 'Generic __init__.py.', a single line, without description, nor summary.
- The above rule is important, if no code, the docstring MUST be, only, really, ONLY 'Generic __init__.py.' triple quoted.

Output only the docstring including the triple quotes.`;
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

  // Clean up markdown fences that the model might add
  return docstring.replace(/```(?:python\s*)?/g, '').trim();
}

/**
 * Deactivation function for the extension.
 * This is called when the extension is deactivated.
 */
export function deactivate() {}