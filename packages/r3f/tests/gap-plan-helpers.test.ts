import { describe, expect, it } from "vitest";

import {
  DEFAULT_SCENE_LINE_TOKENS,
  DIAGNOSTIC_TECHNICAL_THEME,
  OPERATIONAL_NEUTRAL_THEME,
  OPERATIONAL_SCENE_LABEL_TOKENS,
  drapePathPoints,
  estimateSceneLabelWidthPx,
  resolveMinimumScreenWidthMeters,
  resolveRobotPoseFreshnessVisual,
  resolveSceneLabelTokens,
  resolveSceneLineTokens,
  resolveSceneNatureTokens,
  resolveSceneTheme,
  type SceneVisualTheme,
} from "../src/index.js";

describe("drapePathPoints", () => {
  it("resamples along the ground plane and seats samples on the terrain", () => {
    const slope = (x: number): number => x * 0.5;
    const draped = drapePathPoints(
      [
        [0, 0, 0],
        [4, 0, 0],
      ],
      slope,
      { spacingMeters: 1, elevationMeters: 0.1 },
    );
    expect(draped.map((point) => point[0])).toEqual([0, 1, 2, 3, 4]);
    expect(draped[2]?.[2]).toBeCloseTo(1.1, 9);
    expect(draped[4]?.[2]).toBeCloseTo(2.1, 9);
  });

  it("rejects a bad spacing or ground sample", () => {
    expect(() => drapePathPoints([[0, 0, 0]], () => 0, { spacingMeters: 0 })).toThrow(RangeError);
    expect(() => drapePathPoints([[0, 0, 0]], () => Number.NaN)).toThrow(RangeError);
  });
});

describe("resolveMinimumScreenWidthMeters", () => {
  it("keeps the metric width when it is already wide enough on screen", () => {
    expect(resolveMinimumScreenWidthMeters(2, 6, 10, Math.PI / 4, 800)).toBe(2);
  });

  it("widens far-away ribbons in quarter-octave steps", () => {
    const far = resolveMinimumScreenWidthMeters(0.3, 6, 1000, Math.PI / 4, 800);
    const metersPerPixel = (2 * 1000 * Math.tan(Math.PI / 8)) / 800;
    expect(far).toBeGreaterThanOrEqual(6 * metersPerPixel);
    expect(Math.log2(far) * 4).toBeCloseTo(Math.round(Math.log2(far) * 4), 9);
    // A tiny camera move does not change the step.
    expect(resolveMinimumScreenWidthMeters(0.3, 6, 1001, Math.PI / 4, 800)).toBe(far);
  });
});

describe("robot pose freshness", () => {
  it("marks every non-fresh pose as last known and turns the beacon off", () => {
    expect(resolveRobotPoseFreshnessVisual("fresh")).toEqual({
      bodyOpacity: 1,
      lastKnownRing: false,
      beaconAllowed: true,
    });
    for (const freshness of ["stale", "expired", "future"] as const) {
      const visual = resolveRobotPoseFreshnessVisual(freshness);
      expect(visual.lastKnownRing).toBe(true);
      expect(visual.beaconAllowed).toBe(false);
      expect(visual.bodyOpacity).toBeLessThan(1);
    }
    expect(resolveRobotPoseFreshnessVisual("expired").bodyOpacity).toBeLessThan(
      resolveRobotPoseFreshnessVisual("stale").bodyOpacity,
    );
  });
});

describe("scene theme slots", () => {
  it("ships line, label and nature tokens on both built-in profiles", () => {
    for (const theme of [OPERATIONAL_NEUTRAL_THEME, DIAGNOSTIC_TECHNICAL_THEME]) {
      expect(resolveSceneLineTokens(theme)).toEqual(DEFAULT_SCENE_LINE_TOKENS);
      expect(resolveSceneLabelTokens(theme).accent).toBe(theme.scene["selection.active"]);
      expect(resolveSceneNatureTokens(theme).skyZenith).toMatch(/^#/u);
    }
  });

  it("falls back for a custom theme written before the slots existed", () => {
    const custom = Object.fromEntries(
      Object.entries(OPERATIONAL_NEUTRAL_THEME).filter(
        ([key]) => key !== "lines" && key !== "labels" && key !== "nature",
      ),
    ) as unknown as SceneVisualTheme;
    expect(resolveSceneLabelTokens(custom)).toEqual(OPERATIONAL_SCENE_LABEL_TOKENS);
  });

  it("merges label and line overrides from the composition layer", () => {
    const theme = resolveSceneTheme("operational-neutral", {
      labels: { text: "#111111", fontSizePx: 14 },
      lines: { trailWidthPx: 4 },
    });
    expect(resolveSceneLabelTokens(theme)).toMatchObject({ text: "#111111", fontSizePx: 14 });
    expect(resolveSceneLabelTokens(theme).background).toBe(
      OPERATIONAL_SCENE_LABEL_TOKENS.background,
    );
    expect(resolveSceneLineTokens(theme).trailWidthPx).toBe(4);
  });
});

describe("estimateSceneLabelWidthPx", () => {
  it("counts Hangul as full width and Latin as about 0.6 em", () => {
    const tokens = OPERATIONAL_SCENE_LABEL_TOKENS;
    expect(estimateSceneLabelWidthPx("서오릉", tokens)).toBe(
      3 * tokens.fontSizePx + 2 * tokens.paddingXPx,
    );
    expect(estimateSceneLabelWidthPx("AB", tokens)).toBe(
      Math.ceil(1.2 * tokens.fontSizePx + 2 * tokens.paddingXPx),
    );
  });
});
