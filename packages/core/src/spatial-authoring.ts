import {
  assertValidFrameId,
  assertUnitQuaternion,
  assertValidVec3,
  normalizeQuaternion,
  pose3,
  quaternionFromYaw,
  type FrameId,
  type Pose3,
  type Quat,
  type Vec3,
} from "./coordinates.js";
import { assertValidEntityId, type EntityId } from "./identifiers.js";
import {
  assertValidSpatialNodeTransform,
  spatialNodeTransform,
  type SpatialNodeTransform,
} from "./spatial-structure.js";

export type SpatialTransformMode = "translate" | "rotate" | "scale";
export type SpatialTransformAxis = "x" | "y" | "z";
/**
 * `local` uses the node source-frame axes after its captured rotation. `target` uses the axes of
 * `SpatialNodeTransform.targetFrame`; it does not imply an ancestor-accumulated scene-world frame.
 */
export type SpatialTransformSpace = "local" | "target";
export type SpatialTransformChangePhase = "preview" | "commit" | "cancel";

export interface SpatialTransformSnap {
  readonly translationMeters: number;
  readonly rotationRadians: number;
  readonly scaleStep: number;
}

export interface SpatialTransformChange {
  readonly entityId: EntityId;
  readonly before: SpatialNodeTransform;
  readonly after: SpatialNodeTransform;
}

export interface SpatialTransformChangeSet {
  readonly mode: SpatialTransformMode;
  readonly axis: SpatialTransformAxis;
  readonly space: SpatialTransformSpace;
  readonly phase: SpatialTransformChangePhase;
  readonly snap: SpatialTransformSnap;
  readonly changes: readonly SpatialTransformChange[];
}

export interface SpatialTransformStepOptions {
  readonly mode: SpatialTransformMode;
  readonly axis: SpatialTransformAxis;
  readonly space?: SpatialTransformSpace;
  readonly direction?: -1 | 1;
  readonly snap?: Partial<SpatialTransformSnap>;
}

export interface SpatialTranslationDragSession {
  readonly entityId: EntityId;
  readonly axis: SpatialTransformAxis;
  readonly space: SpatialTransformSpace;
  readonly snap: SpatialTransformSnap;
  readonly before: SpatialNodeTransform;
}

export interface BeginSpatialTranslationDragOptions {
  readonly entityId: EntityId;
  readonly transform: SpatialNodeTransform;
  readonly axis: SpatialTransformAxis;
  readonly space?: SpatialTransformSpace;
  readonly snap?: Partial<SpatialTransformSnap>;
}

export interface SpatialRotationDragSession {
  readonly entityId: EntityId;
  readonly axis: SpatialTransformAxis;
  readonly space: SpatialTransformSpace;
  readonly snap: SpatialTransformSnap;
  readonly before: SpatialNodeTransform;
}

export interface BeginSpatialRotationDragOptions {
  readonly entityId: EntityId;
  readonly transform: SpatialNodeTransform;
  readonly axis: SpatialTransformAxis;
  readonly space?: SpatialTransformSpace;
  readonly snap?: Partial<SpatialTransformSnap>;
}

export interface SpatialScaleDragSession {
  readonly entityId: EntityId;
  readonly axis: SpatialTransformAxis;
  readonly space: "local";
  readonly snap: SpatialTransformSnap;
  readonly before: SpatialNodeTransform;
}

export interface BeginSpatialScaleDragOptions {
  readonly entityId: EntityId;
  readonly transform: SpatialNodeTransform;
  readonly axis: SpatialTransformAxis;
  readonly space?: SpatialTransformSpace;
  readonly snap?: Partial<SpatialTransformSnap>;
}

export const DEFAULT_SPATIAL_TRANSFORM_SNAP: SpatialTransformSnap = Object.freeze({
  translationMeters: 0.25,
  rotationRadians: Math.PI / 12,
  scaleStep: 0.1,
});

function assertPositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0)
    throw new RangeError(`${label} must be finite and positive.`);
}

function assertSpatialTransformMode(value: unknown): asserts value is SpatialTransformMode {
  if (value !== "translate" && value !== "rotate" && value !== "scale") {
    throw new RangeError(`Unsupported transform mode: ${String(value)}.`);
  }
}

function assertSpatialTransformAxis(value: unknown): asserts value is SpatialTransformAxis {
  if (value !== "x" && value !== "y" && value !== "z") {
    throw new RangeError(`Unsupported transform axis: ${String(value)}.`);
  }
}

function assertSpatialTransformSpace(value: unknown): asserts value is SpatialTransformSpace {
  if (value !== "local" && value !== "target") {
    throw new RangeError(`Unsupported transform space: ${String(value)}.`);
  }
}

function assertSpatialTransformChangePhase(
  value: unknown,
): asserts value is SpatialTransformChangePhase {
  if (value !== "preview" && value !== "commit" && value !== "cancel") {
    throw new RangeError(`Unsupported transform change phase: ${String(value)}.`);
  }
}

function assertSpatialTransformDirection(value: unknown): asserts value is -1 | 1 {
  if (value !== -1 && value !== 1) {
    throw new RangeError("Transform direction must be -1 or 1.");
  }
}

function assertSpatialTransformTerminalPhase(
  value: unknown,
): asserts value is Exclude<SpatialTransformChangePhase, "preview"> {
  if (value !== "commit" && value !== "cancel") {
    throw new RangeError("A transform drag can finish only with commit or cancel.");
  }
}

function immutableVec3(value: Vec3): Vec3 {
  return Object.freeze([
    value[0] === 0 ? 0 : value[0],
    value[1] === 0 ? 0 : value[1],
    value[2] === 0 ? 0 : value[2],
  ]);
}

function snapSignedValue(value: number, step: number): number {
  const unsnappedSteps = value / step;
  const snappedSteps = Math.sign(unsnappedSteps) * Math.floor(Math.abs(unsnappedSteps) + 0.5);
  return snappedSteps * step;
}

