// The second folder of the multi-root test workspace: its folder settings must apply only to its own files.
type FolderProbe = { nested: { value: string } };
export const folderProbe: FolderProbe = { nested: { value: "folder" } };
