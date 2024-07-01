# TypeScript Type Tree Generator

This project is a TypeScript Language Server Plugin that generates a tree-like structure representing the type information of TypeScript entities. It recursively traverses the types and builds a comprehensive tree, providing a structured view of the types and their relationships.

The plugin handles various TypeScript types including basic types, union types, and complex object types. It also takes care of circular references to prevent infinite recursion. The depth of recursion is configurable, and certain types can be skipped if needed.

This tool is particularly useful for understanding complex type structures in TypeScript projects, aiding in debugging, documentation, and code comprehension.

## Custom Requests through getCompletionsAtPosition

This plugin overrides the `getCompletionsAtPosition` method of the TypeScript Language Server to enable sending custom requests. By hijacking this method, we can intercept the completion request and inject our own logic to generate and return the type tree.

When a completion request is made with the Prettify Metadata flag, instead of providing the usual code completions, the plugin generates a type tree for the entity at the cursor position. This type tree is then included in the completion details that are sent back to the client.

This approach allows us to leverage the existing communication channel between the client and the server, and to provide additional information without requiring changes to the client or the protocol.

## Response TypeInfo

The response from the plugin includes a `TypeInfo` object, which contains detailed type information about a TypeScript node. Here's a breakdown of its structure:

```typescript
type TypeTree = {
    typeName: string;
    kind: "union";
    excessMembers: number;
    types: TypeTree[];
} | {
    typeName: string;
    kind: "intersection";
    types: TypeTree[];
} | {
    typeName: string;
    kind: "object";
    excessProperties: number;
    properties: {
        name: string;
        readonly: boolean;
        type: TypeTree;
    }[];
} | {
    typeName: string;
    kind: "array";
    readonly: boolean;
    elementType: TypeTree;
} | {
    typeName: string;
    kind: "function";
    signatures: {
        returnType: TypeTree;
        parameters: {
            name: string;
            isRestParameter: boolean;
            type: TypeTree;
        }[];
    }[];
} | {
    typeName: string;
    kind: "promise";
    type: TypeTree;
} | {
    typeName: string;
    kind: "enum";
    member: string;
} | {
    typeName: string;
    kind: "basic";
}

/**
 * TypeInfo contains the type information of a TypeScript node.
 */
type TypeInfo = {
  typeTree: TypeTree
  syntaxKind: ts.SyntaxKind
  name: string
}
```
