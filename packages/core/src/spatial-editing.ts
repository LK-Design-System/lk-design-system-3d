import { assertValidPose3, pose3, type Pose3, type Vec3 } from "./coordinates.js";
import { assertValidEntityId, type EntityId } from "./identifiers.js";

export type SpatialEditOperation = "delete" | "restore";

interface SpatialEditVolumeBase {
  readonly id: EntityId;
  readonly operation: SpatialEditOperation;
  readonly pose: Pose3;
}

export interface SpatialEditSphere extends SpatialEditVolumeBase {
  readonly kind: "sphere";
  readonly radiusMeters: number;
}

export interface SpatialEditBox extends SpatialEditVolumeBase {
  readonly kind: "box";
  readonly sizeMeters: Vec3;
}

/** Serializable, renderer-neutral intent. It never implies a destructive commit. */
export type SpatialEditVolume = SpatialEditSphere | SpatialEditBox;

function assertPositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a finite positive number.`);
  }
}

function immutablePose(value: Pose3): Pose3 {
  assertValidPose3(value);
  return pose3(value.frame, value.position, value.orientation);
}

function immutableSize(value: Vec3): Vec3 {
  assertPositive(value[0], "SpatialEditBox.sizeMeters[0]");
  assertPositive(value[1], "SpatialEditBox.sizeMeters[1]");
  assertPositive(value[2], "SpatialEditBox.sizeMeters[2]");
  return Object.freeze([value[0], value[1], value[2]]);
}

function assertOperation(value: unknown): asserts value is SpatialEditOperation {
  if (value !== "delete" && value !== "restore") {
    throw new RangeError(`Unsupported spatial edit operation ${JSON.stringify(value)}.`);
  }
}

export function createSpatialEditSphere(input: {
  readonly id: EntityId;
  readonly operation: SpatialEditOperation;
  readonly pose: Pose3;
  readonly radiusMeters: number;
}): SpatialEditSphere {
  assertValidEntityId(input.id);
  assertOperation(input.operation);
  assertPositive(input.radiusMeters, "SpatialEditSphere.radiusMeters");
  return Object.freeze({
    kind: "sphere",
    id: input.id,
    operation: input.operation,
    pose: immutablePose(input.pose),
    radiusMeters: input.radiusMeters,
  });
}

export function createSpatialEditBox(input: {
  readonly id: EntityId;
  readonly operation: SpatialEditOperation;
  readonly pose: Pose3;
  readonly sizeMeters: Vec3;
}): SpatialEditBox {
  assertValidEntityId(input.id);
  assertOperation(input.operation);
  return Object.freeze({
    kind: "box",
    id: input.id,
    operation: input.operation,
    pose: immutablePose(input.pose),
    sizeMeters: immutableSize(input.sizeMeters),
  });
}

export function assertValidSpatialEditVolume(value: SpatialEditVolume): void {
  assertValidEntityId(value.id);
  assertOperation(value.operation);
  assertValidPose3(value.pose);
  if (value.kind === "sphere") {
    assertPositive(value.radiusMeters, "SpatialEditSphere.radiusMeters");
    return;
  }
  immutableSize(value.sizeMeters);
}
