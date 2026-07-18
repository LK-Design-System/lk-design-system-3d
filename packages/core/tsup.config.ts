import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    coordinates: "src/coordinates.ts",
    entities: "src/entities.ts",
    camera: "src/camera.ts",
    interaction: "src/interaction.ts",
    renderer: "src/renderer.ts",
    time: "src/time.ts",
    theme: "src/theme.ts",
  },
  format: ["esm"],
  target: "es2022",
  outDir: "dist",
  clean: true,
  dts: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
});
