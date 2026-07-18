import { describe, expect, it } from "vitest";

import {
  DEFAULT_SCENE_RENDER_QUALITY,
  DEFAULT_SCENE_FRAME_LOOP,
  DEFAULT_SCENE_SHADOW_MAP_SIZE,
  resolveSceneRenderQuality,
  shouldScheduleDemandFrame,
} from "../src/rendering.js";

describe("renderer performance defaults", () => {
  it("uses a demand-driven, balanced rendering budget by default", () => {
    expect(DEFAULT_SCENE_RENDER_QUALITY).toBe("balanced");
    expect(DEFAULT_SCENE_FRAME_LOOP).toBe("demand");
    expect(DEFAULT_SCENE_SHADOW_MAP_SIZE).toBe(1024);
    expect(resolveSceneRenderQuality()).toMatchObject({
      antialias: true,
      devicePixelRatio: [1, 1.5],
      frameLoop: "demand",
      powerPreference: "default",
      shadowMapSize: 1024,
      shadows: true,
    });
  });

  it("keeps high fidelity opt-in without making the scene continuously render", () => {
    expect(resolveSceneRenderQuality("high")).toMatchObject({
      antialias: true,
      devicePixelRatio: [1, 2],
      frameLoop: "demand",
      powerPreference: "high-performance",
      shadowMapSize: 2048,
      shadows: true,
    });
  });

  it("offers an explicit low-cost profile and preserves caller overrides", () => {
    expect(resolveSceneRenderQuality("performance")).toMatchObject({
      antialias: false,
      devicePixelRatio: 1,
      frameLoop: "demand",
      powerPreference: "low-power",
      shadowMapSize: 512,
      shadows: false,
    });
    expect(
      resolveSceneRenderQuality("performance", {
        devicePixelRatio: [1, 2],
        frameLoop: "always",
        shadowMapSize: 2048,
      }),
    ).toMatchObject({
      devicePixelRatio: [1, 2],
      frameLoop: "always",
      shadowMapSize: 2048,
    });
  });

  it("only schedules active work for a demand-driven canvas", () => {
    expect(shouldScheduleDemandFrame("always", true)).toBe(false);
    expect(shouldScheduleDemandFrame("never", true)).toBe(false);
    expect(shouldScheduleDemandFrame("demand", false)).toBe(false);
    expect(shouldScheduleDemandFrame("demand", true)).toBe(true);
  });
});
