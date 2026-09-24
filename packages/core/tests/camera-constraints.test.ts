import { describe, expect, it } from "vitest";

import {
  applyCameraConstraints,
  clampPointToPolygon2,
  closestPointOnPolygon2,
  createCameraState,
  fitDistanceForRadius,
  frameId,
  isPointInPolygon2,
  maxPolarAngleAt,
  type CameraState,
  type Polygon2,
} from "../src/index.js";

const MAP = frameId("map");
const SQUARE: Polygon2 = [
  [-10, -10],
  [10, -10],
  [10, 10],
  [-10, 10],
];

function camera(position: [number, number, number], target: [number, number, number]): CameraState {
  return createCameraState({
    frame: MAP,
    position,
    target,
    up: [0, 0, 1],
    projection: {
      kind: "perspective",
      verticalFovRadians: Math.PI / 4,
      aspect: 16 / 9,
      nearMeters: 0.05,
      farMeters: 1000,
    },
  });
}

describe("ground polygons", () => {
  it("tests inside, outside and edge points", () => {
    expect(isPointInPolygon2(0, 0, SQUARE)).toBe(true);
    expect(isPointInPolygon2(11, 0, SQUARE)).toBe(false);
    expect(isPointInPolygon2(10, 3, SQUARE)).toBe(true);
  });

  it("clamps outside points to the nearest edge and keeps inside points", () => {
    expect(closestPointOnPolygon2(15, 2, SQUARE)).toEqual([10, 2]);
    expect(clampPointToPolygon2(15, 20, SQUARE)).toEqual([10, 10]);
    expect(clampPointToPolygon2(1, 2, SQUARE)).toEqual([1, 2]);
  });

  it("rejects degenerate polygons", () => {
    expect(() =>
      isPointInPolygon2(0, 0, [
        [0, 0],
        [1, 1],
      ]),
    ).toThrow(RangeError);
  });
});

describe("fitDistanceForRadius", () => {
  it("uses the narrower of the vertical and horizontal FOV", () => {
    const wide = fitDistanceForRadius(5, Math.PI / 4, 16 / 9, 0);
    expect(wide).toBeCloseTo(5 / Math.sin(Math.PI / 8), 6);
    const tall = fitDistanceForRadius(5, Math.PI / 4, 0.5, 0);
    expect(tall).toBeGreaterThan(wide);
  });
});

describe("applyCameraConstraints", () => {
  it("returns the input unchanged when every rule already holds", () => {
    const input = camera([0, -8, 6], [0, 0, 0]);
    const result = applyCameraConstraints(input, { positionPolygon: SQUARE, minDistanceMeters: 2 });
    expect(result.applied).toEqual([]);
    expect(result.state).toEqual(input);
  });

  it("clamps the target into its polygon and keeps the view offset", () => {
    const result = applyCameraConstraints(camera([20, -5, 5], [20, 0, 0]), {
      targetPolygon: SQUARE,
    });
    expect(result.applied).toContain("target-polygon");
    expect(result.state.target).toEqual([10, 0, 0]);
    expect(result.state.position).toEqual([10, -5, 5]);
  });

  it("enforces the distance range along the view direction", () => {
    const near = applyCameraConstraints(camera([0, -1, 0], [0, 0, 0]), { minDistanceMeters: 5 });
    expect(near.state.position[1]).toBeCloseTo(-5, 9);
    const far = applyCameraConstraints(camera([0, -100, 0], [0, 0, 0]), { maxDistanceMeters: 40 });
    expect(far.state.position[1]).toBeCloseTo(-40, 9);
    expect(far.applied).toEqual(["distance"]);
  });

  it("tightens tilt with distance so a far camera cannot see the horizon", () => {
    const limit = {
      nearDistanceMeters: 10,
      nearMaxPolarRadians: (85 * Math.PI) / 180,
      farDistanceMeters: 1000,
      farMaxPolarRadians: (40 * Math.PI) / 180,
    };
    expect(maxPolarAngleAt(limit, 505)).toBeCloseTo((62.5 * Math.PI) / 180, 9);
    // A camera 500 m away almost level with the target.
    const result = applyCameraConstraints(camera([0, -500, 20], [0, 0, 0]), { polarLimit: limit });
    expect(result.applied).toContain("polar");
    const { position, target } = result.state;
    const distance = Math.hypot(
      position[0] - target[0],
      position[1] - target[1],
      position[2] - target[2],
    );
    expect(distance).toBeCloseTo(Math.hypot(500, 20), 6);
    const polar = Math.acos((position[2] - target[2]) / distance);
    expect(polar).toBeCloseTo(maxPolarAngleAt(limit, distance), 9);
    // Heading is preserved: the camera stays on the -Y side.
    expect(result.state.position[0]).toBeCloseTo(0, 9);
    expect(result.state.position[1]).toBeLessThan(0);
  });

  it("clamps the eye into its polygon and lifts it above sampled ground", () => {
    const hill = (x: number): number => (x > 5 ? 12 : 0);
    const result = applyCameraConstraints(
      camera([30, 0, 3], [0, 0, 0]),
      { positionPolygon: SQUARE, groundClearanceMeters: 8, targetGroundClearanceMeters: 1.5 },
      hill,
    );
    expect(result.applied).toEqual(["target-ground", "position-polygon", "position-ground"]);
    expect(result.state.target[2]).toBe(1.5);
    expect(result.state.position).toEqual([10, 0, 20]);
  });

  it("rejects a non-finite ground sample and inverted distance ranges", () => {
    expect(() =>
      applyCameraConstraints(camera([0, -5, 5], [0, 0, 0]), {}, () => Number.NaN),
    ).toThrow(RangeError);
    expect(() =>
      applyCameraConstraints(camera([0, -5, 5], [0, 0, 0]), {
        minDistanceMeters: 5,
        maxDistanceMeters: 2,
      }),
    ).toThrow(RangeError);
  });

  it("is deterministic", () => {
    const input = camera([40, -40, 2], [15, 0, 0]);
    const rules = { positionPolygon: SQUARE, targetPolygon: SQUARE, maxDistanceMeters: 20 };
    expect(applyCameraConstraints(input, rules)).toEqual(applyCameraConstraints(input, rules));
  });
});
