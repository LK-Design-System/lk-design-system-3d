import {
  FrameMismatchError,
  assertValidBounds3,
  assertValidRigidTransform,
  type Bounds3,
  type RigidTransform3,
} from "@lk-robotics/design-system-3d-core";
import type { PointCloudSnapshot } from "@lk-robotics/design-system-3d-pointcloud";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Points,
  PointsMaterial,
  Plane,
  Quaternion,
  StaticDrawUsage,
  Vector3,
} from "three";

import { coreToThreePosition } from "./coordinates.js";

export type PointCloudColorMode = "source" | "uniform" | "height";
export type PointCloudHeightRange = readonly [minimum: number, maximum: number];

export interface PointCloudGeometryResource {
  readonly geometry: BufferGeometry;
  readonly heightRange?: PointCloudHeightRange;
  dispose(): void;
}

export interface PointCloudMaterialOptions {
  /** Optional scene-frame bounds kept by GPU material clipping. */
  readonly clipBounds?: Bounds3;
  readonly colorMode?: PointCloudColorMode;
  readonly fallbackColor: string;
  readonly heightRange?: PointCloudHeightRange;
  readonly opacity: number;
  readonly pointSize: number;
}

/** Converts LK-core section bounds to the six world-space planes used by Three WebGL clipping. */
export function createSectionClippingPlanes(bounds: Bounds3): readonly Plane[] {
  assertValidBounds3(bounds);
  const first = coreToThreePosition(bounds.min);
  const second = coreToThreePosition(bounds.max);
  const minimum = [
    Math.min(first[0], second[0]),
    Math.min(first[1], second[1]),
    Math.min(first[2], second[2]),
  ] as const;
  const maximum = [
    Math.max(first[0], second[0]),
    Math.max(first[1], second[1]),
    Math.max(first[2], second[2]),
  ] as const;
  return Object.freeze([
    new Plane(new Vector3(1, 0, 0), -minimum[0]),
    new Plane(new Vector3(-1, 0, 0), maximum[0]),
    new Plane(new Vector3(0, 1, 0), -minimum[1]),
    new Plane(new Vector3(0, -1, 0), maximum[1]),
    new Plane(new Vector3(0, 0, 1), -minimum[2]),
    new Plane(new Vector3(0, 0, -1), maximum[2]),
  ]);
}

export interface PointCloudRenderResource {
  readonly geometry: BufferGeometry;
  readonly material: PointsMaterial;
  readonly points: Points<BufferGeometry, PointsMaterial>;
  dispose(): void;
}

interface PointCloudGeometryOptions {
  readonly colorMode?: PointCloudColorMode;
  readonly heightRange?: PointCloudHeightRange;
  readonly sourceToScene?: RigidTransform3;
}

function normalizedHeightRange(value: PointCloudHeightRange): PointCloudHeightRange {
  const [minimum, maximum] = value;
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum > maximum) {
    throw new RangeError(
      "Point-cloud heightRange must contain finite [minimum, maximum] values in ascending order.",
    );
  }
  return Object.freeze([minimum, maximum]);
}

function createHeightColors(
  snapshot: PointCloudSnapshot,
  sourceToScene: RigidTransform3 | undefined,
  requestedRange: PointCloudHeightRange | undefined,
): { readonly colors: Float32Array; readonly range: PointCloudHeightRange } {
  const point = new Vector3();
  const rotation =
    sourceToScene === undefined ? null : new Quaternion().fromArray(sourceToScene.rotation);
  const translation =
    sourceToScene === undefined ? null : new Vector3().fromArray(sourceToScene.translation);
  const sceneHeight = (index: number): number => {
    const cursor = index * 3;
    point.set(
      snapshot.positions[cursor] ?? 0,
      snapshot.positions[cursor + 1] ?? 0,
      snapshot.positions[cursor + 2] ?? 0,
    );
    if (rotation !== null && translation !== null) {
      point.applyQuaternion(rotation).add(translation);
    }
    return point.z;
  };

  let minimum = requestedRange?.[0] ?? Number.POSITIVE_INFINITY;
  let maximum = requestedRange?.[1] ?? Number.NEGATIVE_INFINITY;
  if (requestedRange === undefined) {
    for (let index = 0; index < snapshot.pointCount; index += 1) {
      const height = sceneHeight(index);
      minimum = Math.min(minimum, height);
      maximum = Math.max(maximum, height);
    }
    if (snapshot.pointCount === 0) {
      minimum = 0;
      maximum = 0;
    }
  }
  const range = normalizedHeightRange([minimum, maximum]);
  const span = maximum - minimum || 1;
  const colors = new Float32Array(snapshot.pointCount * 3);
  const color = new Color();
  for (let index = 0; index < snapshot.pointCount; index += 1) {
    const unitHeight = Math.max(0, Math.min(1, (sceneHeight(index) - minimum) / span));
    // Match the established robotics convention: blue low, red high.
    color.setHSL(0.66 * (1 - unitHeight), 1, 0.5);
    const cursor = index * 3;
    colors[cursor] = color.r;
    colors[cursor + 1] = color.g;
    colors[cursor + 2] = color.b;
  }
  return Object.freeze({ colors, range });
}

