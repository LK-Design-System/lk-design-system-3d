import { assertValidVec3, type Vec3 } from "./coordinates.js";
import { createCameraState, type CameraState } from "./camera.js";

/** A closed polygon on the core XY ground plane, in metres. At least three vertices. */
export type Polygon2 = readonly (readonly [number, number])[];

/**
 * Samples the ground height (core +Z, metres) at a ground-plane point. Terrain data
 * belongs to the product; the camera solver only asks for heights.
 */
export type GroundHeightSampler = (x: number, y: number) => number;

/**
 * The maximum polar angle (measured from straight down, 0) tightens linearly
 * from `near` to `far` distance, so a distant camera cannot tilt up to the
 * horizon and expose the edge of the modelled site.
 */
export interface CameraPolarLimit {
  readonly nearDistanceMeters: number;
  readonly nearMaxPolarRadians: number;
  readonly farDistanceMeters: number;
  readonly farMaxPolarRadians: number;
}

export interface CameraConstraints {
  /** Where the camera eye may be, on the ground plane. */
  readonly positionPolygon?: Polygon2;
  /** Where the orbit target may be, on the ground plane. */
  readonly targetPolygon?: Polygon2;
  /** Minimum height of the eye above the sampled ground. */
  readonly groundClearanceMeters?: number;
  /** Minimum height of the target above the sampled ground. */
  readonly targetGroundClearanceMeters?: number;
  readonly minDistanceMeters?: number;
  readonly maxDistanceMeters?: number;
  readonly polarLimit?: CameraPolarLimit;
}

export interface CameraConstraintResult {
  readonly state: CameraState;
  /** Which rules moved the camera. Empty when the input already satisfied every rule. */
  readonly applied: readonly CameraConstraintRule[];
}

export type CameraConstraintRule =
  | "target-polygon"
  | "target-ground"
  | "distance"
  | "polar"
  | "position-polygon"
  | "position-ground";

function assertPolygon(polygon: Polygon2, label: string): void {
  if (polygon.length < 3) {
    throw new RangeError(`${label} must have at least three vertices.`);
  }
  for (const [index, vertex] of polygon.entries()) {
    if (!Number.isFinite(vertex[0]) || !Number.isFinite(vertex[1])) {
      throw new RangeError(`${label}[${index.toString()}] must be finite.`);
    }
  }
}

function assertNonNegative(value: number | undefined, label: string): void {
  if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
    throw new RangeError(`${label} must be a finite non-negative number.`);
  }
}

/** Even-odd point-in-polygon test on the ground plane. Points on an edge count as inside. */
export function isPointInPolygon2(x: number, y: number, polygon: Polygon2): boolean {
  assertPolygon(polygon, "polygon");
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    if (a === undefined || b === undefined) continue;
    if (distanceToSegment2(x, y, a, b).distance <= 1e-9) return true;
    const crosses =
      a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0];
    if (crosses) inside = !inside;
  }
  return inside;
}

function distanceToSegment2(
  x: number,
  y: number,
  a: readonly [number, number],
  b: readonly [number, number],
): { readonly distance: number; readonly point: readonly [number, number] } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.min(1, Math.max(0, ((x - a[0]) * dx + (y - a[1]) * dy) / lengthSquared));
  const point: readonly [number, number] = [a[0] + dx * t, a[1] + dy * t];
  return { distance: Math.hypot(x - point[0], y - point[1]), point };
}

/** The closest point on the polygon boundary. */
export function closestPointOnPolygon2(
  x: number,
  y: number,
  polygon: Polygon2,
): readonly [number, number] {
  assertPolygon(polygon, "polygon");
  let best: { readonly distance: number; readonly point: readonly [number, number] } | undefined;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (a === undefined || b === undefined) continue;
    const candidate = distanceToSegment2(x, y, a, b);
    if (best === undefined || candidate.distance < best.distance) best = candidate;
  }
  if (best === undefined) throw new RangeError("polygon has no edges.");
  return Object.freeze([best.point[0], best.point[1]] as const);
}

