import { describe, expect, it } from "vitest";

import {
  aggregateSceneLayerStatus,
  createSpatialGrid2,
  layoutScreenLabels,
  type ScreenLabelCandidate,
} from "../src/index.js";

const VIEWPORT = { width: 800, height: 600 };

function label(
  id: string,
  x: number,
  y: number,
  extra: Partial<ScreenLabelCandidate> = {},
): ScreenLabelCandidate {
  return {
    id,
    priority: 10,
    anchor: { x, y },
    widthPx: 80,
    heightPx: 22,
    distanceMeters: 50,
    ...extra,
  };
}

describe("layoutScreenLabels", () => {
  it("keeps the higher-priority label when two overlap", () => {
    const layout = layoutScreenLabels(
      [label("low", 400, 300, { priority: 10 }), label("high", 410, 305, { priority: 60 })],
      { viewport: VIEWPORT },
    );
    expect(layout.visible.map((entry) => entry.id)).toEqual(["high"]);
    expect(layout.hidden).toEqual([{ id: "low", reason: "collision" }]);
  });

  it("puts a selected label first regardless of priority and ignores its distance limit", () => {
    const layout = layoutScreenLabels(
      [
        label("robot", 400, 300, { priority: 100 }),
        label("place", 405, 300, { selected: true, distanceMeters: 900, maxDistanceMeters: 450 }),
      ],
      { viewport: VIEWPORT },
    );
    expect(layout.visible.map((entry) => entry.id)).toEqual(["place"]);
  });

  it("reports behind-camera, off-screen, distance and limit drops", () => {
    const layout = layoutScreenLabels(
      [
        label("behind", 0, 0, { anchor: null }),
        label("off", -300, 300),
        label("far", 100, 100, { distanceMeters: 500, maxDistanceMeters: 450 }),
        label("a", 100, 400),
        label("b", 600, 400),
      ],
      { viewport: VIEWPORT, maxVisible: 1 },
    );
    expect(layout.visible.map((entry) => entry.id)).toEqual(["a"]);
    expect(Object.fromEntries(layout.hidden.map((entry) => [entry.id, entry.reason]))).toEqual({
      behind: "behind",
      off: "offscreen",
      far: "distance",
      b: "limit",
    });
  });

  it("anchors the box above its point by default", () => {
    const [placed] = layoutScreenLabels([label("a", 400, 300)], { viewport: VIEWPORT }).visible;
    expect(placed).toEqual({ id: "a", x: 360, y: 278, widthPx: 80, heightPx: 22 });
  });

  it("is deterministic for equal priority and distance", () => {
    const candidates = [label("b", 400, 300), label("a", 402, 300)];
    expect(layoutScreenLabels(candidates, { viewport: VIEWPORT }).visible[0]?.id).toBe("a");
  });

  it("rejects duplicate ids", () => {
    expect(() =>
      layoutScreenLabels([label("a", 1, 1), label("a", 2, 2)], { viewport: VIEWPORT }),
    ).toThrow(RangeError);
  });
});

describe("aggregateSceneLayerStatus", () => {
  it("fails the scene only when a required layer fails", () => {
    expect(
      aggregateSceneLayerStatus([
        {
          id: "terrain",
          required: true,
          status: { kind: "error", message: "DEM 404", recoverable: true },
        },
        { id: "trees", status: { kind: "ready" } },
      ]),
    ).toEqual({ kind: "error", failed: ["terrain"], message: "DEM 404", recoverable: true });
  });

  it("stays ready and lists degraded optional layers", () => {
    expect(
      aggregateSceneLayerStatus([
        { id: "terrain", required: true, status: { kind: "ready" } },
        { id: "lidar", status: { kind: "error", message: "timeout" } },
        { id: "photoreal", status: { kind: "disabled" } },
      ]),
    ).toEqual({ kind: "ready", degraded: ["lidar"] });
  });

  it("reports loading with the mean of reported progress", () => {
    expect(
      aggregateSceneLayerStatus([
        { id: "terrain", status: { kind: "loading", progress: 0.2 } },
        { id: "trees", status: { kind: "loading", progress: 0.6 } },
        { id: "robot", status: { kind: "loading" } },
      ]),
    ).toMatchObject({ kind: "loading", loading: ["terrain", "trees", "robot"], progress: 0.4 });
  });

  it("is empty when every layer is disabled", () => {
    expect(aggregateSceneLayerStatus([{ id: "a", status: { kind: "disabled" } }])).toEqual({
      kind: "empty",
    });
  });
});

describe("createSpatialGrid2", () => {
  const grid = createSpatialGrid2(
    [
      { id: "tree-1", bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 } },
      { id: "tree-2", bounds: { minX: 50, minY: 50, maxX: 51, maxY: 51 } },
      { id: "wall", bounds: { minX: -20, minY: 10, maxX: 20, maxY: 11 } },
    ],
    10,
  );

  it("returns only items overlapping the query bounds", () => {
    expect(grid.queryBounds({ minX: -1, minY: -1, maxX: 2, maxY: 2 })).toEqual(["tree-1"]);
    expect(grid.queryBounds({ minX: 15, minY: 5, maxX: 16, maxY: 12 })).toEqual(["wall"]);
  });

  it("returns items a segment crosses, in insertion order", () => {
    expect(grid.querySegment(0.5, -5, 0.5, 60)).toEqual(["tree-1", "wall"]);
    expect(grid.querySegment(30, 30, 60, 60)).toEqual(["tree-2"]);
  });

  it("rejects duplicate ids and bad cell sizes", () => {
    expect(() => createSpatialGrid2([], 0)).toThrow(RangeError);
    expect(() =>
      createSpatialGrid2(
        [
          { id: "a", bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 } },
          { id: "a", bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 } },
        ],
        5,
      ),
    ).toThrow(RangeError);
  });
});
