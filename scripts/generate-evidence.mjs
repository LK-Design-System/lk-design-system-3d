import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { checkStorybookContract } from "./storybook-contract.mjs";

const root = process.cwd();
const testing = await import(
  pathToFileURL(path.join(root, "packages", "testing", "dist", "index.js")).href
);

const coordinateReport = {
  generatedAt: new Date().toISOString(),
  roundTrip: testing.createTransformRoundTripReport(),
  shiftedOrigin: testing.createCoordinateContractReport(),
  floorHitProjection: testing.checkAuthoritativeFloorHitProjection(),
};
const assetReport = {
  generatedAt: new Date().toISOString(),
  contracts: testing.checkAssetFixtureContracts(),
};
const provenanceReport = {
  generatedAt: new Date().toISOString(),
  ...testing.checkFixtureProvenance(),
};

const coordinateDirectory = path.join(root, "evidence", "m1");
const assetDirectory = path.join(coordinateDirectory, "asset-reports");
const fixtureDirectory = path.join(root, "evidence", "m0");
await Promise.all([
  mkdir(coordinateDirectory, { recursive: true }),
  mkdir(assetDirectory, { recursive: true }),
  mkdir(fixtureDirectory, { recursive: true }),
]);

const storybookReport = await checkStorybookContract(root);
const outputs = [
  [path.join(coordinateDirectory, "coordinate-contract.json"), coordinateReport],
  [path.join(assetDirectory, "validation.json"), assetReport],
  [path.join(fixtureDirectory, "fixture-provenance.json"), provenanceReport],
  [
    path.join(root, "evidence", "storybook-static.json"),
    { generatedAt: new Date().toISOString(), ...storybookReport },
  ],
];

// --check compares the committed evidence with a fresh run instead of writing.
// CI used to regenerate and move on, so committed evidence could fall behind
// the code (storybook-static.json listed 31 stories while the contract had
// 40) and nothing noticed. generatedAt is the only field allowed to differ.
if (process.argv.includes("--check")) {
  const withoutTimestamp = (value) => JSON.stringify({ ...value, generatedAt: undefined });
  const stale = [];
  for (const [file, report] of outputs) {
    let committed;
    try {
      committed = JSON.parse(await readFile(file, "utf8"));
    } catch {
      stale.push(`${path.relative(root, file)} (missing)`);
      continue;
    }
    if (withoutTimestamp(committed) !== withoutTimestamp(report)) {
      stale.push(path.relative(root, file));
    }
  }
  if (stale.length > 0) {
    console.error(
      "Committed evidence is stale; run `pnpm evidence` after the final build and commit:",
    );
    for (const file of stale) console.error(`- ${file}`);
    process.exit(1);
  }
  console.log("Committed evidence matches a fresh run (timestamps aside).");
  process.exit(0);
}

await Promise.all(
  outputs.map(([file, report]) => writeFile(file, `${JSON.stringify(report, null, 2)}\n`)),
);

const failures = [
  coordinateReport.roundTrip.passed,
  coordinateReport.shiftedOrigin.passed,
  coordinateReport.floorHitProjection.passed,
  assetReport.contracts.passed,
  provenanceReport.passed,
  storybookReport.passed,
].filter((passed) => !passed).length;

if (failures > 0) {
  console.error(`${failures} Alpha.1 evidence checks failed.`);
  process.exit(1);
}

console.log("Coordinate, asset, fixture provenance and Storybook evidence generated.");