function maximumSafeNegativeScaleSteps(beforeComponent: number, step: number): number {
  const ratio = beforeComponent / step;
  if (!Number.isFinite(ratio) || ratio > Number.MAX_SAFE_INTEGER) return 0;
  let steps = Math.max(0, Math.ceil(ratio) - 1);
  if (steps === 0) return 0;
  const removed = steps * step;
  const remainder = beforeComponent - removed;
  const roundingTolerance =
    Number.EPSILON * 16 * Math.max(Math.abs(beforeComponent), Math.abs(removed), step);
  if (remainder <= roundingTolerance) steps -= 1;
  return steps;
}

export function spatialTransformSnap(
  value: Partial<SpatialTransformSnap> = {},
): SpatialTransformSnap {
  const snap: SpatialTransformSnap = {
    translationMeters: value.translationMeters ?? DEFAULT_SPATIAL_TRANSFORM_SNAP.translationMeters,
    rotationRadians: value.rotationRadians ?? DEFAULT_SPATIAL_TRANSFORM_SNAP.rotationRadians,
    scaleStep: value.scaleStep ?? DEFAULT_SPATIAL_TRANSFORM_SNAP.scaleStep,
  };
  assertPositive(snap.translationMeters, "snap.translationMeters");
  assertPositive(snap.rotationRadians, "snap.rotationRadians");
  assertPositive(snap.scaleStep, "snap.scaleStep");
  return Object.freeze(snap);
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
  assertUnitQuaternion(rotation, "transform.rotation");
  assertValidVec3(value, "axis vector");
  const [x, y, z, w] = rotation;
  const [vx, vy, vz] = value;
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return immutableVec3([
    vx + w * tx + (y * tz - z * ty),
    vy + w * ty + (z * tx - x * tz),
    vz + w * tz + (x * ty - y * tx),
  ]);
}

function axisVector(axis: SpatialTransformAxis): Vec3 {
  if (axis === "x") return [1, 0, 0];
  if (axis === "y") return [0, 1, 0];
  return [0, 0, 1];
}

function axisQuaternion(axis: SpatialTransformAxis, radians: number): Quat {
  const half = radians / 2;
  const sine = Math.sin(half);
  const vector = axisVector(axis);
  return normalizeQuaternion([
    vector[0] * sine,
    vector[1] * sine,
    vector[2] * sine,
    Math.cos(half),
  ]);
}

/** Applies one deterministic snapped transform step without owning history or persistence. */
export function stepSpatialNodeTransform(
  transform: SpatialNodeTransform,
  options: SpatialTransformStepOptions,
): SpatialNodeTransform {
  assertValidSpatialNodeTransform(transform);
  assertSpatialTransformMode(options.mode);
  assertSpatialTransformAxis(options.axis);
  const snap = spatialTransformSnap(options.snap);
  const direction: unknown = options.direction ?? 1;
  const space = options.space ?? "local";
  assertSpatialTransformSpace(space);
  assertSpatialTransformDirection(direction);
  if (options.mode === "scale" && space === "target") {
    throw new RangeError(
      "Target-frame non-uniform scale is not supported because it can synthesize shear.",
    );
  }

  let translation = transform.translation;
  let rotation = transform.rotation;
  let scale = transform.scale;
  if (options.mode === "translate") {
    const localAxis = axisVector(options.axis);
    const vector = space === "local" ? rotateVector(transform.rotation, localAxis) : localAxis;
    const distance = snap.translationMeters * direction;
    translation = immutableVec3([
      transform.translation[0] + vector[0] * distance,
      transform.translation[1] + vector[1] * distance,
      transform.translation[2] + vector[2] * distance,
    ]);
  } else if (options.mode === "rotate") {
    const delta = axisQuaternion(options.axis, snap.rotationRadians * direction);
    rotation = normalizeQuaternion(
      space === "local"
        ? quaternionMultiply(transform.rotation, delta)
        : quaternionMultiply(delta, transform.rotation),
    );
  } else {
    const index = options.axis === "x" ? 0 : options.axis === "y" ? 1 : 2;
    const next = transform.scale[index] + snap.scaleStep * direction;
    if (next <= 0) throw new RangeError("A scale step must keep every scale component positive.");
    scale = immutableVec3([
      index === 0 ? next : transform.scale[0],
      index === 1 ? next : transform.scale[1],
      index === 2 ? next : transform.scale[2],
    ]);
  }

  return spatialNodeTransform(
    transform.sourceFrame,
    transform.targetFrame,
    translation,
    rotation,
    scale,
  );
}

function sameVec3(left: Vec3, right: Vec3): boolean {
  return left[0] === right[0] && left[1] === right[1] && left[2] === right[2];
}

function sameQuaternion(left: Quat, right: Quat): boolean {
  return (
    left[0] === right[0] && left[1] === right[1] && left[2] === right[2] && left[3] === right[3]
  );
}

function sameSpatialNodeTransform(
  left: SpatialNodeTransform,
  right: SpatialNodeTransform,
): boolean {
  return (
    left.sourceFrame === right.sourceFrame &&
    left.targetFrame === right.targetFrame &&
    sameVec3(left.translation, right.translation) &&
    sameQuaternion(left.rotation, right.rotation) &&
    sameVec3(left.scale, right.scale)
  );
}

function cloneSpatialNodeTransform(transform: SpatialNodeTransform): SpatialNodeTransform {
  return spatialNodeTransform(
    transform.sourceFrame,
    transform.targetFrame,
    transform.translation,
    transform.rotation,
    transform.scale,
  );
}

/** Captures the immutable start snapshot used by every preview in one translation drag. */
export function beginSpatialTranslationDrag(
  options: BeginSpatialTranslationDragOptions,
): SpatialTranslationDragSession {
  assertValidEntityId(options.entityId);
  assertValidSpatialNodeTransform(options.transform);
  assertSpatialTransformAxis(options.axis);
  const space = options.space ?? "local";
  assertSpatialTransformSpace(space);
  return Object.freeze({
    entityId: options.entityId,
    axis: options.axis,
    space,
    snap: spatialTransformSnap(options.snap),
    before: cloneSpatialNodeTransform(options.transform),
  });
}

