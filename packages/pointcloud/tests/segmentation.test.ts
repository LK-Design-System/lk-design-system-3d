import { describe, expect, it } from "vitest";

import {
  DEFAULT_SEGMENTATION_PALETTE,
  PointCloudValidationError,
  createSegmentationColors,
} from "../src/index.js";

function paletteColor(index: number): readonly [number, number, number] {
  const color = DEFAULT_SEGMENTATION_PALETTE[index];
  if (color === undefined) throw new Error(`Palette color ${String(index)} missing.`);
  return color;
}

describe("createSegmentationColors", () => {
  it("maps labels onto palette colors and wraps past the palette length", () => {
    const colors = createSegmentationColors([0, 1, DEFAULT_SEGMENTATION_PALETTE.length]);
    expect(colors).toHaveLength(9);
    const expectClose = (offset: number, color: readonly [number, number, number]): void => {
      for (let channel = 0; channel < 3; channel += 1) {
        expect(colors[offset + channel]).toBeCloseTo(color[channel] ?? 0, 6);
      }
    };
    expectClose(0, paletteColor(0));
    expectClose(3, paletteColor(1));
    expectClose(6, paletteColor(0));
  });

  it("accepts typed-array labels", () => {
    const colors = createSegmentationColors(new Uint8Array([2, 2]));
    expect(colors[0]).toBeCloseTo(paletteColor(2)[0], 6);
  });

  it("rejects invalid labels and palettes", () => {
    expect(() => createSegmentationColors([-1])).toThrow(PointCloudValidationError);
    expect(() => createSegmentationColors([0.5])).toThrow(PointCloudValidationError);
    expect(() => createSegmentationColors([0], [])).toThrow(PointCloudValidationError);
    expect(() => createSegmentationColors([0], [[2, 0, 0]])).toThrow(PointCloudValidationError);
  });
});
