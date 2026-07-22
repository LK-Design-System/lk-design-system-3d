import {
  FrameMismatchError,
  assertValidFrameId,
  assertValidRigidTransform,
  identityTransform,
  layerId,
  timestamp,
  type ClockId,
  type FrameId,
  type LayerId,
  type Quat,
  type RigidTransform3,
  type Timestamp,
  type Vec3,
} from "@lk-robotics/lds-3d-core";

import { assertPointCloudSnapshot, type PointCloudSnapshot } from "./snapshot.js";

export interface PointCloudLayerSnapshotInput {
  readonly id: LayerId;
  readonly snapshot: PointCloudSnapshot;
  /**
   * Explicit transform from the snapshot frame into a consumer-selected scene
   * frame. Products resolve TF or another frame graph before this boundary.
   */
  readonly sourceToScene?: RigidTransform3;
  readonly visible?: boolean;
}

/** One immutable-by-replacement point-cloud topic/layer. */
export interface PointCloudLayerSnapshot {
  readonly id: LayerId;
  readonly snapshot: PointCloudSnapshot;
  readonly sourceToScene?: RigidTransform3;
  readonly visible: boolean;
}

export interface PointCloudLayerSetInput {
  readonly layers: readonly PointCloudLayerSnapshotInput[];
}

/** A deterministic, duplicate-free collection of point-cloud layers. */
export interface PointCloudLayerSet {
  readonly layers: readonly PointCloudLayerSnapshot[];
}

export interface PointCloudFreshnessPolicy {
  readonly now: Timestamp;
  readonly staleAfterSeconds: number;
}

export type PointCloudFreshnessState =
  | { readonly kind: "unknown"; readonly reason: "policy-disabled" | "timestamp-missing" }
  | {
      readonly kind: "clock-mismatch";
      readonly expectedClock: ClockId;
      readonly actualClock: ClockId;
    }
  | { readonly kind: "future"; readonly leadSeconds: number }
  | { readonly kind: "fresh"; readonly ageSeconds: number }
  | {
      readonly kind: "stale";
      readonly ageSeconds: number;
      readonly staleAfterSeconds: number;
    };

/** Counts and freshness shared by every per-layer render outcome. */
export interface PointCloudLayerRenderStateBase {
  readonly layerId: LayerId;
  readonly requestedPointCount: number;
  readonly acceptedPointCount: number;
  readonly freshness: PointCloudFreshnessState;
}

export type PointCloudLayerRenderState =
  | (PointCloudLayerRenderStateBase & {
      readonly kind: "ready";
      readonly acceptedPointCount: number;
      readonly sourceToScene: RigidTransform3;
    })
  | (PointCloudLayerRenderStateBase & { readonly kind: "hidden" })
  | (PointCloudLayerRenderStateBase & { readonly kind: "empty" })
  | (PointCloudLayerRenderStateBase & {
      readonly kind: "frame-unresolved";
      readonly sourceFrame: FrameId;
      readonly sceneFrame: FrameId;
    })
  | (PointCloudLayerRenderStateBase & {
      readonly kind: "frame-mismatch";
      readonly sourceFrame: FrameId;
      readonly expectedSceneFrame: FrameId;
      readonly actualSceneFrame: FrameId;
    })
  | (PointCloudLayerRenderStateBase & {
      readonly kind: "budget-exceeded";
      readonly maxPoints: number;
    });

export type PointCloudLayerSetRenderStateKind = "ready" | "empty" | "degraded" | "budget-exceeded";

export interface PointCloudLayerSetRenderState {
  readonly kind: PointCloudLayerSetRenderStateKind;
  readonly sceneFrame: FrameId;
  readonly maxPoints: number;
  readonly requestedPointCount: number;
  readonly acceptedPointCount: number;
  readonly layers: readonly PointCloudLayerRenderState[];
}

export class PointCloudLayerValidationError extends RangeError {
  override readonly name: string = "PointCloudLayerValidationError";
}

function objectRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new PointCloudLayerValidationError(`${label} must be an object.`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function validateLayerId(value: unknown): LayerId {
  if (typeof value !== "string") {
    throw new PointCloudLayerValidationError("layer id must be a string.");
  }
  return layerId(value);
}

function immutableTransform(value: RigidTransform3): RigidTransform3 {
  const translation: Vec3 = [value.translation[0], value.translation[1], value.translation[2]];
  const rotation: Quat = [
    value.rotation[0],
    value.rotation[1],
    value.rotation[2],
    value.rotation[3],
  ];
  return Object.freeze({
    sourceFrame: value.sourceFrame,
    targetFrame: value.targetFrame,
    translation: Object.freeze(translation),
    rotation: Object.freeze(rotation),
  });
}

export function createPointCloudLayerSnapshot(
  input: PointCloudLayerSnapshotInput,
): PointCloudLayerSnapshot {
  const record = objectRecord(input, "PointCloudLayerSnapshotInput");
  const id = validateLayerId(record.id);
  const snapshot = record.snapshot as PointCloudSnapshot;
  assertPointCloudSnapshot(snapshot);
  if (record.visible !== undefined && typeof record.visible !== "boolean") {
    throw new PointCloudLayerValidationError("visible must be a boolean when provided.");
  }

  const sourceToScene = record.sourceToScene as RigidTransform3 | undefined;
  if (sourceToScene !== undefined) {
    assertValidRigidTransform(sourceToScene);
    if (sourceToScene.sourceFrame !== snapshot.frame) {
      throw new FrameMismatchError(
        snapshot.frame,
        sourceToScene.sourceFrame,
        "PointCloudLayerSnapshot.sourceToScene",
      );
    }
  }

  return Object.freeze({
    id,
    snapshot,
    visible: record.visible ?? true,
    ...(sourceToScene === undefined ? {} : { sourceToScene: immutableTransform(sourceToScene) }),
  });
}

export function createPointCloudLayerSet(input: PointCloudLayerSetInput): PointCloudLayerSet {
  const record = objectRecord(input, "PointCloudLayerSetInput");
  if (!Array.isArray(record.layers)) {
    throw new PointCloudLayerValidationError("layers must be an array.");
  }

  const seen = new Set<LayerId>();
  const layers = record.layers.map((value) => {
    const layer = createPointCloudLayerSnapshot(value as PointCloudLayerSnapshotInput);
    if (seen.has(layer.id)) {
      throw new PointCloudLayerValidationError(
        `layers must not contain duplicate id ${JSON.stringify(layer.id)}.`,
      );
    }
    seen.add(layer.id);
    return layer;
  });
  return Object.freeze({ layers: Object.freeze(layers) });
}

function assertMaxPoints(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new PointCloudLayerValidationError("maxPoints must be a positive safe integer.");
  }
}

function validateFreshnessPolicy(
  value: PointCloudFreshnessPolicy | undefined,
): PointCloudFreshnessPolicy | undefined {
  if (value === undefined) return undefined;
  const record = objectRecord(value, "PointCloudFreshnessPolicy");
  const nowRecord = objectRecord(record.now, "PointCloudFreshnessPolicy.now");
  const now = timestamp(
    nowRecord.clock as ClockId,
    nowRecord.sec as number,
    nowRecord.nsec as number,
  );
  const staleAfterSeconds = record.staleAfterSeconds;
  if (
    typeof staleAfterSeconds !== "number" ||
    !Number.isFinite(staleAfterSeconds) ||
    staleAfterSeconds < 0
  ) {
    throw new PointCloudLayerValidationError(
      "staleAfterSeconds must be a finite non-negative number.",
    );
  }
  return Object.freeze({ now, staleAfterSeconds });
}

function resolveFreshness(
  capturedAt: Timestamp | undefined,
  policy: PointCloudFreshnessPolicy | undefined,
): PointCloudFreshnessState {
  if (policy === undefined) {
    return Object.freeze({ kind: "unknown", reason: "policy-disabled" });
  }
  if (capturedAt === undefined) {
    return Object.freeze({ kind: "unknown", reason: "timestamp-missing" });
  }
  if (capturedAt.clock !== policy.now.clock) {
    return Object.freeze({
      kind: "clock-mismatch",
      expectedClock: policy.now.clock,
      actualClock: capturedAt.clock,
    });
  }

  const ageSeconds =
    policy.now.sec - capturedAt.sec + (policy.now.nsec - capturedAt.nsec) / 1_000_000_000;
  if (ageSeconds < 0) {
    return Object.freeze({ kind: "future", leadSeconds: -ageSeconds });
  }
  if (ageSeconds > policy.staleAfterSeconds) {
    return Object.freeze({
      kind: "stale",
      ageSeconds,
      staleAfterSeconds: policy.staleAfterSeconds,
    });
  }
  return Object.freeze({ kind: "fresh", ageSeconds });
}

