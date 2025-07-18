# Prettify TypeScript

**Get useful type information where you need it.**

[![Installs](https://img.shields.io/vscode-marketplace/i/MylesMurphy.prettify-ts)](https://marketplace.visualstudio.com/items?itemName=MylesMurphy.prettify-ts)
[![GitHub Repo stars](https://img.shields.io/github/stars/mylesmmurphy/prettify-ts?style=social)](https://github.com/mylesmmurphy/prettify-ts)
[![Version](https://img.shields.io/vscode-marketplace/v/MylesMurphy.prettify-ts)](https://marketplace.visualstudio.com/items?itemName=MylesMurphy.prettify-ts)
[![License](https://img.shields.io/github/license/mylesmmurphy/prettify-ts)](https://github.com/mylesmmurphy/prettify-ts/blob/main/LICENSE)

## ✨ Overview

Prettify TS is a Visual Studio Code extension that enhances your TypeScript development experience. It provides better hover previews for TypeScript types, classes, interfaces, and more, formatted in a more readable and highly configurable way.

## Example

<img src="./assets/example.png" width="300" alt="Example Screenshot" />

## Watch This

<a href="https://www.youtube.com/shorts/9GRzNXKVa2o" target="_blank">
  <img src="https://raw.githubusercontent.com/mylesmmurphy/prettify-ts/refs/heads/main/assets/demo-preview.png" alt="Watch Demo Video" width="500" />
</a>

## Features

* **Prettified Type Hovers** – Enhanced and formatted hover displays for interfaces, aliases, functions, unions, arrays, and more.
* **Toggle Command** – Use `Toggle Preview` to quickly enable or disable prettified previews.
* **Copy Commands** – Use `Copy Prettified Type` or `Copy Fully Prettified Type` to grab the prettified result to your clipboard.
* **Highly Configurable** – Fine-tune output style, max depth, expansion behavior, and character limits.

## Prerequisites for Vue Projects

To use Prettify TS with Vue projects, you need:

* **Vue.Volar extension** version **2.0.16** or higher
* **For Volar v2**: Add the following configuration to your VSCode settings:
  ```json
  {
    "vue.server.hybridMode": true
  }
  ```
* **For Volar v3**: No additional configuration required

## Extension Settings

| Setting                                 | Description                                                                                                                 |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Type Indentation**                    | Controls the indentation level of types.                                                                                    |
| **Max Depth**                           | Sets the maximum depth to which types should be expanded.                                                                   |
| **Max Properties**                      | Limits the number of properties displayed for each type. Excess properties will be displayed with ellipsis.                 |
| **Max Sub-Properties**                  | Limits the number of sub-properties (on nested objects) displayed for each property. Excess will be shown as ellipsis.      |
| **Max Union Members**                   | Limits the number of union members shown per union. Excess members will be displayed with ellipsis.                         |
| **Max Function Signatures**             | Limits the number of function signatures shown. Excess signatures will be replaced with ellipsis.                           |
| **Unwrap Functions**                    | If enabled, expands function parameter and return types.                                                                    |
| **Unwrap Arrays**                       | If enabled, expands the element types of arrays.                                                                            |
| **Unwrap Generic Arguments Type Names** | A list of generic type names whose arguments should be unwrapped instead of using their resolved output (e.g., `Promise`).  |
| **Hide Private Properties**             | If enabled, hides properties or methods marked private.                                                                     |
| **Skipped Type Names**                  | List of type names that should not be expanded. Generics are supported and replaced with ellipses (e.g., `ZodObject<...>`). |
| **Max Characters**                      | Sets a maximum character limit for output. If exceeded, the result will be truncated.                                       |

## Sidebar View (Deprecated)

As of v0.1.0, Prettify TS focuses on hover previews only and no longer includes a sidebar Type View.

If you're looking for a sidebar-based type explorer, check out:

* [TypeScript Explorer](https://marketplace.visualstudio.com/items?itemName=mxsdev.typescript-explorer)
* [ts-type-expand](https://marketplace.visualstudio.com/items?itemName=kimuson.ts-type-expand)

## Contributing

Bug reports, suggestions, and pull requests are welcome. Visit [GitHub Issues](https://github.com/mylesmmurphy/prettify-ts/issues) to contribute.

## Acknowledgements

* [@mattpocock](https://github.com/mattpocock) – original inspiration via Prettify Type
* [@willbattel](https://github.com/willbattel) – early beta testing and feedback
* [@mattiamanzati](https://github.com/mattiamanzati) – TypeScript compiler insights

## License

[MIT](https://github.com/mylesmmurphy/prettify-ts/blob/main/LICENSE)
