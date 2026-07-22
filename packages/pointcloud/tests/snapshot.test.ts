import { FrameMismatchError, frameId } from "@lk-robotics/lds-3d-core";
import { describe, expect, it } from "vitest";

import {
  assertPointCloudFrame,
  assertPointCloudSnapshot,
  createPointCloudSnapshot,
  PointCloudValidationError,
  resolvePointCloudRenderState,
} from "../src/index.js";

const MAP_FRAME = frameId("lk-map");

function snapshot(positions = new Float32Array([1, 2, 3, -4, 5, 6])) {
  return createPointCloudSnapshot({ frame: MAP_FRAME, positions, revision: 1 });
}

describe("PointCloudSnapshot", () => {
  it("derives point count and bounds without taking ownership of caller buffers", () => {
    const positions = new Float32Array([1, 2, 3, -4, 5, 6]);
    const colors = new Float32Array([0.1, 0.2, 0.3, 0.8, 0.9, 1]);
    const value = createPointCloudSnapshot({
      frame: MAP_FRAME,
      positions,
      colors,
      revision: "warehouse-a",
    });

    expect(value.positions).toBe(positions);
    expect(value.colors).toBe(colors);
    expect(value.bufferOwnership).toBe("caller-retained");
    expect(value.pointCount).toBe(2);
    expect(value.bounds).toEqual({ frame: MAP_FRAME, min: [-4, 2, 3], max: [1, 5, 6] });
  });

  it("uses null bounds for a valid empty snapshot", () => {
    const value = snapshot(new Float32Array());
    expect(value.pointCount).toBe(0);
    expect(value.bounds).toBeNull();
    expect(resolvePointCloudRenderState(value, MAP_FRAME, 10)).toEqual({
      kind: "empty",
      requestedPointCount: 0,
      acceptedPointCount: 0,
    });
  });

  it("rejects malformed, non-finite, and incompatible color buffers", () => {
    expect(() => snapshot(new Float32Array([1, 2]))).toThrow(PointCloudValidationError);
    expect(() => snapshot(new Float32Array([1, Number.NaN, 3]))).toThrow(PointCloudValidationError);
    expect(() =>
      createPointCloudSnapshot({
        frame: MAP_FRAME,
        positions: new Float32Array([1, 2, 3]),
        colors: new Float32Array([1, 0]),
        revision: 1,
      }),
    ).toThrow(PointCloudValidationError);
    expect(() =>
      createPointCloudSnapshot({
        frame: MAP_FRAME,
        positions: new Float32Array([1, 2, 3]),
        colors: new Float32Array([1.1, 0, 0]),
        revision: 1,
      }),
    ).toThrow(PointCloudValidationError);
  });

  it("validates a forged snapshot before it reaches an adapter", () => {
    const value = snapshot();
    expect(() => assertPointCloudSnapshot({ ...value, pointCount: 99 })).toThrow(
      "pointCount must be derived",
    );
  });

  it("does not transform or silently sample a mismatched or over-budget snapshot", () => {
    const value = snapshot();
    const ODOM_FRAME = frameId("odom");

    expect(resolvePointCloudRenderState(value, MAP_FRAME, 10)).toEqual({
      kind: "ready",
      requestedPointCount: 2,
      acceptedPointCount: 2,
    });

    expect(() => assertPointCloudFrame(value, ODOM_FRAME)).toThrow(FrameMismatchError);
    expect(resolvePointCloudRenderState(value, ODOM_FRAME, 10)).toEqual({
      kind: "frame-mismatch",
      expectedFrame: ODOM_FRAME,
      actualFrame: MAP_FRAME,
      requestedPointCount: 2,
      acceptedPointCount: 0,
    });
    expect(resolvePointCloudRenderState(value, MAP_FRAME, 1)).toEqual({
      kind: "budget-exceeded",
      maxPoints: 1,
      requestedPointCount: 2,
      acceptedPointCount: 0,
    });
  });
});
