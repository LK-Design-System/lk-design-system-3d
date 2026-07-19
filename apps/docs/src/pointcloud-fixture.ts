import {
  bounds3,
  createSpatialEditBox,
  createSpatialEditSphere,
  entityId,
  frameId,
  layerId,
  quaternionFromYaw,
  rigidTransform3,
} from "@lk-robotics/design-system-3d-core";
import type { Bounds3, SpatialEditVolume } from "@lk-robotics/design-system-3d-core";
import {
  createPointCloudLayerSet,
  createPointCloudSnapshot,
  type PointCloudLayerSet,
  type PointCloudSnapshot,
} from "@lk-robotics/design-system-3d-pointcloud";

export const POINT_CLOUD_FRAME = frameId("lk-map");
export const POINT_CLOUD_LIDAR_FRAME = frameId("lidar-front");

function createFixture(
  pointCount: number,
  revision: string,
  offset: readonly [number, number, number] = [0, 0, 0],
  frame = POINT_CLOUD_FRAME,
): PointCloudSnapshot {
  const positions = new Float32Array(pointCount * 3);
  const colors = new Float32Array(pointCount * 3);
  for (let index = 0; index < pointCount; index += 1) {
    const angle = index * 2.399963229728653;
    const radius = 1.6 + (index % 29) * 0.055;
    const heightRatio = (index % 37) / 36;
    const cursor = index * 3;
    positions[cursor] = Math.cos(angle) * radius + offset[0];
    positions[cursor + 1] = Math.sin(angle) * radius + offset[1];
    positions[cursor + 2] = (index % 37) * 0.035 + offset[2];
    // Spatially coherent vertical colour bands make the RGB contract inspectable
    // without implying an application-specific classification palette.
    colors[cursor] = 0.1 + heightRatio * 0.82;
    colors[cursor + 1] = 0.82 - heightRatio * 0.48;
    colors[cursor + 2] = 0.96 - heightRatio * 0.48;
  }
  return createPointCloudSnapshot({
    frame,
    positions,
    colors,
    revision,
  });
}

export const POINT_CLOUD_READY = createFixture(5_000, "fixture-ready");
export const POINT_CLOUD_XYZ_ONLY = createPointCloudSnapshot({
  frame: POINT_CLOUD_FRAME,
  positions: POINT_CLOUD_READY.positions,
  revision: "fixture-xyz-only",
});
export const POINT_CLOUD_REPLACEMENT = createFixture(5_000, "fixture-replacement", [1.1, -0.7, 0]);
const POINT_CLOUD_LIDAR_RGB = createFixture(
  2_500,
  "fixture-lidar-rgb",
  [0, 0, 0.2],
  POINT_CLOUD_LIDAR_FRAME,
);
export const POINT_CLOUD_LIDAR = createPointCloudSnapshot({
  frame: POINT_CLOUD_LIDAR_FRAME,
  positions: POINT_CLOUD_LIDAR_RGB.positions,
  revision: "fixture-lidar-xyz",
});
export const POINT_CLOUD_OVER_BUDGET = createFixture(50_000, "fixture-over-budget");
export const POINT_CLOUD_EMPTY = createPointCloudSnapshot({
  frame: POINT_CLOUD_FRAME,
  positions: new Float32Array(),
  revision: "fixture-empty",
});
export const POINT_CLOUD_MISMATCH = createPointCloudSnapshot({
  frame: frameId("odom"),
  positions: POINT_CLOUD_READY.positions,
  revision: "fixture-odom",
  ...(POINT_CLOUD_READY.colors === undefined ? {} : { colors: POINT_CLOUD_READY.colors }),
});
export const POINT_CLOUD_FOCUS_BOUNDS =
  POINT_CLOUD_READY.bounds ?? bounds3(POINT_CLOUD_FRAME, [-1, -1, 0], [1, 1, 1]);

export const POINT_CLOUD_SECTION_BOUNDS: Bounds3 = bounds3(
  POINT_CLOUD_FRAME,
  [-2.35, -2.15, 0.18],
  [2.4, 2.2, 1.08],
);

export const POINT_CLOUD_EDIT_VOLUMES: readonly SpatialEditVolume[] = Object.freeze([
  createSpatialEditSphere({
    id: entityId("edit/delete-sphere-01"),
    operation: "delete",
    pose: {
      frame: POINT_CLOUD_FRAME,
      position: [-1.35, 0.35, 0.62],
      orientation: quaternionFromYaw(0),
    },
    radiusMeters: 0.62,
  }),
  createSpatialEditBox({
    id: entityId("edit/restore-box-01"),
    operation: "restore",
    pose: {
      frame: POINT_CLOUD_FRAME,
      position: [1.25, 0.72, 0.62],
      orientation: quaternionFromYaw(Math.PI / 9),
    },
    sizeMeters: [1.15, 0.9, 1.1],
  }),
]);

const LIDAR_TO_MAP = rigidTransform3(
  POINT_CLOUD_LIDAR_FRAME,
  POINT_CLOUD_FRAME,
  [3.4, 1.2, 0.1],
  quaternionFromYaw(Math.PI / 8),
);

export const POINT_CLOUD_LAYER_SET: PointCloudLayerSet = createPointCloudLayerSet({
  layers: [
    { id: layerId("/mapping/map_points"), snapshot: POINT_CLOUD_READY },
    {
      id: layerId("/mapping/lidar_front"),
      snapshot: POINT_CLOUD_LIDAR,
      sourceToScene: LIDAR_TO_MAP,
    },
  ],
});

export const POINT_CLOUD_LAYER_SET_DEGRADED: PointCloudLayerSet = createPointCloudLayerSet({
  layers: [
    { id: layerId("/mapping/map_points"), snapshot: POINT_CLOUD_READY },
    { id: layerId("/mapping/lidar_front"), snapshot: POINT_CLOUD_LIDAR },
  ],
});
