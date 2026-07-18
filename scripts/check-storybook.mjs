import process from "node:process";

import { checkStorybookContract } from "./storybook-contract.mjs";

const report = await checkStorybookContract(process.cwd());
if (!report.passed) {
  console.error(
    [
      `Missing Storybook IDs: ${report.missingStoryIds.join(", ") || "none"}`,
      `Unexpected Storybook IDs: ${report.unexpectedStoryIds.join(", ") || "none"}`,
    ].join("\n"),
  );
  process.exit(1);
}

console.log(
  `Storybook contract matches the exact ${report.expectedStoryIds.length.toString()} required story IDs.`,
);
