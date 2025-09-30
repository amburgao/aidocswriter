# Change Log

All notable changes to the "aidocswriter" extension will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/) and this project adheres to [Semantic Versioning](http://semver.org/).

## [Unreleased]

## [0.0.1] - 2024-07-26

### Added

- Initial release of the Python Docstring Generator AI.
- Feature: Generate docstrings for Python functions and classes by placing the cursor within their scope.
- Feature: Generate docstrings for a selected block of Python code.
- Feature: Generate module-level docstrings by placing the cursor at the start of a file.
- Command: `Python Docstring AI: Generate Docstring` available in the command palette.
- Configuration: Set your Google Gemini API key and endpoint via VS Code settings (`aidocswriter.apiKey` and `aidocswriter.apiEndpoint`).
- Error handling for missing API configurations and API request failures.
