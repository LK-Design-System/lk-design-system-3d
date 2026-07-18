import { describe, expect, it } from "vitest";

import {
  GLTF_Y_UP_COORDINATE,
  createAssetReport,
  createFileToCoreRotation,
  normalizeAssetPointToCore,
  parseAssetManifest,
  validateAssetManifest,
  type AssetManifestV1,
} from "../src/index.js";

const SHA256 = "0123456789abcdef".repeat(4);

function validInput(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    assetId: "fixture/y-up-robot",
    version: "1.0.0",
    kind: "robot",
    format: "glb",
    fileFrame: "robot-file",
    fileCoordinate: {
      handedness: "right",
      upAxis: "+Y",
      forwardAxis: "+Z",
      metersPerUnit: 0.001,
    },
    coreFrame: "map",
    fileToCoreTransform: {
      sourceFrame: "robot-file",
      targetFrame: "map",
      translation: [10, -2, 0.5],
      rotation: [0.5, 0.5, 0.5, 0.5],
    },
    boundsInCoreMeters: {
      frame: "map",
      min: [9, -3, 0],
      max: [11, -1, 2],
    },
    integrity: { sha256: SHA256 },
  };
}

function issueCodes(input: unknown): string[] {
  return validateAssetManifest(input).map((entry) => entry.code);
}

describe("AssetManifestV1", () => {
  it("parses and runtime-freezes a valid, explicit Y-up GLB manifest", () => {
    const result = parseAssetManifest(validInput());
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.fileCoordinate).toEqual({
      handedness: "right",
      upAxis: "+Y",
      forwardAxis: "+Z",
      metersPerUnit: 0.001,
    });
    expect(result.value.integrity?.sha256).toBe(SHA256);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.fileToCoreTransform.rotation)).toBe(true);
    expect(createAssetReport(validInput())).toMatchObject({ valid: true, issues: [] });
  });

  it("defines the exact glTF Y-up to LK Z-up/+X-forward rotation", () => {
    expect(GLTF_Y_UP_COORDINATE).toEqual({
      handedness: "right",
      upAxis: "+Y",
      forwardAxis: "+Z",
      metersPerUnit: 1,
    });
    expect(createFileToCoreRotation("+Y", "+Z")).toEqual([0.5, 0.5, 0.5, 0.5]);
  });

  it("normalizes unit, basis, and translation in the normative order", () => {
    const result = parseAssetManifest(validInput());
    expect(result.ok).toBe(true);
    const manifest = (result as { readonly value: AssetManifestV1 }).value;

    // File +Y is core +Z. 1,000 millimeters becomes 1 meter before rotation.
    const point = normalizeAssetPointToCore(manifest, [0, 1000, 0]);
    expect(point.frame).toBe("map");
    expect(point.value[0]).toBeCloseTo(10, 12);
    expect(point.value[1]).toBeCloseTo(-2, 12);
    expect(point.value[2]).toBeCloseTo(1.5, 12);
  });

  it.each([
    [
      "left-handed coordinates",
      (input: Record<string, unknown>) => {
        (input.fileCoordinate as Record<string, unknown>).handedness = "left";
      },
      "coordinate.left_handed_unsupported",
    ],
    [
      "collinear axes",
      (input: Record<string, unknown>) => {
        (input.fileCoordinate as Record<string, unknown>).forwardAxis = "-Y";
      },
      "coordinate.invalid_axis_pair",
    ],
    [
      "non-positive unit",
      (input: Record<string, unknown>) => {
        (input.fileCoordinate as Record<string, unknown>).metersPerUnit = 0;
      },
      "coordinate.invalid_unit",
    ],
    [
      "source frame mismatch",
      (input: Record<string, unknown>) => {
        (input.fileToCoreTransform as Record<string, unknown>).sourceFrame = "other";
      },
      "transform.source_frame_mismatch",
    ],
    [
      "target frame mismatch",
      (input: Record<string, unknown>) => {
        (input.fileToCoreTransform as Record<string, unknown>).targetFrame = "other";
      },
      "transform.target_frame_mismatch",
    ],
    [
      "bounds frame mismatch",
      (input: Record<string, unknown>) => {
        (input.boundsInCoreMeters as Record<string, unknown>).frame = "other";
      },
      "bounds.frame_mismatch",
    ],
    [
      "inverted bounds",
      (input: Record<string, unknown>) => {
        (input.boundsInCoreMeters as Record<string, unknown>).min = [12, -3, 0];
      },
      "bounds.invalid_order",
    ],
    [
      "invalid checksum",
      (input: Record<string, unknown>) => {
        (input.integrity as Record<string, unknown>).sha256 = "not-a-sha";
      },
      "integrity.invalid_sha256",
    ],
    [
      "non-normalized quaternion",
      (input: Record<string, unknown>) => {
        (input.fileToCoreTransform as Record<string, unknown>).rotation = [1, 1, 1, 1];
      },
      "transform.quaternion_not_normalized",
    ],
    [
      "non-invertible transform",
      (input: Record<string, unknown>) => {
        (input.fileToCoreTransform as Record<string, unknown>).rotation = [0, 0, 0, 0];
      },
      "transform.non_invertible",
    ],
    [
      "non-finite transform",
      (input: Record<string, unknown>) => {
        (input.fileToCoreTransform as Record<string, unknown>).translation = [Number.NaN, 0, 0];
      },
      "number.non_finite",
    ],
  ])("rejects %s", (_name, mutate, expectedCode) => {
    const input = validInput();
    mutate(input);
    expect(issueCodes(input)).toContain(expectedCode);
    expect(parseAssetManifest(input).ok).toBe(false);
  });

  it("rejects a normalized rotation that contradicts the declared axes", () => {
    const input = validInput();
    (input.fileToCoreTransform as Record<string, unknown>).rotation = [0, 0, 0, 1];
    expect(issueCodes(input)).toContain("transform.axis_mapping_mismatch");
  });

  it("rejects unknown properties consistently with the JSON Schema", () => {
    const input = validInput();
    input.guessedAxis = "+Y";
    expect(validateAssetManifest(input)).toContainEqual(
      expect.objectContaining({
        path: "$.guessedAxis",
        code: "schema.unexpected_property",
      }),
    );
  });

  it("rejects non-finite input points instead of leaking NaN into core", () => {
    const parsed = parseAssetManifest(validInput());
    expect(parsed.ok).toBe(true);
    const manifest = (parsed as { readonly value: AssetManifestV1 }).value;
    expect(() => normalizeAssetPointToCore(manifest, [Number.NaN, 0, 0])).toThrow(/finite/);
  });
});
