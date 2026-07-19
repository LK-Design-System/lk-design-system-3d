import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  FrameMismatchError,
  OccupancyGridValidationError,
  OCCUPANCY_GRID_CELL_FREE,
  OCCUPANCY_GRID_CELL_OCCUPIED,
  OCCUPANCY_GRID_CELL_UNKNOWN,
  assertValidOccupancyGridSnapshot,
  createOccupancyGridCellPicker,
  createOccupancyGridSnapshot,
  frameId,
  framedPoint3,
  occupancyCellCenter,
  occupancyCellDataIndex,
  occupancyCellMinimumCorner,
  occupancyCellToImagePixel,
  occupancyDataIndexToCell,
  occupancyGridGeometry,
  occupancyImagePixelCenter,
  occupancyImagePixelToCell,
  occupancyPointToCell,
  occupancyPointToImagePixel,
  pickOccupancyGridCell,
  projectPointToOccupancyGrid,
  quaternionFromYaw,
  rigidTransform3,
  transformPoint,
  type OccupancyGridGeometry,
} from "../src/index.js";

const gridFrame = frameId("fixture-occupancy-grid");
const mapFrame = frameId("fixture-map");

function rotatedGeometry(): OccupancyGridGeometry {
  return occupancyGridGeometry({
    widthCells: 2,
    heightCells: 3,
    resolutionMeters: 0.5,
    gridToFrame: rigidTransform3(
      gridFrame,
      mapFrame,
      [-2, 3, 0.25],
      quaternionFromYaw(Math.PI / 2),
    ),
  });
}