/**
 * Owns only adapter-created GPU geometry. Snapshot arrays remain caller-owned
 * CPU data and are never mutated or detached by this resource.
 */
export function createPointCloudGeometryResource(
  snapshot: PointCloudSnapshot,
  options: PointCloudGeometryOptions = {},
): PointCloudGeometryResource {
  const geometry = new BufferGeometry();
  geometry.name = `lkds3d:point-cloud:${String(snapshot.revision)}`;
  const position = new BufferAttribute(snapshot.positions, 3);
  position.setUsage(StaticDrawUsage);
  geometry.setAttribute("position", position);
  const colorMode = options.colorMode ?? "source";
  const heightColors =
    colorMode === "height"
      ? createHeightColors(snapshot, options.sourceToScene, options.heightRange)
      : undefined;
  const colorArray =
    colorMode === "source"
      ? snapshot.colors
      : colorMode === "height"
        ? heightColors?.colors
        : undefined;
  if (colorArray !== undefined) {
    const color = new BufferAttribute(colorArray, 3);
    color.setUsage(StaticDrawUsage);
    geometry.setAttribute("color", color);
  }
  geometry.setDrawRange(0, snapshot.pointCount);
  geometry.computeBoundingSphere();

  let disposed = false;
  return Object.freeze({
    geometry,
    ...(heightColors === undefined ? {} : { heightRange: heightColors.range }),
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
  sourceToScene?: RigidTransform3,
): PointCloudRenderResource {
  if (sourceToScene !== undefined) {
    assertValidRigidTransform(sourceToScene);
    if (sourceToScene.sourceFrame !== snapshot.frame) {
      throw new FrameMismatchError(
        snapshot.frame,
        sourceToScene.sourceFrame,
        "createPointCloudRenderResource.sourceToScene",
      );
    }
  }
  const geometryResource = createPointCloudGeometryResource(snapshot, {
    ...(options.colorMode === undefined ? {} : { colorMode: options.colorMode }),
    ...(options.heightRange === undefined ? {} : { heightRange: options.heightRange }),
    ...(sourceToScene === undefined ? {} : { sourceToScene }),
  });
  const colorMode = options.colorMode ?? "source";
  const usesVertexColors =
    colorMode === "height" || (colorMode === "source" && snapshot.colors !== undefined);
  const material = new PointsMaterial({
    ...(options.clipBounds === undefined
      ? {}
      : { clippingPlanes: [...createSectionClippingPlanes(options.clipBounds)] }),
    color: usesVertexColors ? "#ffffff" : options.fallbackColor,
    depthWrite: options.opacity === 1,
    opacity: options.opacity,
    size: options.pointSize,
    // Foundation point size is a stable pixel-density control, not world scale.
    sizeAttenuation: false,
    transparent: options.opacity < 1,
    vertexColors: usesVertexColors,
  });
  const points = new Points(geometryResource.geometry, material);
  if (sourceToScene !== undefined) {
    points.position.fromArray(sourceToScene.translation);
    points.quaternion.fromArray(sourceToScene.rotation);
    points.updateMatrix();
  }
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
