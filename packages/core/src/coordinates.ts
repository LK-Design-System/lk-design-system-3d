import {
  assertValidFrameId,
  frameId,
  IdentifierValidationError,
  type Brand,
  type FrameId,
} from "./identifiers.js";

export { assertValidFrameId, frameId, IdentifierValidationError };
export type { Brand, FrameId };

export type Axis = "+X" | "-X" | "+Y" | "-Y" | "+Z" | "-Z";
export type Vec3 = readonly [number, number, number];
/** Quaternion component order is x, y, z, w. */
export type Quat = readonly [number, number, number, number];
/** Serialized column-major order, matching glTF matrix ordering. */
export type Mat4 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export interface CoordinateSystem {
  readonly handedness: "right" | "left";
  readonly upAxis: Axis;
  readonly forwardAxis: Axis;
  readonly metersPerUnit: number;
}

export const LK_CORE_COORDINATE_SYSTEM: CoordinateSystem = Object.freeze({
  handedness: "right",
  upAxis: "+Z",
  forwardAxis: "+X",
  metersPerUnit: 1,
});

export interface FramedPoint3 {
  readonly frame: FrameId;
  readonly value: Vec3;
}

export interface Pose3 {
  readonly frame: FrameId;
  readonly position: Vec3;
  readonly orientation: Quat;
}

export interface RigidTransform3 {
  readonly sourceFrame: FrameId;
  readonly targetFrame: FrameId;
  readonly translation: Vec3;
  readonly rotation: Quat;
}

export interface Bounds3 {
  readonly frame: FrameId;
  readonly min: Vec3;
  readonly max: Vec3;
}

export type CoordinateValidationCode =
  | "NON_FINITE_NUMBER"
  | "INVALID_VECTOR"
  | "INVALID_QUATERNION"
  | "NON_UNIT_QUATERNION"
  | "FRAME_MISMATCH"
  | "INVALID_BOUNDS";

export class CoordinateValidationError extends RangeError {
  override readonly name: string = "CoordinateValidationError";

  constructor(
    readonly code: CoordinateValidationCode,
    message: string,
  ) {
    super(message);
  }
}

export class FrameMismatchError extends CoordinateValidationError {
  override readonly name: string = "FrameMismatchError";

  constructor(
    readonly expectedFrame: FrameId,
    readonly actualFrame: FrameId,
    operation: string,
  ) {
    super(
      "FRAME_MISMATCH",
      `${operation}: expected frame ${JSON.stringify(expectedFrame)}, received ${JSON.stringify(actualFrame)}`,
    );
  }
}

export const QUATERNION_UNIT_TOLERANCE = 1e-6;

function assertFinite(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new CoordinateValidationError("NON_FINITE_NUMBER", `${label} must be a finite number`);
  }
}

function assertTupleLength(
  value: unknown,
  expectedLength: number,
  label: string,
  code: "INVALID_VECTOR" | "INVALID_QUATERNION" = "INVALID_VECTOR",
): asserts value is readonly number[] {
  if (!Array.isArray(value) || value.length !== expectedLength) {
    throw new CoordinateValidationError(
      code,
      `${label} must contain exactly ${expectedLength.toString()} components`,
    );
  }
}

export function assertValidVec3(value: unknown, label = "Vec3"): asserts value is Vec3 {
  assertTupleLength(value, 3, label);
  assertFinite(value[0], `${label}[0]`);
  assertFinite(value[1], `${label}[1]`);
  assertFinite(value[2], `${label}[2]`);
}

function quaternionNorm(value: Quat): number {
  return Math.hypot(value[0], value[1], value[2], value[3]);
}

export function assertValidQuaternion(value: unknown, label = "Quat"): asserts value is Quat {
  assertTupleLength(value, 4, `${label} in x, y, z, w order`, "INVALID_QUATERNION");
  assertFinite(value[0], `${label}[0]`);
  assertFinite(value[1], `${label}[1]`);
  assertFinite(value[2], `${label}[2]`);
  assertFinite(value[3], `${label}[3]`);
  const norm = Math.hypot(value[0], value[1], value[2], value[3]);
  if (!Number.isFinite(norm) || norm <= Number.EPSILON) {
    throw new CoordinateValidationError(
      "INVALID_QUATERNION",
      `${label} must have a finite, non-zero norm`,
    );
  }
}

