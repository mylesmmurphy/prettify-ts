// TypeScript 7 API types for the VS Code extension. They resolve from this package, the only one that depends on
// the TypeScript 7 package: its `tsc` binary would otherwise replace TypeScript 5.9's in a package's scripts.
export type { API, Snapshot } from "typescript-7/async";
export type {
  ExtensionAPI,
  Hover,
  LspMiddlewareContext,
  MarkedString,
  MarkupContent,
  TypeScriptSDK,
} from "typescript-7/vscode";
