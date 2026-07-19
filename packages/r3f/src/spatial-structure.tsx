import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import {
  Color,
  DoubleSide,
  FrontSide,
  Matrix4,
  Mesh,
  Plane,
  Quaternion,
  Vector3,
  type Group,
  type Intersection,
  type Ray,
  type Raycaster,
} from "three";
import {
  FrameMismatchError,
  assertValidSpatialStructure,
  beginSpatialRotationDrag,
  beginSpatialScaleDrag,
  beginSpatialTranslationDrag,
  finishSpatialRotationDrag,
  finishSpatialScaleDrag,
  finishSpatialTranslationDrag,
  previewSpatialRotationDrag,
  previewSpatialScaleDrag,
  previewSpatialTranslationDrag,
  spatialTransformSnap,
  type EntityId,
  type SpatialAssetNode,
  type SpatialNodeTransform,
  type SpatialPbrMaterial,
  type SpatialPrimitiveGeometry,
  type SpatialPrimitiveNode,
  type SpatialRotationDragSession,
  type SpatialScaleDragSession,
  type SpatialStructure as SpatialStructureContract,
  type SpatialStructureNode,
  type SpatialTransformAxis,
  type SpatialTransformChangeSet,
  type SpatialTransformMode,
  type SpatialTransformSnap,
  type SpatialTransformSpace,
  type SpatialTranslationDragSession,
} from "@lk-robotics/design-system-3d-core";

import { Selectable, type SelectableRenderState } from "./primitives.js";
import { useSceneRuntime } from "./runtime.js";

function materialColor(material: SpatialPbrMaterial): Color {
  return new Color().setRGB(
    material.baseColorFactor[0],
    material.baseColorFactor[1],
    material.baseColorFactor[2],
  );
}

function PbrMaterial({
  material,
  attach,
}: {
  readonly material: SpatialPbrMaterial;
  readonly attach?: string;
}) {
  return (
    <meshStandardMaterial
      {...(attach === undefined ? {} : { attach })}
      color={materialColor(material)}
      metalness={material.metallicFactor}
      roughness={material.roughnessFactor}
      side={material.doubleSided === true ? DoubleSide : FrontSide}
      transparent={material.baseColorFactor[3] < 1}
      opacity={material.baseColorFactor[3]}
      depthWrite={material.baseColorFactor[3] >= 1}
    />
  );
}

function PrimitiveMaterials({ node }: { readonly node: SpatialPrimitiveNode }) {
  const side = node.materials.side ?? node.materials.default;
  const top = node.materials.top ?? node.materials.default;
  if (node.geometry.kind === "box") {
    return (
      <>
        {[0, 1, 2, 3].map((index) => (
          <PbrMaterial key={index} attach={`material-${index.toString()}`} material={side} />
        ))}
        <PbrMaterial attach="material-4" material={top} />
        <PbrMaterial attach="material-5" material={node.materials.default} />
      </>
    );
  }
  return (
    <>
      <PbrMaterial attach="material-0" material={side} />
      <PbrMaterial attach="material-1" material={top} />
      <PbrMaterial attach="material-2" material={node.materials.default} />
    </>
  );
}

function PrimitiveGeometry({ geometry }: { readonly geometry: SpatialPrimitiveGeometry }) {
  if (geometry.kind === "box") {
    return (
      <boxGeometry
        args={[geometry.sizeMeters[0], geometry.sizeMeters[1], geometry.sizeMeters[2]]}
      />
    );
  }
  return (
    <cylinderGeometry
      args={[
        geometry.radiusMeters,
        geometry.radiusMeters,
        geometry.heightMeters,
        geometry.radialSegments ?? 24,
      ]}
    />
  );
}

function PrimitiveOutline({
  geometry,
  color,
  opacity,
}: {
  readonly geometry: SpatialPrimitiveGeometry;
  readonly color: string;
  readonly opacity: number;
}) {
  return (
    <mesh
      scale={1.012}
      rotation={geometry.kind === "cylinder" ? [Math.PI / 2, 0, 0] : [0, 0, 0]}
      renderOrder={8}
    >
      <PrimitiveGeometry geometry={geometry} />
      <meshBasicMaterial color={color} depthWrite={false} opacity={opacity} transparent wireframe />
    </mesh>
  );
}

function PrimitiveNodeVisual({
  node,
  state,
}: {
  readonly node: SpatialPrimitiveNode;
  readonly state: SelectableRenderState;
}) {
  const { theme } = useSceneRuntime();
  return (
    <>
      <mesh
        rotation={node.geometry.kind === "cylinder" ? [Math.PI / 2, 0, 0] : [0, 0, 0]}
        castShadow={node.role !== "floor"}
        receiveShadow
      >
        <PrimitiveGeometry geometry={node.geometry} />
        <PrimitiveMaterials node={node} />
      </mesh>
      {state.selected || state.hovered ? (
        <PrimitiveOutline
          geometry={node.geometry}
          color={state.selected ? theme.materials.selection : theme.materials.live}
          opacity={state.selected ? 1 : 0.72}
        />
      ) : null}
    </>
  );
}

