import {
  FrameMismatchError,
  assertValidBounds3,
  assertValidFrameId,
  assertValidFramedPoint3,
  assertValidVec3,
  type Bounds3,
  type FrameId,
  type FramedPoint3,
  type Vec3,
} from "./coordinates.js";

export type CameraProjection =
  | {
      readonly kind: "perspective";
      readonly verticalFovRadians: number;
      readonly aspect: number;
      readonly nearMeters: number;
      readonly farMeters: number;
    }
  | {
      readonly kind: "orthographic";
      readonly verticalSizeMeters: number;
      readonly aspect: number;
      readonly nearMeters: number;
      readonly farMeters: number;
    };

export interface CameraState {
  readonly frame: FrameId;
  readonly position: Vec3;
  readonly target: Vec3;
  readonly up: Vec3;
  readonly projection: CameraProjection;
}

export interface CameraSolveInput {
  readonly current?: CameraState;
  readonly target: Bounds3 | FramedPoint3;
  readonly viewportAspect: number;
  readonly paddingRatio?: number;
}

export interface CameraRigConfig {
  readonly homeState: CameraState;
  readonly initialState?: CameraState;
}

export type CameraCancellationReason = "superseded" | "explicit" | "rollback" | "disposed";

export type CameraOperationResult =
  | { readonly status: "completed" }
  | {
      readonly status: "cancelled";
      readonly reason: CameraCancellationReason;
    };

/** Renderer-neutral port contract. Concrete hosts own animation and disposal. */
export interface CameraRigPort {
  getState(): CameraState;
  setState(state: CameraState): Promise<CameraOperationResult>;
  setHomeState(state: CameraState): void;
  home(): Promise<CameraOperationResult>;
  top(target: Bounds3): Promise<CameraOperationResult>;
  focus(target: Bounds3 | FramedPoint3): Promise<CameraOperationResult>;
  cancel(reason?: "explicit" | "rollback"): void;
}

const DEFAULT_VERTICAL_FOV_RADIANS = Math.PI / 4;
const DEFAULT_NEAR_METERS = 0.05;
const DEFAULT_FAR_METERS = 10_000;
const DEFAULT_PADDING_RATIO = 0.12;
const MINIMUM_TARGET_RADIUS_METERS = 0.25;

interface TargetExtent {
  readonly frame: FrameId;
  readonly center: Vec3;
  readonly horizontalRadius: number;
  readonly verticalRadius: number;
  readonly radius: number;
}

function immutableVec3(value: Vec3): Vec3 {
  assertValidVec3(value);
  return Object.freeze([
    value[0] === 0 ? 0 : value[0],
    value[1] === 0 ? 0 : value[1],
    value[2] === 0 ? 0 : value[2],
  ]);
}

function add(left: Vec3, right: Vec3): Vec3 {
  return immutableVec3([left[0] + right[0], left[1] + right[1], left[2] + right[2]]);
}

function subtract(left: Vec3, right: Vec3): Vec3 {
  return immutableVec3([left[0] - right[0], left[1] - right[1], left[2] - right[2]]);
}

function scale(value: Vec3, scalar: number): Vec3 {
  return immutableVec3([value[0] * scalar, value[1] * scalar, value[2] * scalar]);
}

function magnitude(value: Vec3): number {
  return Math.hypot(value[0], value[1], value[2]);
}

