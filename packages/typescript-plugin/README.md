# TypeScript Plugin - Prettify Type Tree

This package provides the TypeScript Language Service Plugin that powers the [Prettify TS](https://marketplace.visualstudio.com/items?itemName=MylesMurphy.prettify-ts) VSCode extension. It runs inside TS Server (TypeScript 6 and earlier) and adds prettified type previews to TypeScript's own hovers.


## Features

* Recursively traverses TypeScript types and builds a **tree-like representation**
* Supports:

  * Unions and intersections
  * Tuples and arrays (readonly or mutable)
  * Generic types and inference (e.g., conditional types with `infer`)
  * Function signatures (with rest and optional parameters)
  * Circular references (auto-detected and handled)
* **Merged hovers**: the preview becomes part of TypeScript's quick info, so any editor that shows TypeScript hovers shows it
* Configurable through the extension's settings, or through `tsconfig.json`


## Architecture

The type tree is built by `@prettify-ts/core`, whose builder runs against this plugin's in-process compiler through a synchronous backend (and, in the extension, against the TypeScript 7 API through an asynchronous one). The plugin decorates two language service methods:

* `getQuickInfoAtPosition` merges the rendered preview into TypeScript's quick info. Editors show the display parts as a typescript code block and the documentation as markdown, so the preview is a single text display part, and anything moved out of the signature (TypeScript's own signature, the limits note) goes into the documentation as markdown. Vue files are left unchanged: Vue's own language server provides their hovers, and the extension adds a separate hover there.
* `getCompletionsAtPosition` keeps a **side channel** for the extension: a request whose trigger character is a Prettify request returns a `TypeInfo` object instead of completions. The extension uses it for copy commands and separate hovers.


## `TypeInfo` Response Format

The plugin returns rich type information to the client through a structured object, defined in [`packages/core/src/types.ts`](../core/src/types.ts):

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

/** A tuple slot retains its label, cardinality, and spread syntax. */
export type TypeTupleElement = {
  name?: string;
  optional: boolean;
  rest: boolean;
  type: TypeTree;
};

/**
 * TypeTree is a tree representation of a TypeScript type.
 * Discriminated by the `kind` field.
 */
export type TypeTree = { typeName: string } & (
  | { kind: "union"; excessMembers: number; types: TypeTree[] }
  | { kind: "object"; excessProperties: number; properties: TypeProperty[] }
  | { kind: "tuple"; readonly: boolean; elements: TypeTupleElement[] }
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

In VS Code, the extension sends its `prettify-ts.*` settings to the plugin (`configurePlugin`), including language-specific values. Other editors can configure the plugin in `tsconfig.json`, using the same setting names:

```json
{
  "compilerOptions": {
    "plugins": [
      {
        "name": "@prettify-ts/typescript-plugin",
        "hoverPlacement": "nativeFirst",
        "maxDepth": 2,
        "typeIndentation": 2
      }
    ]
  }
}
```

| Setting | Default | Description |
| --- | --- | --- |
| `enabled` | `true` | Adds previews to hovers. |
| `hoverMode` | `merged` | `merged` adds previews to quick info; `separate` leaves quick info unchanged (the VS Code extension then shows its own hover). |
| `hoverPlacement` | `prettifiedFirst` | `prettifiedFirst`, `nativeFirst`, or `prettifiedOnly`. |
| `typeIndentation`, `maxCharacters` | `4`, `20000` | As in the extension. |
| `maxDepth`, `maxProperties`, `maxSubProperties`, `maxUnionMembers`, `maxFunctionSignatures`, `skippedTypeNames`, `unwrapGenericArgumentsTypeNames`, `unwrapArrays`, `unwrapFunctions`, `hidePrivateProperties`, `treatUnderscoreAsPrivate` | See the extension README | Expansion options, as in the extension. |

## Usage

The plugin is packaged and activated by the [Prettify TS extension](https://marketplace.visualstudio.com/items?itemName=MylesMurphy.prettify-ts). It is not published to npm yet; the `tsconfig.json` configuration above applies to editors that load it from a local install.

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

TypeScript 7 has no TS Server plugins. With TypeScript 7 (experimental), the extension builds the same type tree through the TypeScript 7 API and merges hovers with the TypeScript 7 extension's LSP middleware.

## License

[MIT](../LICENSE)
