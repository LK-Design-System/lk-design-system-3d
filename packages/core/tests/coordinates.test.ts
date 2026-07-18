import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  CoordinateValidationError,
  FrameMismatchError,
  LK_CORE_COORDINATE_SYSTEM,
  bounds3,
  composeTransforms,
  frameId,
  framedPoint3,
  identityTransform,
  invertTransform,
  normalizeQuaternion,
  pose3,
  quaternionFromYaw,
  rigidTransform3,
  transformPoint,
  transformPose,
  transformToMatrix4,
  vec3,
  type Vec3,
} from "../src/index.js";

const closeToVec3 = (actual: Vec3, expected: Vec3, digits = 12): void => {
  expect(actual[0]).toBeCloseTo(expected[0], digits);
  expect(actual[1]).toBeCloseTo(expected[1], digits);
  expect(actual[2]).toBeCloseTo(expected[2], digits);
};

describe("LK core coordinate contract", () => {
  it("is right-handed, Z-up, +X-forward, and measured in meters", () => {
    expect(LK_CORE_COORDINATE_SYSTEM).toEqual({
      handedness: "right",
      upAxis: "+Z",
      forwardAxis: "+X",
      metersPerUnit: 1,
    });
  });

  it("creates an identity transform in one explicit frame", () => {
    const map = frameId("map");
    expect(identityTransform(map)).toEqual({
      sourceFrame: map,
      targetFrame: map,
      translation: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    });
  });

  it("applies a Z-axis yaw and translation to a framed point", () => {
    const source = frameId("robot");
    const target = frameId("map");
    const transform = rigidTransform3(
      source,
      target,
      vec3(10, 20, 3),
      quaternionFromYaw(Math.PI / 2),
    );

    const result = transformPoint(transform, framedPoint3(source, vec3(2, 0, 1)));

    expect(result.frame).toBe(target);
    closeToVec3(result.value, [10, 22, 4]);
  });

  it("composes adjacent transforms in source-to-target order", () => {
    const robot = frameId("robot");
    const odom = frameId("odom");
    const map = frameId("map");
    const robotToOdom = rigidTransform3(robot, odom, [1, 0, 0], quaternionFromYaw(Math.PI / 2));
    const odomToMap = rigidTransform3(odom, map, [10, 0, 0], quaternionFromYaw(Math.PI / 2));

    const composed = composeTransforms(robotToOdom, odomToMap);
    const sequential = transformPoint(
      odomToMap,
      transformPoint(robotToOdom, framedPoint3(robot, [2, 1, 0])),
    );
    const direct = transformPoint(composed, framedPoint3(robot, [2, 1, 0]));

    expect(direct.frame).toBe(map);
    closeToVec3(direct.value, sequential.value);
  });

  it("round-trips arbitrary bounded points through a transform and its inverse", () => {
    const source = frameId("source");
    const target = frameId("target");
    const finite = fc.double({
      min: -1_000_000,
      max: 1_000_000,
      noNaN: true,
      noDefaultInfinity: true,
    });

    fc.assert(
      fc.property(
        finite,
        finite,
        finite,
        finite,
        finite,
        finite,
        fc.double({
          min: -Math.PI,
          max: Math.PI,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        (px, py, pz, tx, ty, tz, yaw) => {
          const transform = rigidTransform3(source, target, [tx, ty, tz], quaternionFromYaw(yaw));
          const point = framedPoint3(source, [px, py, pz]);
          const restored = transformPoint(
            invertTransform(transform),
            transformPoint(transform, point),
          );

          expect(restored.frame).toBe(source);
          expect(Math.abs(restored.value[0] - px)).toBeLessThanOrEqual(1e-6);
          expect(Math.abs(restored.value[1] - py)).toBeLessThanOrEqual(1e-6);
          expect(Math.abs(restored.value[2] - pz)).toBeLessThanOrEqual(1e-6);
        },
      ),
      { numRuns: 250 },
    );
  });

  it("transforms both pose position and orientation", () => {
    const source = frameId("base");
    const target = frameId("world");
    const transform = rigidTransform3(source, target, [1, 2, 3], quaternionFromYaw(Math.PI / 2));
    const result = transformPose(
      transform,
      pose3(source, [1, 0, 0], quaternionFromYaw(Math.PI / 2)),
    );

    closeToVec3(result.position, [1, 3, 3]);
    expect(result.orientation[2]).toBeCloseTo(1, 12);
    expect(result.orientation[3]).toBeCloseTo(0, 12);
  });

  it("serializes transforms as a glTF-compatible column-major matrix", () => {
    const transform = rigidTransform3(
      frameId("source"),
      frameId("target"),
      [4, 5, 6],
      quaternionFromYaw(Math.PI / 2),
    );

    const matrix = transformToMatrix4(transform);
    expect(matrix[0]).toBeCloseTo(0, 12);
    expect(matrix[1]).toBeCloseTo(1, 12);
    expect(matrix[4]).toBeCloseTo(-1, 12);
    expect(matrix[5]).toBeCloseTo(0, 12);
    expect(matrix.slice(12)).toEqual([4, 5, 6, 1]);
  });
});

describe("coordinate validation", () => {
  const source = frameId("source");
  const target = frameId("target");

  it("rejects mismatched point and composition frames", () => {
    expect(() =>
      transformPoint(
        rigidTransform3(source, target, [0, 0, 0], [0, 0, 0, 1]),
        framedPoint3(frameId("wrong"), [0, 0, 0]),
      ),
    ).toThrow(FrameMismatchError);

    expect(() =>
      composeTransforms(
        rigidTransform3(source, target, [0, 0, 0], [0, 0, 0, 1]),
        rigidTransform3(frameId("different"), frameId("final"), [0, 0, 0], [0, 0, 0, 1]),
      ),
    ).toThrow(FrameMismatchError);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects non-finite coordinate %s",
    (invalid) => {
      expect(() => vec3(invalid, 0, 0)).toThrow(CoordinateValidationError);
      expect(() => rigidTransform3(source, target, [0, invalid, 0], [0, 0, 0, 1])).toThrow(
        CoordinateValidationError,
      );
    },
  );

  it("rejects zero and non-unit quaternions at transform and pose boundaries", () => {
    expect(() => normalizeQuaternion([0, 0, 0, 0])).toThrow(CoordinateValidationError);
    expect(() => rigidTransform3(source, target, [0, 0, 0], [0, 0, 0, 2])).toThrow(
      CoordinateValidationError,
    );
    expect(() => pose3(source, [0, 0, 0], [0, 0, 0.5, 0.5])).toThrow(CoordinateValidationError);
  });

  it("normalizes a valid non-zero quaternion only when explicitly requested", () => {
    const normalized = normalizeQuaternion([0, 0, 0, 5]);
    expect(normalized).toEqual([0, 0, 0, 1]);
  });

  it("rejects inverted or non-finite bounds", () => {
    expect(() => bounds3(source, [1, 0, 0], [0, 1, 1])).toThrow(CoordinateValidationError);
    expect(() => bounds3(source, [0, 0, 0], [1, 1, Number.NaN])).toThrow(CoordinateValidationError);
  });

  it("rejects a forged non-invertible rigid transform", () => {
    const invalid = {
      sourceFrame: source,
      targetFrame: target,
      translation: [0, 0, 0] as const,
      rotation: [0, 0, 0, 0] as const,
    };
    expect(() => invertTransform(invalid)).toThrow(CoordinateValidationError);
  });
});
