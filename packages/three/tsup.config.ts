import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    coordinates: "src/coordinates.ts",
    "r3f-bridge": "src/r3f-bridge.ts",
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
    "three",
    "three/examples/jsm/loaders/DRACOLoader.js",
    "three/examples/jsm/loaders/GLTFLoader.js",
    "three/examples/jsm/utils/SkeletonUtils.js",
  ],
});
