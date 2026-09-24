import { describe, expect, it } from "vitest";

import {
  FrameMismatchError,
  cameraTransitionProgress,
  clipCameraBoom,
  computeFollowCameraState,
  easeInOutQuintic,
  frameId,
  interpolateCameraState,
  type CameraProjection,
} from "../src/index.js";

const MAP = frameId("map");
const PROJECTION: CameraProjection = {
  kind: "perspective",
  verticalFovRadians: (42 * Math.PI) / 180,
  aspect: 16 / 9,
  nearMeters: 0.05,
  farMeters: 1000,
};

describe("computeFollowCameraState", () => {
  it("trails behind the subject in third person and looks at it", () => {
    const state = computeFollowCameraState({
      frame: MAP,
      subjectPosition: [10, 5, 0],
      headingRadians: 0,
      mode: "third-person",
      projection: PROJECTION,
    });
    expect(state.position).toEqual([4, 5, 3]);
    expect(state.target).toEqual([10, 5, 1]);
    expect(state.up).toEqual([0, 0, 1]);
  });

  it("rides at eye height and looks ahead in first person", () => {
    const state = computeFollowCameraState({
      frame: MAP,
      subjectPosition: [0, 0, 2],
      headingRadians: Math.PI / 2,
      mode: "first-person",
      projection: PROJECTION,
      lookAheadMeters: 4,
    });
    expect(state.position).toEqual([0, 0, 3.2]);
    expect(state.target[0]).toBeCloseTo(0, 9);
    expect(state.target[1]).toBeCloseTo(4, 9);
    expect(state.target[2]).toBeCloseTo(3.2, 9);
  });

  it("rejects invalid offsets", () => {
    expect(() =>
      computeFollowCameraState({
        frame: MAP,
        subjectPosition: [0, 0, 0],
        headingRadians: 0,
        mode: "third-person",
        projection: PROJECTION,
        distanceMeters: 0,
      }),
    ).toThrow(RangeError);
  });
});

describe("camera transitions", () => {
  it("eases from 0 to 1 with zero slope at both ends", () => {
    expect(easeInOutQuintic(0)).toBe(0);
    expect(easeInOutQuintic(1)).toBe(1);
    expect(easeInOutQuintic(0.5)).toBeCloseTo(0.5, 9);
    expect(easeInOutQuintic(0.01)).toBeLessThan(0.001);
    expect(easeInOutQuintic(-1)).toBe(0);
  });

  it("completes immediately under reduced motion", () => {
    expect(cameraTransitionProgress(0, 800, true)).toBe(1);
    expect(cameraTransitionProgress(400, 800, false)).toBe(0.5);
    expect(cameraTransitionProgress(1200, 800, false)).toBe(1);
  });

  it("interpolates position and target and lands exactly on the destination", () => {
    const from = computeFollowCameraState({
      frame: MAP,
      subjectPosition: [0, 0, 0],
      headingRadians: 0,
      mode: "third-person",
      projection: PROJECTION,
    });
    const to = computeFollowCameraState({
      frame: MAP,
      subjectPosition: [10, 0, 0],
      headingRadians: 0,
      mode: "third-person",
      projection: PROJECTION,
    });
    const half = interpolateCameraState(from, to, 0.5);
    expect(half.position).toEqual([-1, 0, 3]);
    expect(half.target).toEqual([5, 0, 1]);
    expect(interpolateCameraState(from, to, 1)).toEqual(to);
  });

  it("refuses to blend states from different frames", () => {
    const a = computeFollowCameraState({
      frame: MAP,
      subjectPosition: [0, 0, 0],
      headingRadians: 0,
      mode: "third-person",
      projection: PROJECTION,
    });
    const b = { ...a, frame: frameId("odom") };
    expect(() => interpolateCameraState(a, b, 0.5)).toThrow(FrameMismatchError);
  });
});

describe("clipCameraBoom", () => {
  const trailing = computeFollowCameraState({
    frame: MAP,
    subjectPosition: [0, 0, 0],
    headingRadians: 0,
    mode: "third-person",
    projection: PROJECTION,
    distanceMeters: 8,
    heightMeters: 0,
    lookAtHeightMeters: 0,
  });

  it("pulls the eye in front of the first obstacle", () => {
    const clipped = clipCameraBoom(trailing, 3, { marginMeters: 0.5 });
    expect(clipped.position[0]).toBeCloseTo(-2.5, 9);
    expect(clipped.target).toEqual(trailing.target);
  });

  it("keeps a minimum distance and ignores distant obstacles", () => {
    expect(clipCameraBoom(trailing, 0.1).position[0]).toBeCloseTo(-0.5, 9);
    expect(clipCameraBoom(trailing, 50)).toEqual(trailing);
    expect(clipCameraBoom(trailing, undefined)).toEqual(trailing);
  });
});
