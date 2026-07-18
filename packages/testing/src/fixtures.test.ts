import { describe, expect, it } from "vitest";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

import {
  COORDINATE_AXES_FIXTURE,
  INVALID_ASSET_MANIFEST_FIXTURES,
  LEGACY_Z_UP_GLB_MANIFEST_FIXTURE,
  PATH_FIXTURE,
  ROBOT_POSE_FIXTURE,
  UNIT_CUBE_FIXTURE,
  Y_UP_GLB_MANIFEST_FIXTURE,
  Y_UP_TO_Z_UP_ROTATION,
  assetFixtures,
  coordinateFixtures,
} from "./fixtures.js";

describe("foundation fixtures", () => {
  it("defines a one-meter cube with eight vertices and twelve triangles", () => {
    expect(UNIT_CUBE_FIXTURE.edgeLengthMeters).toBe(1);
    expect(UNIT_CUBE_FIXTURE.vertices).toHaveLength(8);
    expect(UNIT_CUBE_FIXTURE.triangles).toHaveLength(12);
  });

  it("defines the LK axes without relying on display color", () => {
    expect(COORDINATE_AXES_FIXTURE.axes.map((axis) => axis.axis)).toEqual(["+X", "+Y", "+Z"]);
    expect(COORDINATE_AXES_FIXTURE.axes.map((axis) => axis.label)).toEqual([
      "+X forward",
      "+Y left",
      "+Z up",
    ]);
  });

  it("keeps robot and path values renderer-neutral and framed", () => {
    expect(ROBOT_POSE_FIXTURE.kind).toBe("robot");
    expect(PATH_FIXTURE.kind).toBe("path");
    expect(ROBOT_POSE_FIXTURE.pose.frame).toBe(PATH_FIXTURE.frame);
    expect(PATH_FIXTURE.points.some((point) => point[2] !== 0)).toBe(true);
  });

  it("declares an explicit Y-up to Z-up transform and checksum", () => {
    expect(Y_UP_GLB_MANIFEST_FIXTURE.fileCoordinate.upAxis).toBe("+Y");
    expect(Y_UP_GLB_MANIFEST_FIXTURE.fileToCoreTransform.rotation).toEqual(Y_UP_TO_Z_UP_ROTATION);
    expect(Y_UP_GLB_MANIFEST_FIXTURE.integrity?.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("contains every required invalid manifest category", () => {
    expect(Object.keys(INVALID_ASSET_MANIFEST_FIXTURES).sort()).toEqual([
      "invalid-axis",
      "invalid-bounds",
      "invalid-checksum",
      "invalid-frame",
      "invalid-unit",
    ]);
  });

  it("publishes the canonical coordinate and asset fixture catalogs", () => {
    expect(Object.keys(coordinateFixtures)).toEqual([
      "unitCube",
      "shiftedOrigin",
      "robotPose",
      "path",
    ]);
    expect(assetFixtures.gltfYUp.manifest).toBe(Y_UP_GLB_MANIFEST_FIXTURE);
    expect(assetFixtures.legacyZUp.manifest).toBe(LEGACY_Z_UP_GLB_MANIFEST_FIXTURE);
    expect(assetFixtures.gltfYUp.sourceUrl).toBeInstanceOf(URL);
  });

  it("binds each asset fixture checksum to the embedded minimal GLB bytes", () => {
    for (const fixture of Object.values(assetFixtures)) {
      const encoded = fixture.sourceUrl.href.split(",", 2)[1];
      expect(encoded).toBeDefined();
      if (encoded === undefined) {
        throw new Error(`Fixture ${fixture.name} has no data URL payload.`);
      }
      const digest = createHash("sha256").update(Buffer.from(encoded, "base64")).digest("hex");

      expect(digest).toBe(fixture.sha256);
      expect(fixture.manifest.integrity?.sha256).toBe(digest);
    }
  });
});
