# Prettify TypeScript

Prettify TS is a Visual Studio Code extension that enhances your TypeScript development experience. It provides hover information for TypeScript types, classes, interfaces, and more, formatted in a more readable way.

## Features

- **Hover Information**: Just hover over a type, class, interface, etc., and you'll see a prettified version of its declaration in the hover panel.

- **Sidebar**: Open the Prettify TS sidebar to view menu options and types.

## Usage

1. Install the extension from the Visual Studio Code marketplace.
2. Open a TypeScript file in Visual Studio Code.
3. Hover over a type, class, interface, etc., to see the prettified declaration in a hover panel.
4. Or, open the Prettify TS option on the sidebar to view menu options and types.

## Toggle

Use the `Prettify TS: Toggle Hover` command to enable or disable the hover information feature provided by the Prettify-ts extension.

Use the `Prettify TS: Toggle View Nested Types` command to show or hide nested type information.

## Example

![Example Photo 1](./assets/example1.png)
![Example Photo 2](./assets/example2.png)
![Example Photo 3](./assets/example3.png)

## Why is the preview loading slowly, even for simple types?

Prettify TS works by creating and loading the entire Abstract Syntax Tree (AST) of the file into memory. This is true even for simple types. The time taken can increase with the complexity and size of the types in the file due to the computation involved in parsing and traversing the AST.

## Disclaimer

Prettify TS is currently, at best, a working proof of concept. The project is still in its early stages of development and may have limitations or bugs.

If you encounter any problems or have any feature requests, please feel free to open an issue on the project's GitHub repository.

## Contributing

Contributions are welcome! Please open an issue if you encounter any problems or have a feature request.

## Note from the developer:

Thanks for trying my extension! This is my first VSCode extension, and also my first time working with the TypeScript AST (Abstract Syntax Tree). Any code optimizations would be greatly appreciated.

Special thanks to [@mattpocock](https://github.com/mattpocock) for the Prettify Type, and to [@willbattel](https://github.com/willbattel) for Beta testing, providing feedback, and overall improving this tool!

## License

MIT