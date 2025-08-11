import type * as ts from "typescript";

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
export type TypeTree = {
  /**
   * String representation of the type name.
   * Always populated for backward compatibility.
   */
  typeName: string;
  /**
   * Optional array of SymbolDisplayPart objects that provide semantic token information
   * for syntax highlighting and proper formatting in editors.
   *
   * This field is populated when the `generateDisplayParts` option is enabled
   * during type tree generation. Each display part contains:
   * - `text`: The text content of the token
   * - `kind`: The semantic classification (e.g., keyword, className, punctuation)
   *
   * If this field is absent or undefined, the `typeTreeToDisplayParts` function
   * will provide a fallback using the typeName field.
   *
   * @see ts.SymbolDisplayPart for the display part structure
   * @see typeTreeToDisplayParts for converting TypeTree to display parts
   */
  displayParts?: ts.SymbolDisplayPart[];
} & (
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
