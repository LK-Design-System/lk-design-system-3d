import { frameId } from "@lk-robotics/design-system-3d-core";
import { createPointCloudSnapshot } from "@lk-robotics/design-system-3d-pointcloud";
import { BufferAttribute, StaticDrawUsage } from "three";
import { describe, expect, it, vi } from "vitest";

import {
  createPointCloudGeometryResource,
  createPointCloudRenderResource,
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
});
