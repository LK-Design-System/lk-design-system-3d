import { describe, expect, it } from "vitest";
import { Mesh, type MeshBasicMaterial } from "three";

import {
  DEFAULT_GOAL_RADIUS_METERS,
  DEFAULT_PATH_WIDTH_METERS,
  OPERATIONAL_SCENE_TOKENS,
  assetId,
  entityId,
  frameId,
  type SceneThemeValues,
} from "@lk-design-system/lds-3d-core";

import { createThreeVisualInstance } from "../src/r3f-bridge.js";

const FRAME = frameId("map");

function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`${what} was not created.`);
  return value;
}
// The canonical palette, not a test-local one (the old test palette encoded
// the same path/goal swap the host shipped).
const THEME: SceneThemeValues = OPERATIONAL_SCENE_TOKENS;

describe("shared Three visual factory", () => {
  it("creates and updates an in-core-frame fallback robot without renderer ownership leaks", () => {
    const visual = createThreeVisualInstance({
      sceneFrame: FRAME,
      theme: THEME,
      entity: {
        kind: "robot",
        id: entityId("robot-01"),
        assetId: assetId("amr"),
        pose: { frame: FRAME, position: [1, 2, 0], orientation: [0, 0, 0, 1] },
      },
    });

    expect(visual.object.position.toArray()).toEqual([1, 2, 0]);
    visual.update({
      sceneFrame: FRAME,
      theme: THEME,
      entity: {
        kind: "robot",
        id: entityId("robot-01"),
        assetId: assetId("amr"),
        pose: { frame: FRAME, position: [3, -1, 0.5], orientation: [0, 0, 0, 1] },
      },
    });
    expect(visual.object.position.toArray()).toEqual([3, -1, 0.5]);

    visual.dispose();
    visual.dispose();
    expect(visual.object.children).toHaveLength(0);
  });

  it("rejects a visual entity from another frame", () => {
    expect(() =>
      createThreeVisualInstance({
        sceneFrame: FRAME,
        theme: THEME,
        entity: {
          kind: "goal",
          id: entityId("goal-01"),
          pose: { frame: frameId("odom"), position: [0, 0, 0], orientation: [0, 0, 0, 1] },
        },
      }),
    ).toThrow(/scene frame/u);
  });

  it("keeps fallback path geometry finite for Three raycasting", () => {
    const visual = createThreeVisualInstance({
      sceneFrame: FRAME,
      theme: THEME,
      entity: {
        kind: "path",
        id: entityId("path-01"),
        frame: FRAME,
        points: [
          [-3, -2, 0.04],
          [-1, -1, 0.04],
          [1, 0, 0.04],
          [3.5, 2, 0.04],
        ],
      },
    });
    const ribbon = visual.object.children.find(
      (child): child is Mesh => child instanceof Mesh && child.name === "lkds3d:path",
    );

    const mesh = required(ribbon, "path ribbon");
    mesh.geometry.computeBoundingSphere();
    expect(Number.isFinite(mesh.geometry.boundingSphere?.radius)).toBe(true);
    // A ribbon at the default width, not a 1 px line that ignores widthMeters.
    const position = mesh.geometry.getAttribute("position");
    const across = Math.hypot(
      position.getX(0) - position.getX(1),
      position.getY(0) - position.getY(1),
    );
    expect(across).toBeCloseTo(DEFAULT_PATH_WIDTH_METERS, 6);
    expect((mesh.material as MeshBasicMaterial).color.getHexString()).toBe(
      OPERATIONAL_SCENE_TOKENS["path.default"].slice(1).toLowerCase(),
    );
    visual.dispose();
  });

  it("draws the fallback goal as a ground ring with faces, in the goal colour", () => {
    const visual = createThreeVisualInstance({
      sceneFrame: FRAME,
      theme: THEME,
      entity: {
        kind: "goal",
        id: entityId("goal-01"),
        pose: { frame: FRAME, position: [1, 2, 0], orientation: [0, 0, 0, 1] },
      },
    });
    const ring = visual.object.children.find(
      (child): child is Mesh => child instanceof Mesh && child.name === "lkds3d:goal",
    );
    const goal = required(ring, "goal ring");
    // ConeGeometry(r, r, 0.18, 24) floored radialSegments to 0 — no faces.
    expect(goal.geometry.index?.count ?? 0).toBeGreaterThan(0);
    goal.geometry.computeBoundingSphere();
    expect(goal.geometry.boundingSphere?.radius).toBeCloseTo(DEFAULT_GOAL_RADIUS_METERS, 3);
    expect((goal.material as MeshBasicMaterial).color.getHexString()).toBe(
      OPERATIONAL_SCENE_TOKENS["goal.default"].slice(1).toLowerCase(),
    );
    visual.dispose();
  });
});
