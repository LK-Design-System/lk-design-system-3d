import { checkPackage, Package } from "@arethetypeswrong/core";
import { getExitCode } from "@arethetypeswrong/cli/internal/getExitCode";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const ignoredEsmOnlyResolutions = ["node10", "node16-cjs"];

async function addPath(files, packageName, packageDirectory, relativePath) {
  const absolutePath = path.join(packageDirectory, relativePath);
  const fileStat = await stat(absolutePath);
  if (fileStat.isDirectory()) {
    const children = await readdir(absolutePath);
    await Promise.all(
      children.map((child) =>
        addPath(files, packageName, packageDirectory, path.join(relativePath, child)),
      ),
    );
    return;
  }

  const virtualPath = path.posix.join(
    "/node_modules",
    packageName,
    ...relativePath.split(path.sep),
  );
  files[virtualPath] = await readFile(absolutePath);
}

async function createPublishedPackage(packageDirectory) {
  const manifest = JSON.parse(await readFile(path.join(packageDirectory, "package.json"), "utf8"));
  const files = {};
  const publishedPaths = new Set(["package.json", ...(manifest.files ?? [])]);
  for (const relativePath of publishedPaths) {
    await addPath(files, manifest.name, packageDirectory, relativePath);
  }
  return new Package(files, manifest.name, manifest.version);
}

for (const name of ["core", "assets", "testing", "pointcloud", "tf", "markers", "three", "r3f"]) {
  const packageDirectory = path.join(root, "packages", name);
  const pkg = await createPublishedPackage(packageDirectory);
  const analysis = await checkPackage(pkg);
  const exitCode = getExitCode(analysis, {
    ignoreResolutions: ignoredEsmOnlyResolutions,
  });
  if (exitCode !== 0) {
    const relevantProblems = analysis.problems.filter(
      (problem) =>
        !("resolutionKind" in problem) ||
        !ignoredEsmOnlyResolutions.includes(problem.resolutionKind),
    );
    console.error(`${pkg.packageName} has ${relevantProblems.length} package type problem(s).`);
    console.error(JSON.stringify(relevantProblems, null, 2));
    process.exit(exitCode);
  }
  console.log(`${pkg.packageName}: ESM-only type resolution passed.`);
}

console.log("Package type resolution checks passed with the Are The Types Wrong core engine.");