function nodeTransformProps(transform: SpatialNodeTransform) {
  return {
    position: [transform.translation[0], transform.translation[1], transform.translation[2]] as [
      number,
      number,
      number,
    ],
    quaternion: [
      transform.rotation[0],
      transform.rotation[1],
      transform.rotation[2],
      transform.rotation[3],
    ] as [number, number, number, number],
    scale: [transform.scale[0], transform.scale[1], transform.scale[2]] as [number, number, number],
  };
}

export interface TransformGizmoProps {
  readonly entityId: EntityId;
  readonly transform: SpatialNodeTransform;
  readonly mode: SpatialTransformMode;
  readonly space?: SpatialTransformSpace;
  readonly axes?: readonly SpatialTransformAxis[];
  readonly snap?: Partial<SpatialTransformSnap>;
  readonly sizeMeters?: number;
  readonly onTransformChange: (changeSet: SpatialTransformChangeSet) => void;
}

/**
 * Validates the public transform-space contract. `target` means the node target-frame axes, not
 * an ancestor-accumulated Three scene-world frame. Target-frame non-uniform scale is rejected
 * because expressing it relative to rotated local axes can synthesize shear.
 */
export function resolveTransformGizmoSpace(
  mode: SpatialTransformMode,
  space: SpatialTransformSpace,
): SpatialTransformSpace {
  if (mode === "scale" && space === "target") {
    throw new RangeError(
      "Target-frame non-uniform scale is not supported because it can synthesize shear.",
    );
  }
  return space;
}

export interface TransformGizmoControlsLike {
  enabled: boolean;
}

export interface TransformDragLifecycle {
  readonly hasPreview: boolean;
  readonly lastPreview: SpatialTransformChangeSet;
  preview(signedValue: number): boolean;
  finish(phase: "commit" | "cancel"): boolean;
  /** Restores renderer state without emitting an obsolete transform after external reparenting. */
  abort(): boolean;
}

export type TranslationDragLifecycle = TransformDragLifecycle;
export type RotationDragLifecycle = TransformDragLifecycle;
export type ScaleDragLifecycle = TransformDragLifecycle;

export interface TranslationDragProjection {
  readonly plane: Plane;
  readonly worldToTarget: Matrix4;
  readonly startPointInTarget: Vector3;
  readonly axisInTarget: Vector3;
}

export interface RotationDragProjection {
  readonly plane: Plane;
  readonly worldToTarget: Matrix4;
  readonly originInTarget: Vector3;
  readonly startVectorInTarget: Vector3;
  readonly axisInTarget: Vector3;
}

interface PointerCaptureTarget {
  setPointerCapture(pointerId: number): void;
  releasePointerCapture(pointerId: number): void;
  hasPointerCapture?(pointerId: number): boolean;
}

interface ActiveTransformDragBase {
  readonly pointerId: number;
  readonly pointerCaptureTarget: PointerCaptureTarget;
  readonly lifecycle: TransformDragLifecycle;
  readonly policyKey: string;
}

interface ActiveTranslationDrag extends ActiveTransformDragBase {
  readonly mode: "translate";
  readonly projection: TranslationDragProjection;
}

interface ActiveScaleDrag extends ActiveTransformDragBase {
  readonly mode: "scale";
  readonly projection: TranslationDragProjection;
  readonly sizeMeters: number;
}

interface ActiveRotationDrag extends ActiveTransformDragBase {
  readonly mode: "rotate";
  readonly projection: RotationDragProjection;
  lastRawAngle: number;
  accumulatedAngle: number;
}

type ActiveTransformDrag = ActiveTranslationDrag | ActiveScaleDrag | ActiveRotationDrag;

function sameQuaternionRotation(
  left: SpatialNodeTransform["rotation"],
  right: SpatialNodeTransform["rotation"],
): boolean {
  const tolerance = 1e-12;
  const sameSign =
    Math.abs(left[0] - right[0]) <= tolerance &&
    Math.abs(left[1] - right[1]) <= tolerance &&
    Math.abs(left[2] - right[2]) <= tolerance &&
    Math.abs(left[3] - right[3]) <= tolerance;
  const oppositeSign =
    Math.abs(left[0] + right[0]) <= tolerance &&
    Math.abs(left[1] + right[1]) <= tolerance &&
    Math.abs(left[2] + right[2]) <= tolerance &&
    Math.abs(left[3] + right[3]) <= tolerance;
  return sameSign || oppositeSign;
}

function sameTransform(left: SpatialNodeTransform, right: SpatialNodeTransform): boolean {
  return (
    left.sourceFrame === right.sourceFrame &&
    left.targetFrame === right.targetFrame &&
    left.translation[0] === right.translation[0] &&
    left.translation[1] === right.translation[1] &&
    left.translation[2] === right.translation[2] &&
    sameQuaternionRotation(left.rotation, right.rotation) &&
    left.scale[0] === right.scale[0] &&
    left.scale[1] === right.scale[1] &&
    left.scale[2] === right.scale[2]
  );
}

