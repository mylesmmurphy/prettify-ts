import * as ts from "typescript/lib/tsserverlibrary";

const keywords = new Set([
  "abstract",
  "any",
  "as",
  "async",
  "await",
  "bigint",
  "boolean",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "declare",
  "default",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "implements",
  "import",
  "in",
  "infer",
  "interface",
  "is",
  "keyof",
  "let",
  "module",
  "namespace",
  "never",
  "new",
  "null",
  "number",
  "object",
  "out",
  "private",
  "protected",
  "public",
  "readonly",
  "return",
  "static",
  "string",
  "super",
  "switch",
  "symbol",
  "this",
  "throw",
  "true",
  "try",
  "type",
  "typeof",
  "undefined",
  "unique",
  "unknown",
  "var",
  "void",
  "while",
  "yield",
]);

/**
 * Helper utilities for creating SymbolDisplayPart objects with proper semantic classification.
 * These functions simplify the creation of display parts during type tree generation.
 */
export const displayParts = {
  aliasName: (text: string): ts.SymbolDisplayPart => ({
    text,
    kind: ts.SymbolDisplayPartKind[ts.SymbolDisplayPartKind.aliasName],
  }),
  className: (text: string): ts.SymbolDisplayPart => ({
    text,
    kind: ts.SymbolDisplayPartKind[ts.SymbolDisplayPartKind.className],
  }),
  enumMember: (text: string): ts.SymbolDisplayPart => ({
    text,
    kind: ts.SymbolDisplayPartKind[ts.SymbolDisplayPartKind.enumMemberName],
  }),
  enumName: (text: string): ts.SymbolDisplayPart => ({
    text,
    kind: ts.SymbolDisplayPartKind[ts.SymbolDisplayPartKind.enumName],
  }),
  functionName: (text: string): ts.SymbolDisplayPart => ({
    text,
    kind: ts.SymbolDisplayPartKind[ts.SymbolDisplayPartKind.functionName],
  }),
  interfaceName: (text: string): ts.SymbolDisplayPart => ({
    text,
    kind: ts.SymbolDisplayPartKind[ts.SymbolDisplayPartKind.interfaceName],
  }),
  keyword: (text: string): ts.SymbolDisplayPart => ({
    text,
    kind: ts.SymbolDisplayPartKind[ts.SymbolDisplayPartKind.keyword],
  }),
  lineBreak: (): ts.SymbolDisplayPart => ({
    text: "\n",
    kind: ts.SymbolDisplayPartKind[ts.SymbolDisplayPartKind.lineBreak],
  }),
  methodName: (text: string): ts.SymbolDisplayPart => ({
    text,
    kind: ts.SymbolDisplayPartKind[ts.SymbolDisplayPartKind.methodName],
  }),
  moduleName: (text: string): ts.SymbolDisplayPart => ({
    text,
    kind: ts.SymbolDisplayPartKind[ts.SymbolDisplayPartKind.moduleName],
  }),
  numericLiteral: (text: string): ts.SymbolDisplayPart => ({
    text,
    kind: ts.SymbolDisplayPartKind[ts.SymbolDisplayPartKind.numericLiteral],
  }),
  operator: (text: string): ts.SymbolDisplayPart => ({
    text,
    kind: ts.SymbolDisplayPartKind[ts.SymbolDisplayPartKind.operator],
  }),
  parameterName: (text: string): ts.SymbolDisplayPart => ({
    text,
    kind: ts.SymbolDisplayPartKind[ts.SymbolDisplayPartKind.parameterName],
  }),
  propertyName: (text: string): ts.SymbolDisplayPart => ({
    text,
    kind: ts.SymbolDisplayPartKind[ts.SymbolDisplayPartKind.propertyName],
  }),
  punctuation: (text: string): ts.SymbolDisplayPart => ({
    text,
    kind: ts.SymbolDisplayPartKind[ts.SymbolDisplayPartKind.punctuation],
  }),
  space: (): ts.SymbolDisplayPart => ({ text: " ", kind: ts.SymbolDisplayPartKind[ts.SymbolDisplayPartKind.space] }),
  stringLiteral: (text: string): ts.SymbolDisplayPart => ({
    text,
    kind: ts.SymbolDisplayPartKind[ts.SymbolDisplayPartKind.stringLiteral],
  }),
  text: (text: string): ts.SymbolDisplayPart => ({
    text,
    kind: ts.SymbolDisplayPartKind[ts.SymbolDisplayPartKind.text],
  }),
  typeParameter: (text: string): ts.SymbolDisplayPart => ({
    text,
    kind: ts.SymbolDisplayPartKind[ts.SymbolDisplayPartKind.typeParameterName],
  }),
};

/**
 * Helper function to determine if a type name represents a TypeScript keyword.
 */
export function isKeyword(typeName: string): boolean {
  return keywords.has(typeName);
}

/**
 * Helper function to create display parts for common type patterns.
 */
export function createTypeReferenceDisplayParts(
  typeName: string,
  typeArguments?: ts.SymbolDisplayPart[][],
): ts.SymbolDisplayPart[] {
  const parts: ts.SymbolDisplayPart[] = [];

  if (isKeyword(typeName)) {
    parts.push(displayParts.keyword(typeName));
  } else {
    parts.push(displayParts.text(typeName));
  }

  if (typeArguments && typeArguments.length > 0) {
    parts.push(displayParts.punctuation("<"));

    for (let i = 0; i < typeArguments.length; i++) {
      if (i > 0) {
        parts.push(displayParts.punctuation(","));
        parts.push(displayParts.space());
      }

      const argParts = typeArguments[i];
      if (argParts) {
        parts.push(...argParts);
      }
    }

    parts.push(displayParts.punctuation(">"));
  }

  return parts;
}

/**
 * Helper function to concatenate multiple display part arrays.
 */
export function concatDisplayParts(...partArrays: (ts.SymbolDisplayPart[] | undefined)[]): ts.SymbolDisplayPart[] {
  const result: ts.SymbolDisplayPart[] = [];

  for (const parts of partArrays) {
    if (parts) {
      result.push(...parts);
    }
  }

  return result;
}
