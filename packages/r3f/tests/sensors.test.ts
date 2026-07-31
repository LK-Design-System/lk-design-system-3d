import { describe, expect, it } from "vitest";
import { frameId } from "@lk-robotics/lds-3d-core";

import { assertValidVoxelSnapshot, computeFrustumCorners } from "../src/sensors.js";

describe("computeFrustumCorners", () => {
  it("derives near/far rectangles from the intrinsics along local +X", () => {
    const corners = computeFrustumCorners(Math.PI / 2, 2, 1, 4);
    expect(corners).toHaveLength(8);
    expect(corners[0]?.[0]).toBe(1);
    expect(Math.abs(corners[0]?.[2] ?? 0)).toBeCloseTo(1, 12);
    expect(Math.abs(corners[0]?.[1] ?? 0)).toBeCloseTo(2, 12);
    expect(corners[4]?.[0]).toBe(4);
    expect(Math.abs(corners[4]?.[2] ?? 0)).toBeCloseTo(4, 12);
  });

  it("rejects invalid intrinsics", () => {
    expect(() => computeFrustumCorners(0, 1, 0.1, 1)).toThrow(TypeError);
    expect(() => computeFrustumCorners(Math.PI, 1, 0.1, 1)).toThrow(TypeError);
    expect(() => computeFrustumCorners(1, -1, 0.1, 1)).toThrow(TypeError);
    expect(() => computeFrustumCorners(1, 1, 1, 1)).toThrow(/greater than nearMeters/u);
  });
});

describe("assertValidVoxelSnapshot", () => {
  const FRAME = frameId("lk-map");

  it("returns the voxel count for a valid snapshot", () => {
    const snapshot = {
      frame: FRAME,
      resolutionMeters: 0.1,
      centers: new Float32Array([0, 0, 0.05, 0.1, 0, 0.05]),
    };
    expect(assertValidVoxelSnapshot(snapshot, 8)).toBe(2);
  });

  it("rejects malformed centers, budgets, and resolutions", () => {
    const centers = new Float32Array([0, 0, 0.05]);
    expect(() =>
      assertValidVoxelSnapshot({ frame: FRAME, resolutionMeters: 0, centers }, 8),
    ).toThrow(TypeError);
    expect(() =>
      assertValidVoxelSnapshot(
        { frame: FRAME, resolutionMeters: 0.1, centers: new Float32Array([1, 2]) },
        8,
      ),
    ).toThrow(/xyz triplets/u);
    expect(() =>
      assertValidVoxelSnapshot(
        { frame: FRAME, resolutionMeters: 0.1, centers: new Float32Array([1, 2, Number.NaN]) },
        8,
      ),
    ).toThrow(/finite/u);
    expect(() =>
      assertValidVoxelSnapshot({ frame: FRAME, resolutionMeters: 0.1, centers }, 0),
    ).toThrow(/positive integer/u);
    expect(() =>
      assertValidVoxelSnapshot(
        { frame: FRAME, resolutionMeters: 0.1, centers: new Float32Array(9) },
        2,
      ),
    ).toThrow(/exceeds the declared budget/u);
  });
});
