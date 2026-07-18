/* eslint-disable @typescript-eslint/no-deprecated -- These tests prove the isolated deprecated subpath remains functional. */

import { describe, expect, it } from "vitest";

import { frameId } from "@lk-robotics/design-system-3d-core";

import { inferLegacyAssetCoordinate } from "../src/legacy.js";

describe("deprecated legacy coordinate inference", () => {
  it("uses a known placement rotation when it strongly identifies the axes", () => {
    const report = inferLegacyAssetCoordinate({
      bounds: { min: [-1, -2, 0], max: [1, 2, 3] },
      knownPlacement: {
        sourceFrame: frameId("file"),
        targetFrame: frameId("core"),
        translation: [0, 0, 0],
        rotation: [0.5, 0.5, 0.5, 0.5],
      },
    });
    expect(report).toMatchObject({
      inferred: true,
      confidence: "high",
      coordinate: { upAxis: "+Y", forwardAxis: "+Z" },
    });
  });

  it("labels bounds-only inference as low confidence", () => {
    const report = inferLegacyAssetCoordinate({
      bounds: { min: [0, 0, 0], max: [1, 2, 4] },
    });
    expect(report).toMatchObject({
      inferred: true,
      confidence: "low",
      coordinate: { upAxis: "+Z", forwardAxis: "+Y" },
    });
    expect(report.warnings.length).toBeGreaterThanOrEqual(2);
  });

  it("refuses invalid bounds", () => {
    expect(
      inferLegacyAssetCoordinate({
        bounds: { min: [2, 0, 0], max: [1, 1, 1] },
      }),
    ).toMatchObject({ inferred: false, confidence: "low" });
  });
});
