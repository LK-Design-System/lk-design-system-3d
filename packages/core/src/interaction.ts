import {
  FrameMismatchError,
  assertValidFrameId,
  assertValidVec3,
  framedPoint3,
  type FrameId,
  type FramedPoint3,
  type Vec3,
} from "./coordinates.js";
import { assertValidCameraState, type CameraState } from "./camera.js";
import type { EntityId, LayerId } from "./identifiers.js";
import type { Timestamp } from "./time.js";

export interface ViewportMetrics {
  readonly widthCssPixels: number;
  readonly heightCssPixels: number;
  readonly devicePixelRatio: number;
}

export interface ViewportPoint {
  /** CSS pixels from the viewport's top-left content edge. */
  readonly xCssPixels: number;
  readonly yCssPixels: number;
}

export interface PickRequest {
  readonly viewportPoint: ViewportPoint;
  readonly viewport: ViewportMetrics;
  readonly layers?: readonly LayerId[];
  readonly mode?: "closest" | "all";
}

export interface Ray3 {
  readonly frame: FrameId;
  readonly origin: Vec3;
  readonly direction: Vec3;
}

export interface Plane3 {
  readonly frame: FrameId;
  readonly point: Vec3;
  readonly normal: Vec3;
}

export interface FramedDirection3 {
  readonly frame: FrameId;
  readonly value: Vec3;
}

export interface PickHit {
  readonly entityId: EntityId;
  readonly point: FramedPoint3;
  readonly normal?: FramedDirection3;
  readonly distanceMeters: number;
  readonly layerId?: LayerId;
  readonly instanceId?: number;
}

export interface SelectionState {
  readonly selected: readonly EntityId[];
  readonly primary?: EntityId;
  readonly hovered?: EntityId;
}

export interface SpatialEvent {
  readonly type: "pointer-enter" | "pointer-leave" | "pointer-move" | "pick" | "pick-miss";
  readonly request: PickRequest;
  readonly hits: readonly PickHit[];
  readonly modifiers: {
    readonly alt: boolean;
    readonly ctrl: boolean;
    readonly meta: boolean;
    readonly shift: boolean;
  };
  readonly timestamp?: Timestamp;
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

function dot(left: Vec3, right: Vec3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross(left: Vec3, right: Vec3): Vec3 {
  return immutableVec3([
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ]);
}

function normalize(value: Vec3, label: string): Vec3 {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (!Number.isFinite(length) || length <= Number.EPSILON) {
    throw new RangeError(`${label} must have a finite non-zero length.`);
  }
  return scale(value, 1 / length);
}

function assertViewport(request: PickRequest): void {
  const { viewport, viewportPoint } = request;
  for (const [label, value] of [
    ["viewport.widthCssPixels", viewport.widthCssPixels],
    ["viewport.heightCssPixels", viewport.heightCssPixels],
    ["viewport.devicePixelRatio", viewport.devicePixelRatio],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(`${label} must be a finite positive number.`);
    }
  }
  for (const [label, value] of [
    ["viewportPoint.xCssPixels", viewportPoint.xCssPixels],
    ["viewportPoint.yCssPixels", viewportPoint.yCssPixels],
  ] as const) {
    if (!Number.isFinite(value)) {
      throw new RangeError(`${label} must be finite.`);
    }
  }
}

/**
 * Derives a core-frame ray from CSS-pixel viewport coordinates. DPR is validated
 * but intentionally not applied: callers pass CSS pixels, never device pixels.
 */
export function createPickRay(camera: CameraState, request: PickRequest): Ray3 {
  assertValidCameraState(camera);
  assertViewport(request);
  const forward = normalize(subtract(camera.target, camera.position), "camera forward");
  const right = normalize(cross(forward, camera.up), "camera forward cross up");
  const up = normalize(cross(right, forward), "camera pick up");
  const ndcX = (request.viewportPoint.xCssPixels / request.viewport.widthCssPixels) * 2 - 1;
  const ndcY = 1 - (request.viewportPoint.yCssPixels / request.viewport.heightCssPixels) * 2;

  if (camera.projection.kind === "orthographic") {
    const halfHeight = camera.projection.verticalSizeMeters / 2;
    const halfWidth = halfHeight * camera.projection.aspect;
    return Object.freeze({
      frame: camera.frame,
      origin: add(
        add(camera.position, scale(right, ndcX * halfWidth)),
        scale(up, ndcY * halfHeight),
      ),
      direction: forward,
    });
  }

  const tangent = Math.tan(camera.projection.verticalFovRadians / 2);
  return Object.freeze({
    frame: camera.frame,
    origin: immutableVec3(camera.position),
    direction: normalize(
      add(
        add(forward, scale(right, ndcX * tangent * camera.projection.aspect)),
        scale(up, ndcY * tangent),
      ),
      "perspective pick direction",
    ),
  });
}

/** Intersects a forward-only ray with a core-frame plane, or returns no hit. */
export function intersectRayWithPlane(ray: Ray3, plane: Plane3): FramedPoint3 | undefined {
  assertValidFrameId(ray.frame);
  assertValidVec3(ray.origin, "ray.origin");
  const direction = normalize(ray.direction, "ray.direction");
  assertValidFrameId(plane.frame);
  assertValidVec3(plane.point, "plane.point");
  const normal = normalize(plane.normal, "plane.normal");
  if (ray.frame !== plane.frame) {
    throw new FrameMismatchError(ray.frame, plane.frame, "intersectRayWithPlane");
  }
  const denominator = dot(direction, normal);
  if (Math.abs(denominator) <= 1e-12) {
    return undefined;
  }
  const distance = dot(subtract(plane.point, ray.origin), normal) / denominator;
  if (distance < 0) {
    return undefined;
  }
  return framedPoint3(ray.frame, add(ray.origin, scale(direction, distance)));
}