/** Captures the immutable start snapshot used by every preview in one rotation drag. */
export function beginSpatialRotationDrag(
  options: BeginSpatialRotationDragOptions,
): SpatialRotationDragSession {
  assertValidEntityId(options.entityId);
  assertValidSpatialNodeTransform(options.transform);
  assertSpatialTransformAxis(options.axis);
  const space = options.space ?? "local";
  assertSpatialTransformSpace(space);
  return Object.freeze({
    entityId: options.entityId,
    axis: options.axis,
    space,
    snap: spatialTransformSnap(options.snap),
    before: cloneSpatialNodeTransform(options.transform),
  });
}

/** Captures the immutable start snapshot used by every local-axis scale preview. */
export function beginSpatialScaleDrag(
  options: BeginSpatialScaleDragOptions,
): SpatialScaleDragSession {
  assertValidEntityId(options.entityId);
  assertValidSpatialNodeTransform(options.transform);
  assertSpatialTransformAxis(options.axis);
  const space = options.space ?? "local";
  assertSpatialTransformSpace(space);
  if (space === "target") {
    throw new RangeError(
      "Target-frame non-uniform scale is not supported because it can synthesize shear.",
    );
  }
  return Object.freeze({
    entityId: options.entityId,
    axis: options.axis,
    space: "local",
    snap: spatialTransformSnap(options.snap),
    before: cloneSpatialNodeTransform(options.transform),
  });
}

interface SpatialTransformDragSessionContract {
  readonly entityId: EntityId;
  readonly axis: SpatialTransformAxis;
  readonly space: SpatialTransformSpace;
  readonly snap: SpatialTransformSnap;
  readonly before: SpatialNodeTransform;
}

function assertValidSpatialTransformDragSession(
  session: SpatialTransformDragSessionContract,
): void {
  assertValidEntityId(session.entityId);
  assertSpatialTransformAxis(session.axis);
  assertSpatialTransformSpace(session.space);
  assertPositive(session.snap.translationMeters, "session.snap.translationMeters");
  assertPositive(session.snap.rotationRadians, "session.snap.rotationRadians");
  assertPositive(session.snap.scaleStep, "session.snap.scaleStep");
  assertValidSpatialNodeTransform(session.before, "session.before");
}

function assertValidSpatialTranslationDragSession(session: SpatialTranslationDragSession): void {
  assertValidSpatialTransformDragSession(session);
}

function assertValidSpatialRotationDragSession(session: SpatialRotationDragSession): void {
  assertValidSpatialTransformDragSession(session);
}

function assertValidSpatialScaleDragSession(session: SpatialScaleDragSession): void {
  assertValidSpatialTransformDragSession(session);
  const runtimeSpace: unknown = session.space;
  if (runtimeSpace !== "local") {
    throw new RangeError(
      "Target-frame non-uniform scale is not supported because it can synthesize shear.",
    );
  }
}

/**
 * Projects a signed drag distance onto the captured transform. The result is absolute from the
 * pointer-down snapshot, so applying previews in a controlled consumer cannot accumulate drift.
 */
export function previewSpatialTranslationDrag(
  session: SpatialTranslationDragSession,
  signedDistanceMeters: number,
): SpatialTransformChangeSet {
  assertValidSpatialTranslationDragSession(session);
  if (!Number.isFinite(signedDistanceMeters)) {
    throw new RangeError("signedDistanceMeters must be finite.");
  }
  const snappedDistance = snapSignedValue(signedDistanceMeters, session.snap.translationMeters);
  const baseAxis = axisVector(session.axis);
  const direction =
    session.space === "local" ? rotateVector(session.before.rotation, baseAxis) : baseAxis;
  const after = spatialNodeTransform(
    session.before.sourceFrame,
    session.before.targetFrame,
    [
      session.before.translation[0] + direction[0] * snappedDistance,
      session.before.translation[1] + direction[1] * snappedDistance,
      session.before.translation[2] + direction[2] * snappedDistance,
    ],
    session.before.rotation,
    session.before.scale,
  );
  return createSpatialTransformChangeSet({
    mode: "translate",
    axis: session.axis,
    space: session.space,
    phase: "preview",
    snap: session.snap,
    changes: [{ entityId: session.entityId, before: session.before, after }],
  });
}

function assertPreviewBelongsToTransformDrag(
  session: SpatialTransformDragSessionContract,
  preview: SpatialTransformChangeSet,
  mode: SpatialTransformMode,
): SpatialTransformChange {
  if (
    preview.mode !== mode ||
    preview.axis !== session.axis ||
    preview.space !== session.space ||
    preview.phase !== "preview" ||
    preview.snap.translationMeters !== session.snap.translationMeters ||
    preview.snap.rotationRadians !== session.snap.rotationRadians ||
    preview.snap.scaleStep !== session.snap.scaleStep ||
    preview.changes.length !== 1
  ) {
    throw new RangeError(`The preview does not belong to this ${mode} drag session.`);
  }
  const [change] = preview.changes;
  if (
    change === undefined ||
    change.entityId !== session.entityId ||
    !sameSpatialNodeTransform(change.before, session.before)
  ) {
    throw new RangeError(`The preview does not belong to this ${mode} drag session.`);
  }
  return change;
}

/** Creates the single terminal change set for a translation drag. */
export function finishSpatialTranslationDrag(
  session: SpatialTranslationDragSession,
  lastPreview: SpatialTransformChangeSet,
  phase: Exclude<SpatialTransformChangePhase, "preview">,
): SpatialTransformChangeSet {
  assertValidSpatialTranslationDragSession(session);
  assertSpatialTransformTerminalPhase(phase);
  const change = assertPreviewBelongsToTransformDrag(session, lastPreview, "translate");
  return createSpatialTransformChangeSet({
    mode: "translate",
    axis: session.axis,
    space: session.space,
    phase,
    snap: session.snap,
    changes: [
      {
        entityId: session.entityId,
        before: session.before,
        after: phase === "commit" ? change.after : session.before,
      },
    ],
  });
}

/**
 * Applies a signed accumulated angle to the pointer-down rotation. Callers may pass values beyond
 * ±π after unwrapping renderer input; every preview remains absolute from the captured snapshot.
 */
