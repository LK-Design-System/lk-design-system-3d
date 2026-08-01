import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    coordinates: "src/coordinates.ts",
    themes: "src/themes.ts",
    state: "src/state.ts",
    models: "src/models.tsx",
    scene: "src/scene.ts",
  },
  format: ["esm"],
  target: "es2022",
  outDir: "dist",
  clean: true,
  dts: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  external: [
    "react",
    "react/jsx-runtime",
    "three",
    "@react-three/fiber",
    "@lk-design-system/lds-3d-three",
    "@lk-design-system/lds-3d-three/coordinates",
    "@lk-design-system/lds-3d-three/r3f-bridge",
    "@lk-design-system/lds-3d-pointcloud",
    "@lk-design-system/lds-3d-markers",
  ],
});