export function assertUnitQuaternion(value: unknown, label = "Quat"): asserts value is Quat {
  assertValidQuaternion(value, label);
  const norm = quaternionNorm(value);
  if (Math.abs(norm - 1) > QUATERNION_UNIT_TOLERANCE) {
    throw new CoordinateValidationError(
      "NON_UNIT_QUATERNION",
      `${label} must be normalized; received norm ${norm.toString()}`,
    );
  }
}

export function normalizeQuaternion(value: Quat): Quat {
  assertValidQuaternion(value);
  const norm = quaternionNorm(value);
  const normalized: Quat = [value[0] / norm, value[1] / norm, value[2] / norm, value[3] / norm];
  return Object.freeze(normalized);
}

export function quaternionFromYaw(yawRadians: number): Quat {
  assertFinite(yawRadians, "yawRadians");
  const halfYaw = yawRadians / 2;
  return Object.freeze([0, 0, Math.sin(halfYaw), Math.cos(halfYaw)]);
}

export function vec3(x: number, y: number, z: number): Vec3 {
  const value: Vec3 = [x, y, z];
  assertValidVec3(value);
  return Object.freeze(value);
}

export function framedPoint3(frame: FrameId, value: Vec3): FramedPoint3 {
  assertValidFrameId(frame);
  assertValidVec3(value, "point.value");
  return Object.freeze({ frame, value: immutableVec3(value) });
}

export function pose3(frame: FrameId, position: Vec3, orientation: Quat): Pose3 {
  assertValidFrameId(frame);
  assertValidVec3(position, "pose.position");
  assertUnitQuaternion(orientation, "pose.orientation");
  return Object.freeze({
    frame,
    position: immutableVec3(position),
    orientation: normalizeQuaternion(orientation),
  });
}

export function rigidTransform3(
  sourceFrame: FrameId,
  targetFrame: FrameId,
  translation: Vec3,
  rotation: Quat,
): RigidTransform3 {
  assertValidFrameId(sourceFrame);
  assertValidFrameId(targetFrame);
  assertValidVec3(translation, "transform.translation");
  assertUnitQuaternion(rotation, "transform.rotation");
  return Object.freeze({
    sourceFrame,
    targetFrame,
    translation: immutableVec3(translation),
    rotation: normalizeQuaternion(rotation),
  });
}

export function bounds3(frame: FrameId, min: Vec3, max: Vec3): Bounds3 {
  const value: Bounds3 = { frame, min, max };
  assertValidBounds3(value);
  return Object.freeze({
    frame,
    min: immutableVec3(min),
    max: immutableVec3(max),
  });
}

export function assertValidFramedPoint3(value: FramedPoint3): void {
  assertValidFrameId(value.frame);
  assertValidVec3(value.value, "point.value");
}

export function assertValidPose3(value: Pose3): void {
  assertValidFrameId(value.frame);
  assertValidVec3(value.position, "pose.position");
  assertUnitQuaternion(value.orientation, "pose.orientation");
}

export function assertValidRigidTransform(value: RigidTransform3): void {
  assertValidFrameId(value.sourceFrame);
  assertValidFrameId(value.targetFrame);
  assertValidVec3(value.translation, "transform.translation");
  assertUnitQuaternion(value.rotation, "transform.rotation");
}

export function assertValidBounds3(value: Bounds3): void {
  assertValidFrameId(value.frame);
  assertValidVec3(value.min, "bounds.min");
  assertValidVec3(value.max, "bounds.max");
  let invalidAxis: number | undefined;
  if (value.min[0] > value.max[0]) {
    invalidAxis = 0;
  } else if (value.min[1] > value.max[1]) {
    invalidAxis = 1;
  } else if (value.min[2] > value.max[2]) {
    invalidAxis = 2;
  }
  if (invalidAxis !== undefined) {
    throw new CoordinateValidationError(
      "INVALID_BOUNDS",
      `bounds.min[${invalidAxis.toString()}] must be less than or equal to bounds.max[${invalidAxis.toString()}]`,
    );
  }
}

function quaternionMultiply(left: Quat, right: Quat): Quat {
  const [lx, ly, lz, lw] = left;
  const [rx, ry, rz, rw] = right;
  return [
    lw * rx + lx * rw + ly * rz - lz * ry,
    lw * ry - lx * rz + ly * rw + lz * rx,
    lw * rz + lx * ry - ly * rx + lz * rw,
    lw * rw - lx * rx - ly * ry - lz * rz,
  ];
}