export function previewSpatialRotationDrag(
  session: SpatialRotationDragSession,
  signedAngleRadians: number,
): SpatialTransformChangeSet {
  assertValidSpatialRotationDragSession(session);
  if (!Number.isFinite(signedAngleRadians)) {
    throw new RangeError("signedAngleRadians must be finite.");
  }
  const snappedAngle = snapSignedValue(signedAngleRadians, session.snap.rotationRadians);
  const delta = axisQuaternion(session.axis, snappedAngle);
  const rotation = normalizeQuaternion(
    session.space === "local"
      ? quaternionMultiply(session.before.rotation, delta)
      : quaternionMultiply(delta, session.before.rotation),
  );
  const after = spatialNodeTransform(
    session.before.sourceFrame,
    session.before.targetFrame,
    session.before.translation,
    rotation,
    session.before.scale,
  );
  return createSpatialTransformChangeSet({
    mode: "rotate",
    axis: session.axis,
    space: session.space,
    phase: "preview",
    snap: session.snap,
    changes: [{ entityId: session.entityId, before: session.before, after }],
  });
}

/** Creates the single terminal change set for a rotation drag. */
export function finishSpatialRotationDrag(
  session: SpatialRotationDragSession,
  lastPreview: SpatialTransformChangeSet,
  phase: Exclude<SpatialTransformChangePhase, "preview">,
): SpatialTransformChangeSet {
  assertValidSpatialRotationDragSession(session);
  assertSpatialTransformTerminalPhase(phase);
  const change = assertPreviewBelongsToTransformDrag(session, lastPreview, "rotate");
  return createSpatialTransformChangeSet({
    mode: "rotate",
    axis: session.axis,
    space: session.space,
    phase,
    snap: session.snap,
    changes: [
      {
        entityId: session.entityId,
        before: session.before,
        after: phase === "commit" ? change.after : session.before,
      },
    ],
  });
}

/**
 * Applies a signed additive scale delta to the captured local-axis component. The lower bound is
 * the smallest positive value reachable on the start-relative snap grid, so dragging cannot
 * collapse or reflect an entity.
 */
export function previewSpatialScaleDrag(
  session: SpatialScaleDragSession,
  signedScaleDelta: number,
): SpatialTransformChangeSet {
  assertValidSpatialScaleDragSession(session);
  if (!Number.isFinite(signedScaleDelta)) {
    throw new RangeError("signedScaleDelta must be finite.");
  }
  const index = session.axis === "x" ? 0 : session.axis === "y" ? 1 : 2;
  const beforeComponent = session.before.scale[index];
  const desiredDelta = snapSignedValue(signedScaleDelta, session.snap.scaleStep);
  const maximumNegativeSteps = maximumSafeNegativeScaleSteps(
    beforeComponent,
    session.snap.scaleStep,
  );
  const minimumDelta = -maximumNegativeSteps * session.snap.scaleStep;
  const snappedDelta = Math.max(desiredDelta, minimumDelta);
  const nextComponent = beforeComponent + snappedDelta;
  if (!Number.isFinite(nextComponent) || nextComponent <= 0) {
    throw new RangeError("A scale drag must keep every scale component positive.");
  }
  const scale = immutableVec3([
    index === 0 ? nextComponent : session.before.scale[0],
    index === 1 ? nextComponent : session.before.scale[1],
    index === 2 ? nextComponent : session.before.scale[2],
  ]);
  const after = spatialNodeTransform(
    session.before.sourceFrame,
    session.before.targetFrame,
    session.before.translation,
    session.before.rotation,
    scale,
  );
  return createSpatialTransformChangeSet({
    mode: "scale",
    axis: session.axis,
    space: "local",
    phase: "preview",
    snap: session.snap,
    changes: [{ entityId: session.entityId, before: session.before, after }],
  });
}

/** Creates the single terminal change set for a scale drag. */
export function finishSpatialScaleDrag(
  session: SpatialScaleDragSession,
  lastPreview: SpatialTransformChangeSet,
  phase: Exclude<SpatialTransformChangePhase, "preview">,
): SpatialTransformChangeSet {
  assertValidSpatialScaleDragSession(session);
  assertSpatialTransformTerminalPhase(phase);
  const change = assertPreviewBelongsToTransformDrag(session, lastPreview, "scale");
  return createSpatialTransformChangeSet({
    mode: "scale",
    axis: session.axis,
    space: "local",
    phase,
    snap: session.snap,
    changes: [
      {
        entityId: session.entityId,
        before: session.before,
        after: phase === "commit" ? change.after : session.before,
      },
    ],
  });
}

export function createSpatialTransformChangeSet(
  value: Omit<SpatialTransformChangeSet, "snap"> & {
    readonly snap?: Partial<SpatialTransformSnap>;
  },
): SpatialTransformChangeSet {
  assertSpatialTransformMode(value.mode);
  assertSpatialTransformAxis(value.axis);
  assertSpatialTransformSpace(value.space);
  assertSpatialTransformChangePhase(value.phase);
  if (value.changes.length === 0) throw new RangeError("A transform change set requires a change.");
  const seen = new Set<EntityId>();
  const changes = value.changes.map((change) => {
    assertValidEntityId(change.entityId);
    if (seen.has(change.entityId))
      throw new RangeError(`Duplicate transform target: ${change.entityId}.`);
    seen.add(change.entityId);
    assertValidSpatialNodeTransform(change.before, `${change.entityId}.before`);
    assertValidSpatialNodeTransform(change.after, `${change.entityId}.after`);
    if (
      change.before.sourceFrame !== change.after.sourceFrame ||
      change.before.targetFrame !== change.after.targetFrame
    ) {
      throw new RangeError("A transform change cannot reparent or rename frames.");
    }
    return Object.freeze({
      entityId: change.entityId,
      before: spatialNodeTransform(
        change.before.sourceFrame,
        change.before.targetFrame,
        change.before.translation,
        change.before.rotation,
        change.before.scale,
      ),
      after: spatialNodeTransform(
        change.after.sourceFrame,
        change.after.targetFrame,
        change.after.translation,
        change.after.rotation,
        change.after.scale,
      ),
    });
  });
  return Object.freeze({
    mode: value.mode,
    axis: value.axis,
    space: value.space,
    phase: value.phase,
    snap: spatialTransformSnap(value.snap),
    changes: Object.freeze(changes),
  });
}

