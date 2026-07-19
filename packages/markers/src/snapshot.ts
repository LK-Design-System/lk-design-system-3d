import {
  FrameMismatchError,
  assertValidFrameId,
  assertValidPose3,
  assertValidRigidTransform,
  assertValidVec3,
  assetId,
  entityId,
  layerId,
  pose3,
  rigidTransform3,
  timestamp,
  type AssetId,
  type ClockId,
  type EntityId,
  type FrameId,
  type LayerId,
  type Pose3,
  type RigidTransform3,
  type Timestamp,
  type Vec3,
} from "@lk-robotics/design-system-3d-core";

export interface MarkerColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

interface MarkerBaseInput {
  readonly id: EntityId;
  readonly pose: Pose3;
  readonly namespace?: string;
  readonly color?: MarkerColor;
  readonly visible?: boolean;
  readonly selectable?: boolean;
}

interface MarkerBaseSnapshot {
  readonly id: EntityId;
  readonly pose: Pose3;
  readonly namespace: string;
  readonly color: MarkerColor;
  readonly visible: boolean;
  readonly selectable: boolean;
}

export interface ArrowMarkerInput extends MarkerBaseInput {
  readonly kind: "arrow";
  /** Length, shaft diameter, and head diameter in meters. */
  readonly scale: Vec3;
}

export interface ArrowMarkerSnapshot extends MarkerBaseSnapshot {
  readonly kind: "arrow";
  readonly scale: Vec3;
}

export interface PoseMarkerInput extends MarkerBaseInput {
  readonly kind: "pose";
  readonly axisLength: number;
  readonly axisRadius?: number;
}

export interface PoseMarkerSnapshot extends MarkerBaseSnapshot {
  readonly kind: "pose";
  readonly axisLength: number;
  readonly axisRadius: number;
}

export interface LineStripMarkerInput extends MarkerBaseInput {
  readonly kind: "line-strip";
  readonly points: readonly Vec3[];
  readonly width: number;
}

export interface LineStripMarkerSnapshot extends MarkerBaseSnapshot {
  readonly kind: "line-strip";
  readonly points: readonly Vec3[];
  readonly width: number;
}

export interface PointSetMarkerInput extends MarkerBaseInput {
  readonly kind: "points";
  readonly points: readonly Vec3[];
  readonly size: number;
}

export interface PointSetMarkerSnapshot extends MarkerBaseSnapshot {
  readonly kind: "points";
  readonly points: readonly Vec3[];
  readonly size: number;
}

export interface TextMarkerInput extends MarkerBaseInput {
  readonly kind: "text";
  readonly text: string;
  readonly height: number;
}

export interface TextMarkerSnapshot extends MarkerBaseSnapshot {
  readonly kind: "text";
  readonly text: string;
  readonly height: number;
}

export type VolumeMarkerShape = "box" | "sphere" | "cylinder";

export interface VolumeMarkerInput extends MarkerBaseInput {
  readonly kind: "volume";
  readonly shape: VolumeMarkerShape;
  readonly scale: Vec3;
}

export interface VolumeMarkerSnapshot extends MarkerBaseSnapshot {
  readonly kind: "volume";
  readonly shape: VolumeMarkerShape;
  readonly scale: Vec3;
}

export interface MeshMarkerInput extends MarkerBaseInput {
  readonly kind: "mesh";
  readonly asset: AssetId;
  readonly scale: Vec3;
  readonly useEmbeddedMaterials?: boolean;
}

export interface MeshMarkerSnapshot extends MarkerBaseSnapshot {
  readonly kind: "mesh";
  readonly asset: AssetId;
  readonly scale: Vec3;
  readonly useEmbeddedMaterials: boolean;
}

export type MarkerSnapshotInput =
  | ArrowMarkerInput
  | PoseMarkerInput
  | LineStripMarkerInput
  | PointSetMarkerInput
  | TextMarkerInput
  | VolumeMarkerInput
  | MeshMarkerInput;

export type MarkerSnapshot =
  | ArrowMarkerSnapshot
  | PoseMarkerSnapshot
  | LineStripMarkerSnapshot
  | PointSetMarkerSnapshot
  | TextMarkerSnapshot
  | VolumeMarkerSnapshot
  | MeshMarkerSnapshot;

