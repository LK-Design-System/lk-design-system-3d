import { copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const packages = {
  core: [
    "coordinates",
    "occupancy-grid",
    "entities",
    "camera",
    "interaction",
    "renderer",
    "time",
    "theme",
  ],
  assets: ["schema", "legacy"],
  testing: ["fixtures", "contracts", "provenance"],
  pointcloud: [],
  tf: [],
  markers: [],
  three: ["coordinates", "r3f-bridge"],
  r3f: ["coordinates", "themes", "state", "models", "scene"],
};
const checkMode = process.argv.includes("--check");
const foundationEvidenceDirectory = path.join(root, "evidence", "m1", "api-report");
const rendererEvidenceDirectory = path.join(root, "evidence", "m2", "api-report");
const pnpmCli = process.env.npm_execpath;

function namespaceIdentifier(subpath) {
  return subpath.replace(/-([a-z0-9])/g, (_match, character) => character.toUpperCase());
}

if (pnpmCli === undefined) {
  throw new Error("Run this generator through the `pnpm api-report` workspace script.");
}
await Promise.all([
  mkdir(foundationEvidenceDirectory, { recursive: true }),
  mkdir(rendererEvidenceDirectory, { recursive: true }),
]);

for (const [packageName, subpaths] of Object.entries(packages)) {
  const packageDirectory = path.join(root, "packages", packageName);
  await mkdir(path.join(packageDirectory, "etc"), { recursive: true });
  await mkdir(path.join(packageDirectory, "temp"), { recursive: true });
  if (subpaths.length > 0) {
    await writeFile(
      path.join(packageDirectory, "temp", "public-subpaths.d.ts"),
      `${subpaths
        .map(
          (subpath) => `export * as ${namespaceIdentifier(subpath)} from "../dist/${subpath}.js";`,
        )
        .join("\n")}\n`,
      "utf8",
    );
  }

  const configs = [
    "api-extractor.json",
    ...(subpaths.length > 0 ? ["api-extractor.subpaths.json"] : []),
  ];

  for (const config of configs) {
    const result = spawnSync(
      process.execPath,
      [
        pnpmCli,
        "exec",
        "api-extractor",
        "run",
        ...(checkMode ? [] : ["--local"]),
        "--config",
        config,
      ],
      {
        cwd: packageDirectory,
        encoding: "utf8",
        shell: false,
      },
    );
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  }

  if (!checkMode) {
    const evidenceDirectory =
      packageName === "three" || packageName === "r3f"
        ? rendererEvidenceDirectory
        : foundationEvidenceDirectory;
    const reports = (await readdir(path.join(packageDirectory, "etc"))).filter((name) =>
      name.endsWith(".api.md"),
    );
    for (const report of reports) {
      await copyFile(
        path.join(packageDirectory, "etc", report),
        path.join(evidenceDirectory, report),
      );
    }
  }
}

console.log(
  checkMode
    ? "API Extractor baselines match every publishable package root and public subpath."
    : "API Extractor root and public-subpath reports generated for all publishable packages.",
);