export type SpatialPointDraftKind = "polyline" | "polygon";
/** Shared linear tolerance for map-authoring validation and rendering adapters. */
export const SPATIAL_AUTHORING_LINEAR_EPSILON_METERS = 1e-7;
/** Shared minimum enclosed area for map-authoring polygons. */
export const SPATIAL_AUTHORING_AREA_EPSILON_SQUARE_METERS = 1e-7;
export type SpatialAuthoringIssueSeverity = "error";
export type SpatialAuthoringIssueCode =
  | "NON_FINITE_POINT"
  | "CONSECUTIVE_DUPLICATE_POINT"
  | "POINT_TOO_CLOSE"
  | "TOO_FEW_POINTS"
  | "NON_PLANAR_POLYGON"
  | "SELF_INTERSECTING_POLYGON"
  | "ZERO_XY_AREA"
  | "MISSING_DRAFT_POINT"
  | "GOAL_HEADING_TOO_SHORT";

export interface SpatialAuthoringIssue {
  readonly code: SpatialAuthoringIssueCode;
  readonly severity: SpatialAuthoringIssueSeverity;
  readonly message: string;
  /** Zero-based point index when the issue belongs to one point or cursor endpoint. */
  readonly index?: number;
}

export interface SpatialPointDraftSession {
  readonly kind: SpatialPointDraftKind;
  readonly frame: FrameId;
  /** Accepted draft vertices only. A product document is not mutated until it consumes a commit. */
  readonly committedPoints: readonly Vec3[];
  readonly previewPoint?: Vec3;
  readonly minPointDistanceMeters: number;
}

export interface BeginSpatialPointDraftOptions {
  readonly kind: SpatialPointDraftKind;
  readonly frame: FrameId;
  readonly committedPoints?: readonly Vec3[];
  readonly minPointDistanceMeters: number;
}

export interface SpatialPointDraftUpdate {
  readonly session: SpatialPointDraftSession;
  readonly issues: readonly SpatialAuthoringIssue[];
}

export interface SpatialPointDraftCommit {
  readonly status: "commit";
  readonly kind: SpatialPointDraftKind;
  readonly frame: FrameId;
  readonly points: readonly Vec3[];
  readonly issues: readonly [];
}

export interface SpatialPointDraftInvalid {
  readonly status: "invalid";
  readonly kind: SpatialPointDraftKind;
  readonly frame: FrameId;
  readonly points: readonly Vec3[];
  readonly issues: readonly SpatialAuthoringIssue[];
}

export type SpatialPointDraftFinishResult = SpatialPointDraftCommit | SpatialPointDraftInvalid;

export interface SpatialPointDraftCancelResult {
  readonly status: "cancel";
  readonly kind: SpatialPointDraftKind;
  readonly frame: FrameId;
}

export interface SpatialGoalPoseDragSession {
  readonly frame: FrameId;
  readonly origin: Vec3;
  readonly minHeadingDistanceMeters: number;
}

export interface BeginSpatialGoalPoseDragOptions {
  readonly frame: FrameId;
  readonly origin: Vec3;
  readonly minHeadingDistanceMeters: number;
}

export interface SpatialGoalPoseHeadingPreview {
  readonly frame: FrameId;
  readonly origin: Vec3;
  readonly cursor: Vec3;
  readonly minHeadingDistanceMeters: number;
  /** XY distance in the core frame. Z does not affect a Z-up yaw. */
  readonly distanceMeters?: number;
  /** Z-up heading in radians, measured from +X toward +Y. */
  readonly yawRadians?: number;
  readonly issues: readonly SpatialAuthoringIssue[];
}

export interface SpatialGoalPoseDragCommit {
  readonly status: "commit";
  readonly pose: Pose3;
  readonly yawRadians: number;
  readonly issues: readonly [];
}

export interface SpatialGoalPoseDragInvalid {
  readonly status: "invalid";
  readonly issues: readonly SpatialAuthoringIssue[];
}

export type SpatialGoalPoseDragFinishResult =
  | SpatialGoalPoseDragCommit
  | SpatialGoalPoseDragInvalid;

const EMPTY_SPATIAL_AUTHORING_ISSUES: readonly [] = Object.freeze([]);

function assertSpatialPointDraftKind(value: unknown): asserts value is SpatialPointDraftKind {
  if (value !== "polyline" && value !== "polygon") {
    throw new RangeError(`Unsupported spatial point draft kind: ${String(value)}.`);
  }
}

function spatialAuthoringIssue(
  code: SpatialAuthoringIssueCode,
  message: string,
  index?: number,
): SpatialAuthoringIssue {
  return Object.freeze(
    index === undefined
      ? { code, severity: "error", message }
      : { code, severity: "error", message, index },
  );
}

function immutableIssues(
  issues: readonly SpatialAuthoringIssue[],
): readonly SpatialAuthoringIssue[] {
  return Object.freeze(
    issues.map((issue) => spatialAuthoringIssue(issue.code, issue.message, issue.index)),
  );
}

function immutablePoints(points: readonly Vec3[]): readonly Vec3[] {
  return Object.freeze(points.map(immutableVec3));
}

function hasFinitePointComponents(value: unknown): value is Vec3 {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    typeof value[0] === "number" &&
    Number.isFinite(value[0]) &&
    typeof value[1] === "number" &&
    Number.isFinite(value[1]) &&
    typeof value[2] === "number" &&
    Number.isFinite(value[2])
  );
}

function pointDistance(left: Vec3, right: Vec3): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function xyOrientation(first: Vec3, second: Vec3, third: Vec3): number {
  return (
    (second[0] - first[0]) * (third[1] - first[1]) - (second[1] - first[1]) * (third[0] - first[0])
  );
}