export interface MarkerLayerSnapshotInput {
  readonly id: LayerId;
  readonly frame: FrameId;
  readonly timestamp?: Timestamp;
  readonly markers: readonly MarkerSnapshotInput[];
  /** Explicit frame transform supplied by the consumer; no TF lookup occurs here. */
  readonly sourceToScene?: RigidTransform3;
  readonly visible?: boolean;
}

export interface MarkerLayerSnapshot {
  readonly id: LayerId;
  readonly frame: FrameId;
  readonly timestamp?: Timestamp;
  readonly markers: readonly MarkerSnapshot[];
  readonly sourceToScene?: RigidTransform3;
  readonly visible: boolean;
}

export interface MarkerFreshnessPolicy {
  readonly now: Timestamp;
  readonly staleAfterSeconds: number;
}

export type MarkerFreshnessState =
  | { readonly kind: "unknown"; readonly reason: "policy-disabled" | "timestamp-missing" }
  | {
      readonly kind: "clock-mismatch";
      readonly expectedClock: ClockId;
      readonly actualClock: ClockId;
    }
  | { readonly kind: "future"; readonly leadSeconds: number }
  | { readonly kind: "fresh"; readonly ageSeconds: number }
  | { readonly kind: "stale"; readonly ageSeconds: number; readonly staleAfterSeconds: number };

interface MarkerLayerRenderStateBase {
  readonly layerId: LayerId;
  readonly markerCount: number;
  readonly acceptedMarkerCount: number;
  readonly freshness: MarkerFreshnessState;
}

export type MarkerLayerRenderState =
  | (MarkerLayerRenderStateBase & {
      readonly kind: "ready";
      readonly sourceToScene: RigidTransform3;
    })
  | (MarkerLayerRenderStateBase & { readonly kind: "hidden" })
  | (MarkerLayerRenderStateBase & { readonly kind: "empty" })
  | (MarkerLayerRenderStateBase & { readonly kind: "budget-exceeded"; readonly maxMarkers: number })
  | (MarkerLayerRenderStateBase & {
      readonly kind: "frame-unresolved";
      readonly sourceFrame: FrameId;
      readonly sceneFrame: FrameId;
    })
  | (MarkerLayerRenderStateBase & {
      readonly kind: "frame-mismatch";
      readonly expectedSceneFrame: FrameId;
      readonly actualSceneFrame: FrameId;
    });

export class MarkerValidationError extends RangeError {
  override readonly name = "MarkerValidationError";
}

const DEFAULT_COLOR: MarkerColor = Object.freeze({ r: 0.13, g: 0.48, b: 0.88, a: 1 });

function finiteNonNegative(value: unknown, label: string, positive = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) || (positive ? value <= 0 : value < 0)) {
    throw new MarkerValidationError(
      `${label} must be a finite ${positive ? "positive" : "non-negative"} number.`,
    );
  }
  return value;
}

function immutableVec3(value: Vec3, label: string, positive = false): Vec3 {
  assertValidVec3(value, label);
  if (positive && value.some((component) => component <= 0)) {
    throw new MarkerValidationError(`${label} components must be positive.`);
  }
  return Object.freeze([value[0], value[1], value[2]]);
}

function immutablePose(value: Pose3): Pose3 {
  assertValidPose3(value);
  return pose3(
    value.frame,
    [value.position[0], value.position[1], value.position[2]],
    [value.orientation[0], value.orientation[1], value.orientation[2], value.orientation[3]],
  );
}

function immutableColor(value: MarkerColor | undefined): MarkerColor {
  const color = value ?? DEFAULT_COLOR;
  for (const channel of [color.r, color.g, color.b, color.a]) {
    if (typeof channel !== "number" || !Number.isFinite(channel) || channel < 0 || channel > 1) {
      throw new MarkerValidationError("Marker color channels must be finite numbers in [0, 1].");
    }
  }
  return Object.freeze({ r: color.r, g: color.g, b: color.b, a: color.a });
}

function markerBase(input: MarkerSnapshotInput): MarkerBaseSnapshot {
  const id = entityId(input.id);
  if (
    input.namespace !== undefined &&
    (typeof input.namespace !== "string" || input.namespace.trim().length === 0)
  ) {
    throw new MarkerValidationError("Marker namespace must be a non-empty string when provided.");
  }
  if (input.visible !== undefined && typeof input.visible !== "boolean") {
    throw new MarkerValidationError("Marker visible must be a boolean when provided.");
  }
  if (input.selectable !== undefined && typeof input.selectable !== "boolean") {
    throw new MarkerValidationError("Marker selectable must be a boolean when provided.");
  }
  return {
    id,
    pose: immutablePose(input.pose),
    namespace: input.namespace ?? "default",
    color: immutableColor(input.color),
    visible: input.visible ?? true,
    selectable: input.selectable ?? true,
  };
}

