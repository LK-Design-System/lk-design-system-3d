import {
  clockId,
  frameId,
  layerId,
  quaternionFromYaw,
  rigidTransform3,
  timestamp,
} from "@lk-robotics/design-system-3d-core";
import { describe, expect, it } from "vitest";

import {
  createPointCloudLayerSet,
  createPointCloudSnapshot,
  PointCloudLayerValidationError,
  resolvePointCloudLayerSetRenderState,
} from "../src/index.js";

const MAP_FRAME = frameId("map");
const LIDAR_FRAME = frameId("lidar");
const ODOM_FRAME = frameId("odom");
const ROS_CLOCK = clockId("ros");

function snapshot(frame = MAP_FRAME, pointCount = 2, sec = 10) {
  const positions = new Float32Array(pointCount * 3);
  for (let index = 0; index < positions.length; index += 1) positions[index] = index / 10;
  return createPointCloudSnapshot({
    frame,
    positions,
    revision: `${frame}:${pointCount.toString()}:${sec.toString()}`,
    timestamp: timestamp(ROS_CLOCK, sec, 0),
  });
}

describe("PointCloudLayerSet", () => {
  it("accepts multiple explicit source frames without copying point buffers", () => {
    const mapSnapshot = snapshot(MAP_FRAME, 2);
    const lidarSnapshot = snapshot(LIDAR_FRAME, 3);
    const lidarToMap = rigidTransform3(
      LIDAR_FRAME,
      MAP_FRAME,
      [1, 2, 3],
      quaternionFromYaw(Math.PI / 2),
    );
    const set = createPointCloudLayerSet({
      layers: [
        { id: layerId("/map_points"), snapshot: mapSnapshot },
        { id: layerId("/lidar_points"), snapshot: lidarSnapshot, sourceToScene: lidarToMap },
      ],
    });

    const state = resolvePointCloudLayerSetRenderState(set, MAP_FRAME, 10);

    expect(state.kind).toBe("ready");
    expect(state.requestedPointCount).toBe(5);
    expect(state.acceptedPointCount).toBe(5);
    expect(state.layers[0]).toMatchObject({
      kind: "ready",
      sourceToScene: { targetFrame: MAP_FRAME },
    });
    expect(state.layers[1]).toMatchObject({ kind: "ready", sourceToScene: lidarToMap });
    expect(set.layers[0]?.snapshot.positions).toBe(mapSnapshot.positions);
    expect(set.layers[1]?.snapshot.positions).toBe(lidarSnapshot.positions);
  });

  it("reports missing and wrong-target transforms without rejecting valid siblings", () => {
    const set = createPointCloudLayerSet({
      layers: [
        { id: layerId("map"), snapshot: snapshot(MAP_FRAME, 2) },
        { id: layerId("missing"), snapshot: snapshot(LIDAR_FRAME, 3) },
        {
          id: layerId("wrong-target"),
          snapshot: snapshot(LIDAR_FRAME, 4),
          sourceToScene: rigidTransform3(LIDAR_FRAME, ODOM_FRAME, [0, 0, 0], [0, 0, 0, 1]),
        },
      ],
    });

    const state = resolvePointCloudLayerSetRenderState(set, MAP_FRAME, 20);

    expect(state.kind).toBe("degraded");
    expect(state.acceptedPointCount).toBe(2);
    expect(state.layers.map((layer) => layer.kind)).toEqual([
      "ready",
      "frame-unresolved",
      "frame-mismatch",
    ]);
  });

  it("rejects the complete eligible set when its total point budget is exceeded", () => {
    const set = createPointCloudLayerSet({
      layers: [
        { id: layerId("a"), snapshot: snapshot(MAP_FRAME, 3) },
        { id: layerId("b"), snapshot: snapshot(MAP_FRAME, 4) },
        { id: layerId("hidden"), snapshot: snapshot(MAP_FRAME, 100), visible: false },
      ],
    });

    const state = resolvePointCloudLayerSetRenderState(set, MAP_FRAME, 6);

    expect(state.kind).toBe("budget-exceeded");
    expect(state.requestedPointCount).toBe(7);
    expect(state.acceptedPointCount).toBe(0);
    expect(state.layers.map((layer) => layer.kind)).toEqual([
      "budget-exceeded",
      "budget-exceeded",
      "hidden",
    ]);
  });

  it("keeps stale data renderable while exposing freshness as degraded state", () => {
    const set = createPointCloudLayerSet({
      layers: [{ id: layerId("scan"), snapshot: snapshot(MAP_FRAME, 2, 10) }],
    });

    const state = resolvePointCloudLayerSetRenderState(set, MAP_FRAME, 10, {
      now: timestamp(ROS_CLOCK, 13, 0),
      staleAfterSeconds: 1,
    });

    expect(state.kind).toBe("degraded");
    expect(state.acceptedPointCount).toBe(2);
    expect(state.layers[0]).toMatchObject({
      kind: "ready",
      freshness: { kind: "stale", ageSeconds: 3, staleAfterSeconds: 1 },
    });
  });

  it("rejects duplicate layer ids and transforms for the wrong source frame", () => {
    const value = snapshot(LIDAR_FRAME, 1);
    expect(() =>
      createPointCloudLayerSet({
        layers: [
          { id: layerId("duplicate"), snapshot: value },
          { id: layerId("duplicate"), snapshot: value },
        ],
      }),
    ).toThrow(PointCloudLayerValidationError);
    expect(() =>
      createPointCloudLayerSet({
        layers: [
          {
            id: layerId("bad-transform"),
            snapshot: value,
            sourceToScene: rigidTransform3(MAP_FRAME, ODOM_FRAME, [0, 0, 0], [0, 0, 0, 1]),
          },
        ],
      }),
    ).toThrow(/expected frame "lidar"/u);
  });
});