describe("occupancy-grid coordinate contract", () => {
  it("flips top-down image rows exactly once into bottom-up grid rows", () => {
    const geometry = rotatedGeometry();

    expect(occupancyImagePixelToCell(geometry, { column: 0, rowFromTop: 0 })).toEqual({
      column: 0,
      row: 2,
    });
    expect(occupancyImagePixelToCell(geometry, { column: 1, rowFromTop: 2 })).toEqual({
      column: 1,
      row: 0,
    });
    expect(occupancyCellToImagePixel(geometry, { column: 0, row: 2 })).toEqual({
      column: 0,
      rowFromTop: 0,
    });
  });

  it("uses ROS row-major occupancy data ordering", () => {
    const geometry = rotatedGeometry();

    expect(occupancyCellDataIndex(geometry, { column: 0, row: 0 })).toBe(0);
    expect(occupancyCellDataIndex(geometry, { column: 1, row: 0 })).toBe(1);
    expect(occupancyCellDataIndex(geometry, { column: 0, row: 1 })).toBe(2);
    expect(occupancyCellDataIndex(geometry, { column: 0, row: 2 })).toBe(4);
    expect(occupancyDataIndexToCell(geometry, 5)).toEqual({ column: 1, row: 2 });
  });

  it("distinguishes the origin corner from the half-cell center", () => {
    const geometry = rotatedGeometry();
    const corner = occupancyCellMinimumCorner(geometry, { column: 0, row: 0 });
    const center = occupancyCellCenter(geometry, { column: 0, row: 0 });

    expect(corner).toEqual({ frame: mapFrame, value: [-2, 3, 0.25] });
    expect(center.frame).toBe(mapFrame);
    expect(center.value[0]).toBeCloseTo(-2.25, 12);
    expect(center.value[1]).toBeCloseTo(3.25, 12);
    expect(center.value[2]).toBeCloseTo(0.25, 12);
  });

  it("applies a non-zero origin yaw to image pixel centers", () => {
    const point = occupancyImagePixelCenter(rotatedGeometry(), {
      column: 0,
      rowFromTop: 0,
    });

    expect(point.frame).toBe(mapFrame);
    expect(point.value[0]).toBeCloseTo(-3.25, 12);
    expect(point.value[1]).toBeCloseTo(3.25, 12);
    expect(point.value[2]).toBeCloseTo(0.25, 12);
  });

  it("round-trips arbitrary cell centers through translated and rotated origins", () => {
    const finiteTranslation = fc.double({
      min: -10_000,
      max: 10_000,
      noNaN: true,
      noDefaultInfinity: true,
    });
    const resolution = fc.double({
      min: 0.001,
      max: 10,
      noNaN: true,
      noDefaultInfinity: true,
    });

    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 128 }),
        fc.integer({ min: 1, max: 128 }),
        fc.nat(),
        fc.nat(),
        resolution,
        finiteTranslation,
        finiteTranslation,
        finiteTranslation,
        fc.double({
          min: -Math.PI,
          max: Math.PI,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        (width, height, columnSeed, rowSeed, cellResolution, tx, ty, tz, yaw) => {
          const geometry = occupancyGridGeometry({
            widthCells: width,
            heightCells: height,
            resolutionMeters: cellResolution,
            gridToFrame: rigidTransform3(gridFrame, mapFrame, [tx, ty, tz], quaternionFromYaw(yaw)),
          });
          const cell = { column: columnSeed % width, row: rowSeed % height };
          const point = occupancyCellCenter(geometry, cell);
          const minimumCorner = transformPoint(
            geometry.gridToFrame,
            framedPoint3(gridFrame, [0, 0, 0]),
          );
          const maximumCorner = transformPoint(
            geometry.gridToFrame,
            framedPoint3(gridFrame, [width * cellResolution, height * cellResolution, 0]),
          );

          expect(occupancyPointToCell(geometry, point)).toEqual(cell);
          expect(occupancyPointToCell(geometry, minimumCorner)).toEqual({ column: 0, row: 0 });
          expect(occupancyPointToCell(geometry, maximumCorner)).toBeUndefined();
          expect(
            occupancyPointToImagePixel(
              geometry,
              occupancyImagePixelCenter(geometry, occupancyCellToImagePixel(geometry, cell)),
            ),
          ).toEqual(occupancyCellToImagePixel(geometry, cell));
        },
      ),
      { numRuns: 250 },
    );
  });

  it("preserves a complete quaternion when projecting cells and plane distance", () => {
    const geometry = occupancyGridGeometry({
      widthCells: 2,
      heightCells: 3,
      resolutionMeters: 0.25,
      gridToFrame: rigidTransform3(gridFrame, mapFrame, [4, -2, 7], [0.5, 0.5, 0.5, 0.5]),
    });
    const cell = { column: 1, row: 2 };
    const center = occupancyCellCenter(geometry, cell);
    const maximumCorner = transformPoint(
      geometry.gridToFrame,
      framedPoint3(gridFrame, [0.5, 0.75, 0]),
    );
    const offPlane = transformPoint(
      geometry.gridToFrame,
      framedPoint3(gridFrame, [0.375, 0.625, 0.01]),
    );

    expect(occupancyPointToCell(geometry, center)).toEqual(cell);
    expect(occupancyPointToCell(geometry, maximumCorner)).toBeUndefined();
    const offPlaneProjection = projectPointToOccupancyGrid(geometry, offPlane);
    expect(offPlaneProjection).toMatchObject({
      withinGridBounds: true,
      withinPlaneTolerance: false,
    });
    expect(offPlaneProjection.planeDistanceMeters).toBeCloseTo(0.01, 12);
  });

  it("keeps a rotated round-tripped maximum corner outside the half-open bounds", () => {
    const geometry = occupancyGridGeometry({
      widthCells: 1,
      heightCells: 30,
      resolutionMeters: 0.5,
      gridToFrame: rigidTransform3(gridFrame, mapFrame, [1, -1, 0.25], quaternionFromYaw(0.1)),
    });
    const minimumCorner = transformPoint(geometry.gridToFrame, framedPoint3(gridFrame, [0, 0, 0]));
    const maximumCorner = transformPoint(
      geometry.gridToFrame,
      framedPoint3(gridFrame, [0.5, 15, 0]),
    );
    const clearlyInside = transformPoint(
      geometry.gridToFrame,
      framedPoint3(gridFrame, [0.5 - 5e-6, 15 - 5e-6, 0]),
    );
    const clearlyOutside = transformPoint(
      geometry.gridToFrame,
      framedPoint3(gridFrame, [-5e-6, 0.25, 0]),
    );

    expect(occupancyPointToCell(geometry, minimumCorner)).toEqual({ column: 0, row: 0 });
    expect(projectPointToOccupancyGrid(geometry, maximumCorner)).toMatchObject({
      localPoint: { frame: gridFrame, value: [0.5, 15, 0] },
      withinGridBounds: false,
    });
    expect(occupancyPointToCell(geometry, clearlyInside)).toEqual({ column: 0, row: 29 });
    expect(occupancyPointToCell(geometry, clearlyOutside)).toBeUndefined();
  });

  it("uses half-open map bounds and reports off-plane points explicitly", () => {
    const geometry = rotatedGeometry();
    const maximumCorner = transformPoint(
      geometry.gridToFrame,
      framedPoint3(gridFrame, [1, 1.5, 0]),
    );
    const offPlane = transformPoint(
      geometry.gridToFrame,
      framedPoint3(gridFrame, [0.25, 0.25, 0.01]),
    );

    const maximumProjection = projectPointToOccupancyGrid(geometry, maximumCorner);
    expect(maximumProjection).toMatchObject({
      withinGridBounds: false,
      withinPlaneTolerance: true,
    });
    expect(maximumProjection.cell).toBeUndefined();

    const offPlaneProjection = projectPointToOccupancyGrid(geometry, offPlane);
    expect(offPlaneProjection).toMatchObject({
      withinGridBounds: true,
      withinPlaneTolerance: false,
    });
    expect(offPlaneProjection.planeDistanceMeters).toBeCloseTo(0.01, 12);
    expect(offPlaneProjection.cell).toBeUndefined();
    expect(occupancyPointToCell(geometry, offPlane, { planeToleranceMeters: 0.02 })).toEqual({
      column: 0,
      row: 0,
    });
  });
});

