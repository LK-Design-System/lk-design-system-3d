import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { assetManifestV1Schema, robotKinematicsV1Schema } from "../src/schema.js";

describe("asset-manifest.v1.schema.json", () => {
  it("matches the schema subpath export exactly", () => {
    const rawSchema = JSON.parse(
      readFileSync(new URL("../asset-manifest.v1.schema.json", import.meta.url), "utf8"),
    ) as unknown;
    expect(rawSchema).toEqual(assetManifestV1Schema);
  });
});

describe("robot-kinematics.v1.schema.json", () => {
  it("matches the schema subpath export exactly", () => {
    const rawSchema = JSON.parse(
      readFileSync(new URL("../robot-kinematics.v1.schema.json", import.meta.url), "utf8"),
    ) as unknown;
    expect(rawSchema).toEqual(robotKinematicsV1Schema);
  });
});
