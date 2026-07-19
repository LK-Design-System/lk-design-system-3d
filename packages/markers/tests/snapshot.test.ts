import { describe, expect, it } from "vitest";
import {
  clockId,
  entityId,
  frameId,
  layerId,
  pose3,
  rigidTransform3,
  timestamp,
} from "@lk-robotics/design-system-3d-core";

import {
  MarkerValidationError,
  createMarkerLayerSnapshot,
  createMarkerSnapshot,
  resolveMarkerLayerRenderState,
} from "../src/index.js";

const BASE = frameId("base-link");
const MAP = frameId("map");
const CLOCK = clockId("ros-time");

const arrow = {
  kind: "arrow",
  id: entityId("marker/heading"),
  pose: pose3(BASE, [0, 0, 0.4], [0, 0, 0, 1]),
  scale: [1.2, 0.08, 0.18],
  color: { r: 0.1, g: 0.5, b: 0.9, a: 1 },
} as const;

describe("marker snapshots", () => {
  it("normalizes immutable marker semantics", () => {
    const marker = createMarkerSnapshot(arrow);
    expect(marker.kind).toBe("arrow");
    expect(marker.namespace).toBe("default");
    expect(marker.visible).toBe(true);
    expect(Object.isFrozen(marker)).toBe(true);
  });

  it("resolves one frame-scoped layer into the selected scene frame", () => {
    const layer = createMarkerLayerSnapshot({
      id: layerId("navigation-markers"),
      frame: BASE,
      timestamp: timestamp(CLOCK, 20, 0),
      markers: [arrow],
      sourceToScene: rigidTransform3(BASE, MAP, [2, 1, 0], [0, 0, 0, 1]),
    });
    const result = resolveMarkerLayerRenderState(layer, MAP, 10, {
      now: timestamp(CLOCK, 20, 100_000_000),
      staleAfterSeconds: 0.5,
    });
    expect(result.kind).toBe("ready");
    expect(result.acceptedMarkerCount).toBe(1);
    expect(result.freshness.kind).toBe("fresh");
  });

  it("does not guess unresolved, mismatched, or over-budget frames", () => {
    const unresolved = createMarkerLayerSnapshot({
      id: layerId("unresolved"),
      frame: BASE,
      markers: [arrow],
    });
    expect(resolveMarkerLayerRenderState(unresolved, MAP, 10).kind).toBe("frame-unresolved");

    const mismatched = createMarkerLayerSnapshot({
      id: layerId("mismatched"),
      frame: BASE,
      markers: [arrow],
      sourceToScene: rigidTransform3(BASE, frameId("odom"), [0, 0, 0], [0, 0, 0, 1]),
    });
    expect(resolveMarkerLayerRenderState(mismatched, MAP, 10).kind).toBe("frame-mismatch");
    expect(() => resolveMarkerLayerRenderState(mismatched, MAP, 0)).toThrow(MarkerValidationError);
  });

  it("reports stale and clock-mismatched layer timestamps", () => {
    const layer = createMarkerLayerSnapshot({
      id: layerId("timed"),
      frame: BASE,
      timestamp: timestamp(CLOCK, 10, 0),
      markers: [arrow],
      sourceToScene: rigidTransform3(BASE, MAP, [0, 0, 0], [0, 0, 0, 1]),
    });
    expect(
      resolveMarkerLayerRenderState(layer, MAP, 10, {
        now: timestamp(CLOCK, 12, 0),
        staleAfterSeconds: 1,
      }).freshness.kind,
    ).toBe("stale");
    expect(
      resolveMarkerLayerRenderState(layer, MAP, 10, {
        now: timestamp(clockId("wall-time"), 12, 0),
        staleAfterSeconds: 1,
      }).freshness.kind,
    ).toBe("clock-mismatch");
  });

  it("rejects duplicate ids, frame mismatches, and invalid geometry", () => {
    expect(() =>
      createMarkerLayerSnapshot({
        id: layerId("duplicates"),
        frame: BASE,
        markers: [arrow, arrow],
      }),
    ).toThrow(MarkerValidationError);
    expect(() => createMarkerSnapshot({ ...arrow, scale: [1, 0, 1] })).toThrow(
      MarkerValidationError,
    );
    expect(() =>
      createMarkerLayerSnapshot({
        id: layerId("wrong-frame"),
        frame: MAP,
        markers: [arrow],
      }),
    ).toThrow(/expected frame/);
  });
});
