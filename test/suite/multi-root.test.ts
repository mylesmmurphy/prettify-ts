import * as assert from "node:assert";
import * as path from "node:path";
import * as vscode from "vscode";
import { applySettings, ensureTypeScriptServerReady, getHoverSections, openDocument } from "./utils";

const secondFolder = process.env.PRETTIFY_TEST_SECOND_FOLDER ?? path.join(__dirname, "../workspace-folder");
const firstPreview = "const declaredProbe: { nested: { value: string; }; }";
const secondPreview = "const folderProbe: { nested: { value: string; }; }";
const secondCollapsed = "const folderProbe: { nested: { ... 1 more }; }";
const secondNative = "const folderProbe: FolderProbe";

/** Settings stored in the second folder's .vscode/settings.json; unset keys are removed. */
async function setSecondFolder(values: { enabled?: boolean; maxDepth?: number; hoverMode?: string }) {
  const config = vscode.workspace.getConfiguration("prettify-ts", vscode.Uri.file(secondFolder));
  for (const key of ["enabled", "maxDepth", "hoverMode"] as const) {
    await config.update(key, values[key], vscode.ConfigurationTarget.WorkspaceFolder);
  }
}

/** The hovers at a keyword, polled until the settings change has reached TS Server and the hover providers. */
async function hoversUntil(
  file: string,
  folder: string | undefined,
  keyword: string,
  done: (hovers: string[][]) => boolean,
): Promise<string[][]> {
  await openDocument(file, folder);
  let hovers = await getHoverSections(keyword);
  for (let attempt = 0; attempt < 50 && !done(hovers); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    hovers = await getHoverSections(keyword);
  }
  return hovers;
}

const second = (done: (hovers: string[][]) => boolean) => hoversUntil("probe.ts", secondFolder, "folderProbe:", done);
const first = (done: (hovers: string[][]) => boolean) =>
  hoversUntil("declarations.ts", undefined, "declaredProbe:", done);
const shows = (text: string) => (hovers: string[][]) => hovers.some((hover) => hover.includes(text));

suite("Workspace folder settings in a multi-root workspace", () => {
  suiteSetup(async function () {
    this.timeout(120000);
    await ensureTypeScriptServerReady("canary.ts", "ServerReadinessProbe");
    await applySettings({ maxDepth: 3 });
    assert.strictEqual(vscode.workspace.workspaceFolders?.length, 2, "multi-root test workspace");
    const hovers = await second(shows(secondPreview));
    assert.ok(shows(secondPreview)(hovers), JSON.stringify(hovers));
  });
  teardown(async () => {
    await setSecondFolder({});
    await applySettings({ maxDepth: 3 });
  });

  test("each folder's depth limit applies only to its own files", async () => {
    await setSecondFolder({ maxDepth: 1 });
    const secondHovers = await second(shows(secondCollapsed));
    assert.ok(shows(secondCollapsed)(secondHovers), JSON.stringify(secondHovers));
    const firstHovers = await first(shows(firstPreview));
    assert.ok(shows(firstPreview)(firstHovers), JSON.stringify(firstHovers));
  });

  test("disabling Prettify in one folder leaves the other folder's merged hovers", async () => {
    await setSecondFolder({ enabled: false });
    const secondHovers = await second((hovers) => !hovers.flat().some((section) => section.includes("nested")));
    assert.ok(!secondHovers.flat().some((section) => section.includes("nested")), JSON.stringify(secondHovers));
    assert.ok(shows(secondNative)(secondHovers), JSON.stringify(secondHovers));
    const firstHovers = await first(shows(firstPreview));
    assert.ok(shows(firstPreview)(firstHovers), JSON.stringify(firstHovers));
    // Turning it back on in that folder applies again.
    await setSecondFolder({});
    const restored = await second(shows(secondPreview));
    assert.ok(shows(secondPreview)(restored), JSON.stringify(restored));
  });

  test("the hover mode follows each folder: the plugin and the separate hover agree", async () => {
    await setSecondFolder({ hoverMode: "separate" });
    const separate = (hovers: string[][]) =>
      hovers.some((hover) => hover.length === 1 && hover[0] === secondPreview) &&
      hovers.some((hover) => hover[0] === secondNative && !hover.includes(secondPreview));
    const secondHovers = await second(separate);
    assert.ok(separate(secondHovers), JSON.stringify(secondHovers));
    const firstHovers = await first(shows(firstPreview));
    const merged = firstHovers.find((hover) => hover.includes(firstPreview));
    assert.ok(merged?.includes("const declaredProbe: DeclaredProbe"), JSON.stringify(firstHovers));
  });
});
