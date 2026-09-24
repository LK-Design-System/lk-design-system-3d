import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

// LDS DOM UI packages no LDS3D package may import (AGENTS.md dependency
// boundary). Only the legacy facade used to be listed.
const forbiddenLdsImports = [
  "@lk-design-system/design-system-core",
  "@lk-design-system/lds-core",
  "@lk-design-system/lds-theme",
  "@lk-design-system/lds-product",
  "@lk-design-system/lds-robotics-ui",
];

const forbiddenRendererImports = [
  "three",
  "@react-three/fiber",
  "@react-three/drei",
  "react",
  ...forbiddenLdsImports,
];

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "storybook-static/**",
      "artifacts/**",
      "evidence/**",
      "**/temp/**",
      "*.api.md",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/no-non-null-assertion": "error",
    },
  },
  {
    files: ["packages/core/src/**/*.ts", "packages/assets/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: forbiddenRendererImports.map((name) => ({
            name,
            message: "Alpha.1 core/assets must remain renderer and LDS neutral.",
          })),
          patterns: ["@lk-design-system/*/src/*", "**/src/internal/*"],
        },
      ],
    },
  },
  {
    // Renderer packages may use react/three, never LDS DOM UI.
    files: [
      "packages/{three,r3f,markers,pointcloud,tf,testing}/src/**/*.ts",
      "packages/{three,r3f,markers,pointcloud,tf,testing}/src/**/*.tsx",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: forbiddenLdsImports.map((name) => ({
            name,
            message:
              "LDS3D renderer packages must not depend on LDS DOM UI; compose LDS in apps/docs or the product.",
          })),
          patterns: [
            "@lk-design-system/lds-core/*",
            "@lk-design-system/lds-product/*",
            "@lk-design-system/lds-theme/*",
            "@lk-design-system/lds-robotics-ui/*",
          ],
        },
      ],
    },
  },
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      globals: {
        console: "readonly",
        module: "readonly",
      },
    },
  },
);