function createTransformDragLifecycle(options: {
  readonly initialPreview: SpatialTransformChangeSet;
  readonly previewChange: (signedValue: number) => SpatialTransformChangeSet;
  readonly finishChange: (
    lastPreview: SpatialTransformChangeSet,
    phase: "commit" | "cancel",
  ) => SpatialTransformChangeSet;
  readonly controls: TransformGizmoControlsLike | null;
  readonly onTransformChange: (changeSet: SpatialTransformChangeSet) => void;
  readonly invalidate: () => void;
}): TransformDragLifecycle {
  let active = true;
  let hasPreview = false;
  let lastPreview = options.initialPreview;
  const before = options.initialPreview.changes[0]?.before;
  const controlsEnabledBefore = options.controls?.enabled;
  if (options.controls !== null) options.controls.enabled = false;

  const deactivate = (): boolean => {
    if (!active) return false;
    active = false;
    if (options.controls !== null && controlsEnabledBefore !== undefined) {
      options.controls.enabled = controlsEnabledBefore;
    }
    return true;
  };

  return {
    get hasPreview() {
      return hasPreview;
    },
    get lastPreview() {
      return lastPreview;
    },
    preview(signedValue) {
      if (!active) return false;
      const next = options.previewChange(signedValue);
      const previousAfter = lastPreview.changes[0]?.after;
      const nextAfter = next.changes[0]?.after;
      if (
        previousAfter === undefined ||
        nextAfter === undefined ||
        sameTransform(previousAfter, nextAfter)
      ) {
        return false;
      }
      lastPreview = next;
      hasPreview = before !== undefined && !sameTransform(before, nextAfter);
      options.onTransformChange(next);
      options.invalidate();
      return true;
    },
    finish(phase) {
      if (!deactivate()) return false;
      options.onTransformChange(options.finishChange(lastPreview, phase));
      options.invalidate();
      return true;
    },
    abort() {
      if (!deactivate()) return false;
      options.invalidate();
      return true;
    },
  };
}

/**
 * Owns exactly one translation drag terminal and restores the prior camera-control policy before
 * notifying the caller. Kept as a public compatibility seam for existing consumers.
 */
export function createTranslationDragLifecycle(options: {
  readonly session: SpatialTranslationDragSession;
  readonly controls: TransformGizmoControlsLike | null;
  readonly onTransformChange: (changeSet: SpatialTransformChangeSet) => void;
  readonly invalidate: () => void;
}): TranslationDragLifecycle {
  return createTransformDragLifecycle({
    initialPreview: previewSpatialTranslationDrag(options.session, 0),
    previewChange: (distance) => previewSpatialTranslationDrag(options.session, distance),
    finishChange: (preview, phase) => finishSpatialTranslationDrag(options.session, preview, phase),
    controls: options.controls,
    onTransformChange: options.onTransformChange,
    invalidate: options.invalidate,
  });
}

/** Owns the common terminal, camera, and invalidation contract for one rotation drag. */
export function createRotationDragLifecycle(options: {
  readonly session: SpatialRotationDragSession;
  readonly controls: TransformGizmoControlsLike | null;
  readonly onTransformChange: (changeSet: SpatialTransformChangeSet) => void;
  readonly invalidate: () => void;
}): RotationDragLifecycle {
  return createTransformDragLifecycle({
    initialPreview: previewSpatialRotationDrag(options.session, 0),
    previewChange: (angle) => previewSpatialRotationDrag(options.session, angle),
    finishChange: (preview, phase) => finishSpatialRotationDrag(options.session, preview, phase),
    controls: options.controls,
    onTransformChange: options.onTransformChange,
    invalidate: options.invalidate,
  });
}

/** Owns the common terminal, camera, and invalidation contract for one scale drag. */
export function createScaleDragLifecycle(options: {
  readonly session: SpatialScaleDragSession;
  readonly controls: TransformGizmoControlsLike | null;
  readonly onTransformChange: (changeSet: SpatialTransformChangeSet) => void;
  readonly invalidate: () => void;
}): ScaleDragLifecycle {
  return createTransformDragLifecycle({
    initialPreview: previewSpatialScaleDrag(options.session, 0),
    previewChange: (delta) => previewSpatialScaleDrag(options.session, delta),
    finishChange: (preview, phase) => finishSpatialScaleDrag(options.session, preview, phase),
    controls: options.controls,
    onTransformChange: options.onTransformChange,
    invalidate: options.invalidate,
  });
}

/** Builds a camera-facing plane that contains the translation axis captured at pointer down. */
export function createTranslationDragProjection(
  originWorld: Vector3,
  axisInTarget: Vector3,
  targetToWorld: Matrix4,
  pointerRay: Ray,
): TranslationDragProjection | null {
  if (Math.abs(targetToWorld.determinant()) < 1e-12) return null;
  const normalizedTargetAxis = axisInTarget.clone();
  if (normalizedTargetAxis.lengthSq() < 1e-12) return null;
  normalizedTargetAxis.normalize();
  const axisWorld = normalizedTargetAxis.clone().transformDirection(targetToWorld);
  const rayDirection = pointerRay.direction.clone();
  if (rayDirection.lengthSq() < 1e-12) return null;
  rayDirection.normalize();

  const normal = rayDirection.clone().addScaledVector(axisWorld, -rayDirection.dot(axisWorld));
  if (normal.lengthSq() < 1e-12) return null;
  normal.normalize();
  const plane = new Plane().setFromNormalAndCoplanarPoint(normal, originWorld);
  const startPointWorld = pointerRay.intersectPlane(plane, new Vector3());
  if (startPointWorld === null) return null;
  const worldToTarget = targetToWorld.clone().invert();
  return {
    plane,
    worldToTarget,
    startPointInTarget: startPointWorld.applyMatrix4(worldToTarget),
    axisInTarget: normalizedTargetAxis,
  };
}