/** Returns the point unchanged when inside, otherwise the closest boundary point. */
export function clampPointToPolygon2(
  x: number,
  y: number,
  polygon: Polygon2,
): readonly [number, number] {
  return isPointInPolygon2(x, y, polygon)
    ? Object.freeze([x, y] as const)
    : closestPointOnPolygon2(x, y, polygon);
}

/**
 * Distance at which a sphere of `radiusMeters` fills a perspective view with the
 * given vertical FOV and aspect, plus a padding ratio.
 */
export function fitDistanceForRadius(
  radiusMeters: number,
  verticalFovRadians: number,
  aspect: number,
  paddingRatio = 0.12,
): number {
  if (!Number.isFinite(radiusMeters) || radiusMeters < 0) {
    throw new RangeError("radiusMeters must be a finite non-negative number.");
  }
  if (
    !Number.isFinite(verticalFovRadians) ||
    verticalFovRadians <= 0 ||
    verticalFovRadians >= Math.PI
  ) {
    throw new RangeError("verticalFovRadians must be between 0 and PI.");
  }
  if (!Number.isFinite(aspect) || aspect <= 0) {
    throw new RangeError("aspect must be a finite positive number.");
  }
  if (!Number.isFinite(paddingRatio) || paddingRatio < 0 || paddingRatio >= 1) {
    throw new RangeError("paddingRatio must be between 0 (inclusive) and 1 (exclusive).");
  }
  const halfVertical = verticalFovRadians / 2;
  const halfHorizontal = Math.atan(Math.tan(halfVertical) * aspect);
  const limiting = Math.min(halfVertical, halfHorizontal);
  return (radiusMeters / Math.sin(limiting)) * (1 + paddingRatio);
}

/** The maximum polar angle allowed at `distanceMeters` under a polar limit. */
export function maxPolarAngleAt(limit: CameraPolarLimit, distanceMeters: number): number {
  const { nearDistanceMeters, farDistanceMeters, nearMaxPolarRadians, farMaxPolarRadians } = limit;
  if (distanceMeters <= nearDistanceMeters) return nearMaxPolarRadians;
  if (distanceMeters >= farDistanceMeters) return farMaxPolarRadians;
  const t = (distanceMeters - nearDistanceMeters) / (farDistanceMeters - nearDistanceMeters);
  return nearMaxPolarRadians + (farMaxPolarRadians - nearMaxPolarRadians) * t;
}

function assertPolarLimit(limit: CameraPolarLimit): void {
  const values = [
    limit.nearDistanceMeters,
    limit.farDistanceMeters,
    limit.nearMaxPolarRadians,
    limit.farMaxPolarRadians,
  ];
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new RangeError("polarLimit values must be finite non-negative numbers.");
  }
  if (limit.farDistanceMeters <= limit.nearDistanceMeters) {
    throw new RangeError("polarLimit.farDistanceMeters must exceed nearDistanceMeters.");
  }
  if (limit.nearMaxPolarRadians > Math.PI || limit.farMaxPolarRadians > Math.PI) {
    throw new RangeError("polarLimit angles must not exceed PI.");
  }
}

/**
 * Moves a camera state into the allowed region. The target is constrained
 * first, then the eye relative to it (distance, then tilt), then the eye's own
 * ground-plane region and height. The view direction is preserved wherever a
 * rule allows it. Assumes the core +Z-up frame.
 */
