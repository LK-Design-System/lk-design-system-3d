import { describe, expect, it } from "vitest";

import type { Vec3 } from "@lk-robotics/design-system-3d-core";

import {
  createMapEditorPolygonGeometry,
  createMapEditorRoutePickSegments,
  isMapEditorAreaCloseCandidate,
  isMapEditorPointCommitGesture,
  isValidMapEditorPolygon,
  mapEditorScreenMovementSquared,
  resolveMapEditorAuthoringSnap,
  resolveMapEditorHeading,
  snapMapEditorPlacementPoint,
} from "./map-editor-webgl.js";

const point = (x: number, y: number, z = 0): Vec3 => Object.freeze([x, y, z]);

describe("map editor authoring snap", () => {
  it("snaps signed values symmetrically and owns the authoring elevation", () => {
    expect(snapMapEditorPlacementPoint(point(0.13, -0.13, 9), 0.4, 0.25)).toEqual([
      0.25,
      -0.25,
      0.4,
    ]);
    expect(snapMapEditorPlacementPoint(point(-0.125, 0.125), 0, 0.25)).toEqual([
      -0.25,
      0.25,
      0,
    ]);
  });

  it("prefers a nearby vertex only when it beats the grid candidate", () => {
    const targets = [point(0.6, 0.6), point(0.2, 0.2, 3)];
    const vertexResult = resolveMapEditorAuthoringSnap(
      point(0.13, 0.13, 8),
      0.5,
      0.25,
      targets,
      0.15,
    );
    expect(vertexResult).toEqual({
      raw: [0.13, 0.13, 0.5],
      snapped: [0.2, 0.2, 0.5],
      kind: "vertex",
      targetIndex: 1,
    });

    const gridResult = resolveMapEditorAuthoringSnap(
      point(0.13, 0.13),
      0,
      0.25,
      [point(0.3, 0.3)],
      0.3,
    );
    expect(gridResult.kind).toBe("grid");
    expect(gridResult.snapped).toEqual([0.25, 0.25, 0]);

    expect(resolveMapEditorAuthoringSnap(point(0.5, -0.25), 0, 0.25).kind).toBe(
      "none",
    );
  });
});

describe("map editor point gesture", () => {
  it("uses the maximum squared screen movement and includes the tolerance boundary", () => {
    const movementSquared = mapEditorScreenMovementSquared(
      { x: 10, y: 20 },
      { x: 13, y: 24 },
    );
    expect(movementSquared).toBe(25);
    expect(isMapEditorPointCommitGesture(movementSquared, 5)).toBe(true);
    expect(isMapEditorPointCommitGesture(25.01, 5)).toBe(false);
    expect(() => isMapEditorPointCommitGesture(-1, 5)).toThrow(RangeError);
  });
});

describe("map editor polygon geometry", () => {
  it("triangulates closed convex and concave horizontal polygons", () => {
    const closedSquare = [
      point(0, 0),
      point(2, 0),
      point(2, 2),
      point(0, 2),
      point(0, 0),
    ];
    const squareGeometry = createMapEditorPolygonGeometry(closedSquare);
    expect(squareGeometry).not.toBeNull();
    expect(squareGeometry?.vertexCount).toBe(4);
    expect(squareGeometry?.areaSquareMeters).toBe(4);
    expect(squareGeometry?.trianglePositions).toHaveLength(18);
    expect(squareGeometry?.outlinePositions).toHaveLength(24);

    const concaveGeometry = createMapEditorPolygonGeometry([
      point(0, 0),
      point(2, 0),
      point(2, 2),
      point(1, 1),
      point(0, 2),
    ]);
    expect(concaveGeometry?.areaSquareMeters).toBe(3);
    expect(concaveGeometry?.trianglePositions).toHaveLength(27);
  });

  it("rejects degenerate, self-intersecting, duplicate, and non-horizontal input", () => {
    expect(isValidMapEditorPolygon([point(0, 0), point(1, 0)])).toBe(false);
    expect(
      isValidMapEditorPolygon([point(0, 0), point(1, 0), point(2, 0)]),
    ).toBe(false);
    expect(
      isValidMapEditorPolygon([point(0, 0), point(1, 0), point(2, 1e-8)]),
    ).toBe(false);
    expect(
      isValidMapEditorPolygon([
        point(0, 0),
        point(2, 2),
        point(0, 2),
        point(2, 0),
      ]),
    ).toBe(false);
    expect(
      isValidMapEditorPolygon([
        point(0, 0),
        point(1, 0),
        point(1, 0),
        point(0, 1),
      ]),
    ).toBe(false);
    expect(
      isValidMapEditorPolygon([
        point(0, 0),
        point(1, 0, 0.1),
        point(0, 1),
      ]),
    ).toBe(false);
  });

  it("recognizes an area close candidate without closing too early", () => {
    const vertices = [point(0, 0), point(1, 0), point(1, 1)];
    expect(isMapEditorAreaCloseCandidate(vertices, point(0.1, 0.1), 0.15)).toBe(true);
    expect(isMapEditorAreaCloseCandidate(vertices, point(0.2, 0.2), 0.15)).toBe(false);
    expect(isMapEditorAreaCloseCandidate(vertices.slice(0, 2), point(0, 0), 0.15)).toBe(
      false,
    );
  });
});

describe("map editor heading", () => {
  it("resolves core-XY yaw, direction, and length", () => {
    const heading = resolveMapEditorHeading(point(1, 2, 0.4), point(1, 4, 0.4));
    expect(heading.lengthMeters).toBe(2);
    expect(heading.yawRadians).toBeCloseTo(Math.PI / 2);
    expect(heading.direction).toEqual([0, 1, 0]);

    const stationary = resolveMapEditorHeading(point(1, 2), point(1, 2));
    expect(stationary.lengthMeters).toBe(0);
    expect(stationary.yawRadians).toBe(0);
    expect(stationary.direction).toEqual([1, 0, 0]);
  });
});

describe("map editor route picking", () => {
  it("creates camera-independent corridors and skips zero-length segments", () => {
    const segments = createMapEditorRoutePickSegments(
      [point(0, 0), point(3, 4), point(3, 4), point(1, 4)],
      0.32,
    );

    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({
      midpoint: [1.5, 2, 0],
      lengthMeters: 5,
      widthMeters: 0.32,
    });
    expect(segments[0]?.yawRadians).toBeCloseTo(Math.atan2(4, 3));
    expect(segments[1]).toMatchObject({
      midpoint: [2, 4, 0],
      lengthMeters: 2,
      widthMeters: 0.32,
    });
    expect(segments[1]?.yawRadians).toBeCloseTo(Math.PI);
    expect(() => createMapEditorRoutePickSegments([point(0, 0), point(1, 0)], 0)).toThrow(
      RangeError,
    );
  });
});
