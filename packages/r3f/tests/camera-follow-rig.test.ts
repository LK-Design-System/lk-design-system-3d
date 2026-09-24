import { describe, expect, it } from "vitest";

import {
  DEFAULT_HOME_CAMERA_POSE,
  clipThreeCameraBoom,
  constrainThreeCameraPlacement,
  coreToThreePosition,
  resolveCameraPose,
} from "../src/index.js";

describe("follow camera pose", () => {
  it("trails the subject in third person by default", () => {
    const pose = resolveCameraPose("follow", {
      followSubject: { position: [10, 0, 0], headingRadians: 0 },
    });
    expect(pose.position).toEqual([4, 0, 3]);
    expect(pose.target).toEqual([10, 0, 1]);
    expect(pose.up).toEqual([0, 0, 1]);
  });

  it("supports first person and custom offsets", () => {
    const pose = resolveCameraPose("follow", {
      followSubject: {
        position: [0, 0, 0],
        headingRadians: 0,
        mode: "first-person",
        eyeHeightMeters: 1.5,
        lookAheadMeters: 5,
      },
    });
    expect(pose.position).toEqual([0, 0, 1.5]);
    expect(pose.target).toEqual([5, 0, 1.5]);
  });

  it("holds the home view without a subject", () => {
    expect(resolveCameraPose("follow")).toEqual(DEFAULT_HOME_CAMERA_POSE);
  });
});

describe("rig constraint helpers (Three space)", () => {
  const square = [
    [-10, -10],
    [10, -10],
    [10, 10],
    [-10, 10],
  ] as const;

  it("leaves a valid placement untouched", () => {
    const placement = {
      position: coreToThreePosition([0, -5, 5]),
      target: coreToThreePosition([0, 0, 0]),
    };
    const result = constrainThreeCameraPlacement(placement, { positionPolygon: square });
    expect(result.changed).toBe(false);
    expect(result.position).toEqual(placement.position);
  });

  it("converts through the core frame and back", () => {
    const result = constrainThreeCameraPlacement(
      { position: coreToThreePosition([30, 0, 5]), target: coreToThreePosition([0, 0, 0]) },
      { positionPolygon: square },
    );
    expect(result.changed).toBe(true);
    expect(result.position).toEqual(coreToThreePosition([10, 0, 5]));
  });

  it("clips the eye in front of an obstacle", () => {
    const placement = {
      position: coreToThreePosition([-8, 0, 0]),
      target: coreToThreePosition([0, 0, 0]),
    };
    const clipped = clipThreeCameraBoom(placement, 3, { marginMeters: 0.5 });
    expect(clipped.changed).toBe(true);
    expect(clipped.position[2]).toBeCloseTo(2.5, 9);
    expect(clipThreeCameraBoom(placement, 20).changed).toBe(false);
    expect(clipThreeCameraBoom(placement, undefined).changed).toBe(false);
  });
});