/** Converts the current event ray to an absolute target-frame distance from pointer down. */
export function projectTranslationDragDistance(
  projection: TranslationDragProjection,
  pointerRay: Ray,
): number | null {
  const pointWorld = pointerRay.intersectPlane(projection.plane, new Vector3());
  if (pointWorld === null) return null;
  return pointWorld
    .applyMatrix4(projection.worldToTarget)
    .sub(projection.startPointInTarget)
    .dot(projection.axisInTarget);
}

/** Builds the stable axis-normal plane and pointer-down radial vector for one rotation drag. */
export function createRotationDragProjection(
  originWorld: Vector3,
  axisInTarget: Vector3,
  targetToWorld: Matrix4,
  pointerRay: Ray,
): RotationDragProjection | null {
  if (Math.abs(targetToWorld.determinant()) < 1e-12) return null;
  const normalizedTargetAxis = axisInTarget.clone();
  if (normalizedTargetAxis.lengthSq() < 1e-12) return null;
  normalizedTargetAxis.normalize();
  const worldToTarget = targetToWorld.clone().invert();
  const originInTarget = originWorld.clone().applyMatrix4(worldToTarget);
  const plane = new Plane()
    .setFromNormalAndCoplanarPoint(normalizedTargetAxis, originInTarget)
    .applyMatrix4(targetToWorld);
  const startPointWorld = pointerRay.intersectPlane(plane, new Vector3());
  if (startPointWorld === null) return null;
  const startVectorInTarget = startPointWorld.applyMatrix4(worldToTarget).sub(originInTarget);
  startVectorInTarget.addScaledVector(
    normalizedTargetAxis,
    -startVectorInTarget.dot(normalizedTargetAxis),
  );
  if (startVectorInTarget.lengthSq() < 1e-12) return null;
  startVectorInTarget.normalize();
  return {
    plane,
    worldToTarget,
    originInTarget,
    startVectorInTarget,
    axisInTarget: normalizedTargetAxis,
  };
}

/** Returns the signed raw angle in [-π, π] from the pointer-down radial vector. */
export function projectRotationDragAngle(
  projection: RotationDragProjection,
  pointerRay: Ray,
): number | null {
  const pointWorld = pointerRay.intersectPlane(projection.plane, new Vector3());
  if (pointWorld === null) return null;
  const current = pointWorld.applyMatrix4(projection.worldToTarget).sub(projection.originInTarget);
  current.addScaledVector(projection.axisInTarget, -current.dot(projection.axisInTarget));
  if (current.lengthSq() < 1e-12) return null;
  current.normalize();
  const sine = projection.axisInTarget.dot(projection.startVectorInTarget.clone().cross(current));
  const cosine = projection.startVectorInTarget.dot(current);
  return Math.atan2(sine, cosine);
}