function normalize(value: Vec3, label: string): Vec3 {
  const length = magnitude(value);
  if (!Number.isFinite(length) || length <= Number.EPSILON) {
    throw new RangeError(`${label} must have a finite non-zero length.`);
  }
  return scale(value, 1 / length);
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a finite positive number.`);
  }
}

function freezeProjection(projection: CameraProjection): CameraProjection {
  assertPositiveFinite(projection.aspect, "camera.projection.aspect");
  assertPositiveFinite(projection.nearMeters, "camera.projection.nearMeters");
  assertPositiveFinite(projection.farMeters, "camera.projection.farMeters");
  if (projection.farMeters <= projection.nearMeters) {
    throw new RangeError("camera.projection.farMeters must be greater than nearMeters.");
  }

  if (projection.kind === "perspective") {
    if (
      !Number.isFinite(projection.verticalFovRadians) ||
      projection.verticalFovRadians <= 0 ||
      projection.verticalFovRadians >= Math.PI
    ) {
      throw new RangeError("camera.projection.verticalFovRadians must be between 0 and PI.");
    }
    return Object.freeze({
      kind: "perspective" as const,
      verticalFovRadians: projection.verticalFovRadians,
      aspect: projection.aspect,
      nearMeters: projection.nearMeters,
      farMeters: projection.farMeters,
    });
  }

  assertPositiveFinite(projection.verticalSizeMeters, "camera.projection.verticalSizeMeters");
  return Object.freeze({
    kind: "orthographic" as const,
    verticalSizeMeters: projection.verticalSizeMeters,
    aspect: projection.aspect,
    nearMeters: projection.nearMeters,
    farMeters: projection.farMeters,
  });
}

/** Validates and defensively snapshots a serializable core camera state. */
export function createCameraState(state: CameraState): CameraState {
  assertValidFrameId(state.frame);
  const position = immutableVec3(state.position);
  const target = immutableVec3(state.target);
  const up = normalize(state.up, "camera.up");
  if (magnitude(subtract(position, target)) <= Number.EPSILON) {
    throw new RangeError("camera.position and camera.target must not be identical.");
  }
  return Object.freeze({
    frame: state.frame,
    position,
    target,
    up,
    projection: freezeProjection(state.projection),
  });
}

export function assertValidCameraState(state: CameraState): void {
  createCameraState(state);
}

function targetExtent(target: Bounds3 | FramedPoint3): TargetExtent {
  if ("min" in target) {
    assertValidBounds3(target);
    const halfX = (target.max[0] - target.min[0]) / 2;
    const halfY = (target.max[1] - target.min[1]) / 2;
    const halfZ = (target.max[2] - target.min[2]) / 2;
    return Object.freeze({
      frame: target.frame,
      center: immutableVec3([target.min[0] + halfX, target.min[1] + halfY, target.min[2] + halfZ]),
      horizontalRadius: Math.hypot(halfX, halfY),
      verticalRadius: halfZ,
      radius: Math.hypot(halfX, halfY, halfZ),
    });
  }

  assertValidFramedPoint3(target);
  return Object.freeze({
    frame: target.frame,
    center: immutableVec3(target.value),
    horizontalRadius: 0,
    verticalRadius: 0,
    radius: 0,
  });
}

function resolveInput(input: CameraSolveInput): {
  readonly extent: TargetExtent;
  readonly current?: CameraState;
  readonly paddingRatio: number;
} {
  assertPositiveFinite(input.viewportAspect, "viewportAspect");
  const extent = targetExtent(input.target);
  const paddingRatio = input.paddingRatio ?? DEFAULT_PADDING_RATIO;
  if (!Number.isFinite(paddingRatio) || paddingRatio < 0 || paddingRatio >= 1) {
    throw new RangeError(
      "paddingRatio must be finite and between 0 (inclusive) and 1 (exclusive).",
    );
  }

  if (input.current === undefined) {
    return Object.freeze({ extent, paddingRatio });
  }

  const current = createCameraState(input.current);
  if (current.frame !== extent.frame) {
    throw new FrameMismatchError(current.frame, extent.frame, "camera solve target");
  }
  return Object.freeze({ extent, current, paddingRatio });
}

function defaultProjection(aspect: number, radius: number): CameraProjection {
  return Object.freeze({
    kind: "perspective" as const,
    verticalFovRadians: DEFAULT_VERTICAL_FOV_RADIANS,
    aspect,
    nearMeters: DEFAULT_NEAR_METERS,
    farMeters: Math.max(DEFAULT_FAR_METERS, radius * 100),
  });
}

function projectionForTarget(
  current: CameraState | undefined,
  viewportAspect: number,
  extent: TargetExtent,
  paddingRatio: number,
): CameraProjection {
  const source = current?.projection ?? defaultProjection(viewportAspect, extent.radius);
  if (source.kind === "perspective") {
    return freezeProjection({ ...source, aspect: viewportAspect });
  }

  const verticalSizeMeters = Math.max(
    MINIMUM_TARGET_RADIUS_METERS * 2,
    2 *
      Math.max(extent.verticalRadius, extent.horizontalRadius / viewportAspect) *
      (1 + paddingRatio),
  );
  return freezeProjection({ ...source, aspect: viewportAspect, verticalSizeMeters });
}

function fittedDistance(
  projection: CameraProjection,
  extent: TargetExtent,
  paddingRatio: number,
): number {
  const horizontal = Math.max(extent.horizontalRadius, MINIMUM_TARGET_RADIUS_METERS);
  const vertical = Math.max(extent.verticalRadius, MINIMUM_TARGET_RADIUS_METERS);
  if (projection.kind === "orthographic") {
    return Math.max(extent.radius * 2, projection.nearMeters * 4, 1);
  }
  const halfVerticalFov = projection.verticalFovRadians / 2;
  const byHeight = vertical / Math.tan(halfVerticalFov);
  const byWidth = horizontal / (Math.tan(halfVerticalFov) * projection.aspect);
  return Math.max(byHeight, byWidth, MINIMUM_TARGET_RADIUS_METERS) * (1 + paddingRatio);
}

function directionFromCurrent(current: CameraState | undefined): Vec3 {
  if (current === undefined) {
    return normalize([1, -1, 0.78], "default camera direction");
  }
  return normalize(subtract(current.position, current.target), "camera position-target direction");
}

function cameraStateForTarget(input: CameraSolveInput, direction: Vec3, up: Vec3): CameraState {
  const resolved = resolveInput(input);
  const projection = projectionForTarget(
    resolved.current,
    input.viewportAspect,
    resolved.extent,
    resolved.paddingRatio,
  );
  const distance = fittedDistance(projection, resolved.extent, resolved.paddingRatio);
  return createCameraState({
    frame: resolved.extent.frame,
    position: add(resolved.extent.center, scale(direction, distance)),
    target: resolved.extent.center,
    up,
    projection,
  });
}

/** Computes a deterministic isometric home camera without a canvas or renderer. */
export function computeHomeCameraState(input: CameraSolveInput): CameraState {
  const resolved = resolveInput(input);
  return cameraStateForTarget(
    input,
    directionFromCurrent(resolved.current),
    resolved.current?.up ?? [0, 0, 1],
  );
}

/** Computes a deterministic top-down camera in the target's explicit core frame. */
export function computeTopCameraState(input: CameraSolveInput): CameraState {
  return cameraStateForTarget(input, [0, 0, 1], [0, 1, 0]);
}

/** Fits an explicit bounds or point target while preserving the active view direction. */
export function computeFocusCameraState(input: CameraSolveInput): CameraState {
  const resolved = resolveInput(input);
  return cameraStateForTarget(
    input,
    directionFromCurrent(resolved.current),
    resolved.current?.up ?? [0, 0, 1],
  );
}
