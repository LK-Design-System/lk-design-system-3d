import { describe, expect, it, vi } from "vitest";
import {
  OCCUPANCY_GRID_CELL_FREE,
  OCCUPANCY_GRID_CELL_OCCUPIED,
  OCCUPANCY_GRID_CELL_UNKNOWN,
  createOccupancyGridCellPicker,
  createOccupancyGridSnapshot,
  frameId,
  occupancyCellCenter,
  occupancyGridGeometry,
  quaternionFromYaw,
  rigidTransform3,
  type Vec3,
} from "@lk-robotics/design-system-3d-core";

import { coreToThreePosition } from "../src/coordinates.js";
import {
  createOccupancyGridHoverLifecycle,
  resolveOccupancyGridCellPointerDetail,
  type OccupancyGridCellPointerDetail,
} from "../src/occupancy-grid.js";

const gridFrame = frameId("fixture-grid");
const sceneFrame = frameId("fixture-scene");

function snapshot() {
  return createOccupancyGridSnapshot({
    geometry: occupancyGridGeometry({
      widthCells: 2,
      heightCells: 3,
      resolutionMeters: 0.5,
      gridToFrame: rigidTransform3(
        gridFrame,
        sceneFrame,
        [10, -2, 0.25],
        quaternionFromYaw(Math.PI / 2),
      ),
    }),
    cellStates: new Uint8Array([
      OCCUPANCY_GRID_CELL_UNKNOWN,
      OCCUPANCY_GRID_CELL_FREE,
      OCCUPANCY_GRID_CELL_OCCUPIED,
      OCCUPANCY_GRID_CELL_FREE,
      OCCUPANCY_GRID_CELL_OCCUPIED,
      OCCUPANCY_GRID_CELL_UNKNOWN,
    ]),
    revision: "fixture-v1",
  });
}

function pointerDetail(
  source: ReturnType<typeof snapshot>,
  cell: { readonly column: number; readonly row: number },
): OccupancyGridCellPointerDetail {
  const center = occupancyCellCenter(source.geometry, cell);
  const detail = resolveOccupancyGridCellPointerDetail(
    createOccupancyGridCellPicker(source),
    sceneFrame,
    coreToThreePosition(center.value),
    1,
  );
  if (detail === undefined) throw new Error("Expected fixture cell to resolve.");
  return detail;
}

describe("occupancy-grid R3F pointer detail", () => {
  it("converts Three world coordinates and accepts the configured surface elevation", () => {
    const source = snapshot();
    const picker = createOccupancyGridCellPicker(source);
    const center = occupancyCellCenter(source.geometry, { column: 1, row: 2 });
    const elevatedCorePoint: Vec3 = [center.value[0], center.value[1], center.value[2] + 0.02];
    const detail = resolveOccupancyGridCellPointerDetail(
      picker,
      sceneFrame,
      coreToThreePosition(elevatedCorePoint),
      3.5,
      0.02,
    );

    expect(detail).toMatchObject({
      revision: "fixture-v1",
      cell: { column: 1, row: 2 },
      imagePixel: { column: 1, rowFromTop: 0 },
      dataIndex: 5,
      cellState: OCCUPANCY_GRID_CELL_UNKNOWN,
      distanceMeters: 3.5,
    });
    expect(detail?.hitPoint.value).toEqual(elevatedCorePoint);
    expect(Object.isFrozen(detail)).toBe(true);
  });

  it("rejects invalid distances and points outside the raster", () => {
    const source = snapshot();
    const picker = createOccupancyGridCellPicker(source);
    const acceptedPoint = coreToThreePosition([9.75, -1.25, 0.25]);

    expect(
      resolveOccupancyGridCellPointerDetail(picker, sceneFrame, acceptedPoint, -1),
    ).toBeUndefined();
    expect(
      resolveOccupancyGridCellPointerDetail(
        picker,
        sceneFrame,
        acceptedPoint,
        Number.POSITIVE_INFINITY,
      ),
    ).toBeUndefined();
    expect(
      resolveOccupancyGridCellPointerDetail(
        picker,
        sceneFrame,
        coreToThreePosition([100, 100, 0.25]),
        1,
      ),
    ).toBeUndefined();
  });
});