describe("occupancy-grid cell picking", () => {
  function rotatedSnapshot() {
    const cellStates = new Uint8Array([
      OCCUPANCY_GRID_CELL_UNKNOWN,
      OCCUPANCY_GRID_CELL_FREE,
      OCCUPANCY_GRID_CELL_OCCUPIED,
      OCCUPANCY_GRID_CELL_FREE,
      OCCUPANCY_GRID_CELL_UNKNOWN,
      OCCUPANCY_GRID_CELL_OCCUPIED,
    ]);
    return {
      cellStates,
      snapshot: createOccupancyGridSnapshot({
        geometry: rotatedGeometry(),
        cellStates,
        revision: "fixture-v1",
      }),
    };
  }

  it("captures the rotated cell, image pixel, data index, state, and framed points", () => {
    const { snapshot } = rotatedSnapshot();
    const hitPoint = occupancyCellCenter(snapshot.geometry, { column: 1, row: 2 });
    const pick = pickOccupancyGridCell(snapshot, hitPoint);

    expect(pick).toMatchObject({
      revision: "fixture-v1",
      cell: { column: 1, row: 2 },
      imagePixel: { column: 1, rowFromTop: 0 },
      dataIndex: 5,
      cellState: OCCUPANCY_GRID_CELL_OCCUPIED,
      hitPoint,
      cellCenter: hitPoint,
    });
  });

  it("returns undefined for out-of-bounds and off-plane hits", () => {
    const { snapshot } = rotatedSnapshot();
    const outOfBounds = transformPoint(
      snapshot.geometry.gridToFrame,
      framedPoint3(gridFrame, [1, 1.5, 0]),
    );
    const offPlane = transformPoint(
      snapshot.geometry.gridToFrame,
      framedPoint3(gridFrame, [0.25, 0.25, 0.01]),
    );

    expect(pickOccupancyGridCell(snapshot, outOfBounds)).toBeUndefined();
    expect(pickOccupancyGridCell(snapshot, offPlane)).toBeUndefined();
    expect(pickOccupancyGridCell(snapshot, offPlane, { planeToleranceMeters: 0.02 })?.cell).toEqual(
      { column: 0, row: 0 },
    );
  });

  it("propagates frame mismatches", () => {
    const { snapshot } = rotatedSnapshot();

    expect(() =>
      pickOccupancyGridCell(snapshot, framedPoint3(frameId("wrong-frame"), [0, 0, 0])),
    ).toThrow(FrameMismatchError);
  });

  it("does not mutate the caller buffer and detaches immutable pick geometry", () => {
    const { cellStates, snapshot } = rotatedSnapshot();
    const before = cellStates.slice();
    const center = occupancyCellCenter(snapshot.geometry, { column: 1, row: 2 });
    const mutableHitValue: [number, number, number] = [...center.value];
    const pick = pickOccupancyGridCell(snapshot, {
      frame: center.frame,
      value: mutableHitValue,
    });

    mutableHitValue[0] = 99;
    expect(cellStates).toEqual(before);
    expect(snapshot.cellStates).toBe(cellStates);
    expect(pick?.hitPoint.value).toEqual(center.value);
    expect(Object.isFrozen(pick)).toBe(true);
    expect(Object.isFrozen(pick?.cell)).toBe(true);
    expect(Object.isFrozen(pick?.imagePixel)).toBe(true);
    expect(Object.isFrozen(pick?.hitPoint)).toBe(true);
    expect(Object.isFrozen(pick?.hitPoint.value)).toBe(true);
    expect(Object.isFrozen(pick?.cellCenter)).toBe(true);
    expect(Object.isFrozen(pick?.cellCenter.value)).toBe(true);
  });

  it("captures revision and cell state at pick time", () => {
    const { cellStates, snapshot } = rotatedSnapshot();
    const hitPoint = occupancyCellCenter(snapshot.geometry, { column: 1, row: 2 });
    const pick = pickOccupancyGridCell(snapshot, hitPoint);

    cellStates[5] = OCCUPANCY_GRID_CELL_FREE;
    const replacement = createOccupancyGridSnapshot({
      geometry: snapshot.geometry,
      cellStates,
      revision: "fixture-v2",
    });

    expect(pick?.revision).toBe("fixture-v1");
    expect(pick?.cellState).toBe(OCCUPANCY_GRID_CELL_OCCUPIED);
    expect(pickOccupancyGridCell(replacement, hitPoint)).toMatchObject({
      revision: "fixture-v2",
      cellState: OCCUPANCY_GRID_CELL_FREE,
    });
  });

  it("matches the validating one-shot API for accepted, rejected, and tolerant hits", () => {
    const { snapshot } = rotatedSnapshot();
    const picker = createOccupancyGridCellPicker(snapshot);
    const accepted = occupancyCellCenter(snapshot.geometry, { column: 1, row: 2 });
    const outOfBounds = transformPoint(
      snapshot.geometry.gridToFrame,
      framedPoint3(gridFrame, [1, 1.5, 0]),
    );
    const offPlane = transformPoint(
      snapshot.geometry.gridToFrame,
      framedPoint3(gridFrame, [0.25, 0.25, 0.01]),
    );

    expect(picker.pick(accepted)).toEqual(pickOccupancyGridCell(snapshot, accepted));
    expect(picker.pick(outOfBounds)).toEqual(pickOccupancyGridCell(snapshot, outOfBounds));
    expect(picker.pick(offPlane)).toEqual(pickOccupancyGridCell(snapshot, offPlane));
    expect(picker.pick(offPlane, { planeToleranceMeters: 0.02 })).toEqual(
      pickOccupancyGridCell(snapshot, offPlane, { planeToleranceMeters: 0.02 }),
    );
  });

  it("binds an immutable stable snapshot wrapper and revision", () => {
    const { cellStates, snapshot } = rotatedSnapshot();
    const mutableSnapshot = {
      geometry: snapshot.geometry,
      cellStates,
      revision: snapshot.revision,
      cellCount: snapshot.cellCount,
      bufferOwnership: snapshot.bufferOwnership,
    };
    const picker = createOccupancyGridCellPicker(mutableSnapshot);
    const originalHit = occupancyCellCenter(snapshot.geometry, { column: 1, row: 2 });

    mutableSnapshot.geometry = occupancyGridGeometry({
      widthCells: 2,
      heightCells: 3,
      resolutionMeters: 1,
      gridToFrame: rigidTransform3(gridFrame, mapFrame, [100, 100, 0], [0, 0, 0, 1]),
    });
    mutableSnapshot.revision = "fixture-v2";
    mutableSnapshot.cellCount = 99;

    expect(picker.revision).toBe("fixture-v1");
    expect(picker.snapshot.revision).toBe("fixture-v1");
    expect(picker.snapshot.cellCount).toBe(6);
    expect(picker.snapshot.cellStates).toBe(cellStates);
    expect(picker.pick(originalHit)).toMatchObject({
      revision: "fixture-v1",
      cell: { column: 1, row: 2 },
    });
    expect(Object.isFrozen(picker)).toBe(true);
    expect(Object.isFrozen(picker.snapshot)).toBe(true);
    expect(Object.isFrozen(picker.snapshot.geometry)).toBe(true);
  });

  it("never mutates the caller-owned state buffer during repeated picks", () => {
    const { cellStates, snapshot } = rotatedSnapshot();
    const before = cellStates.slice();
    const picker = createOccupancyGridCellPicker(snapshot);

    for (const cell of [
      { column: 0, row: 0 },
      { column: 1, row: 1 },
      { column: 1, row: 2 },
    ]) {
      picker.pick(occupancyCellCenter(snapshot.geometry, cell));
    }

    expect(cellStates).toEqual(before);
    expect(picker.snapshot.cellStates).toBe(cellStates);
  });

  it("validates malformed public snapshots before creating a picker", () => {
    const { snapshot } = rotatedSnapshot();
    const malformed = {
      ...snapshot,
      cellStates: new Uint8Array([0, 1, 2, 0, 1, 3]),
    };
    const hitPoint = occupancyCellCenter(snapshot.geometry, { column: 0, row: 0 });

    expect(() => createOccupancyGridCellPicker(malformed)).toThrow(OccupancyGridValidationError);
    expect(() => pickOccupancyGridCell(malformed, hitPoint)).toThrow(OccupancyGridValidationError);
  });
});