/** Unwraps one raw [-π, π] angle step so a drag may accumulate beyond a full turn. */
export function unwrapRotationDragAngle(previousRaw: number, currentRaw: number): number {
  if (!Number.isFinite(previousRaw) || !Number.isFinite(currentRaw)) {
    throw new RangeError("Rotation drag angles must be finite.");
  }
  let delta = currentRaw - previousRaw;
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

/** Converts target-frame handle travel to an additive dimensionless scale delta. */
export function projectScaleDragDelta(
  projection: TranslationDragProjection,
  pointerRay: Ray,
  sizeMeters: number,
): number | null {
  if (!Number.isFinite(sizeMeters) || sizeMeters <= 0) {
    throw new RangeError("Scale drag sizeMeters must be finite and positive.");
  }
  const distance = projectTranslationDragDistance(projection, pointerRay);
  return distance === null ? null : distance / sizeMeters;
}

const AXIS_ROTATION: Readonly<Record<SpatialTransformAxis, readonly [number, number, number]>> =
  Object.freeze({
    x: [0, 0, -Math.PI / 2],
    y: [0, 0, 0],
    z: [Math.PI / 2, 0, 0],
  });

const ROTATION_RING_ROTATION: Readonly<
  Record<SpatialTransformAxis, readonly [number, number, number]>
> = Object.freeze({
  x: [0, Math.PI / 2, 0],
  y: [-Math.PI / 2, 0, 0],
  z: [0, 0, 0],
});

type TransformGizmoRaycast = (
  this: Mesh,
  raycaster: Raycaster,
  intersections: Intersection[],
) => void;

function createPrioritizedTransformGizmoRaycast(axisPriority: number): TransformGizmoRaycast {
  return function prioritizedTransformGizmoRaycast(raycaster, intersections): void {
    const firstGizmoIntersection = intersections.length;
    Mesh.prototype.raycast.call(this, raycaster, intersections);
    for (let index = firstGizmoIntersection; index < intersections.length; index += 1) {
      const intersection = intersections[index];
      if (intersection !== undefined) {
        intersection.distance = axisPriority * 1e-6 + intersection.distance * 1e-12;
      }
    }
  };
}

const TRANSFORM_GIZMO_RAYCAST: Readonly<Record<SpatialTransformAxis, TransformGizmoRaycast>> =
  Object.freeze({
    x: createPrioritizedTransformGizmoRaycast(1),
    y: createPrioritizedTransformGizmoRaycast(2),
    z: createPrioritizedTransformGizmoRaycast(3),
  });

function TransformAxisHandle({
  axis,
  sizeMeters,
  color,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onClick,
}: {
  readonly axis: SpatialTransformAxis;
  readonly sizeMeters: number;
  readonly color: string;
  readonly onPointerDown: (event: ThreeEvent<PointerEvent>) => void;
  readonly onPointerMove: (event: ThreeEvent<PointerEvent>) => void;
  readonly onPointerUp: (event: ThreeEvent<PointerEvent>) => void;
  readonly onClick: (event: ThreeEvent<MouseEvent>) => void;
}) {
  const rotation = AXIS_ROTATION[axis];
  const tipOffset = sizeMeters * 0.78;
  return (
    <group
      name={`lkds3d:transform:translate:${axis}`}
      rotation={[rotation[0], rotation[1], rotation[2]]}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={onClick}
    >
      <mesh
        name={`lkds3d:transform:translate:${axis}:shaft-hit-target`}
        position={[0, sizeMeters * 0.36, 0]}
        raycast={TRANSFORM_GIZMO_RAYCAST[axis]}
      >
        <cylinderGeometry args={[sizeMeters * 0.075, sizeMeters * 0.075, sizeMeters * 0.72, 12]} />
        <meshBasicMaterial
          colorWrite={false}
          depthTest={false}
          depthWrite={false}
          opacity={0}
          transparent
        />
      </mesh>
      <mesh
        name={`lkds3d:transform:translate:${axis}:tip-hit-target`}
        position={[0, tipOffset, 0]}
        raycast={TRANSFORM_GIZMO_RAYCAST[axis]}
      >
        <sphereGeometry args={[sizeMeters * 0.15, 12, 12]} />
        <meshBasicMaterial
          colorWrite={false}
          depthTest={false}
          depthWrite={false}
          opacity={0}
          transparent
        />
      </mesh>
      <mesh position={[0, sizeMeters * 0.36, 0]} renderOrder={20}>
        <cylinderGeometry args={[sizeMeters * 0.035, sizeMeters * 0.035, sizeMeters * 0.72, 12]} />
        <meshBasicMaterial color={color} depthTest={false} depthWrite={false} />
      </mesh>
      <mesh position={[0, tipOffset, 0]} renderOrder={21}>
        <coneGeometry args={[sizeMeters * 0.12, sizeMeters * 0.28, 16]} />
        <meshBasicMaterial color={color} depthTest={false} depthWrite={false} />
      </mesh>
    </group>
  );
}

function ScaleAxisHandle({
  axis,
  sizeMeters,
  color,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onClick,
}: {
  readonly axis: SpatialTransformAxis;
  readonly sizeMeters: number;
  readonly color: string;
  readonly onPointerDown: (event: ThreeEvent<PointerEvent>) => void;
  readonly onPointerMove: (event: ThreeEvent<PointerEvent>) => void;
  readonly onPointerUp: (event: ThreeEvent<PointerEvent>) => void;
  readonly onClick: (event: ThreeEvent<MouseEvent>) => void;
}) {
  const rotation = AXIS_ROTATION[axis];
  const tipOffset = sizeMeters * 0.78;
  return (
    <group
      name={`lkds3d:transform:scale:${axis}`}
      rotation={[rotation[0], rotation[1], rotation[2]]}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={onClick}
    >
      <mesh
        name={`lkds3d:transform:scale:${axis}:shaft-hit-target`}
        position={[0, sizeMeters * 0.36, 0]}
        raycast={TRANSFORM_GIZMO_RAYCAST[axis]}
      >
        <cylinderGeometry args={[sizeMeters * 0.08, sizeMeters * 0.08, sizeMeters * 0.72, 12]} />
        <meshBasicMaterial
          colorWrite={false}
          depthTest={false}
          depthWrite={false}
          opacity={0}
          transparent
        />
      </mesh>
      <mesh
        name={`lkds3d:transform:scale:${axis}:cube-hit-target`}
        position={[0, tipOffset, 0]}
        raycast={TRANSFORM_GIZMO_RAYCAST[axis]}
      >
        <boxGeometry args={[sizeMeters * 0.24, sizeMeters * 0.24, sizeMeters * 0.24]} />
        <meshBasicMaterial
          colorWrite={false}
          depthTest={false}
          depthWrite={false}
          opacity={0}
          transparent
        />
      </mesh>
      <mesh position={[0, sizeMeters * 0.36, 0]} renderOrder={20}>
        <cylinderGeometry args={[sizeMeters * 0.035, sizeMeters * 0.035, sizeMeters * 0.72, 12]} />
        <meshBasicMaterial color={color} depthTest={false} depthWrite={false} />
      </mesh>
      <mesh position={[0, tipOffset, 0]} renderOrder={21}>
        <boxGeometry args={[sizeMeters * 0.17, sizeMeters * 0.17, sizeMeters * 0.17]} />
        <meshBasicMaterial color={color} depthTest={false} depthWrite={false} />
      </mesh>
    </group>
  );
}

function RotationRingHandle({
  axis,
  sizeMeters,
  color,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onClick,
}: {
  readonly axis: SpatialTransformAxis;
  readonly sizeMeters: number;
  readonly color: string;
  readonly onPointerDown: (event: ThreeEvent<PointerEvent>) => void;
  readonly onPointerMove: (event: ThreeEvent<PointerEvent>) => void;
  readonly onPointerUp: (event: ThreeEvent<PointerEvent>) => void;
  readonly onClick: (event: ThreeEvent<MouseEvent>) => void;
}) {
  const rotation = ROTATION_RING_ROTATION[axis];
  return (
    <group
      name={`lkds3d:transform:rotate:${axis}`}
      rotation={[rotation[0], rotation[1], rotation[2]]}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={onClick}
    >
      <mesh
        name={`lkds3d:transform:rotate:${axis}:ring-hit-target`}
        raycast={TRANSFORM_GIZMO_RAYCAST[axis]}
      >
        <torusGeometry args={[sizeMeters * 0.72, sizeMeters * 0.1, 12, 64]} />
        <meshBasicMaterial
          colorWrite={false}
          depthTest={false}
          depthWrite={false}
          opacity={0}
          side={DoubleSide}
          transparent
        />
      </mesh>
      <mesh renderOrder={21}>
        <torusGeometry args={[sizeMeters * 0.72, sizeMeters * 0.025, 10, 64]} />
        <meshBasicMaterial color={color} depthTest={false} depthWrite={false} side={DoubleSide} />
      </mesh>
    </group>
  );
}

/**
 * Emits start-relative snapped translate, rotate, and scale previews with one terminal
 * commit/cancel while keeping pointer, camera-control, and renderer invalidation policy local.
 */
export function TransformGizmo({
  entityId,
  transform,
  mode,
  space = "local",
  axes = ["x", "y", "z"],
  snap,
  sizeMeters = 1.1,
  onTransformChange,
}: TransformGizmoProps) {
  const resolvedSpace = resolveTransformGizmoSpace(mode, space);
  const { theme } = useSceneRuntime();
  const gl = useThree((state) => state.gl);
  const get = useThree((state) => state.get);
  const invalidate = useThree((state) => state.invalidate);
  const groupRef = useRef<Group>(null);
  const activeRef = useRef<ActiveTransformDrag | null>(null);
  const callbackRef = useRef(onTransformChange);
  callbackRef.current = onTransformChange;
  const resolvedSnap = useMemo(
    () => spatialTransformSnap(snap),
    [snap?.rotationRadians, snap?.scaleStep, snap?.translationMeters],
  );
  // Frame ids are stale-session guards because previews never reparent. A divergence uses abort
  // cleanup below, not cancel, so an obsolete pointer-down transform cannot overwrite new frames.
  // Numeric props remain excluded: controlled consumers may echo previews asynchronously, so
  // without a revision/session token an external numeric edit cannot be classified reliably.
  const policyKey = `${entityId}:${transform.sourceFrame}:${transform.targetFrame}:${mode}:${resolvedSpace}:${axes.join(",")}:${sizeMeters.toString()}:${resolvedSnap.translationMeters.toString()}:${resolvedSnap.rotationRadians.toString()}:${resolvedSnap.scaleStep.toString()}`;
  const rotation = resolvedSpace === "local" ? transform.rotation : ([0, 0, 0, 1] as const);

  const terminateActive = useCallback(
    (phase: "commit" | "cancel" | "abort", releaseCapture = true): boolean => {
      const active = activeRef.current;
      if (active === null) return false;
      activeRef.current = null;
      if (releaseCapture) {
        try {
          if (active.pointerCaptureTarget.hasPointerCapture?.(active.pointerId) !== false) {
            active.pointerCaptureTarget.releasePointerCapture(active.pointerId);
          }
        } catch {
          // Pointer capture may already have been released by the user agent.
        }
      }
      return phase === "abort" ? active.lifecycle.abort() : active.lifecycle.finish(phase);
    },
    [],
  );

  useEffect(() => {
    const handlePointerCancel = (event: PointerEvent): void => {
      if (activeRef.current?.pointerId === event.pointerId) terminateActive("cancel", false);
    };
    const handleLostPointerCapture = (event: PointerEvent): void => {
      if (activeRef.current?.pointerId === event.pointerId) terminateActive("cancel", false);
    };
    gl.domElement.addEventListener("pointercancel", handlePointerCancel);
    gl.domElement.addEventListener("lostpointercapture", handleLostPointerCapture);
    return () => {
      gl.domElement.removeEventListener("pointercancel", handlePointerCancel);
      gl.domElement.removeEventListener("lostpointercapture", handleLostPointerCapture);
    };
  }, [gl, terminateActive]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || activeRef.current === null) return;
      event.preventDefault();
      terminateActive("cancel");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [terminateActive]);

  useEffect(() => {
    const active = activeRef.current;
    if (active === null) return;
    const before = active.lifecycle.lastPreview.changes[0]?.before;
    if (
      before !== undefined &&
      (before.sourceFrame !== transform.sourceFrame || before.targetFrame !== transform.targetFrame)
    ) {
      terminateActive("abort");
      return;
    }
    if (active.policyKey !== policyKey) {
      terminateActive("cancel");
    }
  }, [policyKey, terminateActive, transform.sourceFrame, transform.targetFrame]);

  useEffect(
    () => () => {
      // Direct unmount remains an ordinary cancellation: without next-frame props, the gizmo
      // cannot distinguish an external reparent from normal removal. Hosts that can reparent by
      // unmounting need a revision/session coordination contract to avoid that residual ambiguity.
      terminateActive("cancel");
    },
    [terminateActive],
  );

  const beginDrag = useCallback(
    (axis: SpatialTransformAxis, event: ThreeEvent<PointerEvent>): void => {
      event.stopPropagation();
      const pointerEvent = event.nativeEvent;
      if (pointerEvent.button !== 0 || !pointerEvent.isPrimary || activeRef.current !== null) {
        return;
      }
      const group = groupRef.current;
      if (group === null) return;
      group.updateWorldMatrix(true, false);
      const targetToWorld = group.parent?.matrixWorld.clone() ?? new Matrix4();
      const originWorld = group.getWorldPosition(new Vector3());
      const axisInTarget =
        axis === "x"
          ? new Vector3(1, 0, 0)
          : axis === "y"
            ? new Vector3(0, 1, 0)
            : new Vector3(0, 0, 1);
      if (resolvedSpace === "local") {
        axisInTarget.applyQuaternion(
          new Quaternion(
            transform.rotation[0],
            transform.rotation[1],
            transform.rotation[2],
            transform.rotation[3],
          ),
        );
      }
      const rotationProjection =
        mode === "rotate"
          ? createRotationDragProjection(
              originWorld,
              axisInTarget,
              targetToWorld,
              event.ray.clone(),
            )
          : null;
      const linearProjection =
        mode === "rotate"
          ? null
          : createTranslationDragProjection(
              originWorld,
              axisInTarget,
              targetToWorld,
              event.ray.clone(),
            );
      if (rotationProjection === null && linearProjection === null) return;

      const pointerCaptureTarget = event.target as unknown as PointerCaptureTarget;
      if (typeof pointerCaptureTarget.setPointerCapture !== "function") return;
      try {
        pointerCaptureTarget.setPointerCapture(pointerEvent.pointerId);
      } catch {
        return;
      }
      const controlsValue = get().controls as unknown;
      const controls =
        typeof controlsValue === "object" &&
        controlsValue !== null &&
        "enabled" in controlsValue &&
        typeof controlsValue.enabled === "boolean"
          ? (controlsValue as TransformGizmoControlsLike)
          : null;
      const lifecycleOptions = {
        controls,
        onTransformChange: (changeSet: SpatialTransformChangeSet) => callbackRef.current(changeSet),
        invalidate,
      };
      if (mode === "rotate") {
        if (rotationProjection === null) return;
        const session = beginSpatialRotationDrag({
          entityId,
          transform,
          axis,
          space: resolvedSpace,
          snap: resolvedSnap,
        });
        activeRef.current = {
          mode,
          pointerId: pointerEvent.pointerId,
          pointerCaptureTarget,
          projection: rotationProjection,
          policyKey,
          lastRawAngle: 0,
          accumulatedAngle: 0,
          lifecycle: createRotationDragLifecycle({ session, ...lifecycleOptions }),
        };
        return;
      }
      if (linearProjection === null) return;
      if (mode === "scale") {
        const session = beginSpatialScaleDrag({
          entityId,
          transform,
          axis,
          space: "local",
          snap: resolvedSnap,
        });
        activeRef.current = {
          mode,
          pointerId: pointerEvent.pointerId,
          pointerCaptureTarget,
          projection: linearProjection,
          policyKey,
          sizeMeters,
          lifecycle: createScaleDragLifecycle({ session, ...lifecycleOptions }),
        };
        return;
      }
      const session = beginSpatialTranslationDrag({
        entityId,
        transform,
        axis,
        space: resolvedSpace,
        snap: resolvedSnap,
      });
      activeRef.current = {
        mode,
        pointerId: pointerEvent.pointerId,
        pointerCaptureTarget,
        projection: linearProjection,
        policyKey,
        lifecycle: createTranslationDragLifecycle({ session, ...lifecycleOptions }),
      };
    },
    [
      entityId,
      get,
      invalidate,
      mode,
      policyKey,
      resolvedSnap,
      resolvedSpace,
      sizeMeters,
      transform,
    ],
  );

  const previewActiveDrag = useCallback((active: ActiveTransformDrag, ray: Ray): void => {
    if (active.mode === "rotate") {
      const rawAngle = projectRotationDragAngle(active.projection, ray);
      if (rawAngle === null) return;
      active.accumulatedAngle += unwrapRotationDragAngle(active.lastRawAngle, rawAngle);
      active.lastRawAngle = rawAngle;
      active.lifecycle.preview(active.accumulatedAngle);
      return;
    }
    if (active.mode === "scale") {
      const delta = projectScaleDragDelta(active.projection, ray, active.sizeMeters);
      if (delta !== null) active.lifecycle.preview(delta);
      return;
    }
    const distance = projectTranslationDragDistance(active.projection, ray);
    if (distance !== null) active.lifecycle.preview(distance);
  }, []);

  const continueDrag = useCallback(
    (event: ThreeEvent<PointerEvent>): void => {
      event.stopPropagation();
      const active = activeRef.current;
      if (active === null || active.pointerId !== event.nativeEvent.pointerId) return;
      previewActiveDrag(active, event.ray.clone());
    },
    [previewActiveDrag],
  );

  const endDrag = useCallback(
    (event: ThreeEvent<PointerEvent>): void => {
      event.stopPropagation();
      const active = activeRef.current;
      if (active === null || active.pointerId !== event.nativeEvent.pointerId) return;
      previewActiveDrag(active, event.ray.clone());
      terminateActive(active.lifecycle.hasPreview ? "commit" : "cancel");
    },
    [previewActiveDrag, terminateActive],
  );

  const stopClick = useCallback((event: ThreeEvent<MouseEvent>): void => {
    event.stopPropagation();
  }, []);

  if (!Number.isFinite(sizeMeters) || sizeMeters <= 0) {
    throw new RangeError("TransformGizmo.sizeMeters must be finite and positive.");
  }
  const axisColors = {
    x: theme.scene["axis.x"],
    y: theme.scene["axis.y"],
    z: theme.scene["axis.z"],
  } as const;
  return (
    <group
      ref={groupRef}
      name={`lkds3d:transform-gizmo:${entityId}`}
      position={[transform.translation[0], transform.translation[1], transform.translation[2]]}
      quaternion={[rotation[0], rotation[1], rotation[2], rotation[3]]}
    >
      <mesh renderOrder={22}>
        {mode === "scale" ? (
          <boxGeometry args={[sizeMeters * 0.14, sizeMeters * 0.14, sizeMeters * 0.14]} />
        ) : (
          <sphereGeometry args={[sizeMeters * 0.075, 14, 14]} />
        )}
        <meshBasicMaterial color={theme.materials.text} depthTest={false} depthWrite={false} />
      </mesh>
      {axes.map((axis) => {
        const handleProps = {
          axis,
          sizeMeters,
          color: axisColors[axis],
          onPointerDown: (event: ThreeEvent<PointerEvent>) => beginDrag(axis, event),
          onPointerMove: continueDrag,
          onPointerUp: endDrag,
          onClick: stopClick,
        };
        if (mode === "rotate") {
          return <RotationRingHandle key={axis} {...handleProps} />;
        }
        if (mode === "scale") {
          return <ScaleAxisHandle key={axis} {...handleProps} />;
        }
        return <TransformAxisHandle key={axis} {...handleProps} />;
      })}
    </group>
  );
}

