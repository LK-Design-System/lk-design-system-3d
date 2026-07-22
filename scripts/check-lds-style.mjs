import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const candidates = [
  process.env.LDS_CONFORMANCE_CLI,
  path.resolve(
    repositoryRoot,
    "..",
    "lk-design-system",
    "packages",
    "conformance",
    "src",
    "cli.mjs",
  ),
  path.resolve(
    repositoryRoot,
    "..",
    "LK Design System",
    "packages",
    "conformance",
    "src",
    "cli.mjs",
  ),
  path.resolve(
    repositoryRoot,
    ".lds-conformance",
    "lds",
    "packages",
    "conformance",
    "src",
    "cli.mjs",
  ),
  path.resolve(repositoryRoot, "node_modules", "@lk-robotics", "lds-conformance", "src", "cli.mjs"),
].filter(Boolean);

const cli = candidates.find((candidate) => existsSync(candidate));
if (!cli) {
  throw new Error(
    "LDS conformance CLI was not found. Set LDS_CONFORMANCE_CLI or check out LK Design System beside this repository.",
  );
}

const args = [
  cli,
  "check",
  "--profile",
  "lds3d-ui",
  "--root",
  repositoryRoot,
  ...process.argv.slice(2),
];

if (process.env.LDS_CONFORMANCE_ROOT) {
  args.push("--lds-root", process.env.LDS_CONFORMANCE_ROOT);
}

const result = spawnSync(process.execPath, args, {
  cwd: repositoryRoot,
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
