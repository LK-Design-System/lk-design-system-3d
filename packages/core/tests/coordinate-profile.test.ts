import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  frameId,
  occupancyCellDataIndex,
  occupancyCellToImagePixel,
  occupancyDataIndexToCell,
  occupancyGridGeometry,
  occupancyImagePixelCenter,
  occupancyImagePixelToCell,
  quaternionFromYaw,
  rigidTransform3,
  type OccupancyGridGeometry,
} from "../src/index.js";

/**
 * A0 coordinate-profile contract (see docs/A0-MAP-CONTRACT-DRAFT.md §5, §9-2).
 *
 * Machine-enforces the raster coordinate rules that
 * docs/SPATIAL_PRIMITIVES_GUIDE.md `Asset and coordinate boundary` (Contract 1)
 * states in prose: image pixel (0, 0) is top-left, image and grid space differ by
 * one row flip, ROS occupancy data is lower-left row-major, and an anchor pixel
 * resolves to a metric level pose through the grid transform.
 */

const GRID_FRAME = frameId("coord-profile-grid");
const MAP_FRAME = frameId("coord-profile-map");
const WIDTH = 4;
const HEIGHT = 3;
const RESOLUTION = 0.5;

// A non-symmetric 4x3 grid so a swapped row/column or a missing flip cannot hide.
function geometry(yaw: number): OccupancyGridGeometry {
  return occupancyGridGeometry({
    widthCells: WIDTH,
    heightCells: HEIGHT,
    resolutionMeters: RESOLUTION,
    gridToFrame: rigidTransform3(GRID_FRAME, MAP_FRAME, [10, 20, 0], quaternionFromYaw(yaw)),
  });
}

const pixelArb = fc.record({
  column: fc.integer({ min: 0, max: WIDTH - 1 }),
  rowFromTop: fc.integer({ min: 0, max: HEIGHT - 1 }),
});
const cellArb = fc.record({
  column: fc.integer({ min: 0, max: WIDTH - 1 }),
  row: fc.integer({ min: 0, max: HEIGHT - 1 }),
});

describe("A0 coordinate profile contract", () => {
  it("restores an anchor pixel through image -> level -> image (any rotation)", () => {
    // Pixel<->cell mapping is a pure index operation, so the round-trip must hold
    // regardless of the grid's placement/rotation in the target frame.
    for (const yaw of [0, Math.PI / 2, -Math.PI / 2]) {
      const geo = geometry(yaw);
      fc.assert(
        fc.property(pixelArb, (pixel) => {
          const cell = occupancyImagePixelToCell(geo, pixel);
          expect(occupancyCellToImagePixel(geo, cell)).toEqual(pixel);
        }),
      );
    }
  });

  it("restores a cell through the ROS row-major dataIndex round-trip", () => {
    const geo = geometry(0);
    fc.assert(
      fc.property(cellArb, (cell) => {
        const dataIndex = occupancyCellDataIndex(geo, cell);
        expect(occupancyDataIndexToCell(geo, dataIndex)).toEqual(cell);
      }),
    );
  });

  it("maps the top image row to the maximum-Y grid row with exactly one flip", () => {
    const geo = geometry(0);
    expect(occupancyImagePixelToCell(geo, { column: 0, rowFromTop: 0 })).toEqual({
      column: 0,
      row: HEIGHT - 1,
    });
    expect(occupancyImagePixelToCell(geo, { column: 0, rowFromTop: HEIGHT - 1 })).toEqual({
      column: 0,
      row: 0,
    });
  });

  it("orders ROS occupancy data lower-left row-major (row * width + column)", () => {
    const geo = geometry(0);
    expect(occupancyCellDataIndex(geo, { column: 0, row: 0 })).toBe(0);
    expect(occupancyCellDataIndex(geo, { column: 1, row: 0 })).toBe(1);
    expect(occupancyCellDataIndex(geo, { column: 0, row: 1 })).toBe(WIDTH);
  });

  it("resolves an anchor pixel to its metric level pose", () => {
    // Top-left pixel (0, 0) flips to the max-Y cell (0, HEIGHT-1); its center local
    // point is [(0+0.5)*0.5, (2+0.5)*0.5, 0] = [0.25, 1.25, 0], placed by gridToFrame
    // (yaw 0, translation [10, 20, 0]).
    const geo = geometry(0);
    const pose = occupancyImagePixelCenter(geo, { column: 0, rowFromTop: 0 });
    expect(pose.frame).toBe(MAP_FRAME);
    expect(pose.value[0]).toBeCloseTo(10.25, 9);
    expect(pose.value[1]).toBeCloseTo(21.25, 9);
    expect(pose.value[2]).toBeCloseTo(0, 9);
  });
});
