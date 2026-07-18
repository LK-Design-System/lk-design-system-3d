import { mkdir, writeFile } from "node:fs/promises";
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

await Promise.all([
  writeFile(
    path.join(coordinateDirectory, "coordinate-contract.json"),
    `${JSON.stringify(coordinateReport, null, 2)}\n`,
  ),
  writeFile(
    path.join(assetDirectory, "validation.json"),
    `${JSON.stringify(assetReport, null, 2)}\n`,
  ),
  writeFile(
    path.join(fixtureDirectory, "fixture-provenance.json"),
    `${JSON.stringify(provenanceReport, null, 2)}\n`,
  ),
]);

const storybookReport = await checkStorybookContract(root);
await writeFile(
  path.join(root, "evidence", "storybook-static.json"),
  `${JSON.stringify({ generatedAt: new Date().toISOString(), ...storybookReport }, null, 2)}\n`,
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
