import { describe, expect, it } from "vitest";

import {
  IdentifierValidationError,
  TimestampValidationError,
  assetId,
  clockId,
  entityId,
  frameId,
  hasRendererCapability,
  layerId,
  timestamp,
  type AssetEntity,
  type CameraState,
  type GoalEntity,
  type LandmarkEntity,
  type PathEntity,
  type PickHit,
  type RobotEntity,
  type SelectionState,
  type SpatialEvent,
} from "../src/index.js";

describe("validated identifiers and time", () => {
  it("preserves valid identifiers", () => {
    expect(frameId("map")).toBe("map");
    expect(entityId("robot:42")).toBe("robot:42");
    expect(assetId("factory.glb")).toBe("factory.glb");
    expect(layerId("navigation")).toBe("navigation");
    expect(clockId("ros-time")).toBe("ros-time");
  });

  it.each(["", "   ", "bad\u0000id"])("rejects invalid identifier %j", (invalid) => {
    expect(() => frameId(invalid)).toThrow(IdentifierValidationError);
  });

  it("constructs timestamps with normalized nanosecond range", () => {
    const ros = clockId("ros");
    expect(timestamp(ros, -1, 999_999_999)).toEqual({
      clock: ros,
      sec: -1,
      nsec: 999_999_999,
    });
  });

  it.each([
    [0.5, 0],
    [Number.NaN, 0],
    [0, -1],
    [0, 1_000_000_000],
    [0, 0.25],
  ])("rejects invalid timestamp (%s, %s)", (sec, nsec) => {
    expect(() => timestamp(clockId("ros"), sec, nsec)).toThrow(TimestampValidationError);
  });
});

describe("renderer-neutral public contracts", () => {
  it("represents all P0 semantic entity variants without renderer objects", () => {
    const map = frameId("map");
    const pose = {
      frame: map,
      position: [0, 0, 0] as const,
      orientation: [0, 0, 0, 1] as const,
    };
    const entities: readonly [AssetEntity, RobotEntity, GoalEntity, PathEntity, LandmarkEntity] = [
      {
        kind: "asset",
        id: entityId("asset-instance"),
        assetId: assetId("factory"),
        pose,
        pickable: true,
      },
      { kind: "robot", id: entityId("robot"), pose },
      { kind: "goal", id: entityId("goal"), pose, radiusMeters: 0.25 },
      {
        kind: "path",
        id: entityId("path"),
        frame: map,
        points: [
          [0, 0, 0],
          [1, 0, 0],
        ],
      },
      { kind: "landmark", id: entityId("landmark"), pose, label: "Dock" },
    ];

    expect(entities.map((entity) => entity.kind)).toEqual([
      "asset",
      "robot",
      "goal",
      "path",
      "landmark",
    ]);
  });

  it("keeps camera, pick, selection, and spatial events serializable", () => {
    const map = frameId("map");
    const robot = entityId("robot");
    const camera: CameraState = {
      frame: map,
      position: [5, -5, 5],
      target: [0, 0, 0],
      up: [0, 0, 1],
      projection: {
        kind: "perspective",
        verticalFovRadians: Math.PI / 3,
        aspect: 16 / 9,
        nearMeters: 0.1,
        farMeters: 10_000,
      },
    };
    const hit: PickHit = {
      entityId: robot,
      point: { frame: map, value: [1, 2, 0] },
      distanceMeters: 8,
    };
    const selection: SelectionState = { selected: [robot], primary: robot };
    const event: SpatialEvent = {
      type: "pick",
      request: {
        viewportPoint: { xCssPixels: 10, yCssPixels: 20 },
        viewport: {
          widthCssPixels: 800,
          heightCssPixels: 600,
          devicePixelRatio: 2,
        },
      },
      hits: [hit],
      modifiers: { alt: false, ctrl: false, meta: false, shift: false },
    };

    const decoded: unknown = JSON.parse(JSON.stringify({ camera, selection, event }));
    expect(decoded).toEqual({
      camera,
      selection,
      event,
    });
  });

  it("checks capabilities by exact identifier", () => {
    const capabilities = {
      supported: ["rendering", "extension:floor-hit"] as const,
    };
    expect(hasRendererCapability(capabilities, "rendering")).toBe(true);
    expect(hasRendererCapability(capabilities, "picking")).toBe(false);
    expect(hasRendererCapability(capabilities, "extension:floor-hit")).toBe(true);
  });
});
