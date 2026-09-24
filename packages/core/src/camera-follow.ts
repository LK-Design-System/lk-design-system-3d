import {
  FrameMismatchError,
  assertValidFrameId,
  assertValidVec3,
  type FrameId,
  type Vec3,
} from "./coordinates.js";
import { createCameraState, type CameraProjection, type CameraState } from "./camera.js";

/**
 * `third-person` trails behind the subject and looks at it; `first-person`
 * rides at eye height and looks ahead along the subject's heading.
 */
export type FollowCameraMode = "third-person" | "first-person";

export interface FollowCameraInput {
  readonly frame: FrameId;
  /** The subject's rendered position (after any smoothing), not the raw report. */
  readonly subjectPosition: Vec3;
  /** Yaw about core +Z in radians; 0 faces +X, counter-clockwise positive. */
  readonly headingRadians: number;
  readonly mode: FollowCameraMode;
  readonly projection: CameraProjection;
  /** third-person: horizontal distance behind the subject. Default 6 m. */
  readonly distanceMeters?: number;
  /** third-person: eye height above the subject. Default 3 m. */
  readonly heightMeters?: number;
  /** third-person: look-at height above the subject. Default 1 m. */
  readonly lookAtHeightMeters?: number;
  /** first-person: eye height above the subject. Default 1.2 m. */
  readonly eyeHeightMeters?: number;
  /** first-person: how far ahead the camera looks. Default 10 m. */
  readonly lookAheadMeters?: number;
}

/** Default follow offsets, in metres. */
export const FOLLOW_CAMERA_DEFAULTS = Object.freeze({
  distanceMeters: 6,
  heightMeters: 3,
  lookAtHeightMeters: 1,
  eyeHeightMeters: 1.2,
  lookAheadMeters: 10,
});

function positiveOrDefault(value: number | undefined, fallback: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a finite positive number.`);
  }
  return value;
}

function nonNegativeOrDefault(value: number | undefined, fallback: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a finite non-negative number.`);
  }
  return value;
}

/** Computes the follow camera for a subject pose. Deterministic; no renderer. */
export function computeFollowCameraState(input: FollowCameraInput): CameraState {
  assertValidFrameId(input.frame);
  assertValidVec3(input.subjectPosition, "subjectPosition");
  if (!Number.isFinite(input.headingRadians)) {
    throw new RangeError("headingRadians must be finite.");
  }
  const forward: Vec3 = [Math.cos(input.headingRadians), Math.sin(input.headingRadians), 0];
  const [sx, sy, sz] = input.subjectPosition;

  if (input.mode === "first-person") {
    const eye = nonNegativeOrDefault(
      input.eyeHeightMeters,
      FOLLOW_CAMERA_DEFAULTS.eyeHeightMeters,
      "eyeHeightMeters",
    );
    const ahead = positiveOrDefault(
      input.lookAheadMeters,
      FOLLOW_CAMERA_DEFAULTS.lookAheadMeters,
      "lookAheadMeters",
    );
    return createCameraState({
      frame: input.frame,
      position: [sx, sy, sz + eye],
      target: [sx + forward[0] * ahead, sy + forward[1] * ahead, sz + eye],
      up: [0, 0, 1],
      projection: input.projection,
    });
  }

  const distance = positiveOrDefault(
    input.distanceMeters,
    FOLLOW_CAMERA_DEFAULTS.distanceMeters,
    "distanceMeters",
  );
  const height = nonNegativeOrDefault(
    input.heightMeters,
    FOLLOW_CAMERA_DEFAULTS.heightMeters,
    "heightMeters",
  );
  const lookAt = nonNegativeOrDefault(
    input.lookAtHeightMeters,
    FOLLOW_CAMERA_DEFAULTS.lookAtHeightMeters,
    "lookAtHeightMeters",
  );
  return createCameraState({
    frame: input.frame,
    position: [sx - forward[0] * distance, sy - forward[1] * distance, sz + height],
    target: [sx, sy, sz + lookAt],
    up: [0, 0, 1],
    projection: input.projection,
  });
}

/** Smooth start and stop (quintic smootherstep). Maps [0, 1] to [0, 1]. */
export function easeInOutQuintic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/**
 * Transition progress for a camera move. Reduced motion completes immediately:
 * the camera jumps to the destination instead of travelling.
 */
export function cameraTransitionProgress(
  elapsedMs: number,
  durationMs: number,
  prefersReducedMotion: boolean,
): number {
  if (prefersReducedMotion) return 1;
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 1;
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  return Math.min(1, elapsedMs / durationMs);
}

/** Default follow-mode entry transition, from the LK field product (0.8 s). */
export const FOLLOW_CAMERA_TRANSITION_MS = 800;

/**
 * Interpolates two camera states in the same frame. `t` is already eased.
 * Position, target and up are blended linearly (up is re-normalized); the
 * destination projection is used throughout so near/far never flicker.
 */
export function interpolateCameraState(from: CameraState, to: CameraState, t: number): CameraState {
  const start = createCameraState(from);
  const end = createCameraState(to);
  if (start.frame !== end.frame) {
    throw new FrameMismatchError(start.frame, end.frame, "camera interpolation");
  }
  if (!Number.isFinite(t)) throw new RangeError("t must be finite.");
  const k = Math.min(1, Math.max(0, t));
  if (k === 1) return end;
  const mix = (a: Vec3, b: Vec3): Vec3 => [
    a[0] + (b[0] - a[0]) * k,
    a[1] + (b[1] - a[1]) * k,
    a[2] + (b[2] - a[2]) * k,
  ];
  const position = mix(start.position, end.position);
  let target = mix(start.target, end.target);
  if (
    Math.hypot(position[0] - target[0], position[1] - target[1], position[2] - target[2]) <=
    Number.EPSILON
  ) {
    target = end.target;
  }
  let up = mix(start.up, end.up);
  if (Math.hypot(up[0], up[1], up[2]) <= Number.EPSILON) up = end.up;
  return createCameraState({ frame: end.frame, position, target, up, projection: end.projection });
}

/**
 * Pulls the eye toward the target so it stays in front of the first obstacle
 * on the target→eye ray. The host measures `obstacleDistanceMeters` (a
 * raycast); this function only decides where the eye goes.
 */
export function clipCameraBoom(
  state: CameraState,
  obstacleDistanceMeters: number | undefined,
  options: { readonly marginMeters?: number; readonly minDistanceMeters?: number } = {},
): CameraState {
  const input = createCameraState(state);
  if (obstacleDistanceMeters === undefined) return input;
  if (!Number.isFinite(obstacleDistanceMeters) || obstacleDistanceMeters < 0) {
    throw new RangeError("obstacleDistanceMeters must be a finite non-negative number.");
  }
  const margin = nonNegativeOrDefault(options.marginMeters, 0.3, "marginMeters");
  const minimum = positiveOrDefault(options.minDistanceMeters, 0.5, "minDistanceMeters");
  const offset: Vec3 = [
    input.position[0] - input.target[0],
    input.position[1] - input.target[1],
    input.position[2] - input.target[2],
  ];
  const distance = Math.hypot(offset[0], offset[1], offset[2]);
  const allowed = Math.max(minimum, obstacleDistanceMeters - margin);
  if (allowed >= distance) return input;
  const ratio = allowed / distance;
  return createCameraState({
    ...input,
    position: [
      input.target[0] + offset[0] * ratio,
      input.target[1] + offset[1] * ratio,
      input.target[2] + offset[2] * ratio,
    ],
  });
}
