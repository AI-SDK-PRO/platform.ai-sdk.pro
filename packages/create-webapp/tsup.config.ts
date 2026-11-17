import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    cli: "src/cli.ts",
  },
  format: ["esm"],
  dts: {
    entry: {
      index: "src/index.ts",
    },
  },
  clean: true,
  splitting: false,
  sourcemap: false,
  target: "node22",
  platform: "node",
});
