import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.{ts,tsx}", "apps/**/*.test.{ts,tsx}"],
    exclude: ["**/dist/**", "**/node_modules/**", "**/storybook-static/**"],
    coverage: {
      reporter: ["text", "json-summary"],
    },
  },
});
