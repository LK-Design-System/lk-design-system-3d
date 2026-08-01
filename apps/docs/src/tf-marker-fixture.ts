import {
  bounds3,
  clockId,
  entityId,
  frameId,
  layerId,
  pose3,
  quaternionFromYaw,
  rigidTransform3,
  timestamp,
  type Bounds3,
  type FrameId,
  type RigidTransform3,
} from "@lk-design-system/lds-3d-core";
import { createMarkerLayerSnapshot } from "@lk-design-system/lds-3d-markers";
import { createPointCloudLayerSnapshot } from "@lk-design-system/lds-3d-pointcloud";
import { createFrameGraph, lookupFrameTransform } from "@lk-design-system/lds-3d-tf";

import { POINT_CLOUD_LIDAR } from "./pointcloud-fixture.js";

export const TF_MARKER_MAP_FRAME = frameId("lk-map");
export const TF_MARKER_BASE_FRAME = frameId("base-link");
export const TF_MARKER_LIDAR_FRAME = frameId("lidar-front");
export const TF_MARKER_TIME = timestamp(clockId("ros-time"), 42, 250_000_000);

export const TF_MARKER_GRAPH = createFrameGraph([
  {
    transform: rigidTransform3(
      TF_MARKER_BASE_FRAME,
      TF_MARKER_MAP_FRAME,
      [0.8, -0.6, 0],
      quaternionFromYaw(Math.PI / 9),
    ),
    timestamp: TF_MARKER_TIME,
  },
  {
    transform: rigidTransform3(
      TF_MARKER_LIDAR_FRAME,
      TF_MARKER_BASE_FRAME,
      [0.42, 0, 0.72],
      quaternionFromYaw(0),
    ),
    timestamp: TF_MARKER_TIME,
    static: true,
  },
]);

function requireTransform(sourceFrame: FrameId): RigidTransform3 {
  const result = lookupFrameTransform(
    TF_MARKER_GRAPH,
    sourceFrame,
    TF_MARKER_MAP_FRAME,
    TF_MARKER_TIME,
    { staleAfterSeconds: 0.25 },
  );
  if (result.kind !== "ready") {
    throw new Error(`TF/Marker fixture transform failed: ${result.kind}`);
  }
  return result.transform;
}

export const TF_MARKER_BASE_TO_MAP = requireTransform(TF_MARKER_BASE_FRAME);
export const TF_MARKER_LIDAR_TO_MAP = requireTransform(TF_MARKER_LIDAR_FRAME);

export const TF_MARKER_LAYER = createMarkerLayerSnapshot({
  id: layerId("/visualization/navigation"),
  frame: TF_MARKER_BASE_FRAME,
  timestamp: TF_MARKER_TIME,
  sourceToScene: TF_MARKER_BASE_TO_MAP,
  markers: [
    {
      kind: "pose",
      id: entityId("marker/base-pose"),
      namespace: "robot",
      pose: pose3(TF_MARKER_BASE_FRAME, [0, 0, 0.08], quaternionFromYaw(0)),
      axisLength: 0.72,
      axisRadius: 0.025,
      color: { r: 0.25, g: 0.25, b: 0.25, a: 1 },
    },
    {
      kind: "arrow",
      id: entityId("marker/heading"),
      namespace: "navigation",
      pose: pose3(TF_MARKER_BASE_FRAME, [0, 0, 0.34], quaternionFromYaw(0)),
      scale: [1.35, 0.09, 0.24],
      color: { r: 0.07, g: 0.43, b: 0.88, a: 1 },
    },
    {
      kind: "line-strip",
      id: entityId("marker/local-route"),
      namespace: "navigation",
      pose: pose3(TF_MARKER_BASE_FRAME, [0, 0, 0.06], quaternionFromYaw(0)),
      points: [
        [0, 0, 0],
        [1.1, 0.2, 0],
        [2.1, 0.75, 0],
        [3.2, 0.55, 0],
      ],
      width: 0.075,
      color: { r: 0.05, g: 0.56, b: 0.36, a: 0.92 },
    },
    {
      kind: "points",
      id: entityId("marker/checkpoints"),
      namespace: "navigation",
      pose: pose3(TF_MARKER_BASE_FRAME, [0, 0, 0.12], quaternionFromYaw(0)),
      points: [
        [1.1, 0.2, 0],
        [2.1, 0.75, 0],
        [3.2, 0.55, 0],
      ],
      size: 0.18,
      color: { r: 0.43, g: 0.24, b: 0.8, a: 1 },
    },
    {
      kind: "volume",
      id: entityId("marker/safety-volume"),
      namespace: "safety",
      pose: pose3(TF_MARKER_BASE_FRAME, [1.55, -0.72, 0.42], quaternionFromYaw(Math.PI / 7)),
      shape: "box",
      scale: [0.9, 0.7, 0.84],
      color: { r: 0.91, g: 0.49, b: 0.08, a: 0.44 },
    },
    {
      kind: "text",
      id: entityId("marker/base-label"),
      namespace: "labels",
      pose: pose3(TF_MARKER_BASE_FRAME, [0, 0, 1.25], quaternionFromYaw(0)),
      text: "BASE LINK",
      height: 0.34,
      color: { r: 0.08, g: 0.18, b: 0.28, a: 1 },
      selectable: false,
    },
  ],
});

export const TF_MARKER_POINT_CLOUD_LAYER = createPointCloudLayerSnapshot({
  id: layerId("/sensors/lidar-front"),
  snapshot: POINT_CLOUD_LIDAR,
  sourceToScene: TF_MARKER_LIDAR_TO_MAP,
});

export const TF_MARKER_BOUNDS: Bounds3 = bounds3(
  TF_MARKER_MAP_FRAME,
  [-3.2, -3.2, 0],
  [5.2, 3.8, 2.4],
);
