import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const expectedExports = {
  core: [
    ".",
    "./coordinates",
    "./occupancy-grid",
    "./entities",
    "./camera",
    "./interaction",
    "./renderer",
    "./time",
    "./theme",
    "./package.json",
  ],
  assets: [
    ".",
    "./schema",
    "./legacy",
    "./asset-manifest.v1.schema.json",
    "./robots/catalog.json",
    "./robots/tron/tron.glb",
    "./robots/tron/tron.asset-manifest.json",
    "./robots/tron/provenance.json",
    "./package.json",
  ],
  testing: [".", "./fixtures", "./contracts", "./provenance", "./package.json"],
  pointcloud: [".", "./package.json"],
  tf: [".", "./package.json"],
  markers: [".", "./package.json"],
  three: [".", "./coordinates", "./r3f-bridge", "./package.json"],
  r3f: [".", "./coordinates", "./themes", "./state", "./models", "./scene", "./package.json"],
};

// Static asset exports ship verbatim (no dist build, no types); .glb is a binary
// runtime asset consumed by URL (e.g. Vite `?url`), not a code entrypoint.
const staticAssetExtensions = [".json", ".glb"];

const requiredRendererPeers = ["@react-three/fiber", "react", "three"];
const requiredThreePeers = ["three"];

const errors = [];

for (const [packageName, requiredExports] of Object.entries(expectedExports)) {
  const directory = path.join(root, "packages", packageName);
  const manifestPath = path.join(directory, "package.json");
  try {
    await access(manifestPath);
  } catch {
    errors.push(`${path.relative(root, manifestPath)} is missing`);
    continue;
  }

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.type !== "module") {
    errors.push(`${manifest.name ?? directory}: package type must be module`);
  }
  if (!manifest.exports || typeof manifest.exports !== "object") {
    errors.push(`${manifest.name ?? directory}: exports map is required`);
    continue;
  }

  const actualExports = Object.keys(manifest.exports);
  const missingExports = requiredExports.filter((subpath) => !actualExports.includes(subpath));
  const unexpectedExports = actualExports.filter((subpath) => !requiredExports.includes(subpath));
  if (missingExports.length > 0) {
    errors.push(`${manifest.name}: missing required exports ${missingExports.join(", ")}`);
  }
  if (unexpectedExports.length > 0) {
    errors.push(
      `${manifest.name}: unexpected exports require an explicit package baseline update: ${unexpectedExports.join(", ")}`,
    );
  }

  for (const [subpath, target] of Object.entries(manifest.exports)) {
    const serialized = JSON.stringify(target);
    if (serialized.includes("/src/") || serialized.includes('"./src')) {
      errors.push(`${manifest.name} ${subpath}: exports must not expose source paths`);
    }
    const isStaticAssetExport =
      typeof target === "string" &&
      target.startsWith("./") &&
      staticAssetExtensions.some((extension) => target.endsWith(extension));
    if (!isStaticAssetExport && !serialized.includes("dist/")) {
      errors.push(`${manifest.name} ${subpath}: exports must resolve through dist`);
    }
    if (
      !isStaticAssetExport &&
      (typeof target !== "object" || target === null || !("import" in target))
    ) {
      errors.push(`${manifest.name} ${subpath}: code exports must define an import condition`);
    }
    if (serialized.includes('"require"')) {
      errors.push(`${manifest.name} ${subpath}: CommonJS require exports are not allowed`);
    }
  }

  const files = Array.isArray(manifest.files) ? manifest.files : [];
  if (!files.includes("dist")) {
    errors.push(`${manifest.name}: files must include dist`);
  }
  if (manifest.main || manifest.module) {
    errors.push(`${manifest.name}: ESM packages use exports only; main/module are not allowed`);
  }

  if (packageName === "r3f" || packageName === "three") {
    const peerDependencies = manifest.peerDependencies ?? {};
    const runtimeDependencies = manifest.dependencies ?? {};
    const requiredPeers = packageName === "r3f" ? requiredRendererPeers : requiredThreePeers;
    for (const peer of requiredPeers) {
      if (!(peer in peerDependencies)) {
        errors.push(`${manifest.name}: renderer peer dependency ${peer} is required`);
      }
      if (peer in runtimeDependencies) {
        errors.push(`${manifest.name}: renderer runtime ${peer} must be a peer dependency`);
      }
    }
  }

  if (packageName === "three") {
    const rootDeclarationPath = path.join(directory, "dist", "index.d.ts");
    try {
      const declaration = await readFile(rootDeclarationPath, "utf8");
      if (/from ['"]three(?:\/|['"])/u.test(declaration)) {
        errors.push(
          `${manifest.name}: root declaration must not expose raw Three types; use ./r3f-bridge for adapter-only Three objects`,
        );
      }
    } catch {
      errors.push(
        `${manifest.name}: build output ${path.relative(root, rootDeclarationPath)} is required for root API boundary validation`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log("Package export maps match the required source-isolated ESM baselines.");
