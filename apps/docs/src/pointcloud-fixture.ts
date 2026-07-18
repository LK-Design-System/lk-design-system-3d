import { bounds3, frameId } from "@lk-robotics/design-system-3d-core";
import {
  createPointCloudSnapshot,
  type PointCloudSnapshot,
} from "@lk-robotics/design-system-3d-pointcloud";

export const POINT_CLOUD_FRAME = frameId("lk-map");

function createFixture(
  pointCount: number,
  revision: string,
  offset: readonly [number, number, number] = [0, 0, 0],
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
    frame: POINT_CLOUD_FRAME,
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
