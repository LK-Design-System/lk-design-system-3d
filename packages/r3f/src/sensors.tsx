import { useEffect, useMemo } from "react";
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
} from "three";
import type { EntityId, FrameId, Quat, Vec3 } from "@lk-design-system/lds-3d-core";

/**
 * Sensor-visualization primitives.
 *
 * Both atoms are renderer-owned presentation for caller-owned sensor data:
 * they accept validated, already-transformed inputs and never subscribe,
 * retry, or resample. Budgets are explicit — over-budget inputs are rejected
 * with a contract error, never silently truncated.
 */

const IDENTITY_QUATERNION: Quat = [0, 0, 0, 1];
const ZERO: Vec3 = [0, 0, 0];

function assertFinitePositive(value: number, label: string): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${label} must be a finite positive number.`);
  }
}

export interface CameraFrustumProps {
  readonly entityId: EntityId;
  /** Sensor pose in the scene frame; the optical axis is local +X, up is +Z. */
  readonly position?: Vec3;
  readonly orientation?: Quat;
  /** Vertical field of view in radians, in (0, π). */
  readonly fovYRadians: number;
  /** Width over height. */
  readonly aspect: number;
  readonly nearMeters: number;
  readonly farMeters: number;
  readonly color?: string;
  readonly opacity?: number;
  /** Render a translucent far-plane fill in addition to the wireframe. */
  readonly showFarPlane?: boolean;
}

/** Frustum corner positions: near then far plane, CCW from bottom-left. */
export function computeFrustumCorners(
  fovYRadians: number,
  aspect: number,
  nearMeters: number,
  farMeters: number,
): readonly Vec3[] {
  if (!(fovYRadians > 0 && fovYRadians < Math.PI)) {
    throw new TypeError("fovYRadians must be inside (0, PI).");
  }
  assertFinitePositive(aspect, "aspect");
  assertFinitePositive(nearMeters, "nearMeters");
  assertFinitePositive(farMeters, "farMeters");
  if (farMeters <= nearMeters) {
    throw new TypeError("farMeters must be greater than nearMeters.");
  }
  const corners: Vec3[] = [];
  for (const distance of [nearMeters, farMeters]) {
    const halfHeight = Math.tan(fovYRadians / 2) * distance;
    const halfWidth = halfHeight * aspect;
    corners.push(
      [distance, halfWidth, -halfHeight],
      [distance, -halfWidth, -halfHeight],
      [distance, -halfWidth, halfHeight],
      [distance, halfWidth, halfHeight],
    );
  }
  return corners;
}

const FRUSTUM_EDGES: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];

/**
 * Wireframe camera/depth-sensor frustum. Pure presentation: intrinsics are
 * validated, geometry is derived, and no image content is fetched — image
 * planes stay caller-owned because texture transport is a product concern.
 */
export function CameraFrustum({
  entityId,
  position = ZERO,
  orientation = IDENTITY_QUATERNION,
  fovYRadians,
  aspect,
  nearMeters,
  farMeters,
  color = "#43d9ff",
  opacity = 0.9,
  showFarPlane = true,
}: CameraFrustumProps) {
  void entityId;
  const resources = useMemo(() => {
    const corners = computeFrustumCorners(fovYRadians, aspect, nearMeters, farMeters);
    const linePositions = new Float32Array(FRUSTUM_EDGES.length * 6);
    FRUSTUM_EDGES.forEach(([from, to], index) => {
      const a = corners[from];
      const b = corners[to];
      if (a === undefined || b === undefined) return;
      linePositions.set([...a, ...b], index * 6);
    });
    const lineGeometry = new BufferGeometry();
    lineGeometry.setAttribute("position", new BufferAttribute(linePositions, 3));
    const lineMaterial = new LineBasicMaterial({
      color: new Color(color),
      transparent: opacity < 1,
      opacity,
      toneMapped: false,
    });
    const lines = new LineSegments(lineGeometry, lineMaterial);

    let farPlane: Mesh | null = null;
    if (showFarPlane) {
      const planePositions = new Float32Array(
        [4, 5, 6, 4, 6, 7]
          .map((index) => corners[index] ?? [0, 0, 0])
          .flatMap((corner) => [...corner]),
      );
      const planeGeometry = new BufferGeometry();
      planeGeometry.setAttribute("position", new BufferAttribute(planePositions, 3));
      planeGeometry.computeVertexNormals();
      const planeMaterial = new MeshBasicMaterial({
        color: new Color(color),
        transparent: true,
        opacity: Math.min(0.16, opacity),
        side: DoubleSide,
        depthWrite: false,
        toneMapped: false,
      });
      farPlane = new Mesh(planeGeometry, planeMaterial);
    }
    return { lines, lineGeometry, lineMaterial, farPlane };
  }, [aspect, color, farMeters, fovYRadians, nearMeters, opacity, showFarPlane]);

  useEffect(
    () => () => {
      resources.lineGeometry.dispose();
      resources.lineMaterial.dispose();
      if (resources.farPlane !== null) {
        resources.farPlane.geometry.dispose();
        (resources.farPlane.material as MeshBasicMaterial).dispose();
      }
    },
    [resources],
  );

  return (
    <group
      position={[position[0], position[1], position[2]]}
      quaternion={[orientation[0], orientation[1], orientation[2], orientation[3]]}
    >
      <primitive object={resources.lines} dispose={null} />
      {resources.farPlane === null ? null : (
        <primitive object={resources.farPlane} dispose={null} />
      )}
    </group>
  );
}

export interface VoxelLayerSnapshot {
  readonly frame: FrameId;
  /** Cube edge length shared by every voxel, in meters. */
  readonly resolutionMeters: number;
  /** Voxel center positions as xyz triplets in the layer frame. */
  readonly centers: Float32Array;
}

export interface VoxelLayerProps {
  readonly snapshot: VoxelLayerSnapshot;
  /** Required renderer budget. Over-budget snapshots are rejected. */
  readonly maxVoxels: number;
  /** Placement of the layer frame in the scene frame. */
  readonly position?: Vec3;
  readonly orientation?: Quat;
  readonly color?: string;
  readonly opacity?: number;
}

export function assertValidVoxelSnapshot(snapshot: VoxelLayerSnapshot, maxVoxels: number): number {
  assertFinitePositive(snapshot.resolutionMeters, "VoxelLayer resolutionMeters");
  if (!Number.isInteger(maxVoxels) || maxVoxels < 1) {
    throw new TypeError("VoxelLayer maxVoxels must be a positive integer.");
  }
  const { centers } = snapshot;
  if (!(centers instanceof Float32Array) || centers.length % 3 !== 0) {
    throw new TypeError("VoxelLayer centers must be a Float32Array of xyz triplets.");
  }
  for (let index = 0; index < centers.length; index += 1) {
    if (!Number.isFinite(centers[index])) {
      throw new TypeError(`VoxelLayer centers[${String(index)}] must be finite.`);
    }
  }
  const voxelCount = centers.length / 3;
  if (voxelCount > maxVoxels) {
    throw new TypeError(
      `VoxelLayer snapshot exceeds the declared budget: ${String(voxelCount)} > ${String(maxVoxels)} voxels.`,
    );
  }
  return voxelCount;
}

/**
 * Instanced 3D occupancy voxels. The caller owns voxelization, framing, and
 * budgets; the layer renders exactly the validated centers it was handed.
 */
export function VoxelLayer({
  snapshot,
  maxVoxels,
  position = ZERO,
  orientation = IDENTITY_QUATERNION,
  color = "#f0803c",
  opacity = 0.85,
}: VoxelLayerProps) {
  const mesh = useMemo(() => {
    const voxelCount = assertValidVoxelSnapshot(snapshot, maxVoxels);
    const size = snapshot.resolutionMeters;
    const geometry = new BoxGeometry(size, size, size);
    const material = new MeshStandardMaterial({
      color: new Color(color),
      transparent: opacity < 1,
      opacity,
      roughness: 0.55,
      metalness: 0.08,
    });
    const instanced = new InstancedMesh(geometry, material, voxelCount);
    const matrix = new Matrix4();
    for (let index = 0; index < voxelCount; index += 1) {
      matrix.setPosition(
        snapshot.centers[index * 3] ?? 0,
        snapshot.centers[index * 3 + 1] ?? 0,
        snapshot.centers[index * 3 + 2] ?? 0,
      );
      instanced.setMatrixAt(index, matrix);
    }
    instanced.instanceMatrix.needsUpdate = true;
    return { instanced, geometry, material };
  }, [color, maxVoxels, opacity, snapshot]);

  useEffect(
    () => () => {
      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh.instanced.dispose();
    },
    [mesh],
  );

  return (
    <group
      position={[position[0], position[1], position[2]]}
      quaternion={[orientation[0], orientation[1], orientation[2], orientation[3]]}
    >
      <primitive object={mesh.instanced} dispose={null} />
    </group>
  );
}