function pointOnXySegment(point: Vec3, start: Vec3, end: Vec3): boolean {
  return (
    Math.abs(xyOrientation(start, end, point)) <= SPATIAL_AUTHORING_AREA_EPSILON_SQUARE_METERS &&
    point[0] >= Math.min(start[0], end[0]) - SPATIAL_AUTHORING_LINEAR_EPSILON_METERS &&
    point[0] <= Math.max(start[0], end[0]) + SPATIAL_AUTHORING_LINEAR_EPSILON_METERS &&
    point[1] >= Math.min(start[1], end[1]) - SPATIAL_AUTHORING_LINEAR_EPSILON_METERS &&
    point[1] <= Math.max(start[1], end[1]) + SPATIAL_AUTHORING_LINEAR_EPSILON_METERS
  );
}

function oppositeXyOrientations(first: number, second: number): boolean {
  return (
    (first > SPATIAL_AUTHORING_AREA_EPSILON_SQUARE_METERS &&
      second < -SPATIAL_AUTHORING_AREA_EPSILON_SQUARE_METERS) ||
    (first < -SPATIAL_AUTHORING_AREA_EPSILON_SQUARE_METERS &&
      second > SPATIAL_AUTHORING_AREA_EPSILON_SQUARE_METERS)
  );
}

function xySegmentsIntersect(
  firstStart: Vec3,
  firstEnd: Vec3,
  secondStart: Vec3,
  secondEnd: Vec3,
): boolean {
  const firstToSecondStart = xyOrientation(firstStart, firstEnd, secondStart);
  const firstToSecondEnd = xyOrientation(firstStart, firstEnd, secondEnd);
  const secondToFirstStart = xyOrientation(secondStart, secondEnd, firstStart);
  const secondToFirstEnd = xyOrientation(secondStart, secondEnd, firstEnd);
  if (
    oppositeXyOrientations(firstToSecondStart, firstToSecondEnd) &&
    oppositeXyOrientations(secondToFirstStart, secondToFirstEnd)
  ) {
    return true;
  }
  return (
    (Math.abs(firstToSecondStart) <= SPATIAL_AUTHORING_AREA_EPSILON_SQUARE_METERS &&
      pointOnXySegment(secondStart, firstStart, firstEnd)) ||
    (Math.abs(firstToSecondEnd) <= SPATIAL_AUTHORING_AREA_EPSILON_SQUARE_METERS &&
      pointOnXySegment(secondEnd, firstStart, firstEnd)) ||
    (Math.abs(secondToFirstStart) <= SPATIAL_AUTHORING_AREA_EPSILON_SQUARE_METERS &&
      pointOnXySegment(firstStart, secondStart, secondEnd)) ||
    (Math.abs(secondToFirstEnd) <= SPATIAL_AUTHORING_AREA_EPSILON_SQUARE_METERS &&
      pointOnXySegment(firstEnd, secondStart, secondEnd))
  );
}

function polygonSelfIntersects(points: readonly Vec3[]): boolean {
  for (let firstIndex = 0; firstIndex < points.length; firstIndex += 1) {
    const firstStart = points[firstIndex];
    const firstEnd = points[(firstIndex + 1) % points.length];
    if (firstStart === undefined || firstEnd === undefined) continue;
    for (let secondIndex = firstIndex + 1; secondIndex < points.length; secondIndex += 1) {
      const adjacent =
        secondIndex === firstIndex + 1 || (firstIndex === 0 && secondIndex === points.length - 1);
      if (adjacent) continue;
      const secondStart = points[secondIndex];
      const secondEnd = points[(secondIndex + 1) % points.length];
      if (
        secondStart !== undefined &&
        secondEnd !== undefined &&
        xySegmentsIntersect(firstStart, firstEnd, secondStart, secondEnd)
      ) {
        return true;
      }
    }
  }
  return false;
}

function pointCandidateIssues(
  point: unknown,
  index: number,
  previous: Vec3 | undefined,
  minPointDistanceMeters: number,
): readonly SpatialAuthoringIssue[] {
  if (!hasFinitePointComponents(point)) {
    return immutableIssues([
      spatialAuthoringIssue(
        "NON_FINITE_POINT",
        `Draft point ${index.toString()} must contain exactly three finite meter values.`,
        index,
      ),
    ]);
  }
  if (previous === undefined || !hasFinitePointComponents(previous)) return Object.freeze([]);
  if (sameVec3(previous, point)) {
    return immutableIssues([
      spatialAuthoringIssue(
        "CONSECUTIVE_DUPLICATE_POINT",
        `Draft point ${index.toString()} duplicates the preceding point.`,
        index,
      ),
    ]);
  }
  const distance = pointDistance(previous, point);
  const effectiveMinimum = Math.max(
    minPointDistanceMeters,
    SPATIAL_AUTHORING_LINEAR_EPSILON_METERS,
  );
  if (distance <= SPATIAL_AUTHORING_LINEAR_EPSILON_METERS || distance < minPointDistanceMeters) {
    return immutableIssues([
      spatialAuthoringIssue(
        "POINT_TOO_CLOSE",
        `Draft point ${index.toString()} is ${distance.toString()} m from the preceding point; the minimum is ${effectiveMinimum.toString()} m.`,
        index,
      ),
    ]);
  }
  return Object.freeze([]);
}

function createSpatialPointDraftSession(
  kind: SpatialPointDraftKind,
  frame: FrameId,
  committedPoints: readonly Vec3[],
  minPointDistanceMeters: number,
  previewPoint?: Vec3,
): SpatialPointDraftSession {
  const base = {
    kind,
    frame,
    committedPoints: immutablePoints(committedPoints),
    minPointDistanceMeters,
  };
  return Object.freeze(
    previewPoint === undefined ? base : { ...base, previewPoint: immutableVec3(previewPoint) },
  );
}

function createSpatialPointDraftUpdate(
  session: SpatialPointDraftSession,
  issues: readonly SpatialAuthoringIssue[],
): SpatialPointDraftUpdate {
  return Object.freeze({ session, issues: immutableIssues(issues) });
}

