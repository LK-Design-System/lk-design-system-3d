import type { PointCloudSnapshot } from "@lk-robotics/design-system-3d-pointcloud";
import { BufferAttribute, BufferGeometry, Points, PointsMaterial, StaticDrawUsage } from "three";

export interface PointCloudGeometryResource {
  readonly geometry: BufferGeometry;
  dispose(): void;
}

export interface PointCloudMaterialOptions {
  readonly fallbackColor: string;
  readonly opacity: number;
  readonly pointSize: number;
}

export interface PointCloudRenderResource {
  readonly geometry: BufferGeometry;
  readonly material: PointsMaterial;
  readonly points: Points<BufferGeometry, PointsMaterial>;
  dispose(): void;
}

/**
 * Owns only adapter-created GPU geometry. Snapshot arrays remain caller-owned
 * CPU data and are never mutated or detached by this resource.
 */
export function createPointCloudGeometryResource(
  snapshot: PointCloudSnapshot,
): PointCloudGeometryResource {
  const geometry = new BufferGeometry();
  geometry.name = `lkds3d:point-cloud:${String(snapshot.revision)}`;
  const position = new BufferAttribute(snapshot.positions, 3);
  position.setUsage(StaticDrawUsage);
  geometry.setAttribute("position", position);
  if (snapshot.colors !== undefined) {
    const color = new BufferAttribute(snapshot.colors, 3);
    color.setUsage(StaticDrawUsage);
    geometry.setAttribute("color", color);
  }
  geometry.setDrawRange(0, snapshot.pointCount);
  geometry.computeBoundingSphere();

  let disposed = false;
  return Object.freeze({
    geometry,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      geometry.dispose();
    },
  });
}

/**
 * Owns the adapter-created Three object graph for one immutable snapshot.
 * R3F mounts this graph as a primitive with auto-disposal disabled; the caller
 * disposes this resource on replacement or unmount. Snapshot arrays remain
 * caller-owned throughout.
 */
export function createPointCloudRenderResource(
  snapshot: PointCloudSnapshot,
  options: PointCloudMaterialOptions,
): PointCloudRenderResource {
  const geometryResource = createPointCloudGeometryResource(snapshot);
  const material = new PointsMaterial({
    color: snapshot.colors === undefined ? options.fallbackColor : "#ffffff",
    depthWrite: options.opacity === 1,
    opacity: options.opacity,
    size: options.pointSize,
    // Foundation point size is a stable pixel-density control, not world scale.
    sizeAttenuation: false,
    transparent: options.opacity < 1,
    vertexColors: snapshot.colors !== undefined,
  });
  const points = new Points(geometryResource.geometry, material);
  points.frustumCulled = true;

  let disposed = false;
  return Object.freeze({
    geometry: geometryResource.geometry,
    material,
    points,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      geometryResource.dispose();
      material.dispose();
    },
  });
}
