# TypeScript Plugin - Prettify Type Tree

This package provides the TypeScript Language Service Plugin that powers the [Prettify TS](https://marketplace.visualstudio.com/items?itemName=MylesMurphy.prettify-ts) VSCode extension. It enables structured type analysis, enabling improved and customizable type previews in editor hover tooltips.


## ✨ Features

* Recursively traverses TypeScript types and builds a **tree-like representation**
* Supports:

  * Unions and intersections
  * Tuples and arrays (readonly or mutable)
  * Generic types and inference (e.g., conditional types with `infer`)
  * Function signatures (with rest and optional parameters)
  * Circular references (auto-detected and handled)
* Configurable via plugin settings passed from the extension
* Used by the extension to format hover results in a clean and human-readable way


## Architecture

The plugin hijacks the TypeScript language service API by overriding `getCompletionsAtPosition` to add a **side channel** for extracting type metadata.

When a hover is triggered in the extension, the plugin returns metadata about the hovered node in a `TypeInfo` object rather than traditional completions.


## `TypeInfo` Response Format

The plugin returns rich type information to the client through a structured object:

```ts
/**
 * Type Tree Object Properties
 */
export type TypeProperty = {
  name: string;
  optional: boolean;
  readonly: boolean;
  type: TypeTree;
};

/**
 * Type Tree Function Parameters
 */
export type TypeFunctionParameter = {
  name: string;
  optional: boolean;
  isRestParameter: boolean;
  type: TypeTree;
};

/**
 * Type Tree Function Signatures
 */
export type TypeFunctionSignature = {
  returnType: TypeTree;
  parameters: TypeFunctionParameter[];
};

/**
 * TypeTree is a tree representation of a TypeScript type.
 * Discriminated by the `kind` field.
 */
export type TypeTree = { typeName: string } & (
  | { kind: "union"; excessMembers: number; types: TypeTree[] }
  | { kind: "object"; excessProperties: number; properties: TypeProperty[] }
  | { kind: "tuple"; readonly: boolean; elementTypes: TypeTree[] }
  | { kind: "array"; readonly: boolean; elementType: TypeTree }
  | {
      kind: "function";
      excessSignatures: number;
      signatures: TypeFunctionSignature[];
    }
  | { kind: "generic"; arguments: TypeTree[] }
  | { kind: "enum"; member: string }
  | { kind: "primitive" } // string, number, boolean, symbol, bigint, undefined, null, void, never, any
  | { kind: "reference" } // Named types like classes, interfaces, type aliases, etc. when maxDepth is reached
);

/**
 * TypeInfo contains the type information of a TypeScript node.
 */
export type TypeInfo = {
  typeTree: TypeTree;
  declaration: string;
  name: string;
};

```

## Configuration

The plugin behavior is controlled via settings passed by the extension.

## Usage

This plugin is **not meant to be installed or used independently**. It is packaged and activated by the [Prettify TS extension](https://marketplace.visualstudio.com/items?itemName=MylesMurphy.prettify-ts).

## Development Notes

* The Prettify extension registers this plugin in its `package.json` under `typescriptServerPlugins`

```json
"typescriptServerPlugins": [
  {
    "name": "@prettify-ts/typescript-plugin",
    "enableForWorkspaceTypeScriptVersions": true
  }
]
```

The extension and plugin communicate internally via the `getCompletionsAtPosition` override to pass metadata back to the client.

## License

[MIT](../LICENSE)