function assertValidSpatialPointDraftSession(session: SpatialPointDraftSession): void {
  assertSpatialPointDraftKind(session.kind);
  assertValidFrameId(session.frame);
  assertPositive(session.minPointDistanceMeters, "session.minPointDistanceMeters");
  if (!Array.isArray(session.committedPoints)) {
    throw new TypeError("session.committedPoints must be an array.");
  }
}

/** Starts a renderer-neutral polyline or polygon draft in one explicit core frame. */
export function beginSpatialPointDraft(
  options: BeginSpatialPointDraftOptions,
): SpatialPointDraftSession {
  assertSpatialPointDraftKind(options.kind);
  assertValidFrameId(options.frame);
  assertPositive(options.minPointDistanceMeters, "minPointDistanceMeters");
  return createSpatialPointDraftSession(
    options.kind,
    options.frame,
    options.committedPoints ?? [],
    options.minPointDistanceMeters,
  );
}

/** Replaces only the transient cursor preview; it never appends to a product document. */
export function previewSpatialPointDraftCursor(
  session: SpatialPointDraftSession,
  point: Vec3,
): SpatialPointDraftUpdate {
  assertValidSpatialPointDraftSession(session);
  const index = session.committedPoints.length;
  const issues = pointCandidateIssues(
    point,
    index,
    session.committedPoints[index - 1],
    session.minPointDistanceMeters,
  );
  if (!hasFinitePointComponents(point)) return createSpatialPointDraftUpdate(session, issues);
  return createSpatialPointDraftUpdate(
    createSpatialPointDraftSession(
      session.kind,
      session.frame,
      session.committedPoints,
      session.minPointDistanceMeters,
      point,
    ),
    issues,
  );
}

/** Appends one valid point to draft state and clears its preview; no document mutation is owned. */
export function appendSpatialPointDraftPoint(
  session: SpatialPointDraftSession,
  point: Vec3 | undefined = session.previewPoint,
): SpatialPointDraftUpdate {
  assertValidSpatialPointDraftSession(session);
  const index = session.committedPoints.length;
  if (point === undefined) {
    return createSpatialPointDraftUpdate(session, [
      spatialAuthoringIssue(
        "MISSING_DRAFT_POINT",
        "Appending a draft point requires an explicit point or current preview point.",
        index,
      ),
    ]);
  }
  const issues = pointCandidateIssues(
    point,
    index,
    session.committedPoints[index - 1],
    session.minPointDistanceMeters,
  );
  if (issues.length > 0) return createSpatialPointDraftUpdate(session, issues);
  return createSpatialPointDraftUpdate(
    createSpatialPointDraftSession(
      session.kind,
      session.frame,
      [...session.committedPoints, point],
      session.minPointDistanceMeters,
    ),
    [],
  );
}

/** Removes only the last draft vertex, preserving the prior immutable session snapshot. */
export function removeLastSpatialPointDraftPoint(
  session: SpatialPointDraftSession,
): SpatialPointDraftUpdate {
  assertValidSpatialPointDraftSession(session);
  const points = session.committedPoints.slice(0, -1);
  const next = createSpatialPointDraftSession(
    session.kind,
    session.frame,
    points,
    session.minPointDistanceMeters,
    session.previewPoint,
  );
  if (next.previewPoint === undefined) return createSpatialPointDraftUpdate(next, []);
  return createSpatialPointDraftUpdate(
    next,
    pointCandidateIssues(
      next.previewPoint,
      next.committedPoints.length,
      next.committedPoints[next.committedPoints.length - 1],
      next.minPointDistanceMeters,
    ),
  );
}

/** Returns all terminal validation issues for committed draft vertices. */
export function validateSpatialPointDraft(
  session: SpatialPointDraftSession,
): readonly SpatialAuthoringIssue[] {
  assertValidSpatialPointDraftSession(session);
  const issues: SpatialAuthoringIssue[] = [];
  for (const [index, point] of session.committedPoints.entries()) {
    issues.push(
      ...pointCandidateIssues(
        point,
        index,
        session.committedPoints[index - 1],
        session.minPointDistanceMeters,
      ),
    );
  }

  const minimumPoints = session.kind === "polyline" ? 2 : 3;
  if (session.committedPoints.length < minimumPoints) {
    issues.push(
      spatialAuthoringIssue(
        "TOO_FEW_POINTS",
        `A ${session.kind} requires at least ${minimumPoints.toString()} committed points.`,
        session.committedPoints.length,
      ),
    );
  }

  const allFinite = session.committedPoints.every(hasFinitePointComponents);
  if (session.kind === "polygon" && session.committedPoints.length >= 3 && allFinite) {
    const lastIndex = session.committedPoints.length - 1;
    const closingIssues = pointCandidateIssues(
      session.committedPoints[0],
      lastIndex,
      session.committedPoints[lastIndex],
      session.minPointDistanceMeters,
    );
    issues.push(...closingIssues);

    let twiceArea = 0;
    for (const [index, point] of session.committedPoints.entries()) {
      const next = session.committedPoints[(index + 1) % session.committedPoints.length];
      if (next !== undefined) twiceArea += point[0] * next[1] - next[0] * point[1];
    }
    if (Math.abs(twiceArea) <= SPATIAL_AUTHORING_AREA_EPSILON_SQUARE_METERS * 2) {
      issues.push(
        spatialAuthoringIssue(
          "ZERO_XY_AREA",
          "A polygon must enclose non-zero area in the core-frame XY plane.",
        ),
      );
    }
    const firstElevation = session.committedPoints[0]?.[2];
    if (
      firstElevation !== undefined &&
      session.committedPoints.some(
        (point) => Math.abs(point[2] - firstElevation) > SPATIAL_AUTHORING_LINEAR_EPSILON_METERS,
      )
    ) {
      issues.push(
        spatialAuthoringIssue(
          "NON_PLANAR_POLYGON",
          "A polygon must keep every vertex on one core-frame XY elevation.",
        ),
      );
    }
    if (polygonSelfIntersects(session.committedPoints)) {
      issues.push(
        spatialAuthoringIssue(
          "SELF_INTERSECTING_POLYGON",
          "A polygon ring must not cross or touch a non-adjacent edge.",
        ),
      );
    }
    for (let firstIndex = 0; firstIndex < session.committedPoints.length; firstIndex += 1) {
      for (
        let secondIndex = firstIndex + 1;
        secondIndex < session.committedPoints.length;
        secondIndex += 1
      ) {
        const adjacent =
          secondIndex === firstIndex + 1 ||
          (firstIndex === 0 && secondIndex === session.committedPoints.length - 1);
        if (adjacent) continue;
        const first = session.committedPoints[firstIndex];
        const second = session.committedPoints[secondIndex];
        if (
          first !== undefined &&
          second !== undefined &&
          pointDistance(first, second) <= SPATIAL_AUTHORING_LINEAR_EPSILON_METERS
        ) {
          issues.push(
            spatialAuthoringIssue(
              "POINT_TOO_CLOSE",
              `Draft point ${secondIndex.toString()} is indistinguishable from non-adjacent point ${firstIndex.toString()} at the shared authoring tolerance.`,
              secondIndex,
            ),
          );
        }
      }
    }
  }
  return immutableIssues(issues);
}