function rotateVector(rotation: Quat, value: Vec3): Vec3 {
  const [x, y, z, w] = rotation;
  const [vx, vy, vz] = value;

  // q * [v, 0] * conjugate(q), expanded to avoid temporary allocations.
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);

  return [
    vx + w * tx + (y * tz - z * ty),
    vy + w * ty + (z * tx - x * tz),
    vz + w * tz + (x * ty - y * tx),
  ];
}

function add(left: Vec3, right: Vec3): Vec3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function cleanSignedZero(value: number): number {
  return value === 0 ? 0 : value;
}

function immutableVec3(value: Vec3): Vec3 {
  return Object.freeze([
    cleanSignedZero(value[0]),
    cleanSignedZero(value[1]),
    cleanSignedZero(value[2]),
  ]);
}

export function identityTransform(frame: FrameId): RigidTransform3 {
  return rigidTransform3(frame, frame, [0, 0, 0], [0, 0, 0, 1]);
}

export function invertTransform(value: RigidTransform3): RigidTransform3 {
  assertValidRigidTransform(value);
  const rotation = normalizeQuaternion(value.rotation);
  const inverseRotation: Quat = [-rotation[0], -rotation[1], -rotation[2], rotation[3]];
  const inverseTranslation = rotateVector(inverseRotation, [
    -value.translation[0],
    -value.translation[1],
    -value.translation[2],
  ]);
  return rigidTransform3(
    value.targetFrame,
    value.sourceFrame,
    immutableVec3(inverseTranslation),
    inverseRotation,
  );
}

export function composeTransforms(
  sourceToMiddle: RigidTransform3,
  middleToTarget: RigidTransform3,
): RigidTransform3 {
  assertValidRigidTransform(sourceToMiddle);
  assertValidRigidTransform(middleToTarget);
  if (sourceToMiddle.targetFrame !== middleToTarget.sourceFrame) {
    throw new FrameMismatchError(
      sourceToMiddle.targetFrame,
      middleToTarget.sourceFrame,
      "composeTransforms",
    );
  }

  const firstRotation = normalizeQuaternion(sourceToMiddle.rotation);
  const secondRotation = normalizeQuaternion(middleToTarget.rotation);
  const rotation = normalizeQuaternion(quaternionMultiply(secondRotation, firstRotation));
  const translation = add(
    rotateVector(secondRotation, sourceToMiddle.translation),
    middleToTarget.translation,
  );

  return rigidTransform3(
    sourceToMiddle.sourceFrame,
    middleToTarget.targetFrame,
    immutableVec3(translation),
    rotation,
  );
}

export function transformPoint(transform: RigidTransform3, point: FramedPoint3): FramedPoint3 {
  assertValidRigidTransform(transform);
  assertValidFramedPoint3(point);
  if (point.frame !== transform.sourceFrame) {
    throw new FrameMismatchError(transform.sourceFrame, point.frame, "transformPoint");
  }
  const rotation = normalizeQuaternion(transform.rotation);
  return Object.freeze({
    frame: transform.targetFrame,
    value: immutableVec3(add(rotateVector(rotation, point.value), transform.translation)),
  });
}

export function transformPose(transform: RigidTransform3, pose: Pose3): Pose3 {
  assertValidRigidTransform(transform);
  assertValidPose3(pose);
  if (pose.frame !== transform.sourceFrame) {
    throw new FrameMismatchError(transform.sourceFrame, pose.frame, "transformPose");
  }
  const transformRotation = normalizeQuaternion(transform.rotation);
  return Object.freeze({
    frame: transform.targetFrame,
    position: immutableVec3(
      add(rotateVector(transformRotation, pose.position), transform.translation),
    ),
    orientation: normalizeQuaternion(quaternionMultiply(transformRotation, pose.orientation)),
  });
}

export function transformToMatrix4(value: RigidTransform3): Mat4 {
  assertValidRigidTransform(value);
  const [x, y, z, w] = normalizeQuaternion(value.rotation);
  const xx = x * x;
  const yy = y * y;
  const zz = z * z;
  const xy = x * y;
  const xz = x * z;
  const yz = y * z;
  const wx = w * x;
  const wy = w * y;
  const wz = w * z;

  return Object.freeze([
    1 - 2 * (yy + zz),
    2 * (xy + wz),
    2 * (xz - wy),
    0,
    2 * (xy - wz),
    1 - 2 * (xx + zz),
    2 * (yz + wx),
    0,
    2 * (xz + wy),
    2 * (yz - wx),
    1 - 2 * (xx + yy),
    0,
    value.translation[0],
    value.translation[1],
    value.translation[2],
    1,
  ]);
}