function immutablePoints(points: readonly Vec3[], minimum: number, label: string): readonly Vec3[] {
  const unknownPoints: unknown = points;
  if (!Array.isArray(unknownPoints) || points.length < minimum) {
    throw new MarkerValidationError(`${label} requires at least ${minimum.toString()} points.`);
  }
  return Object.freeze(
    points.map((point, index) => immutableVec3(point, `${label}[${index.toString()}]`)),
  );
}

export function createMarkerSnapshot(input: MarkerSnapshotInput): MarkerSnapshot {
  const unknownInput: unknown = input;
  if (typeof unknownInput !== "object" || unknownInput === null || Array.isArray(unknownInput)) {
    throw new MarkerValidationError("MarkerSnapshotInput must be an object.");
  }
  const base = markerBase(input);
  switch (input.kind) {
    case "arrow":
      return Object.freeze({
        ...base,
        kind: input.kind,
        scale: immutableVec3(input.scale, "arrow.scale", true),
      });
    case "pose": {
      const axisLength = finiteNonNegative(input.axisLength, "pose.axisLength", true);
      const axisRadius = finiteNonNegative(
        input.axisRadius ?? axisLength * 0.035,
        "pose.axisRadius",
        true,
      );
      return Object.freeze({ ...base, kind: input.kind, axisLength, axisRadius });
    }
    case "line-strip":
      return Object.freeze({
        ...base,
        kind: input.kind,
        points: immutablePoints(input.points, 2, "line-strip.points"),
        width: finiteNonNegative(input.width, "line-strip.width", true),
      });
    case "points":
      return Object.freeze({
        ...base,
        kind: input.kind,
        points: immutablePoints(input.points, 1, "points.points"),
        size: finiteNonNegative(input.size, "points.size", true),
      });
    case "text":
      if (typeof input.text !== "string" || input.text.trim().length === 0) {
        throw new MarkerValidationError("text.text must be a non-empty string.");
      }
      return Object.freeze({
        ...base,
        kind: input.kind,
        text: input.text,
        height: finiteNonNegative(input.height, "text.height", true),
      });
    case "volume":
      if (!(["box", "sphere", "cylinder"] as const).includes(input.shape)) {
        throw new MarkerValidationError("volume.shape must be box, sphere, or cylinder.");
      }
      return Object.freeze({
        ...base,
        kind: input.kind,
        shape: input.shape,
        scale: immutableVec3(input.scale, "volume.scale", true),
      });
    case "mesh":
      assetId(input.asset);
      if (
        input.useEmbeddedMaterials !== undefined &&
        typeof input.useEmbeddedMaterials !== "boolean"
      ) {
        throw new MarkerValidationError(
          "mesh.useEmbeddedMaterials must be a boolean when provided.",
        );
      }
      return Object.freeze({
        ...base,
        kind: input.kind,
        asset: assetId(input.asset),
        scale: immutableVec3(input.scale, "mesh.scale", true),
        useEmbeddedMaterials: input.useEmbeddedMaterials ?? true,
      });
  }
}

function immutableTransform(value: RigidTransform3): RigidTransform3 {
  return rigidTransform3(
    value.sourceFrame,
    value.targetFrame,
    [value.translation[0], value.translation[1], value.translation[2]],
    [value.rotation[0], value.rotation[1], value.rotation[2], value.rotation[3]],
  );
}

