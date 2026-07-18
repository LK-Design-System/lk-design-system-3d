import { describe, expect, it } from "vitest";

import {
  FrameMismatchError,
  bounds3,
  computeFocusCameraState,
  computeHomeCameraState,
  computeTopCameraState,
  createCameraState,
  frameId,
  framedPoint3,
} from "../src/index.js";

const MAP = frameId("map");
const MAP_BOUNDS = bounds3(MAP, [-4, -2, 0], [8, 6, 3]);

describe("pure camera solvers", () => {
  it("returns a deterministic home view in the target frame without a canvas", () => {
    const first = computeHomeCameraState({ target: MAP_BOUNDS, viewportAspect: 16 / 9 });
    const second = computeHomeCameraState({ target: MAP_BOUNDS, viewportAspect: 16 / 9 });

    expect(first).toEqual(second);
    expect(first.frame).toBe(MAP);
    expect(first.target).toEqual([2, 2, 1.5]);
    expect(first.position[2]).toBeGreaterThan(first.target[2]);
    expect(first.projection).toMatchObject({ kind: "perspective", aspect: 16 / 9 });
  });

  it("returns a top-down state with an explicit non-parallel up vector", () => {
    const top = computeTopCameraState({ target: MAP_BOUNDS, viewportAspect: 4 / 3 });

    expect(top.target).toEqual([2, 2, 1.5]);
    expect(top.position[0]).toBeCloseTo(top.target[0], 12);
    expect(top.position[1]).toBeCloseTo(top.target[1], 12);
    expect(top.position[2]).toBeGreaterThan(top.target[2]);
    expect(top.up).toEqual([0, 1, 0]);
  });

  it("preserves the current projection family and direction when focusing", () => {
    const current = createCameraState({
      frame: MAP,
      position: [12, -10, 9],
      target: [0, 0, 0],
      up: [0, 0, 1],
      projection: {
        kind: "orthographic",
        verticalSizeMeters: 18,
        aspect: 1,
        nearMeters: 0.1,
        farMeters: 500,
      },
    });
    const focus = computeFocusCameraState({
      current,
      target: framedPoint3(MAP, [3, -1, 0]),
      viewportAspect: 2,
      paddingRatio: 0.2,
    });

    expect(focus.projection).toMatchObject({ kind: "orthographic", aspect: 2 });
    expect(focus.target).toEqual([3, -1, 0]);
    expect(focus.position[0]).toBeGreaterThan(focus.target[0]);
    expect(focus.position[1]).toBeLessThan(focus.target[1]);
  });

  it("rejects an unframed solve across different current and target frames", () => {
    const current = createCameraState({
      frame: frameId("odom"),
      position: [1, 0, 1],
      target: [0, 0, 0],
      up: [0, 0, 1],
      projection: {
        kind: "perspective",
        verticalFovRadians: Math.PI / 3,
        aspect: 1,
        nearMeters: 0.1,
        farMeters: 100,
      },
    });

    expect(() =>
      computeFocusCameraState({ current, target: MAP_BOUNDS, viewportAspect: 1 }),
    ).toThrow(FrameMismatchError);
  });

  it("rejects invalid camera projection and padding input before calculation", () => {
    expect(() =>
      createCameraState({
        frame: MAP,
        position: [1, 0, 1],
        target: [0, 0, 0],
        up: [0, 0, 1],
        projection: {
          kind: "perspective",
          verticalFovRadians: Math.PI,
          aspect: 1,
          nearMeters: 1,
          farMeters: 2,
        },
      }),
    ).toThrow(/verticalFovRadians/u);
    expect(() =>
      computeHomeCameraState({ target: MAP_BOUNDS, viewportAspect: 1, paddingRatio: 1 }),
    ).toThrow(/paddingRatio/u);
  });
});
