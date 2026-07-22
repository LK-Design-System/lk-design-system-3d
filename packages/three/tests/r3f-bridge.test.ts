import { describe, expect, it } from "vitest";
import { Line } from "three";

import {
  assetId,
  entityId,
  frameId,
  type SceneThemeValues,
} from "@lk-robotics/lds-3d-core";

import { createThreeVisualInstance } from "../src/r3f-bridge.js";

const FRAME = frameId("map");
const THEME: SceneThemeValues = {
  "scene.background": "#ffffff",
  "grid.major": "#777777",
  "grid.minor": "#aaaaaa",
  "axis.x": "#ff0000",
  "axis.y": "#00ff00",
  "axis.z": "#0000ff",
  "selection.active": "#0088ff",
  "path.default": "#7755ff",
  "goal.default": "#00aaaa",
  warning: "#ff9900",
};

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
    const line = visual.object.children.find((child): child is Line => child instanceof Line);

    expect(line).toBeDefined();
    line?.geometry.computeBoundingSphere();
    expect(Number.isFinite(line?.geometry.boundingSphere?.radius)).toBe(true);
    visual.dispose();
  });
});
