# Prettify TypeScript

**Get useful type information where you need it.**

[![Installs](https://badgen.net/vs-marketplace/i/MylesMurphy.prettify-ts)](https://marketplace.visualstudio.com/items?itemName=MylesMurphy.prettify-ts)
[![GitHub Repo stars](https://img.shields.io/github/stars/mylesmmurphy/prettify-ts?style=social)](https://github.com/mylesmmurphy/prettify-ts)
[![Version](https://badgen.net/vs-marketplace/v/MylesMurphy.prettify-ts)](https://marketplace.visualstudio.com/items?itemName=MylesMurphy.prettify-ts)
[![License](https://badgen.net/static/license/MIT/blue)](https://github.com/mylesmmurphy/prettify-ts/blob/main/LICENSE)

Prettify TS replaces hard-to-read TypeScript hovers with fully resolved, nicely formatted types. Hover over a type, interface, class, function, or variable to see what it actually is, without chasing through intersections, mapped types, and generics.

<img src="./assets/example.png" width="300" alt="Prettified hover preview" />

## Watch This

<a href="https://www.youtube.com/shorts/9GRzNXKVa2o" target="_blank">
  <img src="https://raw.githubusercontent.com/mylesmmurphy/prettify-ts/refs/heads/main/assets/demo-preview.png" alt="Watch the demo video" width="500" />
</a>

## Features

* **Prettified hovers** for interfaces, type aliases, classes, functions, unions, arrays, and more.
* **Copy as TypeScript**: right-click and choose **Prettify → Copy Prettified Type** or **Copy Fully Prettified Type**. Copied output is valid TypeScript you can paste straight into your code.
* **Toggle Preview**: run **Prettify TS: Toggle Preview** from the Command Palette to switch prettified hovers on or off.
* **Configurable**: control depth, indentation, how much is shown, and which types are left as-is.
* **TypeScript, JavaScript, and Vue**: works in `.ts`, `.tsx`, `.js`, `.jsx`, and `.vue` files.

## Requirements

* VS Code **1.100.0** or newer.
* Works with the editor's bundled TypeScript or your workspace TypeScript.

### JavaScript projects

Hovers use TypeScript's inferred types and JSDoc annotations. For configured projects, include JavaScript files with `allowJs` in `tsconfig.json`, or use a `jsconfig.json`.

### Vue projects

* Install the [Vue - Official](https://marketplace.visualstudio.com/items?itemName=Vue.volar) extension, version **3.1.1** or newer. No extra configuration is needed.

## Extension Settings

All settings are under `prettify-ts.*` and can be overridden per language.

| Setting | Default | Description |
| --- | --- | --- |
| `enabled` | `true` | Turns prettified hovers on or off. **Toggle Preview** flips this. |
| `typeIndentation` | `4` | Spaces used to indent nested types. |
| `maxDepth` | `1` | How many levels of nested types to expand. |
| `maxProperties` | `1000` | Maximum properties shown in total, including nested ones. |
| `maxSubProperties` | `10` | Maximum properties shown on each nested object. |
| `maxUnionMembers` | `15` | Maximum members shown per union. |
| `maxFunctionSignatures` | `5` | Maximum overloads shown per function. |
| `unwrapFunctions` | `true` | Expands function parameter and return types. |
| `unwrapArrays` | `true` | Expands array element types. |
| `unwrapGenericArgumentsTypeNames` | `Promise`, `Set`, `Map`, `Observable` | Generic types whose arguments are expanded instead of the type itself. |
| `skippedTypeNames` | `Array`, `Date`, `Map`, `Set`, … | Types that are never expanded. Hovers show generics as `ZodObject<...>`; copies keep the arguments. |
| `hidePrivateProperties` | `true` | Hides private and protected members and JavaScript `#private` fields. |
| `treatUnderscoreAsPrivate` | `true` | Also hides `_underscore` members when `hidePrivateProperties` is on. |
| `maxCharacters` | `20000` | Maximum characters in a preview before it is cut off. Higher values are slower. |

To show public `_underscore` members while still hiding private and protected ones:

```json
{
  "prettify-ts.hidePrivateProperties": true,
  "prettify-ts.treatUnderscoreAsPrivate": false
}
```

## Large and recursive types

Very large or self-referencing types can't stall the TypeScript server: previews and copies have internal time and size limits well above normal use, and the output says when one is reached. Copied types mark omitted members with comments like `/* ... 3 more */`, so pasted output stays valid TypeScript.

If something goes wrong, check the **Prettify TS** output channel for details.

## Related Projects

Want to explore types in a sidebar tree? Check out:

* [TypeScript Explorer](https://marketplace.visualstudio.com/items?itemName=mxsdev.typescript-explorer)
* [ts-type-expand](https://marketplace.visualstudio.com/items?itemName=kimuson.ts-type-expand)

## Contributing

Bug reports, suggestions, and pull requests are welcome on [GitHub](https://github.com/mylesmmurphy/prettify-ts/issues).

## Acknowledgements

* [@mattpocock](https://github.com/mattpocock): original inspiration via Prettify Type
* [@willbattel](https://github.com/willbattel): early beta testing and feedback
* [@mattiamanzati](https://github.com/mattiamanzati): TypeScript compiler insights

## License

[MIT](https://github.com/mylesmmurphy/prettify-ts/blob/main/LICENSE)
