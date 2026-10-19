import type * as ts from "typescript";
import type { Language } from "@volar/language-core";
import type { PrettifyOptions } from "@prettify-ts/core/src/options";
import type { TypeInfo } from "@prettify-ts/core/src/types";
import { runSync } from "@prettify-ts/core/src/builder/backend";
import { getTypeInfo } from "@prettify-ts/core/src/builder/builder";
import type { AnalysisControl } from "@prettify-ts/core/src/builder/builder";
import { createCompilerBackend } from "./backend";
import { getPositionForVue } from "./vue";

export type { AnalysisControl };

/** Type information from the in-process compiler. Analysis state belongs to one request, including all safety budgets. */
export function getTypeInfoAtPosition(
  typescript: typeof ts,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  position: number,
  prettifyOptions: PrettifyOptions,
  vueLanguage?: Language,
  control: AnalysisControl = {},
): TypeInfo | undefined {
  try {
    if (vueLanguage) position = getPositionForVue(vueLanguage, sourceFile.fileName.replace(/\\/g, "/"), position);
    const backend = createCompilerBackend(typescript, checker, sourceFile);
    return runSync(getTypeInfo(backend, sourceFile, position, prettifyOptions, control));
  } catch (error) {
    control.onError?.(error);
    return undefined;
  }
}
