import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  outDir: "out",
  splitting: false,
  sourcemap: false,
  clean: true,
  dts: false,
  format: ["cjs"],
  external: ["typescript"],
});
