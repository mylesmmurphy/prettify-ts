/**
 * Type Tree Object Properties
 */
export type TypeProperty = {
  name: string;
  computed?: boolean;
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
  typeParameters?: { modifiers?: string[]; name: string; constraint?: TypeTree; default?: TypeTree }[];
  predicate?: { parameter: string; asserts: boolean; type?: TypeTree };
  construct?: boolean;
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
  | {
      kind: "object";
      excessProperties: number;
      properties: TypeProperty[];
      signatures?: TypeFunctionSignature[];
      excessSignatures?: number;
    }
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
  truncationReasons?: string[];
  compilerVersion?: string;
};