export type SpatialAssetRenderer = (
  node: SpatialAssetNode,
  state: SelectableRenderState,
) => ReactNode;

export interface SpatialStructureProps {
  readonly structure: SpatialStructureContract;
  readonly renderAsset?: SpatialAssetRenderer;
  readonly activeTransform?: Omit<TransformGizmoProps, "entityId" | "transform"> & {
    readonly entityId: EntityId;
  };
}

function StructureNode({
  node,
  childrenByParent,
  renderAsset,
  activeTransform,
}: {
  readonly node: SpatialStructureNode;
  readonly childrenByParent: ReadonlyMap<EntityId, readonly SpatialStructureNode[]>;
  readonly renderAsset?: SpatialAssetRenderer;
  readonly activeTransform?: SpatialStructureProps["activeTransform"];
}) {
  if (node.visible === false) return null;
  const children = childrenByParent.get(node.id) ?? [];
  if (node.kind === "site" || node.kind === "building" || node.kind === "level") {
    return (
      <group
        name={`lkds3d:structure:${node.kind}:${node.id}`}
        {...nodeTransformProps(node.transform)}
      >
        {children.map((child) => (
          <StructureNode
            key={child.id}
            node={child}
            childrenByParent={childrenByParent}
            {...(renderAsset === undefined ? {} : { renderAsset })}
            {...(activeTransform === undefined ? {} : { activeTransform })}
          />
        ))}
      </group>
    );
  }

  const selectable = node.selectable !== false;
  return (
    <>
      <Selectable
        entityId={node.id}
        selectable={selectable}
        {...nodeTransformProps(node.transform)}
      >
        {(state) =>
          node.kind === "primitive" ? (
            <PrimitiveNodeVisual node={node} state={state} />
          ) : (
            (renderAsset?.(node, state) ?? null)
          )
        }
      </Selectable>
      {activeTransform?.entityId === node.id ? (
        <TransformGizmo {...activeTransform} entityId={node.id} transform={node.transform} />
      ) : null}
    </>
  );
}

/** Renders one validated Site/Building/Level tree with selectable primitive and asset leaves. */
export function SpatialStructure({
  structure,
  renderAsset,
  activeTransform,
}: SpatialStructureProps) {
  const { frame } = useSceneRuntime();
  assertValidSpatialStructure(structure);
  if (structure.frame !== frame) {
    throw new FrameMismatchError(frame, structure.frame, "SpatialStructure.frame");
  }
  const { roots, childrenByParent } = useMemo(() => {
    const childMap = new Map<EntityId, SpatialStructureNode[]>();
    const rootNodes: SpatialStructureNode[] = [];
    for (const node of structure.nodes) {
      if (node.parentId === undefined) rootNodes.push(node);
      else childMap.set(node.parentId, [...(childMap.get(node.parentId) ?? []), node]);
    }
    return { roots: rootNodes, childrenByParent: childMap };
  }, [structure]);
  return (
    <group name="lkds3d:spatial-structure">
      {roots.map((root) => (
        <StructureNode
          key={root.id}
          node={root}
          childrenByParent={childrenByParent}
          {...(renderAsset === undefined ? {} : { renderAsset })}
          {...(activeTransform === undefined ? {} : { activeTransform })}
        />
      ))}
    </group>
  );
}