/** Produces a detached commit payload only when the draft is valid. */
export function finishSpatialPointDraft(
  session: SpatialPointDraftSession,
): SpatialPointDraftFinishResult {
  assertValidSpatialPointDraftSession(session);
  const issues = validateSpatialPointDraft(session);
  const points = immutablePoints(session.committedPoints);
  if (issues.length > 0) {
    return Object.freeze({
      status: "invalid",
      kind: session.kind,
      frame: session.frame,
      points,
      issues,
    });
  }
  return Object.freeze({
    status: "commit",
    kind: session.kind,
    frame: session.frame,
    points,
    issues: EMPTY_SPATIAL_AUTHORING_ISSUES,
  });
}

/** Terminates draft interaction without returning points that a document could accidentally apply. */
export function cancelSpatialPointDraft(
  session: SpatialPointDraftSession,
): SpatialPointDraftCancelResult {
  assertValidSpatialPointDraftSession(session);
  return Object.freeze({ status: "cancel", kind: session.kind, frame: session.frame });
}

/** Captures a goal origin. Heading is always a Z-up yaw in this same core frame. */
export function beginSpatialGoalPoseDrag(
  options: BeginSpatialGoalPoseDragOptions,
): SpatialGoalPoseDragSession {
  assertValidFrameId(options.frame);
  assertValidVec3(options.origin, "origin");
  assertPositive(options.minHeadingDistanceMeters, "minHeadingDistanceMeters");
  return Object.freeze({
    frame: options.frame,
    origin: immutableVec3(options.origin),
    minHeadingDistanceMeters: options.minHeadingDistanceMeters,
  });
}

/** Computes a +X-to-+Y yaw in radians from the captured origin to an XY cursor. */
export function previewSpatialGoalPoseHeading(
  session: SpatialGoalPoseDragSession,
  cursor: Vec3,
): SpatialGoalPoseHeadingPreview {
  assertValidFrameId(session.frame);
  assertValidVec3(session.origin, "session.origin");
  assertPositive(session.minHeadingDistanceMeters, "session.minHeadingDistanceMeters");
  if (!hasFinitePointComponents(cursor)) {
    return Object.freeze({
      frame: session.frame,
      origin: immutableVec3(session.origin),
      cursor: immutableVec3(cursor),
      minHeadingDistanceMeters: session.minHeadingDistanceMeters,
      issues: immutableIssues([
        spatialAuthoringIssue(
          "NON_FINITE_POINT",
          "The goal heading cursor must contain exactly three finite meter values.",
          1,
        ),
      ]),
    });
  }
  const deltaX = cursor[0] - session.origin[0];
  const deltaY = cursor[1] - session.origin[1];
  const distanceMeters = Math.hypot(deltaX, deltaY);
  const yawRadians = Math.atan2(deltaY, deltaX);
  const issues =
    distanceMeters < session.minHeadingDistanceMeters
      ? immutableIssues([
          spatialAuthoringIssue(
            "GOAL_HEADING_TOO_SHORT",
            `Goal heading drag is ${distanceMeters.toString()} m in XY; the minimum is ${session.minHeadingDistanceMeters.toString()} m.`,
            1,
          ),
        ])
      : Object.freeze([]);
  return Object.freeze({
    frame: session.frame,
    origin: immutableVec3(session.origin),
    cursor: immutableVec3(cursor),
    minHeadingDistanceMeters: session.minHeadingDistanceMeters,
    distanceMeters,
    yawRadians,
    issues,
  });
}

function goalPosePreviewBelongsToSession(
  session: SpatialGoalPoseDragSession,
  preview: SpatialGoalPoseHeadingPreview,
): boolean {
  return (
    preview.frame === session.frame &&
    sameVec3(preview.origin, session.origin) &&
    preview.minHeadingDistanceMeters === session.minHeadingDistanceMeters
  );
}

/** Finishes with a core-frame Pose3 only after a valid heading preview. */
export function finishSpatialGoalPoseDrag(
  session: SpatialGoalPoseDragSession,
  preview: SpatialGoalPoseHeadingPreview,
): SpatialGoalPoseDragFinishResult {
  assertValidFrameId(session.frame);
  assertValidVec3(session.origin, "session.origin");
  assertPositive(session.minHeadingDistanceMeters, "session.minHeadingDistanceMeters");
  if (!goalPosePreviewBelongsToSession(session, preview)) {
    throw new RangeError("The heading preview does not belong to this goal pose drag session.");
  }
  if (preview.issues.length > 0 || preview.yawRadians === undefined) {
    return Object.freeze({ status: "invalid", issues: immutableIssues(preview.issues) });
  }
  return Object.freeze({
    status: "commit",
    pose: pose3(session.frame, session.origin, quaternionFromYaw(preview.yawRadians)),
    yawRadians: preview.yawRadians,
    issues: EMPTY_SPATIAL_AUTHORING_ISSUES,
  });
}
