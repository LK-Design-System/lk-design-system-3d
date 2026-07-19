import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const pnpmCli = process.env.npm_execpath;

if (pnpmCli === undefined) {
  throw new Error("Run this check through the `pnpm publint` workspace script.");
}

for (const name of ["core", "assets", "testing", "pointcloud", "tf", "markers", "three", "r3f"]) {
  const result = spawnSync(process.execPath, [pnpmCli, "exec", "publint"], {
    cwd: path.join(root, "packages", name),
    encoding: "utf8",
    shell: false,
  });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("Publint passed for all publishable packages.");