export function applyCameraConstraints(
  state: CameraState,
  constraints: CameraConstraints,
  groundHeightAt?: GroundHeightSampler,
): CameraConstraintResult {
  const input = createCameraState(state);
  if (constraints.positionPolygon !== undefined) {
    assertPolygon(constraints.positionPolygon, "positionPolygon");
  }
  if (constraints.targetPolygon !== undefined)
    assertPolygon(constraints.targetPolygon, "targetPolygon");
  assertNonNegative(constraints.groundClearanceMeters, "groundClearanceMeters");
  assertNonNegative(constraints.targetGroundClearanceMeters, "targetGroundClearanceMeters");
  assertNonNegative(constraints.minDistanceMeters, "minDistanceMeters");
  assertNonNegative(constraints.maxDistanceMeters, "maxDistanceMeters");
  if (
    constraints.minDistanceMeters !== undefined &&
    constraints.maxDistanceMeters !== undefined &&
    constraints.maxDistanceMeters < constraints.minDistanceMeters
  ) {
    throw new RangeError("maxDistanceMeters must not be less than minDistanceMeters.");
  }
  if (constraints.polarLimit !== undefined) assertPolarLimit(constraints.polarLimit);

  const applied: CameraConstraintRule[] = [];
  const ground = (x: number, y: number): number | undefined => {
    if (groundHeightAt === undefined) return undefined;
    const height = groundHeightAt(x, y);
    if (!Number.isFinite(height))
      throw new RangeError("groundHeightAt must return a finite height.");
    return height;
  };

  let target: [number, number, number] = [input.target[0], input.target[1], input.target[2]];
  let offset: [number, number, number] = [
    input.position[0] - input.target[0],
    input.position[1] - input.target[1],
    input.position[2] - input.target[2],
  ];

  if (constraints.targetPolygon !== undefined) {
    const [x, y] = clampPointToPolygon2(target[0], target[1], constraints.targetPolygon);
    if (x !== target[0] || y !== target[1]) {
      target = [x, y, target[2]];
      applied.push("target-polygon");
    }
  }
  const targetGround = ground(target[0], target[1]);
  if (targetGround !== undefined) {
    const minimum = targetGround + (constraints.targetGroundClearanceMeters ?? 0);
    if (target[2] < minimum) {
      target = [target[0], target[1], minimum];
      applied.push("target-ground");
    }
  }

  let distance = Math.hypot(offset[0], offset[1], offset[2]);
  const minDistance = constraints.minDistanceMeters ?? 0;
  const maxDistance = constraints.maxDistanceMeters ?? Number.POSITIVE_INFINITY;
  const clampedDistance = Math.min(maxDistance, Math.max(minDistance, distance));
  if (clampedDistance !== distance && clampedDistance > 0) {
    const ratio = clampedDistance / distance;
    offset = [offset[0] * ratio, offset[1] * ratio, offset[2] * ratio];
    distance = clampedDistance;
    applied.push("distance");
  }

  if (constraints.polarLimit !== undefined && distance > 0) {
    const polar = Math.acos(Math.min(1, Math.max(-1, offset[2] / distance)));
    const maximum = maxPolarAngleAt(constraints.polarLimit, distance);
    if (polar > maximum) {
      const horizontal = Math.hypot(offset[0], offset[1]);
      const heading = horizontal > 0 ? Math.atan2(offset[1], offset[0]) : 0;
      offset = [
        Math.cos(heading) * Math.sin(maximum) * distance,
        Math.sin(heading) * Math.sin(maximum) * distance,
        Math.cos(maximum) * distance,
      ];
      applied.push("polar");
    }
  }

  let position: [number, number, number] = [
    target[0] + offset[0],
    target[1] + offset[1],
    target[2] + offset[2],
  ];
  if (constraints.positionPolygon !== undefined) {
    const [x, y] = clampPointToPolygon2(position[0], position[1], constraints.positionPolygon);
    if (x !== position[0] || y !== position[1]) {
      position = [x, y, position[2]];
      applied.push("position-polygon");
    }
  }
  const eyeGround = ground(position[0], position[1]);
  if (eyeGround !== undefined) {
    const minimum = eyeGround + (constraints.groundClearanceMeters ?? 0);
    if (position[2] < minimum) {
      position = [position[0], position[1], minimum];
      applied.push("position-ground");
    }
  }

  const next = createCameraState({ ...input, position: vec(position), target: vec(target) });
  return Object.freeze({ state: next, applied: Object.freeze(applied) });
}

function vec(value: readonly [number, number, number]): Vec3 {
  assertValidVec3(value);
  return value;
}
