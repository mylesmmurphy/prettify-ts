import type { Language } from "@volar/language-core";
import type { TypeScriptServiceScript } from "@volar/typescript";
import type * as ts from "typescript";

type VueProgram = ts.Program & {
  // https://github.com/vuejs/language-tools/blob/v2.0.16/packages/typescript-plugin/index.ts#L75
  __vue__: { language: Language };
};

function getMappingOffset(language: Language, serviceScript: TypeScriptServiceScript): number {
  if (serviceScript.preventLeadingOffset) {
    return 0;
  }
  const sourceScript = language.scripts.fromVirtualCode(serviceScript.code);
  return sourceScript.snapshot.getLength();
}

export function isVueProgram(program: ts.Program): program is VueProgram {
  return "__vue__" in program;
}

export function getPositionForVue(program: VueProgram, fileName: string, startPos = -1): number {
  const language = program.__vue__.language;
  if (language?.scripts) {
    const vFile = language.scripts.get(fileName);
    const serviceScript = vFile?.generated?.languagePlugin.typescript?.getServiceScript(vFile.generated.root);
    if (vFile?.generated?.root?.languageId === "vue" && serviceScript) {
      const sourceMap = language.maps.get(serviceScript.code, vFile);

      const snapshotLength = getMappingOffset(language, serviceScript);

      for (const [generatedLocation] of sourceMap.toGeneratedLocation(startPos)) {
        if (generatedLocation) {
          startPos = generatedLocation + snapshotLength;
        }
      }
    }
  }

  return startPos;
}
