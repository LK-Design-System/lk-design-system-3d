import { describe, expect, it, vi } from "vitest";
import {
  OCCUPANCY_GRID_CELL_FREE,
  OCCUPANCY_GRID_CELL_OCCUPIED,
  OCCUPANCY_GRID_CELL_UNKNOWN,
  createOccupancyGridSnapshot,
  frameId,
  occupancyGridGeometry,
  quaternionFromYaw,
  rigidTransform3,
} from "@lk-robotics/design-system-3d-core";
import { NearestFilter, NoColorSpace } from "three";

import {
  createOccupancyGridRenderResource,
  createOccupancyGridSelectionResource,
  resolveOccupancyGridRenderState,
} from "../src/occupancy-grid-resource.js";

const gridFrame = frameId("fixture-grid");
const sceneFrame = frameId("fixture-scene");
const otherFrame = frameId("other-scene");

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

const palette = {
  unknown: "#778899",
  free: "#eeeeee",
  occupied: "#111111",
  gridLine: "#555555",
} as const;

describe("occupancy-grid render state", () => {
  it("accepts a frame-matched snapshot within explicit budgets", () => {
    expect(resolveOccupancyGridRenderState(snapshot(), sceneFrame, 6, 4)).toEqual({
      kind: "ready",
      requestedCellCount: 6,
      acceptedCellCount: 6,
    });
  });

  it("rejects frame, cell-budget, and texture-dimension mismatches", () => {
    expect(resolveOccupancyGridRenderState(snapshot(), otherFrame, 6, 4)).toMatchObject({
      kind: "frame-mismatch",
      expectedFrame: otherFrame,
      actualFrame: sceneFrame,
      acceptedCellCount: 0,
    });
    expect(resolveOccupancyGridRenderState(snapshot(), sceneFrame, 5, 4)).toMatchObject({
      kind: "budget-exceeded",
      maxCells: 5,
      acceptedCellCount: 0,
    });
    expect(resolveOccupancyGridRenderState(snapshot(), sceneFrame, 6, 2)).toMatchObject({
      kind: "texture-dimension-exceeded",
      requestedWidth: 2,
      requestedHeight: 3,
      acceptedCellCount: 0,
    });
  });
});

describe("occupancy-grid WebGL resource", () => {
  it("creates one lower-left-origin quad with nearest-filtered row-major state data", () => {
    const source = snapshot();
    const originalStates = new Uint8Array(source.cellStates);
    const resource = createOccupancyGridRenderResource(source, {
      palette,
      elevationOffsetMeters: 0.01,
    });
    const positions = resource.geometry.getAttribute("position");
    const textureData = resource.texture.image.data as Uint8Array;

    const positionValues = Array.from(positions.array);
    expect(positionValues.filter((_value, index) => index % 3 !== 2)).toEqual([
      0, 0, 1, 0, 0, 1.5, 1, 1.5,
    ]);
    for (const index of [2, 5, 8, 11]) {
      expect(positionValues[index]).toBeCloseTo(0.01, 7);
    }
    expect(Array.from(textureData)).toEqual([0, 127, 255, 127, 255, 0]);
    expect(resource.texture.flipY).toBe(false);
    expect(resource.texture.colorSpace).toBe(NoColorSpace);
    expect(resource.texture.magFilter).toBe(NearestFilter);
    expect(resource.texture.minFilter).toBe(NearestFilter);
    expect(resource.texture.generateMipmaps).toBe(false);
    expect(source.cellStates).toEqual(originalStates);
  });

  it("places the quad with the full grid origin transform", () => {
    const resource = createOccupancyGridRenderResource(snapshot(), { palette });

    expect(resource.mesh.position.toArray()).toEqual([10, -2, 0.25]);
    expect(resource.mesh.quaternion.z).toBeCloseTo(Math.SQRT1_2, 12);
    expect(resource.mesh.quaternion.w).toBeCloseTo(Math.SQRT1_2, 12);
    expect(resource.material.fragmentShader).toContain("checker");
    expect(resource.material.fragmentShader).toContain("diagonal");
  });

  it("disposes each owned GPU resource exactly once", () => {
    const resource = createOccupancyGridRenderResource(snapshot(), { palette });
    const geometryDispose = vi.spyOn(resource.geometry, "dispose");
    const textureDispose = vi.spyOn(resource.texture, "dispose");
    const materialDispose = vi.spyOn(resource.material, "dispose");

    resource.dispose();
    resource.dispose();

    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(textureDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
  });
});

describe("occupancy-grid controlled selection resource", () => {
  it("creates one lifted cell outline with the full grid transform", () => {
    const resource = createOccupancyGridSelectionResource(
      snapshot(),
      { column: 1, row: 2 },
      { color: "#00aaff", elevationOffsetMeters: 0.01 },
    );
    const positions = Array.from(resource.geometry.getAttribute("position").array);

    expect(positions.filter((_value, index) => index % 3 !== 2)).toEqual([
      0.5, 1, 1, 1, 1, 1.5, 0.5, 1.5,
    ]);
    for (const index of [2, 5, 8, 11]) {
      expect(positions[index]).toBeGreaterThan(0.01);
    }
    expect(resource.outline.position.toArray()).toEqual([10, -2, 0.25]);
    expect(resource.outline.quaternion.z).toBeCloseTo(Math.SQRT1_2, 12);
    expect(resource.outline.quaternion.w).toBeCloseTo(Math.SQRT1_2, 12);
    expect(resource.outline.isLineLoop).toBe(true);
  });

  it("rejects out-of-bounds cells and disposes owned resources once", () => {
    expect(() =>
      createOccupancyGridSelectionResource(snapshot(), { column: 2, row: 0 }, { color: "#00aaff" }),
    ).toThrow();

    const resource = createOccupancyGridSelectionResource(
      snapshot(),
      { column: 0, row: 0 },
      { color: "#00aaff" },
    );
    const geometryDispose = vi.spyOn(resource.geometry, "dispose");
    const materialDispose = vi.spyOn(resource.material, "dispose");

    resource.dispose();
    resource.dispose();

    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
  });
});