export function createMarkerLayerSnapshot(input: MarkerLayerSnapshotInput): MarkerLayerSnapshot {
  const unknownInput: unknown = input;
  if (typeof unknownInput !== "object" || unknownInput === null || Array.isArray(unknownInput)) {
    throw new MarkerValidationError("MarkerLayerSnapshotInput must be an object.");
  }
  assertValidFrameId(input.frame);
  const id = layerId(input.id);
  if (!Array.isArray(input.markers)) throw new MarkerValidationError("markers must be an array.");
  if (input.visible !== undefined && typeof input.visible !== "boolean") {
    throw new MarkerValidationError("visible must be a boolean when provided.");
  }
  const markers = input.markers.map(createMarkerSnapshot);
  const seen = new Set<EntityId>();
  for (const marker of markers) {
    if (marker.pose.frame !== input.frame) {
      throw new FrameMismatchError(
        input.frame,
        marker.pose.frame,
        "MarkerLayerSnapshot.marker.pose",
      );
    }
    if (seen.has(marker.id))
      throw new MarkerValidationError(`Duplicate marker id ${JSON.stringify(marker.id)}.`);
    seen.add(marker.id);
  }
  const sourceToScene = input.sourceToScene;
  if (sourceToScene !== undefined) {
    assertValidRigidTransform(sourceToScene);
    if (sourceToScene.sourceFrame !== input.frame) {
      throw new FrameMismatchError(
        input.frame,
        sourceToScene.sourceFrame,
        "MarkerLayerSnapshot.sourceToScene",
      );
    }
  }
  return Object.freeze({
    id,
    frame: input.frame,
    markers: Object.freeze(markers),
    visible: input.visible ?? true,
    ...(input.timestamp === undefined
      ? {}
      : { timestamp: timestamp(input.timestamp.clock, input.timestamp.sec, input.timestamp.nsec) }),
    ...(sourceToScene === undefined ? {} : { sourceToScene: immutableTransform(sourceToScene) }),
  });
}

function resolveFreshness(
  capturedAt: Timestamp | undefined,
  policy: MarkerFreshnessPolicy | undefined,
): MarkerFreshnessState {
  if (policy === undefined) return Object.freeze({ kind: "unknown", reason: "policy-disabled" });
  if (capturedAt === undefined)
    return Object.freeze({ kind: "unknown", reason: "timestamp-missing" });
  const now = timestamp(policy.now.clock, policy.now.sec, policy.now.nsec);
  const staleAfterSeconds = finiteNonNegative(policy.staleAfterSeconds, "staleAfterSeconds");
  if (capturedAt.clock !== now.clock) {
    return Object.freeze({
      kind: "clock-mismatch",
      expectedClock: now.clock,
      actualClock: capturedAt.clock,
    });
  }
  const ageSeconds = now.sec - capturedAt.sec + (now.nsec - capturedAt.nsec) / 1_000_000_000;
  if (ageSeconds < 0) return Object.freeze({ kind: "future", leadSeconds: -ageSeconds });
  if (ageSeconds > staleAfterSeconds) {
    return Object.freeze({ kind: "stale", ageSeconds, staleAfterSeconds });
  }
  return Object.freeze({ kind: "fresh", ageSeconds });
}

export function resolveMarkerLayerRenderState(
  layerInput: MarkerLayerSnapshot,
  sceneFrame: FrameId,
  maxMarkers: number,
  freshnessPolicy?: MarkerFreshnessPolicy,
): MarkerLayerRenderState {
  const layer = createMarkerLayerSnapshot(layerInput);
  assertValidFrameId(sceneFrame);
  if (!Number.isSafeInteger(maxMarkers) || maxMarkers <= 0) {
    throw new MarkerValidationError("maxMarkers must be a positive safe integer.");
  }
  const markerCount = layer.markers.filter((marker) => marker.visible).length;
  const freshness = resolveFreshness(layer.timestamp, freshnessPolicy);
  const base = { layerId: layer.id, markerCount, acceptedMarkerCount: 0, freshness } as const;
  if (!layer.visible) return Object.freeze({ ...base, kind: "hidden" });
  if (markerCount === 0) return Object.freeze({ ...base, kind: "empty" });
  if (markerCount > maxMarkers)
    return Object.freeze({ ...base, kind: "budget-exceeded", maxMarkers });
  if (layer.sourceToScene === undefined) {
    return Object.freeze({
      ...base,
      kind: "frame-unresolved",
      sourceFrame: layer.frame,
      sceneFrame,
    });
  }
  if (layer.sourceToScene.targetFrame !== sceneFrame) {
    return Object.freeze({
      ...base,
      kind: "frame-mismatch",
      expectedSceneFrame: sceneFrame,
      actualSceneFrame: layer.sourceToScene.targetFrame,
    });
  }
  return Object.freeze({
    ...base,
    kind: "ready",
    acceptedMarkerCount: markerCount,
    sourceToScene: layer.sourceToScene,
  });
}
