/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * This file is used as a target for opening a document in the test workspace.
 * The primary purpose is to have a known file and type to trigger a hover on.
 * We then wait for this hover to:
 *  1. Not display a "Loading..." message.
 *  2. Include detailed metadata (e.g., the optional marker '?' for property 'a').
 * This indicates that the TypeScript language server has fully initialized,
 * parsed the Abstract Syntax Tree (AST), and is ready to provide rich type information.
 *
 * NOTE: This method of waiting for the server to be "ready" by checking hover content
 * is a heuristic. More robust or direct methods for determining server readiness
 * should be explored for better test stability and reliability.
 */

type ServerReadinessProbe = {
  a?: string;
};