function resolveLayerState(
  layer: PointCloudLayerSnapshot,
  sceneFrame: FrameId,
  policy: PointCloudFreshnessPolicy | undefined,
): PointCloudLayerRenderState {
  const pointCount = layer.snapshot.pointCount;
  const freshness = resolveFreshness(layer.snapshot.timestamp, policy);
  const base = {
    layerId: layer.id,
    requestedPointCount: layer.visible ? pointCount : 0,
    acceptedPointCount: 0,
    freshness,
  } as const;

  if (!layer.visible) return Object.freeze({ ...base, kind: "hidden" });
  if (pointCount === 0) return Object.freeze({ ...base, kind: "empty" });

  if (layer.snapshot.frame === sceneFrame && layer.sourceToScene === undefined) {
    return Object.freeze({
      ...base,
      kind: "ready",
      acceptedPointCount: pointCount,
      sourceToScene: identityTransform(sceneFrame),
    });
  }
  if (layer.sourceToScene === undefined) {
    return Object.freeze({
      ...base,
      kind: "frame-unresolved",
      sourceFrame: layer.snapshot.frame,
      sceneFrame,
    });
  }
  if (layer.sourceToScene.targetFrame !== sceneFrame) {
    return Object.freeze({
      ...base,
      kind: "frame-mismatch",
      sourceFrame: layer.snapshot.frame,
      expectedSceneFrame: sceneFrame,
      actualSceneFrame: layer.sourceToScene.targetFrame,
    });
  }
  return Object.freeze({
    ...base,
    kind: "ready",
    acceptedPointCount: pointCount,
    sourceToScene: layer.sourceToScene,
  });
}

function freshnessIsDegraded(value: PointCloudFreshnessState): boolean {
  return value.kind === "clock-mismatch" || value.kind === "future" || value.kind === "stale";
}

/**
 * Resolves a complete visible layer set against one scene frame and one total
 * point budget. If the total eligible set exceeds the budget, no eligible
 * layer is accepted; callers must explicitly hide, sample, or replace input.
 */
export function resolvePointCloudLayerSetRenderState(
  layerSet: PointCloudLayerSet,
  sceneFrame: FrameId,
  maxPoints: number,
  freshnessPolicy?: PointCloudFreshnessPolicy,
): PointCloudLayerSetRenderState {
  const normalizedSet = createPointCloudLayerSet({ layers: layerSet.layers });
  assertValidFrameId(sceneFrame);
  assertMaxPoints(maxPoints);
  const policy = validateFreshnessPolicy(freshnessPolicy);
  let states = normalizedSet.layers.map((layer) => resolveLayerState(layer, sceneFrame, policy));
  const requestedPointCount = states.reduce((total, state) => total + state.requestedPointCount, 0);
  const eligiblePointCount = states.reduce(
    (total, state) => total + (state.kind === "ready" ? state.acceptedPointCount : 0),
    0,
  );

  if (eligiblePointCount > maxPoints) {
    states = states.map((state) =>
      state.kind === "ready"
        ? Object.freeze({
            ...state,
            kind: "budget-exceeded" as const,
            acceptedPointCount: 0,
            maxPoints,
          })
        : state,
    );
    return Object.freeze({
      kind: "budget-exceeded",
      sceneFrame,
      maxPoints,
      requestedPointCount,
      acceptedPointCount: 0,
      layers: Object.freeze(states),
    });
  }

  const degraded = states.some(
    (state) =>
      state.kind === "frame-mismatch" ||
      state.kind === "frame-unresolved" ||
      freshnessIsDegraded(state.freshness),
  );
  const kind: PointCloudLayerSetRenderStateKind = degraded
    ? "degraded"
    : eligiblePointCount === 0
      ? "empty"
      : "ready";
  return Object.freeze({
    kind,
    sceneFrame,
    maxPoints,
    requestedPointCount,
    acceptedPointCount: eligiblePointCount,
    layers: Object.freeze(states),
  });
}