describe("occupancy-grid hover lifecycle", () => {
  it("reports cell transitions and clears an active hover only once", () => {
    const source = snapshot();
    const firstDetail = pointerDetail(source, { column: 1, row: 2 });
    const secondDetail = pointerDetail(source, { column: 0, row: 1 });
    const callback = vi.fn<(detail: OccupancyGridCellPointerDetail | null) => void>();
    const lifecycle = createOccupancyGridHoverLifecycle();

    expect(lifecycle.report(source, callback, firstDetail)).toBe(true);
    expect(lifecycle.report(source, callback, firstDetail)).toBe(false);
    expect(lifecycle.report(source, callback, secondDetail)).toBe(true);
    expect(callback.mock.calls).toEqual([[firstDetail], [secondDetail]]);

    expect(lifecycle.clear()).toBe(true);
    expect(lifecycle.clear()).toBe(false);
    expect(callback.mock.calls).toEqual([[firstDetail], [secondDetail], [null]]);
  });

  it("clears exactly once for non-ready, snapshot, callback, and unmount transitions", () => {
    const firstSnapshot = snapshot();
    const nextSnapshot = snapshot();
    const firstDetail = pointerDetail(firstSnapshot, { column: 1, row: 2 });
    const nextDetail = pointerDetail(nextSnapshot, { column: 0, row: 1 });
    const firstCallback = vi.fn<(detail: OccupancyGridCellPointerDetail | null) => void>();
    const nextCallback = vi.fn<(detail: OccupancyGridCellPointerDetail | null) => void>();
    const lifecycle = createOccupancyGridHoverLifecycle();

    lifecycle.report(firstSnapshot, firstCallback, firstDetail);
    expect(lifecycle.reconcile(firstSnapshot, firstCallback, true)).toBe(false);
    expect(lifecycle.reconcile(firstSnapshot, firstCallback, false)).toBe(true);
    expect(lifecycle.reconcile(firstSnapshot, firstCallback, false)).toBe(false);

    lifecycle.report(firstSnapshot, firstCallback, firstDetail);
    expect(lifecycle.reconcile(nextSnapshot, firstCallback, true)).toBe(true);
    expect(lifecycle.reconcile(nextSnapshot, firstCallback, true)).toBe(false);

    lifecycle.report(nextSnapshot, firstCallback, nextDetail);
    expect(lifecycle.reconcile(nextSnapshot, nextCallback, true)).toBe(true);
    expect(lifecycle.reconcile(nextSnapshot, nextCallback, true)).toBe(false);

    lifecycle.report(nextSnapshot, nextCallback, nextDetail);
    expect(lifecycle.clear()).toBe(true);
    expect(lifecycle.clear()).toBe(false);

    expect(firstCallback.mock.calls).toEqual([
      [firstDetail],
      [null],
      [firstDetail],
      [null],
      [nextDetail],
      [null],
    ]);
    expect(nextCallback.mock.calls).toEqual([[nextDetail], [null]]);
  });

  it("clears the previous callback before reporting a raced owner change", () => {
    const source = snapshot();
    const detail = pointerDetail(source, { column: 1, row: 2 });
    const firstCallback = vi.fn<(value: OccupancyGridCellPointerDetail | null) => void>();
    const nextCallback = vi.fn<(value: OccupancyGridCellPointerDetail | null) => void>();
    const lifecycle = createOccupancyGridHoverLifecycle();

    lifecycle.report(source, firstCallback, detail);
    lifecycle.report(source, nextCallback, detail);

    expect(firstCallback.mock.calls).toEqual([[detail], [null]]);
    expect(nextCallback.mock.calls).toEqual([[detail]]);
  });
});
