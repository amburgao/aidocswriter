# Python Docstring Generator AI

Generate Python docstrings for functions, classes, and modules using the Google Gemini API right within Visual Studio Code.

## Features

* **Automatic Code Detection**: Automatically detects the function, class, or module context based on your cursor's position.
* **Selection Support**: Generate docstrings for a specific block of selected code.
* **Module-Level Docstrings**: Easily create docstrings for an entire Python file by placing your cursor at the beginning of the file.
* **Configurable**: Set your own Gemini API endpoint and key through VS Code settings.

## Requirements

You need a Google Gemini API key to use this extension. You can obtain one from [Google AI Studio](https://aistudio.google.com/app/apikey).

## Extension Settings

This extension contributes the following settings:

* `aidocswriter.apiKey`: Your Google Gemini API key.
* `aidocswriter.apiEndpoint`: The API endpoint for the Gemini model. Defaults to `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent`.

To configure the settings, open your VS Code Settings (`Ctrl+,`), search for "aidocswriter", and enter your API key.

## Usage

1. Open a Python file (`.py`).
2. To generate a docstring, you can either:
    * Place your cursor inside a function or class definition.
    * Select a block of code you want to document.
    * Place your cursor at the very beginning of the file (line 1, column 1) to generate a module-level docstring.
3. Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P` on Mac).
4. Run the command: `Python Docstring AI: Generate Docstring`.
5. The generated docstring will be inserted at the correct position.

## Release Notes

See the [CHANGELOG.md](CHANGELOG.md) file for details on each release.

## License

This extension is licensed under the [MIT License](LICENSE).
