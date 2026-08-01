import {
  FrameMismatchError,
  assertValidFrameId,
  bounds3,
  timestamp,
  type Bounds3,
  type ClockId,
  type FrameId,
  type Timestamp,
} from "@lk-design-system/lds-3d-core";

export type PointCloudRevision = string | number;
export type PointCloudBufferOwnership = "caller-retained";

export interface PointCloudSnapshotInput {
  /** Core-frame XYZ positions in metres, packed as x/y/z triples. */
  readonly positions: Float32Array;
  /** Optional linear RGB triples in the inclusive range [0, 1]. */
  readonly colors?: Float32Array;
  readonly frame: FrameId;
  /** A caller-defined immutable content revision used for replacement. */
  readonly revision: PointCloudRevision;
  readonly timestamp?: Timestamp;
}

/**
 * A finite, immutable-by-replacement point-cloud snapshot.
 *
 * `positions` and `colors` are caller-retained CPU buffers. LDS3D never
 * mutates, clones, detaches, or disposes them. Publish a fresh snapshot rather
 * than mutating a retained buffer in place; renderer adapters dispose only the
 * GPU resources they allocate from this data.
 */
export interface PointCloudSnapshot {
  readonly positions: Float32Array;
  readonly colors?: Float32Array;
  readonly frame: FrameId;
  readonly revision: PointCloudRevision;
  readonly timestamp?: Timestamp;
  readonly pointCount: number;
  readonly bounds: Bounds3 | null;
  readonly bufferOwnership: PointCloudBufferOwnership;
}

export type PointCloudRenderState =
  | {
      readonly kind: "ready";
      readonly requestedPointCount: number;
      /** Accepted for adapter creation; this does not claim a measured GPU draw. */
      readonly acceptedPointCount: number;
    }
  | {
      readonly kind: "empty";
      readonly requestedPointCount: 0;
      readonly acceptedPointCount: 0;
    }
  | {
      readonly kind: "frame-mismatch";
      readonly expectedFrame: FrameId;
      readonly actualFrame: FrameId;
      readonly requestedPointCount: number;
      readonly acceptedPointCount: 0;
    }
  | {
      readonly kind: "budget-exceeded";
      readonly maxPoints: number;
      readonly requestedPointCount: number;
      readonly acceptedPointCount: 0;
    };

export class PointCloudValidationError extends RangeError {
  override readonly name: string = "PointCloudValidationError";
}

function objectRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new PointCloudValidationError(`${label} must be an object.`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function assertRevision(value: unknown): asserts value is PointCloudRevision {
  if (typeof value === "string") {
    if (value.trim().length > 0) return;
  } else if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return;
  }
  throw new PointCloudValidationError(
    "revision must be a non-empty string or a non-negative safe integer.",
  );
}

function assertPositions(value: unknown): asserts value is Float32Array {
  if (!(value instanceof Float32Array)) {
    throw new PointCloudValidationError("positions must be a Float32Array.");
  }
  if (value.length % 3 !== 0) {
    throw new PointCloudValidationError("positions length must be divisible by 3.");
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Number.isFinite(value[index])) {
      throw new PointCloudValidationError(`positions[${index.toString()}] must be finite.`);
    }
  }
}

function assertColors(value: unknown, positionLength: number): asserts value is Float32Array {
  if (!(value instanceof Float32Array)) {
    throw new PointCloudValidationError("colors must be a Float32Array when provided.");
  }
  if (value.length !== positionLength) {
    throw new PointCloudValidationError("colors length must equal positions length.");
  }
  for (let index = 0; index < value.length; index += 1) {
    const component = value[index];
    if (component === undefined || !Number.isFinite(component) || component < 0 || component > 1) {
      throw new PointCloudValidationError(
        `colors[${index.toString()}] must be a finite linear RGB value in [0, 1].`,
      );
    }
  }
}

function normalizedTimestamp(value: unknown): Timestamp {
  const record = objectRecord(value, "timestamp");
  return timestamp(record.clock as ClockId, record.sec as number, record.nsec as number);
}

function deriveBounds(frame: FrameId, positions: Float32Array): Bounds3 | null {
  if (positions.length === 0) return null;
  let minX = positionComponentAt(positions, 0);
  let minY = positionComponentAt(positions, 1);
  let minZ = positionComponentAt(positions, 2);
  let maxX = minX;
  let maxY = minY;
  let maxZ = minZ;

  for (let index = 3; index < positions.length; index += 3) {
    const x = positionComponentAt(positions, index);
    const y = positionComponentAt(positions, index + 1);
    const z = positionComponentAt(positions, index + 2);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }
  return bounds3(frame, [minX, minY, minZ], [maxX, maxY, maxZ]);
}