describe("occupancy-grid validation", () => {
  it.each([
    { widthCells: 0, heightCells: 1, resolutionMeters: 1 },
    { widthCells: 1.5, heightCells: 1, resolutionMeters: 1 },
    { widthCells: 1, heightCells: -1, resolutionMeters: 1 },
    { widthCells: 1, heightCells: 1, resolutionMeters: 0 },
    { widthCells: 1, heightCells: 1, resolutionMeters: Number.NaN },
  ])("rejects invalid geometry %#", ({ widthCells, heightCells, resolutionMeters }) => {
    expect(() =>
      occupancyGridGeometry({
        widthCells,
        heightCells,
        resolutionMeters,
        gridToFrame: rigidTransform3(gridFrame, mapFrame, [0, 0, 0], [0, 0, 0, 1]),
      }),
    ).toThrow(OccupancyGridValidationError);
  });

  it("rejects invalid cells, image pixels, data indices, and tolerances", () => {
    const geometry = rotatedGeometry();
    expect(() => occupancyCellDataIndex(geometry, { column: 2, row: 0 })).toThrow(
      OccupancyGridValidationError,
    );
    expect(() => occupancyImagePixelToCell(geometry, { column: 0, rowFromTop: 3 })).toThrow(
      OccupancyGridValidationError,
    );
    expect(() => occupancyDataIndexToCell(geometry, 6)).toThrow(OccupancyGridValidationError);
    expect(() =>
      projectPointToOccupancyGrid(geometry, occupancyCellCenter(geometry, { column: 0, row: 0 }), {
        planeToleranceMeters: -1,
      }),
    ).toThrow(OccupancyGridValidationError);
  });

  it("rejects target-frame mismatches instead of guessing a transform", () => {
    expect(() =>
      projectPointToOccupancyGrid(
        rotatedGeometry(),
        framedPoint3(frameId("wrong-frame"), [0, 0, 0]),
      ),
    ).toThrow(FrameMismatchError);
  });

  it("detaches and freezes the caller-owned placement transform", () => {
    const translation: [number, number, number] = [1, 2, 3];
    const input = {
      widthCells: 2,
      heightCells: 3,
      resolutionMeters: 0.5,
      gridToFrame: {
        sourceFrame: gridFrame,
        targetFrame: mapFrame,
        translation,
        rotation: [0, 0, 0, 1] as const,
      },
    };
    const geometry = occupancyGridGeometry(input);

    translation[0] = 99;
    expect(geometry.gridToFrame.translation).toEqual([1, 2, 3]);
    expect(Object.isFrozen(geometry)).toBe(true);
    expect(Object.isFrozen(geometry.gridToFrame)).toBe(true);
    expect(Object.isFrozen(geometry.gridToFrame.translation)).toBe(true);
  });

  it("validates normalized states while retaining the caller-owned buffer", () => {
    const cellStates = new Uint8Array([
      OCCUPANCY_GRID_CELL_UNKNOWN,
      OCCUPANCY_GRID_CELL_FREE,
      OCCUPANCY_GRID_CELL_OCCUPIED,
      OCCUPANCY_GRID_CELL_FREE,
      OCCUPANCY_GRID_CELL_OCCUPIED,
      OCCUPANCY_GRID_CELL_UNKNOWN,
    ]);
    const snapshot = createOccupancyGridSnapshot({
      geometry: rotatedGeometry(),
      cellStates,
      revision: "fixture-v1",
    });

    expect(snapshot.cellStates).toBe(cellStates);
    expect(snapshot.cellCount).toBe(6);
    expect(snapshot.bufferOwnership).toBe("caller-retained");
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(() => assertValidOccupancyGridSnapshot(snapshot)).not.toThrow();
  });

  it("rejects inconsistent snapshot count and buffer-ownership metadata", () => {
    const snapshot = createOccupancyGridSnapshot({
      geometry: rotatedGeometry(),
      cellStates: new Uint8Array([0, 1, 2, 0, 1, 2]),
      revision: "fixture-v1",
    });
    const invalidOwnership = {
      ...snapshot,
      bufferOwnership: "copied",
    } as unknown as typeof snapshot;

    expect(() => assertValidOccupancyGridSnapshot({ ...snapshot, cellCount: 5 })).toThrow(
      OccupancyGridValidationError,
    );
    expect(() => assertValidOccupancyGridSnapshot(invalidOwnership)).toThrow(
      OccupancyGridValidationError,
    );
  });

  it("rejects invalid state buffers, values, and revisions", () => {
    expect(() =>
      createOccupancyGridSnapshot({
        geometry: rotatedGeometry(),
        cellStates: new Uint8Array(5),
        revision: 1,
      }),
    ).toThrow(OccupancyGridValidationError);
    expect(() =>
      createOccupancyGridSnapshot({
        geometry: rotatedGeometry(),
        cellStates: new Uint8Array([0, 1, 2, 0, 1, 3]),
        revision: 1,
      }),
    ).toThrow(OccupancyGridValidationError);
    expect(() =>
      createOccupancyGridSnapshot({
        geometry: rotatedGeometry(),
        cellStates: new Uint8Array([0, 1, 2, 0, 1, 2]),
        revision: " ",
      }),
    ).toThrow(OccupancyGridValidationError);
  });
});
