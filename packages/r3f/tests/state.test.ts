import { describe, expect, it } from "vitest";
import { bounds3, computeFocusCameraState, entityId, frameId } from "@lk-design-system/lds-3d-core";

import {
  EMPTY_INTERACTION_STATE,
  calculatePathLength,
  createPathSegments,
  reduceSceneInteraction,
  SCENE_CANVAS_VERTICAL_FOV_RADIANS,
  resolveCameraPose,
  validateSceneRenderState,
} from "../src/state.js";

describe("scene state helpers", () => {
  it("resolves a Z-up top camera above the target", () => {
    const pose = resolveCameraPose("top", { topTarget: [3, 4, 1] });
    expect(pose.target).toEqual([3, 4, 1]);
    expect(pose.position[0]).toBe(3);
    expect(pose.position[1]).toBe(4);
    expect(pose.position[2]).toBeGreaterThan(1);
    expect(pose.up).toEqual([0, 1, 0]);
  });

  it("frames Top independently from the selected Focus target", () => {
    const floor = bounds3(frameId("map"), [-9, -6, 0], [9, 6, 0]);
    const top = resolveCameraPose("top", {
      topBounds: floor,
      focusTarget: [8, 5, 0.4],
    });
    const focus = resolveCameraPose("focus", {
      topBounds: floor,
      focusTarget: [8, 5, 0.4],
    });
    expect(top.target).toEqual([0, 0, 0]);
    // The fitted view contains the whole floor at the canvas aspect (the old
    // r3f-only formula ignored aspect and stood ~50% too far back).
    const height = top.position[2];
    const halfHeight = height * Math.tan(SCENE_CANVAS_VERTICAL_FOV_RADIANS / 2);
    expect(halfHeight).toBeGreaterThanOrEqual(6);
    expect(halfHeight * (16 / 9)).toBeGreaterThanOrEqual(9);
    expect(focus.target).toEqual([8, 5, 0.4]);
  });

  it("fits focus distance to a target bounds", () => {
    const bounds = bounds3(frameId("map"), [-5, -1, 0], [5, 1, 2]);
    const pose = resolveCameraPose("focus", { focusBounds: bounds });
    expect(pose.target).toEqual([0, 0, 1]);
    const distance = Math.hypot(
      pose.position[0] - pose.target[0],
      pose.position[1] - pose.target[1],
      pose.position[2] - pose.target[2],
    );
    // Same fit as the three host: both call the core camera solver.
    const direction = [0.75, -1, 0.62] as const;
    const core = computeFocusCameraState({
      current: {
        frame: bounds.frame,
        position: [direction[0], direction[1], 1 + direction[2]],
        target: [0, 0, 1],
        up: [0, 0, 1],
        projection: {
          kind: "perspective",
          verticalFovRadians: SCENE_CANVAS_VERTICAL_FOV_RADIANS,
          aspect: 16 / 9,
          nearMeters: 0.05,
          farMeters: 10_000,
        },
      },
      target: bounds,
      viewportAspect: 16 / 9,
    });
    const coreDistance = Math.hypot(
      core.position[0] - core.target[0],
      core.position[1] - core.target[1],
      core.position[2] - core.target[2],
    );
    expect(distance).toBeCloseTo(Math.max(4, coreDistance), 6);
  });

  it("keeps hover and selection as independent semantic channels", () => {
    const robot = entityId("robot-01");
    const goal = entityId("goal-01");
    const hovered = reduceSceneInteraction(EMPTY_INTERACTION_STATE, {
      type: "hover",
      entityId: robot,
    });
    const selected = reduceSceneInteraction(hovered, { type: "select", entityId: goal });
    expect(selected).toEqual({ hovered: robot, selected: goal });
    expect(reduceSceneInteraction(selected, { type: "leave", entityId: robot })).toEqual({
      hovered: null,
      selected: goal,
    });
  });

  it("builds metric path segments", () => {
    const points = [
      [0, 0, 0],
      [3, 4, 0],
      [3, 4, 2],
    ] as const;
    expect(createPathSegments(points)).toHaveLength(2);
    expect(calculatePathLength(points)).toBe(7);
  });

  it("rejects invalid loading progress", () => {
    expect(() => validateSceneRenderState({ kind: "loading", progress: 1.2 })).toThrow(
      /between 0 and 1/u,
    );
  });
});
