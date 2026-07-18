import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

const forbiddenRendererImports = [
  "three",
  "@react-three/fiber",
  "@react-three/drei",
  "react",
  "@lk-robotics/design-system-core",
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
          patterns: ["@lk-robotics/*/src/*", "**/src/internal/*"],
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
