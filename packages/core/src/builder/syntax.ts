import type * as ts from "typescript";

/**
 * The syntax enums of the compiler that produced the nodes. Kind checks go through these enums rather than the
 * compiler's `is*` functions, so the builder depends only on the node shapes (`parent`, `name`, `type`, `modifiers`,
 * `getText`, `forEachChild`), not on one compiler's enum values.
 */
export type SyntaxModule = {
  SyntaxKind: typeof ts.SyntaxKind;
  NodeFlags: typeof ts.NodeFlags;
  tokenToString(kind: ts.SyntaxKind): string | undefined;
};

type Guard<N extends ts.Node> = (node: ts.Node | undefined) => node is N;

/** Kind-based node guards, equivalent to the compiler's own `is*` functions for these node kinds. */
export function syntaxGuards(syntax: SyntaxModule) {
  const K = syntax.SyntaxKind;
  const guard =
    <N extends ts.Node>(kind: ts.SyntaxKind): Guard<N> =>
    (node): node is N =>
      node?.kind === kind;
  const is = {
    isIdentifier: guard<ts.Identifier>(K.Identifier),
    isQualifiedName: guard<ts.QualifiedName>(K.QualifiedName),
    isTypeReferenceNode: guard<ts.TypeReferenceNode>(K.TypeReference),
    isParenthesizedTypeNode: guard<ts.ParenthesizedTypeNode>(K.ParenthesizedType),
    isArrayTypeNode: guard<ts.ArrayTypeNode>(K.ArrayType),
    isClassDeclaration: guard<ts.ClassDeclaration>(K.ClassDeclaration),
    isInterfaceDeclaration: guard<ts.InterfaceDeclaration>(K.InterfaceDeclaration),
    isTypeAliasDeclaration: guard<ts.TypeAliasDeclaration>(K.TypeAliasDeclaration),
    isVariableDeclaration: guard<ts.VariableDeclaration>(K.VariableDeclaration),
    isParameter: guard<ts.ParameterDeclaration>(K.Parameter),
    isPropertyDeclaration: guard<ts.PropertyDeclaration>(K.PropertyDeclaration),
    isPropertySignature: guard<ts.PropertySignature>(K.PropertySignature),
    isMethodDeclaration: guard<ts.MethodDeclaration>(K.MethodDeclaration),
    isMethodSignature: guard<ts.MethodSignature>(K.MethodSignature),
    isGetAccessor: guard<ts.GetAccessorDeclaration>(K.GetAccessor),
    isSetAccessor: guard<ts.SetAccessorDeclaration>(K.SetAccessor),
    isPropertyAccessExpression: guard<ts.PropertyAccessExpression>(K.PropertyAccessExpression),
    isNewExpression: guard<ts.NewExpression>(K.NewExpression),
    isObjectBindingPattern: guard<ts.ObjectBindingPattern>(K.ObjectBindingPattern),
    isOmittedExpression: guard<ts.OmittedExpression>(K.OmittedExpression),
    isImportDeclaration: guard<ts.ImportDeclaration>(K.ImportDeclaration),
    isImportSpecifier: guard<ts.ImportSpecifier>(K.ImportSpecifier),
    isImportClause: guard<ts.ImportClause>(K.ImportClause),
  };
  return {
    ...is,
    /** `as const`: the compiler resolves the keyword to an unresolved `const` symbol. */
    isConstTypeReference(node: ts.Node): boolean {
      return (
        is.isTypeReferenceNode(node) &&
        is.isIdentifier(node.typeName) &&
        node.typeName.text === "const" &&
        !node.typeArguments
      );
    },
  };
}

export type SyntaxGuards = ReturnType<typeof syntaxGuards>;

/** Modifiers of a declaration, without the version-specific `canHaveModifiers`/`getModifiers` helpers. */
export function modifiersOf(node: ts.Node): readonly ts.ModifierLike[] {
  return (node as ts.Node & { modifiers?: readonly ts.ModifierLike[] }).modifiers ?? [];
}

export function findAncestor(node: ts.Node | undefined, predicate: (node: ts.Node) => boolean): ts.Node | undefined {
  while (node) {
    if (predicate(node)) return node;
    node = node.parent;
  }
  return undefined;
}

/**
 * https://github.com/dsherret/ts-ast-viewer/blob/b4be8f2234a1c3c099296bf5d0ad6cc14107367c/site/src/compiler/getDescendantAtRange.ts
 * https://github.com/mxsdev/ts-type-explorer/blob/main/packages/api/src/util.ts#L763
 */
export function getDescendantAtRange(sourceFile: ts.SourceFile, range: [number, number]): ts.Node | undefined {
  let bestMatch: { node: ts.Node; start: number; end: number } = {
    node: sourceFile,
    start: sourceFile.getStart(sourceFile),
    end: sourceFile.getEnd(),
  };

  searchDescendants(sourceFile);
  return bestMatch.node;

  function searchDescendants(node: ts.Node): void {
    const start = node.getStart(sourceFile);
    const end = node.getEnd();

    if (start > range[0] || end < range[1]) return;

    if (start <= range[0] && end >= range[1]) {
      if (start >= bestMatch.start && end <= bestMatch.end) {
        bestMatch = { node, start, end };
      }
    }

    node.forEachChild((child) => {
      // Children are in source order; later siblings cannot contain this range.
      if (child.pos > range[1]) return true;
      searchDescendants(child);
      return undefined;
    });
  }
}
