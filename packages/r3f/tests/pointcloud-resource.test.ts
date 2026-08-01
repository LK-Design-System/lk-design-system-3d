import { bounds3, frameId, quaternionFromYaw, rigidTransform3 } from "@lk-design-system/lds-3d-core";
import { coreToThreePosition } from "@lk-design-system/lds-3d-three/coordinates";
import { createPointCloudSnapshot } from "@lk-design-system/lds-3d-pointcloud";
import { BufferAttribute, Color, StaticDrawUsage, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";

import {
  createPointCloudGeometryResource,
  createPointCloudRenderResource,
  createSectionClippingPlanes,
} from "../src/pointcloud-resource.js";

const SNAPSHOT = createPointCloudSnapshot({
  frame: frameId("lk-map"),
  positions: new Float32Array([0, 0, 0, 1, 2, 3]),
  colors: new Float32Array([0.1, 0.2, 0.3, 0.7, 0.8, 0.9]),
  revision: "a",
});
const XYZ_SNAPSHOT = createPointCloudSnapshot({
  frame: frameId("lk-map"),
  positions: new Float32Array([0, 0, 0, 1, 2, 3]),
  revision: "xyz-only",
});
const LIDAR_SNAPSHOT = createPointCloudSnapshot({
  frame: frameId("lidar"),
  positions: new Float32Array([0, 0, 0, 1, 0, 0]),
  revision: "lidar",
});
const HEIGHT_SNAPSHOT = createPointCloudSnapshot({
  frame: frameId("lidar"),
  positions: new Float32Array([0, 0, 0, 0, 0, 2]),
  revision: "height",
});
const MATERIAL_OPTIONS = {
  fallbackColor: "#3c9dff",
  opacity: 1,
  pointSize: 1.25,
} as const;

describe("PointCloud geometry resource", () => {
  it("creates static GPU attributes without taking ownership of snapshot arrays", () => {
    const resource = createPointCloudGeometryResource(SNAPSHOT);
    const position = resource.geometry.getAttribute("position");
    const color = resource.geometry.getAttribute("color");

    expect(position).toBeInstanceOf(BufferAttribute);
    expect(color).toBeInstanceOf(BufferAttribute);
    expect((position as BufferAttribute).array).toBe(SNAPSHOT.positions);
    expect((position as BufferAttribute).usage).toBe(StaticDrawUsage);
    expect((color as BufferAttribute).array).toBe(SNAPSHOT.colors);
    expect((color as BufferAttribute).usage).toBe(StaticDrawUsage);
    expect(resource.geometry.drawRange).toEqual({ start: 0, count: SNAPSHOT.pointCount });
    expect(resource.geometry.boundingSphere).not.toBeNull();
    resource.dispose();
  });

  it("creates fresh RGB and XYZ materials for shader-safe snapshot replacement", () => {
    const rgb = createPointCloudRenderResource(SNAPSHOT, MATERIAL_OPTIONS);
    const xyz = createPointCloudRenderResource(XYZ_SNAPSHOT, {
      ...MATERIAL_OPTIONS,
      opacity: 0.5,
    });

    expect(rgb.material.vertexColors).toBe(true);
    expect(rgb.material.color.getHexString()).toBe("ffffff");
    expect(rgb.material.sizeAttenuation).toBe(false);
    expect(rgb.material.depthWrite).toBe(true);
    expect(xyz.material.vertexColors).toBe(false);
    expect(xyz.material.color.getHexString()).toBe("3c9dff");
    expect(xyz.material.transparent).toBe(true);
    expect(xyz.material.depthWrite).toBe(false);

    rgb.dispose();
    xyz.dispose();
  });

  it("supports source RGB, explicit uniform color, and scene-frame height color", () => {
    const uniform = createPointCloudRenderResource(SNAPSHOT, {
      ...MATERIAL_OPTIONS,
      colorMode: "uniform",
      fallbackColor: "#ffba6b",
    });
    expect(uniform.geometry.getAttribute("color")).toBeUndefined();
    expect(uniform.material.vertexColors).toBe(false);
    expect(uniform.material.color.getHexString()).toBe("ffba6b");

    const lidarToMap = rigidTransform3(
      HEIGHT_SNAPSHOT.frame,
      frameId("map"),
      [0, 0, 10],
      quaternionFromYaw(0),
    );
    const height = createPointCloudGeometryResource(HEIGHT_SNAPSHOT, {
      colorMode: "height",
      sourceToScene: lidarToMap,
    });
    const colors = height.geometry.getAttribute("color") as BufferAttribute;
    const low = new Color().setHSL(0.66, 1, 0.5);
    const high = new Color().setHSL(0, 1, 0.5);
    expect(height.heightRange).toEqual([10, 12]);
    expect(colors.array).not.toBe(HEIGHT_SNAPSHOT.positions);
    expect(colors.getX(0)).toBeCloseTo(low.r, 6);
    expect(colors.getY(0)).toBeCloseTo(low.g, 6);
    expect(colors.getZ(0)).toBeCloseTo(low.b, 6);
    expect(colors.getX(1)).toBeCloseTo(high.r, 6);
    expect(colors.getY(1)).toBeCloseTo(high.g, 6);
    expect(colors.getZ(1)).toBeCloseTo(high.b, 6);

    uniform.dispose();
    height.dispose();
  });

  it("disposes geometry and material exactly once across replacement and unmount", () => {
    const replaced = createPointCloudRenderResource(SNAPSHOT, MATERIAL_OPTIONS);
    const mounted = createPointCloudRenderResource(XYZ_SNAPSHOT, MATERIAL_OPTIONS);
    const replacedGeometryDispose = vi.fn();
    const replacedMaterialDispose = vi.fn();
    const mountedGeometryDispose = vi.fn();
    const mountedMaterialDispose = vi.fn();
    replaced.geometry.addEventListener("dispose", replacedGeometryDispose);
    replaced.material.addEventListener("dispose", replacedMaterialDispose);
    mounted.geometry.addEventListener("dispose", mountedGeometryDispose);
    mounted.material.addEventListener("dispose", mountedMaterialDispose);

    // Replacement releases the old object graph; later unmount releases the new one.
    replaced.dispose();
    mounted.dispose();
    mounted.dispose();

    expect(replacedGeometryDispose).toHaveBeenCalledTimes(1);
    expect(replacedMaterialDispose).toHaveBeenCalledTimes(1);
    expect(mountedGeometryDispose).toHaveBeenCalledTimes(1);
    expect(mountedMaterialDispose).toHaveBeenCalledTimes(1);
  });

  it("applies an explicit source-to-scene transform without rewriting point buffers", () => {
    const lidarToMap = rigidTransform3(
      LIDAR_SNAPSHOT.frame,
      frameId("map"),
      [4, 5, 6],
      quaternionFromYaw(Math.PI / 2),
    );
    const resource = createPointCloudRenderResource(LIDAR_SNAPSHOT, MATERIAL_OPTIONS, lidarToMap);

    expect(resource.geometry.getAttribute("position").array).toBe(LIDAR_SNAPSHOT.positions);
    expect(resource.points.position.toArray()).toEqual([4, 5, 6]);
    expect(resource.points.quaternion.z).toBeCloseTo(lidarToMap.rotation[2], 12);
    expect(resource.points.quaternion.w).toBeCloseTo(lidarToMap.rotation[3], 12);
    const transformed = new Vector3(1, 0, 0).applyMatrix4(resource.points.matrix);
    expect(transformed.toArray()).toEqual([4, 6, 6]);

    resource.dispose();
  });

  it("creates six world-space clipping planes that keep the core section interior", () => {
    const bounds = bounds3(frameId("lk-map"), [-1, -2, 0], [3, 4, 5]);
    const planes = createSectionClippingPlanes(bounds);
    const center = new Vector3().fromArray(coreToThreePosition([1, 1, 2.5]));
    const outside = new Vector3().fromArray(coreToThreePosition([4, 1, 2.5]));

    expect(planes).toHaveLength(6);
    expect(planes.every((plane) => plane.distanceToPoint(center) >= 0)).toBe(true);
    expect(planes.some((plane) => plane.distanceToPoint(outside) < 0)).toBe(true);

    const resource = createPointCloudRenderResource(SNAPSHOT, {
      ...MATERIAL_OPTIONS,
      clipBounds: bounds,
    });
    expect(resource.material.clippingPlanes).toHaveLength(6);
    expect(resource.geometry.getAttribute("position").array).toBe(SNAPSHOT.positions);
    resource.dispose();
  });
});
