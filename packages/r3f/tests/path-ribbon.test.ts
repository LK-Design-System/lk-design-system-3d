import { describe, expect, it } from "vitest";

import {
  createPathRibbonIntervals,
  resolvePathExecutionCursorMetrics,
  resolvePathExecutionProgress,
  resolvePathRibbonVisualState,
} from "../src/path-ribbon.js";

describe("PathRibbon visual grammar", () => {
  it("uses one continuous surface for actual and executing paths", () => {
    expect(resolvePathRibbonVisualState("actual")).toMatchObject({ surfacePattern: "solid" });
    expect(resolvePathRibbonVisualState("executing")).toMatchObject({
      showExecutionCursor: true,
      surfacePattern: "solid",
    });
  });

  it("uses a low, width-scaled 3D execution arrow with deterministic reduced motion", () => {
    const metrics = resolvePathExecutionCursorMetrics(0.16);
    expect(metrics.arrowLength).toBeCloseTo(0.28);
    expect(metrics.arrowWidth).toBeCloseTo(0.1312);
    expect(metrics.arrowHeight).toBeCloseTo(0.0352);
    expect(metrics.baseElevation).toBeCloseTo(0.0128);
    expect(resolvePathExecutionProgress(3.125, true)).toBeCloseTo(0.5);
    expect(resolvePathExecutionProgress(999, false)).toBe(0.55);
  });

  it("uses width-scaled segmented surfaces for planned paths", () => {
    expect(resolvePathRibbonVisualState("planned")).toMatchObject({
      showBlockedBarriers: false,
      surfacePattern: "segmented",
    });
    const intervals = createPathRibbonIntervals(3.6, 0.2, "segmented");
    expect(
      intervals.map(({ start, end }) => [Number(start.toFixed(6)), Number(end.toFixed(6))]),
    ).toEqual([
      [0, 0.166667],
      [0.25, 0.416667],
      [0.5, 0.666667],
      [0.75, 0.916667],
    ]);
  });

  it("keeps a blocked path solid and adds explicit barriers", () => {
    expect(resolvePathRibbonVisualState("blocked")).toEqual({
      showBlockedBarriers: true,
      showExecutionCursor: false,
      surfacePattern: "solid",
    });
  });

  it("rejects invalid geometry inputs", () => {
    expect(() => createPathRibbonIntervals(0, 0.2, "solid")).toThrow(RangeError);
    expect(() => createPathRibbonIntervals(2, Number.NaN, "segmented")).toThrow(RangeError);
    expect(() => resolvePathExecutionCursorMetrics(-0.1)).toThrow(RangeError);
    expect(() => resolvePathExecutionProgress(Number.POSITIVE_INFINITY, true)).toThrow(RangeError);
  });
});
