import {
  applyCameraConstraints,
  clipCameraBoom,
  createCameraState,
  frameId,
  type CameraConstraints,
  type CameraState,
  type GroundHeightSampler,
  type Vec3,
} from "@lk-design-system/lds-3d-core";

import { coreToThreePosition, threeToCorePosition } from "./coordinates.js";

const RIG_FRAME = frameId("scene-camera-rig");

export interface ThreeCameraPlacement {
  /** Eye position in Three (Y-up) space. */
  readonly position: Vec3;
  /** Orbit target in Three space. */
  readonly target: Vec3;
}

export interface ThreeCameraPlacementResult extends ThreeCameraPlacement {
  readonly changed: boolean;
}

function coreState(placement: ThreeCameraPlacement): CameraState {
  return createCameraState({
    frame: RIG_FRAME,
    position: threeToCorePosition(placement.position),
    target: threeToCorePosition(placement.target),
    up: [0, 0, 1],
    projection: {
      kind: "perspective",
      verticalFovRadians: Math.PI / 4,
      aspect: 1,
      nearMeters: 0.05,
      farMeters: 10_000,
    },
  });
}

function sameVec(a: Vec3, b: Vec3): boolean {
  return (
    Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9 && Math.abs(a[2] - b[2]) < 1e-9
  );
}

/**
 * Applies core camera constraints to a Three-space eye and target. Returns the
 * input unchanged (and `changed: false`) when every rule already holds, so the
 * rig only writes back when it must.
 */
export function constrainThreeCameraPlacement(
  placement: ThreeCameraPlacement,
  constraints: CameraConstraints,
  groundHeightAt?: GroundHeightSampler,
): ThreeCameraPlacementResult {
  if (sameVec(placement.position, placement.target)) {
    return Object.freeze({ ...placement, changed: false });
  }
  const result = applyCameraConstraints(coreState(placement), constraints, groundHeightAt);
  if (result.applied.length === 0) return Object.freeze({ ...placement, changed: false });
  return Object.freeze({
    position: coreToThreePosition(result.state.position),
    target: coreToThreePosition(result.state.target),
    changed: true,
  });
}

/**
 * Pulls a Three-space eye in front of the first obstacle on the target→eye
 * ray. `obstacleDistanceMeters` comes from the host's raycast.
 */
export function clipThreeCameraBoom(
  placement: ThreeCameraPlacement,
  obstacleDistanceMeters: number | undefined,
  options?: { readonly marginMeters?: number; readonly minDistanceMeters?: number },
): ThreeCameraPlacementResult {
  if (obstacleDistanceMeters === undefined || sameVec(placement.position, placement.target)) {
    return Object.freeze({ ...placement, changed: false });
  }
  const before = coreState(placement);
  const after = clipCameraBoom(before, obstacleDistanceMeters, options);
  if (after === before || sameVec(after.position, before.position)) {
    return Object.freeze({ ...placement, changed: false });
  }
  return Object.freeze({
    position: coreToThreePosition(after.position),
    target: placement.target,
    changed: true,
  });
}

/** `userData` flag that marks a Three object as a camera obstacle for follow-mode boom clipping. */
export const CAMERA_OBSTACLE_USER_DATA_KEY = "lds3dCameraObstacle";
