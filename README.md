# Gemini Docstrings Writer

Generate high-quality, context-aware docstrings for your code in multiple languages using Google's Gemini models, right within VS Code.

![Demo](https://raw.githubusercontent.com/amburgao/aidocswriter/main/assets/demo.gif)

## Features

- **AI-Powered Documentation**: Leverages the power of Google's Gemini models to generate accurate and descriptive docstrings.
- **Multi-Language Support**: Out-of-the-box support for Python and PowerShell, with an easily extensible architecture.
- **Context-Aware Generation**:
  - **Cursor-Based**: Simply place your cursor inside a function or class and run the command.
  - **Selection-Based**: Highlight a specific block of code to generate a docstring for it.
  - **Module-Level**: Generate a docstring for an entire file by placing the cursor at the very beginning.
- **Customizable Models**: Choose from a list of available Gemini models to balance speed and quality.
- **Seamless Integration**: A dedicated status bar item allows you to see the current model and switch between models on the fly.

## Requirements

You need a Google Gemini API key to use this extension. You can obtain one for free from [Google AI Studio](https://aistudio.google.com/app/apikey).

## Extension Settings

This extension contributes the following settings to your VS Code `settings.json`:

- `aidocswriter.apiKey`: Your Google Gemini API key.
- `aidocswriter.model`: The Gemini model to use for generation. You can choose from a dropdown list of supported models.

## Usage

1. **Get an API Key**: Go to [Google AI Studio](https://aistudio.google.com/app/apikey) and create an API key.
2. **Configure the Extension**:
    - Open VS Code settings (File > Preferences > Settings or `Ctrl+,`).
    - Search for "aidocswriter".
    - Enter your API key in the `aidocswriter.apiKey` field.
    - (Optional) Select your preferred model from the `aidocswriter.model` dropdown.
3. **Generate a Docstring**:
    - Open a Python or PowerShell file.
    - Place your cursor inside a function/class, select a block of code, or place the cursor at the top of the file.
    - Open the Command Palette (`Ctrl+Shift+P`).
    - Run the command **"Gemini Docstrings: Generate Docstring"**.
4. **Change Model**:
    - Click the `$(chip) gemini-...` text in the status bar.
    - Select a new model from the quick pick menu.

## Release Notes

See the [CHANGELOG.md](CHANGELOG.md) for detailed release notes.

## License

This extension is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.**