function positionComponentAt(positions: Float32Array, index: number): number {
  const component = positions[index];
  if (component === undefined) {
    throw new PointCloudValidationError(
      `positions[${index.toString()}] is missing from an XYZ tuple.`,
    );
  }
  return component;
}

function assertBoundsEqual(actual: unknown, expected: Bounds3 | null): void {
  if (expected === null) {
    if (actual === null) return;
    throw new PointCloudValidationError("bounds must be null for an empty point cloud.");
  }
  const record = objectRecord(actual, "bounds");
  const min = record.min;
  const max = record.max;
  if (
    record.frame !== expected.frame ||
    !Array.isArray(min) ||
    !Array.isArray(max) ||
    min.length !== 3 ||
    max.length !== 3 ||
    min[0] !== expected.min[0] ||
    min[1] !== expected.min[1] ||
    min[2] !== expected.min[2] ||
    max[0] !== expected.max[0] ||
    max[1] !== expected.max[1] ||
    max[2] !== expected.max[2]
  ) {
    throw new PointCloudValidationError("bounds must exactly match the derived core-frame bounds.");
  }
}

function assertMaxPoints(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new PointCloudValidationError("maxPoints must be a positive safe integer.");
  }
}

export function createPointCloudSnapshot(input: PointCloudSnapshotInput): PointCloudSnapshot {
  const record = objectRecord(input, "PointCloudSnapshotInput");
  const frame = record.frame as FrameId;
  const positions = record.positions;
  const colors = record.colors;
  assertValidFrameId(frame);
  assertRevision(record.revision);
  assertPositions(positions);
  if (colors !== undefined) assertColors(colors, positions.length);
  const resolvedTimestamp =
    record.timestamp === undefined ? undefined : normalizedTimestamp(record.timestamp);
  const snapshot: PointCloudSnapshot = {
    positions,
    frame,
    revision: record.revision,
    pointCount: positions.length / 3,
    bounds: deriveBounds(frame, positions),
    bufferOwnership: "caller-retained",
    ...(colors === undefined ? {} : { colors }),
    ...(resolvedTimestamp === undefined ? {} : { timestamp: resolvedTimestamp }),
  };
  return Object.freeze(snapshot);
}

export function assertPointCloudSnapshot(value: unknown): asserts value is PointCloudSnapshot {
  const record = objectRecord(value, "PointCloudSnapshot");
  const frame = record.frame as FrameId;
  const positions = record.positions;
  const colors = record.colors;
  assertValidFrameId(frame);
  assertRevision(record.revision);
  assertPositions(positions);
  if (colors !== undefined) assertColors(colors, positions.length);
  if (record.timestamp !== undefined) normalizedTimestamp(record.timestamp);
  if (record.pointCount !== positions.length / 3) {
    throw new PointCloudValidationError("pointCount must be derived from positions length.");
  }
  if (record.bufferOwnership !== "caller-retained") {
    throw new PointCloudValidationError("bufferOwnership must be caller-retained.");
  }
  assertBoundsEqual(record.bounds, deriveBounds(frame, positions));
}

export function assertPointCloudFrame(snapshot: PointCloudSnapshot, sceneFrame: FrameId): void {
  assertPointCloudSnapshot(snapshot);
  assertValidFrameId(sceneFrame);
  if (snapshot.frame !== sceneFrame) {
    throw new FrameMismatchError(sceneFrame, snapshot.frame, "PointCloudSnapshot");
  }
}

export function resolvePointCloudRenderState(
  snapshot: PointCloudSnapshot,
  sceneFrame: FrameId,
  maxPoints: number,
): PointCloudRenderState {
  assertPointCloudSnapshot(snapshot);
  assertValidFrameId(sceneFrame);
  assertMaxPoints(maxPoints);
  if (snapshot.frame !== sceneFrame) {
    return Object.freeze({
      kind: "frame-mismatch",
      expectedFrame: sceneFrame,
      actualFrame: snapshot.frame,
      requestedPointCount: snapshot.pointCount,
      acceptedPointCount: 0,
    });
  }
  if (snapshot.pointCount === 0) {
    return Object.freeze({ kind: "empty", requestedPointCount: 0, acceptedPointCount: 0 });
  }
  if (snapshot.pointCount > maxPoints) {
    return Object.freeze({
      kind: "budget-exceeded",
      maxPoints,
      requestedPointCount: snapshot.pointCount,
      acceptedPointCount: 0,
    });
  }
  return Object.freeze({
    kind: "ready",
    requestedPointCount: snapshot.pointCount,
    acceptedPointCount: snapshot.pointCount,
  });
}
