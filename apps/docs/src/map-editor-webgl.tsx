import tronModelUrl from "@lk-robotics/design-system-3d-assets/robots/tron/tron.glb?url";
import type {
  EntityId,
  SpatialAssetNode,
  Vec3,
} from "@lk-robotics/design-system-3d-core";
import {
  SPATIAL_AUTHORING_AREA_EPSILON_SQUARE_METERS,
  SPATIAL_AUTHORING_LINEAR_EPSILON_METERS,
} from "@lk-robotics/design-system-3d-core";
import {
  GltfModel,
  Selectable,
  useSceneRuntime,
  type SelectableRenderState,
} from "@lk-robotics/design-system-3d-r3f";
import { threeToCorePosition } from "@lk-robotics/design-system-3d-r3f/coordinates";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { Mesh, type Intersection, type Raycaster } from "three";

import { MAP_EDITOR_TRON_MANIFEST } from "./map-editor-asset-catalog.js";

const DEFAULT_PLACEMENT_EXTENT_METERS = [20, 20] as const;
const DEFAULT_CLICK_TOLERANCE_PIXELS = 6;
const AUTHORING_Z_OFFSET_METERS = 0.012;
const LINEAR_EPSILON_SQUARED =
  SPATIAL_AUTHORING_LINEAR_EPSILON_METERS *
  SPATIAL_AUTHORING_LINEAR_EPSILON_METERS;
const WEBGL_DOUBLE_SIDE = 2 as const;
const TRON_MANIFEST = MAP_EDITOR_TRON_MANIFEST;
const ASSET_PICK_PADDING_METERS = 0.04;

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite.`);
}

function assertPositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be finite and positive.`);
  }
}

function assertNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be finite and non-negative.`);
  }
}

function snapSignedValue(value: number, step: number): number {
  const unsnappedSteps = value / step;
  const snappedSteps =
    Math.sign(unsnappedSteps) * Math.floor(Math.abs(unsnappedSteps) + 0.5);
  const snapped = snappedSteps * step;
  return snapped === 0 ? 0 : snapped;
}

/** Converts one core-space hit into a deterministic XY-grid placement point. */
export function snapMapEditorPlacementPoint(
  pointInCore: Vec3,
  elevationMeters: number,
  snapMeters: number,
): Vec3 {
  pointInCore.forEach((value, index) =>
    assertFinite(value, `pointInCore[${index.toString()}]`),
  );
  assertFinite(elevationMeters, "elevationMeters");
  assertPositive(snapMeters, "snapMeters");
  return Object.freeze([
    snapSignedValue(pointInCore[0], snapMeters),
    snapSignedValue(pointInCore[1], snapMeters),
    elevationMeters === 0 ? 0 : elevationMeters,
  ]);
}

export type MapEditorSnapKind = "none" | "grid" | "vertex";

export interface MapEditorSnapResult {
  /** Unsnapped core point projected to the authoring elevation. */
  readonly raw: Vec3;
  readonly snapped: Vec3;
  readonly kind: MapEditorSnapKind;
  readonly targetIndex?: number;
}

function squaredDistanceInCoreXY(first: Vec3, second: Vec3): number {
  const deltaX = first[0] - second[0];
  const deltaY = first[1] - second[1];
  return deltaX * deltaX + deltaY * deltaY;
}

/**
 * Resolves one point against the authoring grid and optional existing vertices. A vertex wins only
 * when it is inside the vertex tolerance and no farther from the raw point than the grid candidate.
 */
export function resolveMapEditorAuthoringSnap(
  pointInCore: Vec3,
  elevationMeters: number,
  snapMeters: number,
  snapTargets: readonly Vec3[] = [],
  vertexSnapToleranceMeters = snapMeters,
): MapEditorSnapResult {
  pointInCore.forEach((value, index) =>
    assertFinite(value, `pointInCore[${index.toString()}]`),
  );
  assertFinite(elevationMeters, "elevationMeters");
  assertPositive(snapMeters, "snapMeters");
  assertNonNegative(vertexSnapToleranceMeters, "vertexSnapToleranceMeters");

  const raw: Vec3 = Object.freeze([
    pointInCore[0] === 0 ? 0 : pointInCore[0],
    pointInCore[1] === 0 ? 0 : pointInCore[1],
    elevationMeters === 0 ? 0 : elevationMeters,
  ]);
  const gridPoint = snapMapEditorPlacementPoint(raw, elevationMeters, snapMeters);
  const gridDistanceSquared = squaredDistanceInCoreXY(raw, gridPoint);
  let nearestTargetIndex: number | undefined;
  let nearestTargetDistanceSquared = Number.POSITIVE_INFINITY;

  snapTargets.forEach((target, index) => {
    target.forEach((value, coordinateIndex) =>
      assertFinite(value, `snapTargets[${index.toString()}][${coordinateIndex.toString()}]`),
    );
    const distanceSquared = squaredDistanceInCoreXY(raw, target);
    if (distanceSquared < nearestTargetDistanceSquared) {
      nearestTargetDistanceSquared = distanceSquared;
      nearestTargetIndex = index;
    }
  });

  const toleranceSquared = vertexSnapToleranceMeters * vertexSnapToleranceMeters;
  if (
    nearestTargetIndex !== undefined &&
    nearestTargetDistanceSquared <= toleranceSquared + LINEAR_EPSILON_SQUARED &&
    nearestTargetDistanceSquared <= gridDistanceSquared + LINEAR_EPSILON_SQUARED
  ) {
    const target = snapTargets[nearestTargetIndex];
    if (target === undefined) {
      throw new RangeError("The nearest snap target is missing.");
    }
    return Object.freeze({
      raw,
      snapped: Object.freeze([
        target[0] === 0 ? 0 : target[0],
        target[1] === 0 ? 0 : target[1],
        elevationMeters === 0 ? 0 : elevationMeters,
      ]) as Vec3,
      kind: "vertex",
      targetIndex: nearestTargetIndex,
    });
  }

  if (gridDistanceSquared <= LINEAR_EPSILON_SQUARED) {
    return Object.freeze({ raw, snapped: raw, kind: "none" });
  }
  return Object.freeze({ raw, snapped: gridPoint, kind: "grid" });
}

export interface MapEditorScreenPoint {
  readonly x: number;
  readonly y: number;
}

export function mapEditorScreenMovementSquared(
  start: MapEditorScreenPoint,
  current: MapEditorScreenPoint,
): number {
  assertFinite(start.x, "start.x");
  assertFinite(start.y, "start.y");
  assertFinite(current.x, "current.x");
  assertFinite(current.y, "current.y");
  const deltaX = current.x - start.x;
  const deltaY = current.y - start.y;
  return deltaX * deltaX + deltaY * deltaY;
}

export function isMapEditorPointCommitGesture(
  maximumMovementSquared: number,
  tolerancePixels = DEFAULT_CLICK_TOLERANCE_PIXELS,
): boolean {
  assertNonNegative(maximumMovementSquared, "maximumMovementSquared");
  assertNonNegative(tolerancePixels, "tolerancePixels");
  return maximumMovementSquared <= tolerancePixels * tolerancePixels;
}

export interface MapEditorHeading {
  readonly origin: Vec3;
  readonly current: Vec3;
  readonly direction: Vec3;
  readonly lengthMeters: number;
  readonly yawRadians: number;
}

/** Resolves a deterministic heading in core XY; a zero-length heading points along core +X. */
export function resolveMapEditorHeading(origin: Vec3, current: Vec3): MapEditorHeading {
  origin.forEach((value, index) => assertFinite(value, `origin[${index.toString()}]`));
  current.forEach((value, index) => assertFinite(value, `current[${index.toString()}]`));
  const deltaX = current[0] - origin[0];
  const deltaY = current[1] - origin[1];
  const lengthMeters = Math.hypot(deltaX, deltaY);
  const yawRadians =
    lengthMeters <= SPATIAL_AUTHORING_LINEAR_EPSILON_METERS
      ? 0
      : Math.atan2(deltaY, deltaX);
  return Object.freeze({
    origin: Object.freeze([...origin]) as Vec3,
    current: Object.freeze([...current]) as Vec3,
    direction: Object.freeze([
      lengthMeters <= SPATIAL_AUTHORING_LINEAR_EPSILON_METERS
        ? 1
        : deltaX / lengthMeters,
      lengthMeters <= SPATIAL_AUTHORING_LINEAR_EPSILON_METERS
        ? 0
        : deltaY / lengthMeters,
      0,
    ]) as Vec3,
    lengthMeters,
    yawRadians,
  });
}

export interface MapEditorHeadingGesture extends MapEditorHeading {
  readonly originSnap: MapEditorSnapResult;
  readonly currentSnap: MapEditorSnapResult;
}

function createHeadingGesture(
  originSnap: MapEditorSnapResult,
  currentSnap: MapEditorSnapResult,
): MapEditorHeadingGesture {
  const heading = resolveMapEditorHeading(originSnap.snapped, currentSnap.snapped);
  return Object.freeze({ ...heading, originSnap, currentSnap });
}

export type MapEditorAuthoringCancelReason =
  | "capture-failed"
  | "lost-pointer-capture"
  | "movement-threshold"
  | "multi-touch"
  | "pointer-cancel"
  | "surface-disabled";

export interface MapEditorAuthoringCancellation {
  readonly reason: MapEditorAuthoringCancelReason;
  readonly gestureMode: MapEditorAuthoringGestureMode;
  readonly origin?: Vec3;
}

interface MapEditorAuthoringSurfaceBaseProps {
  readonly enabled: boolean;
  readonly elevationMeters: number;
  readonly extentMeters?: readonly [number, number];
  readonly snapMeters: number;
  readonly snapTargets?: readonly Vec3[];
  readonly vertexSnapToleranceMeters?: number;
  readonly clickTolerancePixels?: number;
  readonly onGestureActiveChange?: (active: boolean) => void;
  readonly onHoverPoint?: (result: MapEditorSnapResult | null) => void;
  readonly onCancel?: (cancellation: MapEditorAuthoringCancellation) => void;
}

export type MapEditorAuthoringGestureMode = "heading" | "point";

export type MapEditorAuthoringSurfaceProps = MapEditorAuthoringSurfaceBaseProps &
  (
    | {
        readonly gestureMode: "point";
        readonly onPointCommit: (
          pointInCore: Vec3,
          snapResult: MapEditorSnapResult,
        ) => void;
        readonly onHeadingStart?: never;
        readonly onHeadingPreview?: never;
        readonly onHeadingCommit?: never;
      }
    | {
        readonly gestureMode: "heading";
        readonly onPointCommit?: never;
        readonly onHeadingStart?: (gesture: MapEditorHeadingGesture) => void;
        readonly onHeadingPreview?: (gesture: MapEditorHeadingGesture) => void;
        readonly onHeadingCommit: (gesture: MapEditorHeadingGesture) => void;
      }
  );

interface PointerCaptureTarget {
  hasPointerCapture?(pointerId: number): boolean;
  releasePointerCapture(pointerId: number): void;
  setPointerCapture(pointerId: number): void;
}

type MapEditorAuthoringSurfaceRaycast = (
  this: Mesh,
  raycaster: Raycaster,
  intersections: Intersection[],
) => void;

/** Keeps the active modal authoring plane ahead of scene entities without losing hit geometry. */
const MAP_EDITOR_AUTHORING_SURFACE_RAYCAST: MapEditorAuthoringSurfaceRaycast =
  function prioritizedMapEditorAuthoringSurfaceRaycast(
    raycaster,
    intersections,
  ): void {
    const firstSurfaceIntersection = intersections.length;
    Mesh.prototype.raycast.call(this, raycaster, intersections);
    for (
      let index = firstSurfaceIntersection;
      index < intersections.length;
      index += 1
    ) {
      const intersection = intersections[index];
      if (intersection !== undefined) {
        intersection.distance = 1e-5 + intersection.distance * 1e-12;
      }
    }
  };

/** Beats coplanar floors while remaining behind the active authoring surface and transform gizmos. */
const MAP_EDITOR_ENTITY_PICK_RAYCAST: MapEditorAuthoringSurfaceRaycast =
  function prioritizedMapEditorEntityPickRaycast(raycaster, intersections): void {
    const firstEntityIntersection = intersections.length;
    Mesh.prototype.raycast.call(this, raycaster, intersections);
    for (
      let index = firstEntityIntersection;
      index < intersections.length;
      index += 1
    ) {
      const intersection = intersections[index];
      if (intersection !== undefined) {
        intersection.distance = 2e-5 + intersection.distance * 1e-12;
      }
    }
  };

interface ActiveAuthoringPointer {
  readonly pointerId: number;
  readonly pointerCaptureTarget: PointerCaptureTarget;
  readonly gestureMode: MapEditorAuthoringGestureMode;
  readonly originSnap: MapEditorSnapResult;
  readonly screenStart: MapEditorScreenPoint;
  maximumMovementSquared: number;
}

interface AuthoringCallbacks {
  readonly onGestureActiveChange: ((active: boolean) => void) | undefined;
  readonly onHoverPoint: ((result: MapEditorSnapResult | null) => void) | undefined;
  readonly onPointCommit:
    | ((pointInCore: Vec3, snapResult: MapEditorSnapResult) => void)
    | undefined;
  readonly onHeadingStart: ((gesture: MapEditorHeadingGesture) => void) | undefined;
  readonly onHeadingPreview: ((gesture: MapEditorHeadingGesture) => void) | undefined;
  readonly onHeadingCommit: ((gesture: MapEditorHeadingGesture) => void) | undefined;
  readonly onCancel: ((cancellation: MapEditorAuthoringCancellation) => void) | undefined;
}

/**
 * Invisible core-XY authoring plane. It owns one pointer transaction at a time and never commits on
 * pointer-down: point gestures commit on a stationary pointer-up, while heading gestures publish
 * down/move/up samples.
 */
export function MapEditorAuthoringSurface(props: MapEditorAuthoringSurfaceProps) {
  const {
    enabled,
    elevationMeters,
    extentMeters = DEFAULT_PLACEMENT_EXTENT_METERS,
    snapMeters,
    snapTargets = [],
    vertexSnapToleranceMeters = snapMeters,
    clickTolerancePixels = DEFAULT_CLICK_TOLERANCE_PIXELS,
    gestureMode,
  } = props;
  const gl = useThree((state) => state.gl);
  const activeRef = useRef<ActiveAuthoringPointer | null>(null);
  const suppressedPointerIdsRef = useRef(new Set<number>());
  const callbacksRef = useRef<AuthoringCallbacks>({
    onGestureActiveChange: undefined,
    onHoverPoint: undefined,
    onPointCommit: undefined,
    onHeadingStart: undefined,
    onHeadingPreview: undefined,
    onHeadingCommit: undefined,
    onCancel: undefined,
  });
  callbacksRef.current = {
    onGestureActiveChange: props.onGestureActiveChange,
    onHoverPoint: props.onHoverPoint,
    onPointCommit: props.gestureMode === "point" ? props.onPointCommit : undefined,
    onHeadingStart: props.gestureMode === "heading" ? props.onHeadingStart : undefined,
    onHeadingPreview: props.gestureMode === "heading" ? props.onHeadingPreview : undefined,
    onHeadingCommit: props.gestureMode === "heading" ? props.onHeadingCommit : undefined,
    onCancel: props.onCancel,
  };

  const takeActive = useCallback((releaseCapture = true): ActiveAuthoringPointer | null => {
    const active = activeRef.current;
    if (active === null) return null;
    activeRef.current = null;
    callbacksRef.current.onGestureActiveChange?.(false);
    if (releaseCapture) {
      try {
        if (active.pointerCaptureTarget.hasPointerCapture?.(active.pointerId) !== false) {
          active.pointerCaptureTarget.releasePointerCapture(active.pointerId);
        }
      } catch {
        // The user agent may already have released pointer capture.
      }
    }
    return active;
  }, []);

  const cancelActive = useCallback(
    (reason: MapEditorAuthoringCancelReason, releaseCapture = true): boolean => {
      const active = takeActive(releaseCapture);
      if (active === null) return false;
      callbacksRef.current.onHoverPoint?.(null);
      callbacksRef.current.onCancel?.(
        Object.freeze({
          reason,
          gestureMode: active.gestureMode,
          origin: active.originSnap.snapped,
        }),
      );
      return true;
    },
    [takeActive],
  );

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent): void => {
      const active = activeRef.current;
      if (active === null || event.pointerId === active.pointerId) return;
      suppressedPointerIdsRef.current.add(event.pointerId);
      cancelActive("multi-touch");
    };
    const handlePointerCancel = (event: PointerEvent): void => {
      suppressedPointerIdsRef.current.delete(event.pointerId);
      if (activeRef.current?.pointerId === event.pointerId) {
        cancelActive("pointer-cancel", false);
      }
    };
    const handleLostPointerCapture = (event: PointerEvent): void => {
      if (activeRef.current?.pointerId === event.pointerId) {
        cancelActive("lost-pointer-capture", false);
      }
    };
    const clearSuppressedPointer = (event: PointerEvent): void => {
      suppressedPointerIdsRef.current.delete(event.pointerId);
    };
    gl.domElement.addEventListener("pointerdown", handlePointerDown);
    gl.domElement.addEventListener("pointercancel", handlePointerCancel);
    gl.domElement.addEventListener("lostpointercapture", handleLostPointerCapture);
    gl.domElement.addEventListener("pointerup", clearSuppressedPointer);
    return () => {
      gl.domElement.removeEventListener("pointerdown", handlePointerDown);
      gl.domElement.removeEventListener("pointercancel", handlePointerCancel);
      gl.domElement.removeEventListener("lostpointercapture", handleLostPointerCapture);
      gl.domElement.removeEventListener("pointerup", clearSuppressedPointer);
    };
  }, [cancelActive, gl]);

  useEffect(() => {
    if (!enabled) {
      cancelActive("surface-disabled");
      callbacksRef.current.onHoverPoint?.(null);
    }
  }, [cancelActive, enabled]);

  useEffect(
    () => () => {
      cancelActive("surface-disabled");
      suppressedPointerIdsRef.current.clear();
    },
    [cancelActive],
  );

  if (!enabled) return null;
  assertFinite(elevationMeters, "elevationMeters");
  assertPositive(extentMeters[0], "extentMeters[0]");
  assertPositive(extentMeters[1], "extentMeters[1]");
  assertPositive(snapMeters, "snapMeters");
  assertNonNegative(vertexSnapToleranceMeters, "vertexSnapToleranceMeters");
  assertNonNegative(clickTolerancePixels, "clickTolerancePixels");

  const snapEventPoint = (event: ThreeEvent<PointerEvent>): MapEditorSnapResult => {
    const pointInCore = threeToCorePosition([
      event.point.x,
      event.point.y,
      event.point.z,
    ]);
    return resolveMapEditorAuthoringSnap(
      pointInCore,
      elevationMeters,
      snapMeters,
      snapTargets,
      vertexSnapToleranceMeters,
    );
  };

  const begin = (event: ThreeEvent<PointerEvent>): void => {
    const pointerEvent = event.nativeEvent;
    if (pointerEvent.button !== 0) return;
    event.stopPropagation();
    pointerEvent.preventDefault();
    if (suppressedPointerIdsRef.current.delete(pointerEvent.pointerId)) return;
    const active = activeRef.current;
    if (active !== null) {
      if (active.pointerId !== pointerEvent.pointerId) cancelActive("multi-touch");
      return;
    }
    if (!pointerEvent.isPrimary) {
      callbacksRef.current.onCancel?.(
        Object.freeze({ reason: "multi-touch", gestureMode }),
      );
      return;
    }

    const originSnap = snapEventPoint(event);
    const pointerCaptureTarget = event.target as unknown as PointerCaptureTarget;
    if (typeof pointerCaptureTarget.setPointerCapture !== "function") {
      callbacksRef.current.onCancel?.(
        Object.freeze({
          reason: "capture-failed",
          gestureMode,
          origin: originSnap.snapped,
        }),
      );
      return;
    }
    try {
      pointerCaptureTarget.setPointerCapture(pointerEvent.pointerId);
    } catch {
      callbacksRef.current.onCancel?.(
        Object.freeze({
          reason: "capture-failed",
          gestureMode,
          origin: originSnap.snapped,
        }),
      );
      return;
    }
    activeRef.current = {
      pointerId: pointerEvent.pointerId,
      pointerCaptureTarget,
      gestureMode,
      originSnap,
      screenStart: Object.freeze({ x: pointerEvent.clientX, y: pointerEvent.clientY }),
      maximumMovementSquared: 0,
    };
    callbacksRef.current.onGestureActiveChange?.(true);
    callbacksRef.current.onHoverPoint?.(originSnap);
    if (gestureMode === "heading") {
      callbacksRef.current.onHeadingStart?.(createHeadingGesture(originSnap, originSnap));
    }
  };

  const preview = (event: ThreeEvent<PointerEvent>): void => {
    const pointerEvent = event.nativeEvent;
    const active = activeRef.current;
    if (active === null && pointerEvent.buttons !== 0) return;
    event.stopPropagation();
    pointerEvent.preventDefault();
    if (suppressedPointerIdsRef.current.has(pointerEvent.pointerId)) return;
    const currentSnap = snapEventPoint(event);
    if (active === null) {
      if (pointerEvent.isPrimary) callbacksRef.current.onHoverPoint?.(currentSnap);
      return;
    }
    if (active.pointerId !== pointerEvent.pointerId || !pointerEvent.isPrimary) {
      cancelActive("multi-touch");
      return;
    }
    active.maximumMovementSquared = Math.max(
      active.maximumMovementSquared,
      mapEditorScreenMovementSquared(active.screenStart, {
        x: pointerEvent.clientX,
        y: pointerEvent.clientY,
      }),
    );
    callbacksRef.current.onHoverPoint?.(currentSnap);
    if (active.gestureMode === "heading") {
      callbacksRef.current.onHeadingPreview?.(
        createHeadingGesture(active.originSnap, currentSnap),
      );
    }
  };

  const finish = (event: ThreeEvent<PointerEvent>): void => {
    const pointerEvent = event.nativeEvent;
    if (suppressedPointerIdsRef.current.delete(pointerEvent.pointerId)) return;
    const active = activeRef.current;
    if (active === null || active.pointerId !== pointerEvent.pointerId) return;
    event.stopPropagation();
    pointerEvent.preventDefault();
    if (!pointerEvent.isPrimary) {
      cancelActive("multi-touch");
      return;
    }
    const currentSnap = snapEventPoint(event);
    active.maximumMovementSquared = Math.max(
      active.maximumMovementSquared,
      mapEditorScreenMovementSquared(active.screenStart, {
        x: pointerEvent.clientX,
        y: pointerEvent.clientY,
      }),
    );
    const completed = takeActive();
    if (completed === null) return;
    callbacksRef.current.onHoverPoint?.(currentSnap);
    if (completed.gestureMode === "heading") {
      callbacksRef.current.onHeadingCommit?.(
        createHeadingGesture(completed.originSnap, currentSnap),
      );
      return;
    }
    if (!isMapEditorPointCommitGesture(completed.maximumMovementSquared, clickTolerancePixels)) {
      callbacksRef.current.onCancel?.(
        Object.freeze({
          reason: "movement-threshold",
          gestureMode: completed.gestureMode,
          origin: completed.originSnap.snapped,
        }),
      );
      return;
    }
    callbacksRef.current.onPointCommit?.(currentSnap.snapped, currentSnap);
  };

  const clearHover = (): void => {
    if (activeRef.current === null) callbacksRef.current.onHoverPoint?.(null);
  };

  return (
    <mesh
      name="lkds3d:map-editor-authoring-surface"
      position={[0, 0, elevationMeters]}
      raycast={MAP_EDITOR_AUTHORING_SURFACE_RAYCAST}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={begin}
      onPointerLeave={clearHover}
      onPointerMove={preview}
      onPointerUp={finish}
    >
      <planeGeometry args={[extentMeters[0], extentMeters[1]]} />
      <meshBasicMaterial
        colorWrite={false}
        depthWrite={false}
        opacity={0}
        transparent
      />
    </mesh>
  );
}

export interface MapEditorPlacementSurfaceProps {
  readonly enabled: boolean;
  readonly elevationMeters: number;
  readonly extentMeters?: readonly [number, number];
  readonly snapMeters: number;
  readonly onPlace: (pointInCore: Vec3) => void;
}

/** Compatibility wrapper for one-click placement; commits on pointer-up. */
export function MapEditorPlacementSurface({
  enabled,
  elevationMeters,
  extentMeters,
  snapMeters,
  onPlace,
}: MapEditorPlacementSurfaceProps) {
  return (
    <MapEditorAuthoringSurface
      enabled={enabled}
      elevationMeters={elevationMeters}
      {...(extentMeters === undefined ? {} : { extentMeters })}
      snapMeters={snapMeters}
      gestureMode="point"
      onPointCommit={onPlace}
    />
  );
}

function hasFiniteCorePoints(points: readonly Vec3[]): boolean {
  return points.every((point) => point.every((coordinate) => Number.isFinite(coordinate)));
}

function coreCross(first: Vec3, second: Vec3, third: Vec3): number {
  return (
    (second[0] - first[0]) * (third[1] - first[1]) -
    (second[1] - first[1]) * (third[0] - first[0])
  );
}

function sameCoreXY(first: Vec3, second: Vec3): boolean {
  return squaredDistanceInCoreXY(first, second) <= LINEAR_EPSILON_SQUARED;
}

function normalizePolygonPoints(points: readonly Vec3[]): readonly Vec3[] | null {
  if (points.length < 3 || !hasFiniteCorePoints(points)) return null;
  const normalized = points.map((point) => Object.freeze([...point]) as Vec3);
  const firstPoint = normalized[0];
  const lastPoint = normalized.at(-1);
  if (
    normalized.length > 3 &&
    firstPoint !== undefined &&
    lastPoint !== undefined &&
    sameCoreXY(firstPoint, lastPoint)
  ) {
    normalized.pop();
  }
  if (normalized.length < 3) return null;
  const elevation = normalized[0]?.[2];
  if (
    elevation === undefined ||
    normalized.some(
      (point) =>
        Math.abs(point[2] - elevation) >
        SPATIAL_AUTHORING_LINEAR_EPSILON_METERS,
    )
  ) {
    return null;
  }
  for (let firstIndex = 0; firstIndex < normalized.length; firstIndex += 1) {
    const first = normalized[firstIndex];
    if (first === undefined) return null;
    for (let secondIndex = firstIndex + 1; secondIndex < normalized.length; secondIndex += 1) {
      const second = normalized[secondIndex];
      if (second !== undefined && sameCoreXY(first, second)) return null;
    }
  }
  return Object.freeze(normalized);
}

function polygonSignedArea(points: readonly Vec3[]): number {
  let doubledArea = 0;
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    if (next !== undefined) doubledArea += point[0] * next[1] - next[0] * point[1];
  });
  return doubledArea / 2;
}

function orientation(first: Vec3, second: Vec3, third: Vec3): number {
  const cross = coreCross(first, second, third);
  return Math.abs(cross) <= SPATIAL_AUTHORING_AREA_EPSILON_SQUARE_METERS
    ? 0
    : Math.sign(cross);
}

function pointOnSegment(point: Vec3, start: Vec3, end: Vec3): boolean {
  return (
    Math.abs(coreCross(start, end, point)) <=
      SPATIAL_AUTHORING_AREA_EPSILON_SQUARE_METERS &&
    point[0] >= Math.min(start[0], end[0]) - SPATIAL_AUTHORING_LINEAR_EPSILON_METERS &&
    point[0] <= Math.max(start[0], end[0]) + SPATIAL_AUTHORING_LINEAR_EPSILON_METERS &&
    point[1] >= Math.min(start[1], end[1]) - SPATIAL_AUTHORING_LINEAR_EPSILON_METERS &&
    point[1] <= Math.max(start[1], end[1]) + SPATIAL_AUTHORING_LINEAR_EPSILON_METERS
  );
}

function segmentsIntersect(firstStart: Vec3, firstEnd: Vec3, secondStart: Vec3, secondEnd: Vec3) {
  const firstOrientation = orientation(firstStart, firstEnd, secondStart);
  const secondOrientation = orientation(firstStart, firstEnd, secondEnd);
  const thirdOrientation = orientation(secondStart, secondEnd, firstStart);
  const fourthOrientation = orientation(secondStart, secondEnd, firstEnd);
  if (
    firstOrientation !== secondOrientation &&
    thirdOrientation !== fourthOrientation &&
    firstOrientation !== 0 &&
    secondOrientation !== 0 &&
    thirdOrientation !== 0 &&
    fourthOrientation !== 0
  ) {
    return true;
  }
  return (
    (firstOrientation === 0 && pointOnSegment(secondStart, firstStart, firstEnd)) ||
    (secondOrientation === 0 && pointOnSegment(secondEnd, firstStart, firstEnd)) ||
    (thirdOrientation === 0 && pointOnSegment(firstStart, secondStart, secondEnd)) ||
    (fourthOrientation === 0 && pointOnSegment(firstEnd, secondStart, secondEnd))
  );
}

function isSimplePolygon(points: readonly Vec3[]): boolean {
  for (let firstIndex = 0; firstIndex < points.length; firstIndex += 1) {
    const firstEndIndex = (firstIndex + 1) % points.length;
    const firstStart = points[firstIndex];
    const firstEnd = points[firstEndIndex];
    if (firstStart === undefined || firstEnd === undefined) return false;
    for (let secondIndex = firstIndex + 1; secondIndex < points.length; secondIndex += 1) {
      const secondEndIndex = (secondIndex + 1) % points.length;
      if (
        firstIndex === secondIndex ||
        firstIndex === secondEndIndex ||
        firstEndIndex === secondIndex
      ) {
        continue;
      }
      const secondStart = points[secondIndex];
      const secondEnd = points[secondEndIndex];
      if (
        secondStart !== undefined &&
        secondEnd !== undefined &&
        segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd)
      ) {
        return false;
      }
    }
  }
  return true;
}

function pointInsideTriangle(point: Vec3, first: Vec3, second: Vec3, third: Vec3): boolean {
  const firstCross = coreCross(first, second, point);
  const secondCross = coreCross(second, third, point);
  const thirdCross = coreCross(third, first, point);
  const hasNegative =
    firstCross < -SPATIAL_AUTHORING_AREA_EPSILON_SQUARE_METERS ||
    secondCross < -SPATIAL_AUTHORING_AREA_EPSILON_SQUARE_METERS ||
    thirdCross < -SPATIAL_AUTHORING_AREA_EPSILON_SQUARE_METERS;
  const hasPositive =
    firstCross > SPATIAL_AUTHORING_AREA_EPSILON_SQUARE_METERS ||
    secondCross > SPATIAL_AUTHORING_AREA_EPSILON_SQUARE_METERS ||
    thirdCross > SPATIAL_AUTHORING_AREA_EPSILON_SQUARE_METERS;
  return !(hasNegative && hasPositive);
}

export interface MapEditorPolygonGeometry {
  readonly areaSquareMeters: number;
  readonly outlinePositions: readonly number[];
  readonly trianglePositions: readonly number[];
  readonly vertexCount: number;
}

/** Triangulates one simple, horizontal core-XY polygon with deterministic ear clipping. */
export function createMapEditorPolygonGeometry(
  inputPoints: readonly Vec3[],
): MapEditorPolygonGeometry | null {
  const points = normalizePolygonPoints(inputPoints);
  if (points === null || !isSimplePolygon(points)) return null;
  const signedArea = polygonSignedArea(points);
  if (Math.abs(signedArea) <= SPATIAL_AUTHORING_AREA_EPSILON_SQUARE_METERS) {
    return null;
  }
  const winding = Math.sign(signedArea);
  const indices = points.map((_, index) => index);
  const triangles: number[] = [];
  let guard = points.length * points.length;

  while (indices.length > 3 && guard > 0) {
    let clipped = false;
    for (let index = 0; index < indices.length; index += 1) {
      const previousIndex = indices[(index - 1 + indices.length) % indices.length];
      const currentIndex = indices[index];
      const nextIndex = indices[(index + 1) % indices.length];
      if (previousIndex === undefined || currentIndex === undefined || nextIndex === undefined) {
        return null;
      }
      const previous = points[previousIndex];
      const current = points[currentIndex];
      const next = points[nextIndex];
      if (previous === undefined || current === undefined || next === undefined) return null;
      if (
        coreCross(previous, current, next) * winding <=
        SPATIAL_AUTHORING_AREA_EPSILON_SQUARE_METERS
      ) {
        continue;
      }
      const containsVertex = indices.some((candidateIndex) => {
        if (
          candidateIndex === previousIndex ||
          candidateIndex === currentIndex ||
          candidateIndex === nextIndex
        ) {
          return false;
        }
        const candidate = points[candidateIndex];
        return candidate !== undefined && pointInsideTriangle(candidate, previous, current, next);
      });
      if (containsVertex) continue;
      const triangleIndices =
        winding > 0
          ? [previousIndex, currentIndex, nextIndex]
          : [previousIndex, nextIndex, currentIndex];
      triangleIndices.forEach((triangleIndex) => {
        const point = points[triangleIndex];
        if (point !== undefined) triangles.push(point[0], point[1], point[2]);
      });
      indices.splice(index, 1);
      clipped = true;
      break;
    }
    if (!clipped) return null;
    guard -= 1;
  }

  if (indices.length !== 3) return null;
  const [firstIndex, secondIndex, thirdIndex] = indices;
  if (firstIndex === undefined || secondIndex === undefined || thirdIndex === undefined) return null;
  const finalTriangle =
    winding > 0
      ? [firstIndex, secondIndex, thirdIndex]
      : [firstIndex, thirdIndex, secondIndex];
  finalTriangle.forEach((triangleIndex) => {
    const point = points[triangleIndex];
    if (point !== undefined) triangles.push(point[0], point[1], point[2]);
  });
  const outline: number[] = [];
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    if (next !== undefined) outline.push(...point, ...next);
  });
  return Object.freeze({
    areaSquareMeters: Math.abs(signedArea),
    outlinePositions: Object.freeze(outline),
    trianglePositions: Object.freeze(triangles),
    vertexCount: points.length,
  });
}

export function isValidMapEditorPolygon(points: readonly Vec3[]): boolean {
  return createMapEditorPolygonGeometry(points) !== null;
}

export function isMapEditorAreaCloseCandidate(
  points: readonly Vec3[],
  hoverPoint: Vec3 | null,
  toleranceMeters: number,
): boolean {
  assertNonNegative(toleranceMeters, "toleranceMeters");
  const first = points[0];
  return (
    points.length >= 3 &&
    first !== undefined &&
    hoverPoint !== null &&
    squaredDistanceInCoreXY(first, hoverPoint) <= toleranceMeters * toleranceMeters
  );
}

function polylineSegmentPositions(points: readonly Vec3[], closed = false): Float32Array {
  const positions: number[] = [];
  const segmentCount = closed ? points.length : Math.max(0, points.length - 1);
  for (let index = 0; index < segmentCount; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    if (start !== undefined && end !== undefined && !sameCoreXY(start, end)) {
      positions.push(...start, ...end);
    }
  }
  return new Float32Array(positions);
}

function MapEditorLineSegments({
  positions,
  color,
  opacity = 1,
  name,
}: {
  readonly positions: Float32Array;
  readonly color: string;
  readonly opacity?: number;
  readonly name: string;
}) {
  if (positions.length === 0) return null;
  return (
    <lineSegments
      name={name}
      position={[0, 0, AUTHORING_Z_OFFSET_METERS]}
      raycast={() => undefined}
      renderOrder={6}
    >
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial
        color={color}
        depthWrite={false}
        opacity={opacity}
        transparent={opacity < 1}
      />
    </lineSegments>
  );
}

const DIRECTION_CUE_POSITIONS = new Float32Array([
  0.16,
  0,
  0,
  -0.11,
  0.09,
  0,
  -0.11,
  -0.09,
  0,
]);

function MapEditorDirectionCue({
  point,
  yawRadians,
  color,
  scale = 1,
  name,
}: {
  readonly point: Vec3;
  readonly yawRadians: number;
  readonly color: string;
  readonly scale?: number;
  readonly name: string;
}) {
  return (
    <mesh
      name={name}
      position={[point[0], point[1], point[2] + AUTHORING_Z_OFFSET_METERS * 1.5]}
      rotation={[0, 0, yawRadians]}
      scale={scale}
      renderOrder={7}
    >
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[DIRECTION_CUE_POSITIONS, 3]} />
      </bufferGeometry>
      <meshBasicMaterial color={color} depthWrite={false} side={WEBGL_DOUBLE_SIDE} />
    </mesh>
  );
}

function routeDirectionCues(points: readonly Vec3[]) {
  return points.slice(0, -1).flatMap((start, index) => {
    const end = points[index + 1];
    if (end === undefined) return [];
    const heading = resolveMapEditorHeading(start, end);
    if (heading.lengthMeters <= 0.12) return [];
    return [
      {
        key: `${index.toString()}:${start.join(":")}:${end.join(":")}`,
        point: Object.freeze([
          (start[0] + end[0]) / 2,
          (start[1] + end[1]) / 2,
          (start[2] + end[2]) / 2,
        ]) as Vec3,
        yawRadians: heading.yawRadians,
      },
    ];
  });
}

interface MapEditorEntityVisualProps {
  readonly entityId?: EntityId;
  readonly color?: string;
  readonly selectable?: boolean;
}

export interface MapEditorRouteProps extends MapEditorEntityVisualProps {
  readonly points: readonly Vec3[];
  readonly pickWidthMeters?: number;
  readonly showDirectionCues?: boolean;
  readonly widthMeters?: number;
}

export interface MapEditorRoutePickSegment {
  readonly midpoint: Vec3;
  readonly lengthMeters: number;
  readonly widthMeters: number;
  readonly yawRadians: number;
}

/** Produces camera-independent XY pick corridors instead of relying on Three's line threshold. */
export function createMapEditorRoutePickSegments(
  points: readonly Vec3[],
  widthMeters = 0.28,
): readonly MapEditorRoutePickSegment[] {
  assertPositive(widthMeters, "widthMeters");
  if (!hasFiniteCorePoints(points)) return Object.freeze([]);
  return Object.freeze(
    points.slice(0, -1).flatMap((start, index) => {
      const end = points[index + 1];
      if (end === undefined) return [];
      const heading = resolveMapEditorHeading(start, end);
      if (heading.lengthMeters <= SPATIAL_AUTHORING_LINEAR_EPSILON_METERS) return [];
      return [
        Object.freeze({
          midpoint: Object.freeze([
            (start[0] + end[0]) / 2,
            (start[1] + end[1]) / 2,
            (start[2] + end[2]) / 2,
          ]) as Vec3,
          lengthMeters: heading.lengthMeters,
          widthMeters,
          yawRadians: heading.yawRadians,
        }),
      ];
    }),
  );
}

function MapEditorRoutePickCorridors({
  points,
  widthMeters,
}: {
  readonly points: readonly Vec3[];
  readonly widthMeters: number;
}) {
  return createMapEditorRoutePickSegments(points, widthMeters).map(
    (segment, index) => (
      <mesh
        key={`${index.toString()}:${segment.midpoint.join(":")}`}
        name="lkds3d:map-editor-route-pick-proxy"
        position={[
          segment.midpoint[0],
          segment.midpoint[1],
          segment.midpoint[2] + AUTHORING_Z_OFFSET_METERS,
        ]}
        raycast={MAP_EDITOR_ENTITY_PICK_RAYCAST}
        rotation={[0, 0, segment.yawRadians]}
      >
        <planeGeometry args={[segment.lengthMeters, segment.widthMeters]} />
        <meshBasicMaterial
          colorWrite={false}
          depthWrite={false}
          opacity={0}
          side={WEBGL_DOUBLE_SIDE}
          transparent
        />
      </mesh>
    ),
  );
}

function MapEditorRouteRibbon({
  points,
  widthMeters,
  color,
}: {
  readonly points: readonly Vec3[];
  readonly widthMeters: number;
  readonly color: string;
}) {
  return (
    <group name="lkds3d:map-editor-route-ribbon">
      {createMapEditorRoutePickSegments(points, widthMeters).map(
        (segment, index) => (
          <mesh
            key={`${index.toString()}:${segment.midpoint.join(":")}`}
            name="lkds3d:map-editor-route-ribbon-segment"
            position={[
              segment.midpoint[0],
              segment.midpoint[1],
              segment.midpoint[2] + AUTHORING_Z_OFFSET_METERS * 1.15,
            ]}
            raycast={() => undefined}
            rotation={[0, 0, segment.yawRadians]}
            renderOrder={5}
          >
            <planeGeometry
              args={[segment.lengthMeters + widthMeters, widthMeters]}
            />
            <meshBasicMaterial
              color={color}
              depthWrite={false}
              opacity={0.82}
              side={WEBGL_DOUBLE_SIDE}
              transparent
            />
          </mesh>
        ),
      )}
      {points.map((point, index) => (
        <mesh
          key={`${index.toString()}:${point.join(":")}`}
          name="lkds3d:map-editor-route-ribbon-joint"
          position={[
            point[0],
            point[1],
            point[2] + AUTHORING_Z_OFFSET_METERS * 1.15,
          ]}
          raycast={() => undefined}
          renderOrder={5}
        >
          <circleGeometry args={[widthMeters / 2, 16]} />
          <meshBasicMaterial
            color={color}
            depthWrite={false}
            opacity={0.82}
            side={WEBGL_DOUBLE_SIDE}
            transparent
          />
        </mesh>
      ))}
    </group>
  );
}

/** Continuous planar ribbon with explicit directional mesh cues and a stable pick corridor. */
export function MapEditorRoute({
  entityId,
  points,
  color,
  selectable = true,
  pickWidthMeters = 0.28,
  showDirectionCues = true,
  widthMeters = 0.12,
}: MapEditorRouteProps) {
  const { theme } = useSceneRuntime();
  if (points.length < 2 || !hasFiniteCorePoints(points)) return null;
  const resolvedColor = color ?? theme.materials.intent;
  assertPositive(pickWidthMeters, "pickWidthMeters");
  assertPositive(widthMeters, "widthMeters");
  const renderRoute = (state: SelectableRenderState): ReactNode => {
    const stateColor = state.selected
      ? theme.materials.selection
      : state.hovered
        ? theme.materials.live
        : resolvedColor;
    return (
      <group name={`lkds3d:map-editor-route:${entityId ?? "anonymous"}`}>
        <MapEditorRoutePickCorridors
          points={points}
          widthMeters={pickWidthMeters}
        />
        <MapEditorRouteRibbon
          points={points}
          widthMeters={widthMeters}
          color={stateColor}
        />
        <MapEditorLineSegments
          name="lkds3d:map-editor-route-centerline"
          positions={polylineSegmentPositions(points)}
          color={stateColor}
        />
        {showDirectionCues
          ? routeDirectionCues(points).map((cue) => (
              <MapEditorDirectionCue
                key={cue.key}
                name="lkds3d:map-editor-route-direction"
                point={cue.point}
                yawRadians={cue.yawRadians}
                color={stateColor}
              />
            ))
          : null}
        {state.hovered || state.selected ? (
          <MapEditorDraftVertices points={points} color={stateColor} />
        ) : null}
      </group>
    );
  };
  if (entityId === undefined) {
    return renderRoute({ hovered: false, selected: false });
  }
  return (
    <Selectable entityId={entityId} selectable={selectable}>
      {renderRoute}
    </Selectable>
  );
}

export interface MapEditorAreaProps extends MapEditorEntityVisualProps {
  readonly points: readonly Vec3[];
  readonly fillOpacity?: number;
}

/** Flat polygon fill and independent outline for a completed area. */
export function MapEditorArea({
  entityId,
  points,
  color,
  selectable = true,
  fillOpacity = 0.22,
}: MapEditorAreaProps) {
  const { theme } = useSceneRuntime();
  const geometry = createMapEditorPolygonGeometry(points);
  if (geometry === null) return null;
  assertNonNegative(fillOpacity, "fillOpacity");
  if (fillOpacity > 1) throw new RangeError("fillOpacity must be at most 1.");
  const resolvedColor = color ?? theme.materials.live;
  const renderArea = (state: SelectableRenderState): ReactNode => {
    const stateColor = state.selected
      ? theme.materials.selection
      : state.hovered
        ? theme.materials.intent
        : resolvedColor;
    return (
      <group name={`lkds3d:map-editor-area:${entityId ?? "anonymous"}`}>
        <mesh
          position={[0, 0, AUTHORING_Z_OFFSET_METERS]}
          raycast={MAP_EDITOR_ENTITY_PICK_RAYCAST}
          renderOrder={5}
        >
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[new Float32Array(geometry.trianglePositions), 3]}
            />
          </bufferGeometry>
          <meshBasicMaterial
            color={stateColor}
            depthWrite={false}
            opacity={state.selected ? Math.max(fillOpacity, 0.34) : fillOpacity}
            side={WEBGL_DOUBLE_SIDE}
            transparent
          />
        </mesh>
        <MapEditorLineSegments
          name="lkds3d:map-editor-area-outline"
          positions={new Float32Array(geometry.outlinePositions)}
          color={stateColor}
          opacity={0.96}
        />
        {state.hovered || state.selected ? (
          <MapEditorDraftVertices points={points} color={stateColor} />
        ) : null}
      </group>
    );
  };
  if (entityId === undefined) {
    return renderArea({ hovered: false, selected: false });
  }
  return (
    <Selectable entityId={entityId} selectable={selectable}>
      {renderArea}
    </Selectable>
  );
}

function MapEditorDraftVertices({ points, color }: { readonly points: readonly Vec3[]; readonly color: string }) {
  return points.map((point, index) => (
    <mesh
      key={`${index.toString()}:${point.join(":")}`}
      name="lkds3d:map-editor-draft-vertex"
      position={[point[0], point[1], point[2] + AUTHORING_Z_OFFSET_METERS * 1.7]}
      renderOrder={7}
    >
      <sphereGeometry args={[0.065, 12, 8]} />
      <meshBasicMaterial color={color} depthWrite={false} />
    </mesh>
  ));
}

export interface MapEditorRouteDraftProps {
  readonly points: readonly Vec3[];
  readonly hoverPoint?: Vec3 | null;
  readonly color?: string;
}

export function MapEditorRouteDraft({
  points,
  hoverPoint = null,
  color,
}: MapEditorRouteDraftProps) {
  const { theme } = useSceneRuntime();
  if (!hasFiniteCorePoints(points) || (hoverPoint !== null && !hasFiniteCorePoints([hoverPoint]))) {
    return null;
  }
  const resolvedColor = color ?? theme.materials.warning;
  const previewPoints = hoverPoint === null ? points : [...points, hoverPoint];
  return (
    <group name="lkds3d:map-editor-route-draft">
      <MapEditorLineSegments
        name="lkds3d:map-editor-route-rubber-band"
        positions={polylineSegmentPositions(previewPoints)}
        color={resolvedColor}
        opacity={0.86}
      />
      <MapEditorDraftVertices points={points} color={resolvedColor} />
    </group>
  );
}

export interface MapEditorAreaDraftProps extends MapEditorRouteDraftProps {
  readonly closeToleranceMeters?: number;
}

export function MapEditorAreaDraft({
  points,
  hoverPoint = null,
  color,
  closeToleranceMeters = 0.28,
}: MapEditorAreaDraftProps) {
  const { theme } = useSceneRuntime();
  if (!hasFiniteCorePoints(points) || (hoverPoint !== null && !hasFiniteCorePoints([hoverPoint]))) {
    return null;
  }
  const resolvedColor = color ?? theme.materials.warning;
  const closeCandidate = isMapEditorAreaCloseCandidate(
    points,
    hoverPoint,
    closeToleranceMeters,
  );
  const previewPoints = hoverPoint === null ? points : [...points, hoverPoint];
  const closePositions =
    closeCandidate && hoverPoint !== null && points[0] !== undefined
      ? polylineSegmentPositions([hoverPoint, points[0]])
      : new Float32Array();
  const first = points[0];
  return (
    <group name="lkds3d:map-editor-area-draft">
      <MapEditorLineSegments
        name="lkds3d:map-editor-area-rubber-band"
        positions={polylineSegmentPositions(previewPoints)}
        color={resolvedColor}
        opacity={0.86}
      />
      <MapEditorLineSegments
        name="lkds3d:map-editor-area-close-segment"
        positions={closePositions}
        color={theme.materials.live}
      />
      <MapEditorDraftVertices points={points} color={resolvedColor} />
      {points.length >= 3 && first !== undefined ? (
        <mesh
          name="lkds3d:map-editor-area-close-cue"
          position={[first[0], first[1], first[2] + AUTHORING_Z_OFFSET_METERS * 1.8]}
          renderOrder={8}
        >
          <torusGeometry args={[0.13, 0.025, 8, 24]} />
          <meshBasicMaterial
            color={closeCandidate ? theme.materials.live : resolvedColor}
            depthWrite={false}
          />
        </mesh>
      ) : null}
    </group>
  );
}

export interface MapEditorGoalDraftProps {
  readonly origin: Vec3;
  readonly current: Vec3;
  readonly color?: string;
}

export function MapEditorGoalDraft({ origin, current, color }: MapEditorGoalDraftProps) {
  const { theme } = useSceneRuntime();
  if (!hasFiniteCorePoints([origin, current])) return null;
  const resolvedColor = color ?? theme.materials.selection;
  const heading = resolveMapEditorHeading(origin, current);
  return (
    <group name="lkds3d:map-editor-goal-draft">
      <mesh
        name="lkds3d:map-editor-goal-origin"
        position={[origin[0], origin[1], origin[2] + AUTHORING_Z_OFFSET_METERS * 1.7]}
        renderOrder={8}
      >
        <torusGeometry args={[0.12, 0.028, 8, 24]} />
        <meshBasicMaterial color={resolvedColor} depthWrite={false} />
      </mesh>
      <MapEditorLineSegments
        name="lkds3d:map-editor-goal-heading"
        positions={polylineSegmentPositions([origin, current])}
        color={resolvedColor}
      />
      {heading.lengthMeters > SPATIAL_AUTHORING_LINEAR_EPSILON_METERS ? (
        <MapEditorDirectionCue
          name="lkds3d:map-editor-goal-direction"
          point={current}
          yawRadians={heading.yawRadians}
          color={resolvedColor}
          scale={1.15}
        />
      ) : null}
    </group>
  );
}

export interface MapEditorPlacementGhostProps {
  readonly point: Vec3;
  readonly footprintOffsetMeters?: readonly [number, number];
  readonly footprintMeters?: readonly [number, number];
  readonly headingRadians?: number;
  readonly kind?: "asset" | "object";
  readonly valid?: boolean;
}

/** Transparent footprint plus reticle for object and asset placement preview. */
export function MapEditorPlacementGhost({
  point,
  footprintOffsetMeters = [0, 0],
  footprintMeters = [0.8, 0.6],
  headingRadians = 0,
  kind = "object",
  valid = true,
}: MapEditorPlacementGhostProps) {
  const { theme } = useSceneRuntime();
  if (!hasFiniteCorePoints([point])) return null;
  assertPositive(footprintMeters[0], "footprintMeters[0]");
  assertPositive(footprintMeters[1], "footprintMeters[1]");
  assertFinite(footprintOffsetMeters[0], "footprintOffsetMeters[0]");
  assertFinite(footprintOffsetMeters[1], "footprintOffsetMeters[1]");
  assertFinite(headingRadians, "headingRadians");
  const color = valid ? theme.materials.live : theme.materials.error;
  const halfWidth = footprintMeters[0] / 2;
  const halfHeight = footprintMeters[1] / 2;
  const outline = new Float32Array([
    -halfWidth,
    -halfHeight,
    0,
    halfWidth,
    -halfHeight,
    0,
    halfWidth,
    -halfHeight,
    0,
    halfWidth,
    halfHeight,
    0,
    halfWidth,
    halfHeight,
    0,
    -halfWidth,
    halfHeight,
    0,
    -halfWidth,
    halfHeight,
    0,
    -halfWidth,
    -halfHeight,
    0,
  ]);
  const reticleExtent = Math.min(0.22, Math.max(0.1, Math.min(halfWidth, halfHeight)));
  const reticle = new Float32Array([
    -reticleExtent,
    0,
    0,
    reticleExtent,
    0,
    0,
    0,
    -reticleExtent,
    0,
    0,
    reticleExtent,
    0,
  ]);
  return (
    <group
      name={`lkds3d:map-editor-${kind}-ghost`}
      position={point}
      rotation={[0, 0, headingRadians]}
    >
      <group position={[footprintOffsetMeters[0], footprintOffsetMeters[1], 0]}>
        <mesh position={[0, 0, AUTHORING_Z_OFFSET_METERS]} renderOrder={5}>
          <planeGeometry args={[footprintMeters[0], footprintMeters[1]]} />
          <meshBasicMaterial
            color={color}
            depthWrite={false}
            opacity={valid ? 0.2 : 0.14}
            side={WEBGL_DOUBLE_SIDE}
            transparent
          />
        </mesh>
        <MapEditorLineSegments
          name="lkds3d:map-editor-ghost-footprint"
          positions={outline}
          color={color}
          opacity={0.94}
        />
      </group>
      <MapEditorLineSegments
        name="lkds3d:map-editor-ghost-reticle"
        positions={reticle}
        color={color}
      />
    </group>
  );
}

export interface MapEditorSnapCueProps {
  readonly result: MapEditorSnapResult;
}

/** WebGL-only snap feedback: diamond for grid, ring for vertex, crosshair for unsnapped. */
export function MapEditorSnapCue({ result }: MapEditorSnapCueProps) {
  const { theme } = useSceneRuntime();
  const point = result.snapped;
  const color =
    result.kind === "vertex"
      ? theme.materials.selection
      : result.kind === "grid"
        ? theme.materials.live
        : theme.materials.intent;
  const reticle = new Float32Array([
    -0.1,
    0,
    0,
    0.1,
    0,
    0,
    0,
    -0.1,
    0,
    0,
    0.1,
    0,
  ]);
  return (
    <group
      name={`lkds3d:map-editor-snap-${result.kind}`}
      position={[point[0], point[1], point[2] + AUTHORING_Z_OFFSET_METERS * 2]}
    >
      <MapEditorLineSegments
        name="lkds3d:map-editor-snap-reticle"
        positions={reticle}
        color={color}
      />
      {result.kind === "vertex" ? (
        <mesh name="lkds3d:map-editor-vertex-snap-cue" renderOrder={9}>
          <torusGeometry args={[0.15, 0.028, 8, 24]} />
          <meshBasicMaterial color={color} depthWrite={false} />
        </mesh>
      ) : result.kind === "grid" ? (
        <mesh
          name="lkds3d:map-editor-grid-snap-cue"
          rotation={[0, 0, Math.PI / 4]}
          renderOrder={9}
        >
          <boxGeometry args={[0.18, 0.18, 0.018]} />
          <meshBasicMaterial color={color} depthWrite={false} opacity={0.72} transparent />
        </mesh>
      ) : null}
    </group>
  );
}

const TRON_BOUNDS_CENTER: Vec3 = Object.freeze([
  (TRON_MANIFEST.boundsInCoreMeters.min[0] + TRON_MANIFEST.boundsInCoreMeters.max[0]) / 2,
  (TRON_MANIFEST.boundsInCoreMeters.min[1] + TRON_MANIFEST.boundsInCoreMeters.max[1]) / 2,
  (TRON_MANIFEST.boundsInCoreMeters.min[2] + TRON_MANIFEST.boundsInCoreMeters.max[2]) / 2,
]);

const TRON_BOUNDS_SIZE: Vec3 = Object.freeze([
  TRON_MANIFEST.boundsInCoreMeters.max[0] - TRON_MANIFEST.boundsInCoreMeters.min[0],
  TRON_MANIFEST.boundsInCoreMeters.max[1] - TRON_MANIFEST.boundsInCoreMeters.min[1],
  TRON_MANIFEST.boundsInCoreMeters.max[2] - TRON_MANIFEST.boundsInCoreMeters.min[2],
]);

const TRON_BOUNDS_CORNERS = ([-1, 1] as const).flatMap((xDirection) =>
  ([-1, 1] as const).flatMap((yDirection) =>
    ([-1, 1] as const).map(
      (zDirection) =>
        [
          (TRON_BOUNDS_SIZE[0] / 2) * xDirection,
          (TRON_BOUNDS_SIZE[1] / 2) * yDirection,
          (TRON_BOUNDS_SIZE[2] / 2) * zDirection,
        ] as const,
    ),
  ),
);

const TRON_BOUNDS_EDGE_INDICES = [
  [0, 1],
  [0, 2],
  [0, 4],
  [1, 3],
  [1, 5],
  [2, 3],
  [2, 6],
  [3, 7],
  [4, 5],
  [4, 6],
  [5, 7],
  [6, 7],
] as const;

const TRON_BOUNDS_EDGE_POSITIONS = new Float32Array(
  TRON_BOUNDS_EDGE_INDICES.flatMap(([startIndex, endIndex]) => {
    const start = TRON_BOUNDS_CORNERS[startIndex];
    const end = TRON_BOUNDS_CORNERS[endIndex];
    if (start === undefined || end === undefined) {
      throw new RangeError("The TRON bounds edge references a missing corner.");
    }
    return [...start, ...end];
  }),
);

function MapEditorAssetBoundsCue({ state }: { readonly state: SelectableRenderState }) {
  const { theme } = useSceneRuntime();
  const color = state.selected ? theme.materials.selection : theme.materials.live;
  const cornerSize = Math.max(
    0.025,
    Math.min(TRON_BOUNDS_SIZE[0], TRON_BOUNDS_SIZE[1], TRON_BOUNDS_SIZE[2]) * 0.08,
  );

  return (
    <group name="lkds3d:map-editor-asset-bounds-cue" position={TRON_BOUNDS_CENTER}>
      <lineSegments renderOrder={4}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[TRON_BOUNDS_EDGE_POSITIONS, 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial
          color={color}
          depthWrite={false}
          opacity={state.selected ? 0.96 : 0.72}
          transparent
        />
      </lineSegments>
      {state.selected
        ? TRON_BOUNDS_CORNERS.map((position) => (
            <mesh key={position.join(":")} position={position} renderOrder={4}>
              <boxGeometry args={[cornerSize, cornerSize, cornerSize]} />
              <meshBasicMaterial color={color} depthWrite={false} />
            </mesh>
          ))
        : null}
    </group>
  );
}

function MapEditorTronAsset({
  node,
  state,
}: {
  readonly node: SpatialAssetNode;
  readonly state: SelectableRenderState;
}) {
  return (
    <>
      <GltfModel
        entityId={node.id}
        manifest={TRON_MANIFEST}
        selectable={false}
        url={tronModelUrl}
      />
      <mesh
        name="lkds3d:map-editor-asset-pick-proxy"
        position={TRON_BOUNDS_CENTER}
      >
        <boxGeometry
          args={[
            TRON_BOUNDS_SIZE[0] + ASSET_PICK_PADDING_METERS,
            TRON_BOUNDS_SIZE[1] + ASSET_PICK_PADDING_METERS,
            TRON_BOUNDS_SIZE[2] + ASSET_PICK_PADDING_METERS,
          ]}
        />
        <meshBasicMaterial
          colorWrite={false}
          depthWrite={false}
          opacity={0}
          transparent
        />
      </mesh>
      {state.hovered || state.selected ? <MapEditorAssetBoundsCue state={state} /> : null}
    </>
  );
}

/** SpatialStructure asset slot for the approved Story-local asset catalog. */
export function renderMapEditorAsset(
  node: SpatialAssetNode,
  state: SelectableRenderState,
): ReactNode {
  if (node.assetId !== TRON_MANIFEST.assetId) return null;
  return <MapEditorTronAsset node={node} state={state} />;
}
