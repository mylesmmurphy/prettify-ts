# Prettify TypeScript

**Get useful type information where you need it**

[![Installs](https://img.shields.io/vscode-marketplace/d/MylesMurphy.prettify-ts.svg)](https://marketplace.visualstudio.com/items?itemName=MylesMurphy.prettify-ts)
[![GitHub Repo stars](https://img.shields.io/github/stars/mylesmmurphy/prettify-ts?style=social)](https://github.com/mylesmmurphy/prettify-ts)
[![Marketplace](https://img.shields.io/vscode-marketplace/v/MylesMurphy.prettify-ts.svg)](https://marketplace.visualstudio.com/items?itemName=username.repo)
[![License](https://img.shields.io/github/license/mylesmmurphy/prettify-ts)](https://github.com/mylesmmurphy/prettify-ts/blob/main/LICENSE)

Prettify TS is a Visual Studio Code extension that enhances your TypeScript development experience. It provides better hover previews for TypeScript types, classes, interfaces, and more, formatted in a more readable and highly configurable way.

## Example
![Example Photo](./assets/example.png)

## Features

- **Hover Information**: Just hover over a type, class, interface, etc., and you'll see a prettified version in the hover panel.

## Extension Settings

Prettify TS can be configured to customize your TypeScript development experience. Visual Studio Code extension settings can be found by navigating to the Settings editor and searching for the specific extension by name.

The following settings are available:

- **Type Indentation**: Controls the indentation level of types.
- **Max Depth**: Sets the maximum depth to which types should be expanded.
- **Max Properties**: Limits the number of properties displayed for each type. Excess properties will be displayed with ellipsis.
- **Max Sub-Properties**: Limits the number of sub-properties (properties on nested objects) displayed for each property. Excess properties will be displayed with ellipsis.
- **Unwrap Functions**: If enabled, function parameters and return types will be expanded.
- **Unwrap Arrays**: If enabled, array element types will be expanded.
- **Unwrap Promises**: If enabled, Promise resolved types will be expanded.
- **Skipped Type Names**: A list of type names that should not be expanded.
- **Max Characters**: Sets the maximum number of characters for the prettified output. If the output exceeds this limit, it will be truncated.

## Contributing

Contributions are welcome! Please open an issue if you encounter any problems or have a feature request.

## Acknowledgements

Thank you for trying out this extension! A special mention to [@mattpocock](https://github.com/mattpocock) for the Prettify Type, [@willbattel](https://github.com/willbattel) for beta testing, and [@mattiamanzati](https://github.com/mattiamanzati) for their TypeScript expertise.

## License

MIT
