import {
  assertValidPose3,
  assertValidSpatialNodeTransform,
  assertValidSpatialStructure,
  assertValidVec3,
  assetId,
  bounds3,
  createSpatialStructure,
  entityId,
  frameId,
  layerId,
  pose3,
  spatialNodeTransform,
  spatialPbrMaterial,
  SPATIAL_AUTHORING_AREA_EPSILON_SQUARE_METERS,
  SPATIAL_AUTHORING_LINEAR_EPSILON_METERS,
  stepSpatialNodeTransform,
  type EntityId,
  type FrameId,
  type GoalEntity,
  type Pose3,
  type Quat,
  type SpatialStructure,
  type SpatialStructureNode,
  type SpatialTransformStepOptions,
  type Vec3,
} from "@lk-design-system/lds-3d-core";

import { mapEditorTronBounds } from "./map-editor-asset-catalog.js";

export const MAP_EDITOR_SCHEMA_VERSION = 2 as const;

export type MapObjectKind = "box" | "column" | "asset";
export type MapRouteTraversal = "forward" | "reverse" | "bidirectional";
export type MapAreaCategory = "generic" | "keepout" | "slow" | "work";
export type MapEntityKind = MapObjectKind | "route" | "area" | "goal";

export interface MapRouteEntity {
  readonly kind: "route";
  readonly id: EntityId;
  readonly frame: FrameId;
  readonly levelId: EntityId;
  readonly points: readonly Vec3[];
  readonly traversal: MapRouteTraversal;
  readonly widthMeters: number;
}

export interface MapAreaEntity {
  readonly kind: "area";
  readonly id: EntityId;
  readonly frame: FrameId;
  readonly levelId: EntityId;
  /** The outer ring without a repeated closing point. */
  readonly points: readonly Vec3[];
  readonly category: MapAreaCategory;
}

export interface MapGoalEntity extends GoalEntity {
  readonly levelId: EntityId;
}

export interface MapEditorDocument {
  readonly schemaVersion: typeof MAP_EDITOR_SCHEMA_VERSION;
  readonly documentId: EntityId;
  readonly name: string;
  readonly frame: FrameId;
  readonly structure: SpatialStructure;
  readonly routes: readonly MapRouteEntity[];
  readonly areas: readonly MapAreaEntity[];
  readonly goals: readonly MapGoalEntity[];
  readonly labels: Readonly<Record<string, string>>;
  readonly nextEntityNumber: number;
}

export interface CreateMapEditorDocumentOptions {
  readonly documentId?: EntityId;
  readonly name?: string;
  readonly routes?: readonly MapRouteEntity[];
  readonly areas?: readonly MapAreaEntity[];
  readonly goals?: readonly MapGoalEntity[];
  readonly labels?: Readonly<Record<string, string>>;
  readonly nextEntityNumber?: number;
}

export interface AddMapRouteOptions {
  readonly traversal?: MapRouteTraversal;
  readonly widthMeters?: number;
}

export interface AddMapAreaOptions {
  readonly category?: MapAreaCategory;
}

export interface AddMapGoalOptions {
  readonly radiusMeters?: number;
}

export interface MapEditorMutationResult {
  readonly document: MapEditorDocument;
  readonly createdId: EntityId;
}

const MAP_EDITOR_DOCUMENT_KEYS = Object.freeze([
  "areas",
  "documentId",
  "frame",
  "goals",
  "labels",
  "name",
  "nextEntityNumber",
  "routes",
  "schemaVersion",
  "structure",
]);

const OBJECT_SIDE = spatialPbrMaterial([0.12, 0.34, 0.48, 1], {
  metallicFactor: 0.08,
  roughnessFactor: 0.62,
});
const OBJECT_TOP = spatialPbrMaterial([0.18, 0.56, 0.58, 1], {
  metallicFactor: 0.05,
  roughnessFactor: 0.52,
});
const COLUMN_SIDE = spatialPbrMaterial([0.86, 0.48, 0.08, 1], {
  metallicFactor: 0.04,
  roughnessFactor: 0.66,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[]): void {
  const actual = Object.keys(value).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new RangeError(`MapEditorDocument has unsupported fields: ${actual.join(", ")}.`);
  }
}

function assertNonEmptyText(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new RangeError(`${label} must be a non-empty string.`);
  }
}

function assertPositive(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be finite and positive.`);
  }
}

function assertValidEntityIdentifier(value: unknown, label: string): asserts value is EntityId {
  if (typeof value !== "string") throw new RangeError(`${label} must be a string.`);
  entityId(value);
}

function assertValidFrameIdentifier(value: unknown, label: string): asserts value is FrameId {
  if (typeof value !== "string") throw new RangeError(`${label} must be a string.`);
  frameId(value);
}

function findLevel(structure: SpatialStructure, levelId: EntityId): SpatialStructureNode {
  const level = structure.nodes.find((node) => node.id === levelId);
  if (level?.kind !== "level") {
    throw new RangeError(`${levelId} is not a level in this map document.`);
  }
  return level;
}

function assertLevelOwnership(
  levelId: unknown,
  structure: SpatialStructure,
  label: string,
): asserts levelId is EntityId {
  assertValidEntityIdentifier(levelId, label);
  findLevel(structure, levelId);
}

function pointsIndistinguishable(left: Vec3, right: Vec3): boolean {
  return (
    Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]) <=
    SPATIAL_AUTHORING_LINEAR_EPSILON_METERS
  );
}

function xyOrientation(first: Vec3, second: Vec3, third: Vec3): number {
  return (
    (second[0] - first[0]) * (third[1] - first[1]) -
    (second[1] - first[1]) * (third[0] - first[0])
  );
}

function pointOnXySegment(point: Vec3, start: Vec3, end: Vec3): boolean {
  return (
    Math.abs(xyOrientation(start, end, point)) <=
      SPATIAL_AUTHORING_AREA_EPSILON_SQUARE_METERS &&
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

function areaSelfIntersects(points: readonly Vec3[]): boolean {
  for (let firstIndex = 0; firstIndex < points.length; firstIndex += 1) {
    const firstStart = points[firstIndex];
    const firstEnd = points[(firstIndex + 1) % points.length];
    if (firstStart === undefined || firstEnd === undefined) continue;
    for (let secondIndex = firstIndex + 1; secondIndex < points.length; secondIndex += 1) {
      if (
        secondIndex === firstIndex + 1 ||
        (firstIndex === 0 && secondIndex === points.length - 1)
      ) {
        continue;
      }
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

function assertValidPointSequence(
  points: unknown,
  minimumLength: number,
  label: string,
): asserts points is readonly Vec3[] {
  if (!Array.isArray(points) || points.length < minimumLength) {
    throw new RangeError(
      `${label} must contain at least ${minimumLength.toString()} points.`,
    );
  }
  points.forEach((point, index) =>
    assertValidVec3(point, `${label}[${index.toString()}]`),
  );
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1] as Vec3;
    const current = points[index] as Vec3;
    if (
      Math.hypot(
        previous[0] - current[0],
        previous[1] - current[1],
        previous[2] - current[2],
      ) <= SPATIAL_AUTHORING_LINEAR_EPSILON_METERS
    ) {
      throw new RangeError(`${label} cannot contain consecutive duplicate points.`);
    }
  }
}

function assertValidRoute(
  route: unknown,
  frame: FrameId,
  structure: SpatialStructure,
): asserts route is MapRouteEntity {
  if (!isRecord(route) || route.kind !== "route") {
    throw new RangeError("Expected a route entity.");
  }
  assertValidEntityIdentifier(route.id, "route.id");
  const routeId = route.id;
  assertValidFrameIdentifier(route.frame, `${routeId}.frame`);
  if (route.frame !== frame) {
    throw new RangeError(`${routeId}.frame must use the map document frame.`);
  }
  assertLevelOwnership(route.levelId, structure, `${routeId}.levelId`);
  assertValidPointSequence(route.points, 2, `${routeId}.points`);
  if (
    route.traversal !== "forward" &&
    route.traversal !== "reverse" &&
    route.traversal !== "bidirectional"
  ) {
    throw new RangeError(`${routeId}.traversal is unsupported.`);
  }
  assertPositive(route.widthMeters, `${routeId}.widthMeters`);
}

function assertValidArea(
  area: unknown,
  frame: FrameId,
  structure: SpatialStructure,
): asserts area is MapAreaEntity {
  if (!isRecord(area) || area.kind !== "area") {
    throw new RangeError("Expected an area entity.");
  }
  assertValidEntityIdentifier(area.id, "area.id");
  const areaId = area.id;
  assertValidFrameIdentifier(area.frame, `${areaId}.frame`);
  if (area.frame !== frame) {
    throw new RangeError(`${areaId}.frame must use the map document frame.`);
  }
  assertLevelOwnership(area.levelId, structure, `${areaId}.levelId`);
  assertValidPointSequence(area.points, 3, `${areaId}.points`);
  const points = area.points;
  const first = points[0];
  const last = points.at(-1);
  if (
    first !== undefined &&
    last !== undefined &&
    pointsIndistinguishable(first, last)
  ) {
    throw new RangeError(`${areaId}.points must omit the repeated closing point.`);
  }
  let twiceSignedArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    if (current === undefined || next === undefined) continue;
    twiceSignedArea += current[0] * next[1] - next[0] * current[1];
  }
  if (
    !Number.isFinite(twiceSignedArea) ||
    Math.abs(twiceSignedArea) <=
      SPATIAL_AUTHORING_AREA_EPSILON_SQUARE_METERS * 2
  ) {
    throw new RangeError(`${areaId}.points must enclose a non-zero XY area.`);
  }
  const firstElevation = points[0]?.[2];
  if (
    firstElevation !== undefined &&
    points.some(
      (point) =>
        Math.abs(point[2] - firstElevation) >
        SPATIAL_AUTHORING_LINEAR_EPSILON_METERS,
    )
  ) {
    throw new RangeError(`${areaId}.points must use one XY elevation.`);
  }
  if (areaSelfIntersects(points)) {
    throw new RangeError(`${areaId}.points must not self-intersect.`);
  }
  for (let firstIndex = 0; firstIndex < points.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < points.length; secondIndex += 1) {
      const adjacent =
        secondIndex === firstIndex + 1 ||
        (firstIndex === 0 && secondIndex === points.length - 1);
      if (adjacent) continue;
      const firstPoint = points[firstIndex];
      const secondPoint = points[secondIndex];
      if (
        firstPoint !== undefined &&
        secondPoint !== undefined &&
        Math.hypot(
          firstPoint[0] - secondPoint[0],
          firstPoint[1] - secondPoint[1],
          firstPoint[2] - secondPoint[2],
        ) <= SPATIAL_AUTHORING_LINEAR_EPSILON_METERS
      ) {
        throw new RangeError(`${areaId}.points contain indistinguishable vertices.`);
      }
    }
  }
  if (
    area.category !== "generic" &&
    area.category !== "keepout" &&
    area.category !== "slow" &&
    area.category !== "work"
  ) {
    throw new RangeError(`${areaId}.category is unsupported.`);
  }
}

function assertValidGoal(
  goal: unknown,
  frame: FrameId,
  structure: SpatialStructure,
): asserts goal is MapGoalEntity {
  if (!isRecord(goal) || goal.kind !== "goal") throw new RangeError("Expected a goal entity.");
  assertValidEntityIdentifier(goal.id, "goal.id");
  const goalId = goal.id;
  assertLevelOwnership(goal.levelId, structure, `${goalId}.levelId`);
  if (!isRecord(goal.pose)) throw new RangeError(`${goalId}.pose must be an object.`);
  assertValidPose3(goal.pose as unknown as Pose3);
  const goalPose = goal.pose as unknown as Pose3;
  if (goalPose.frame !== frame) {
    throw new RangeError(`${goalId}.pose must use the map document frame.`);
  }
  if (goal.radiusMeters !== undefined) {
    assertPositive(goal.radiusMeters, `${goalId}.radiusMeters`);
  }
  if (goal.layerId !== undefined) {
    if (typeof goal.layerId !== "string") {
      throw new RangeError(`${goalId}.layerId must be a string.`);
    }
    layerId(goal.layerId);
  }
}

function entityIds(document: MapEditorDocument): readonly EntityId[] {
  return [
    ...document.structure.nodes.map((node) => node.id),
    ...document.routes.map((route) => route.id),
    ...document.areas.map((area) => area.id),
    ...document.goals.map((goal) => goal.id),
  ];
}

export function assertValidMapEditorDocument(value: unknown): asserts value is MapEditorDocument {
  if (!isRecord(value)) throw new RangeError("MapEditorDocument must be an object.");
  assertExactKeys(value, MAP_EDITOR_DOCUMENT_KEYS);
  if (value.schemaVersion !== MAP_EDITOR_SCHEMA_VERSION) {
    throw new RangeError(`Unsupported map editor schema version: ${String(value.schemaVersion)}.`);
  }
  assertValidEntityIdentifier(value.documentId, "documentId");
  assertNonEmptyText(value.name, "name");
  assertValidFrameIdentifier(value.frame, "frame");
  const documentFrame = value.frame;
  if (!isRecord(value.structure)) throw new RangeError("structure must be an object.");
  assertValidSpatialStructure(value.structure as unknown as SpatialStructure);
  const structure = value.structure as unknown as SpatialStructure;
  if (structure.frame !== documentFrame) {
    throw new RangeError("MapEditorDocument.frame must equal SpatialStructure.frame.");
  }
  if (!Array.isArray(value.routes)) throw new RangeError("routes must be an array.");
  if (!Array.isArray(value.areas)) throw new RangeError("areas must be an array.");
  if (!Array.isArray(value.goals)) throw new RangeError("goals must be an array.");
  value.routes.forEach((route) => assertValidRoute(route, documentFrame, structure));
  value.areas.forEach((area) => assertValidArea(area, documentFrame, structure));
  value.goals.forEach((goal) => assertValidGoal(goal, documentFrame, structure));
  if (
    typeof value.nextEntityNumber !== "number" ||
    !Number.isSafeInteger(value.nextEntityNumber) ||
    value.nextEntityNumber < 1
  ) {
    throw new RangeError("nextEntityNumber must be a positive safe integer.");
  }
  if (!isRecord(value.labels)) throw new RangeError("labels must be an object.");

  const ids: readonly EntityId[] = [
    ...structure.nodes.map((node) => node.id),
    ...(value.routes as unknown as readonly MapRouteEntity[]).map((route) => route.id),
    ...(value.areas as unknown as readonly MapAreaEntity[]).map((area) => area.id),
    ...(value.goals as unknown as readonly MapGoalEntity[]).map((goal) => goal.id),
  ];
  const seen = new Set<EntityId>();
  for (const id of ids) {
    if (seen.has(id)) throw new RangeError(`Duplicate map entity id: ${id}.`);
    seen.add(id);
  }
  if (seen.has(value.documentId)) {
    throw new RangeError("documentId must not collide with a map entity id.");
  }

  const expectedLabels = new Set<string>(ids);
  for (const [id, label] of Object.entries(value.labels)) {
    if (!expectedLabels.has(id)) throw new RangeError(`Label references missing entity: ${id}.`);
    assertNonEmptyText(label, `labels[${JSON.stringify(id)}]`);
  }
  for (const id of expectedLabels) {
    if (value.labels[id] === undefined) throw new RangeError(`Missing label for entity: ${id}.`);
  }
}

function immutableVec3(point: Vec3): Vec3 {
  return Object.freeze([point[0] === 0 ? 0 : point[0], point[1] === 0 ? 0 : point[1], point[2] === 0 ? 0 : point[2]]);
}

function cloneRoute(route: MapRouteEntity): MapRouteEntity {
  return Object.freeze({
    kind: "route",
    id: entityId(route.id),
    frame: frameId(route.frame),
    levelId: entityId(route.levelId),
    points: Object.freeze(route.points.map(immutableVec3)),
    traversal: route.traversal,
    widthMeters: route.widthMeters,
  });
}

function cloneArea(area: MapAreaEntity): MapAreaEntity {
  return Object.freeze({
    kind: "area",
    id: entityId(area.id),
    frame: frameId(area.frame),
    levelId: entityId(area.levelId),
    points: Object.freeze(area.points.map(immutableVec3)),
    category: area.category,
  });
}

function cloneGoal(goal: MapGoalEntity): MapGoalEntity {
  return Object.freeze({
    kind: "goal",
    id: entityId(goal.id),
    levelId: entityId(goal.levelId),
    pose: pose3(frameId(goal.pose.frame), goal.pose.position, goal.pose.orientation),
    ...(goal.radiusMeters === undefined ? {} : { radiusMeters: goal.radiusMeters }),
    ...(goal.layerId === undefined ? {} : { layerId: layerId(goal.layerId) }),
  });
}

function cloneLabels(labels: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  return Object.freeze(
    Object.fromEntries(Object.entries(labels).sort(([left], [right]) => left.localeCompare(right))),
  );
}

/** Validates, detaches, and deeply freezes the Story-local document snapshot. */
export function freezeMapEditorDocument(value: MapEditorDocument): MapEditorDocument {
  assertValidMapEditorDocument(value);
  const document: MapEditorDocument = Object.freeze({
    schemaVersion: MAP_EDITOR_SCHEMA_VERSION,
    documentId: entityId(value.documentId),
    name: value.name.trim(),
    frame: frameId(value.frame),
    structure: createSpatialStructure(value.structure.frame, value.structure.nodes),
    routes: Object.freeze(value.routes.map(cloneRoute)),
    areas: Object.freeze(value.areas.map(cloneArea)),
    goals: Object.freeze(value.goals.map(cloneGoal)),
    labels: cloneLabels(value.labels),
    nextEntityNumber: value.nextEntityNumber,
  });
  assertValidMapEditorDocument(document);
  return document;
}

export function cloneMapEditorDocument(document: MapEditorDocument): MapEditorDocument {
  return freezeMapEditorDocument(document);
}

function defaultLabel(node: SpatialStructureNode): string {
  if (node.name !== undefined && node.name.trim().length > 0) return node.name;
  const segment = node.id.split("/").at(-1) ?? node.id;
  return segment.replaceAll("-", " ");
}

export function createMapEditorDocument(
  structure: SpatialStructure,
  options: CreateMapEditorDocumentOptions = {},
): MapEditorDocument {
  assertValidSpatialStructure(structure);
  const labels: Record<string, string> = Object.fromEntries(
    structure.nodes.map((node) => [node.id, defaultLabel(node)]),
  );
  for (const route of options.routes ?? []) labels[route.id] = `Route ${route.id}`;
  for (const area of options.areas ?? []) labels[area.id] = `Area ${area.id}`;
  for (const goal of options.goals ?? []) labels[goal.id] = `Goal ${goal.id}`;
  Object.assign(labels, options.labels);
  return freezeMapEditorDocument({
    schemaVersion: MAP_EDITOR_SCHEMA_VERSION,
    documentId: options.documentId ?? entityId("map-document"),
    name: options.name ?? "Spatial map",
    frame: structure.frame,
    structure,
    routes: options.routes ?? [],
    areas: options.areas ?? [],
    goals: options.goals ?? [],
    labels,
    nextEntityNumber: options.nextEntityNumber ?? 1,
  });
}

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalJsonValue(child)]),
  );
}

/** Stable key ordering and two-space indentation make snapshots reviewable in source control. */
export function serializeMapEditorDocument(document: MapEditorDocument): string {
  assertValidMapEditorDocument(document);
  return `${JSON.stringify(canonicalJsonValue(document), null, 2)}\n`;
}

export function parseMapEditorDocument(serialized: string): MapEditorDocument {
  const parsed: unknown = JSON.parse(serialized);
  if (!isRecord(parsed)) throw new RangeError("Serialized map document must contain an object.");
  return freezeMapEditorDocument(parsed as unknown as MapEditorDocument);
}

function allSourceFrames(document: MapEditorDocument): ReadonlySet<FrameId> {
  return new Set(document.structure.nodes.map((node) => node.transform.sourceFrame));
}

function allocationPrefix(kind: MapEntityKind): string {
  return kind === "asset" ? "tron" : kind;
}

function allocateEntity(
  document: MapEditorDocument,
  kind: MapEntityKind,
): Readonly<{ id: EntityId; sourceFrame: FrameId; number: number; nextNumber: number }> {
  const ids = new Set<EntityId>(entityIds(document));
  const frames = allSourceFrames(document);
  for (let number = document.nextEntityNumber; Number.isSafeInteger(number); number += 1) {
    const prefix = allocationPrefix(kind);
    const id = entityId(`map/${prefix}-${number.toString()}`);
    const sourceFrame = frameId(`map-${prefix}-${number.toString()}-local`);
    if (id !== document.documentId && !ids.has(id) && !frames.has(sourceFrame)) {
      return Object.freeze({ id, sourceFrame, number, nextNumber: number + 1 });
    }
  }
  throw new RangeError("Map entity id allocation exhausted the safe integer range.");
}

function rotateVector(rotation: Quat, value: Vec3): Vec3 {
  const [x, y, z, w] = rotation;
  const [vx, vy, vz] = value;
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return [
    vx + w * tx + (y * tz - z * ty),
    vy + w * ty + (z * tx - x * tz),
    vz + w * tz + (x * ty - y * tx),
  ];
}

function inverseTransformPoint(transform: SpatialStructureNode["transform"], point: Vec3): Vec3 {
  const shifted: Vec3 = [
    point[0] - transform.translation[0],
    point[1] - transform.translation[1],
    point[2] - transform.translation[2],
  ];
  const [x, y, z, w] = transform.rotation;
  const unrotated = rotateVector([-x, -y, -z, w], shifted);
  return [
    unrotated[0] / transform.scale[0],
    unrotated[1] / transform.scale[1],
    unrotated[2] / transform.scale[2],
  ];
}

/** Converts a point in the document/core frame to the selected level's local frame. */
export function mapDocumentPointToLevelLocal(
  structure: SpatialStructure,
  levelId: EntityId,
  point: Vec3,
): Vec3 {
  assertValidSpatialStructure(structure);
  assertValidVec3(point, "corePlacementPoint");
  const byId = new Map(structure.nodes.map((node) => [node.id, node]));
  let current: SpatialStructureNode | undefined = findLevel(structure, levelId);
  const ancestry: SpatialStructureNode[] = [];
  while (current !== undefined) {
    ancestry.push(current);
    current = current.parentId === undefined ? undefined : byId.get(current.parentId);
  }
  let local = point;
  for (const node of ancestry.reverse()) local = inverseTransformPoint(node.transform, local);
  return Object.freeze([local[0], local[1], local[2]]);
}

function labelForKind(kind: MapEntityKind, number: number): string {
  const title =
    kind === "box"
      ? "Box"
      : kind === "column"
        ? "Column"
        : kind === "asset"
          ? "TRON"
          : kind === "goal"
            ? "Goal"
            : kind === "route"
              ? "Route"
              : "Area";
  return `${title} ${number.toString()}`;
}

type MapEditorPatch = Partial<
  Pick<
    MapEditorDocument,
    "structure" | "routes" | "areas" | "goals" | "labels" | "nextEntityNumber"
  >
>;

function nextDocument(document: MapEditorDocument, patch: MapEditorPatch): MapEditorDocument {
  return freezeMapEditorDocument({ ...document, ...patch });
}

function assertMapObjectKind(kind: unknown): asserts kind is MapObjectKind {
  if (kind !== "box" && kind !== "column" && kind !== "asset") {
    throw new RangeError(`Unsupported map object kind: ${String(kind)}.`);
  }
}

/** Adds one box, column, or asset at a point expressed in the document/core frame. */
export function addMapObject(
  document: MapEditorDocument,
  kind: MapObjectKind,
  activeLevelId: EntityId,
  corePlacementPoint: Vec3,
): MapEditorMutationResult {
  assertValidMapEditorDocument(document);
  assertMapObjectKind(kind);
  const level = findLevel(document.structure, activeLevelId);
  assertValidVec3(corePlacementPoint, "corePlacementPoint");
  const allocation = allocateEntity(document, kind);
  const label = labelForKind(kind, allocation.number);
  const local = mapDocumentPointToLevelLocal(
    document.structure,
    activeLevelId,
    corePlacementPoint,
  );
  const translation: Vec3 =
    kind === "box"
      ? [local[0], local[1], local[2] + 0.5]
      : kind === "column"
        ? [local[0], local[1], local[2] + 1]
        : local;
  const transform = spatialNodeTransform(
    allocation.sourceFrame,
    level.transform.sourceFrame,
    translation,
  );
  const node: SpatialStructureNode =
    kind === "asset"
      ? {
          kind: "asset",
          id: allocation.id,
          parentId: level.id,
          name: label,
          assetId: assetId("robots/tron"),
          bounds: mapEditorTronBounds(allocation.sourceFrame),
          transform,
          selectable: true,
        }
      : {
          kind: "primitive",
          role: "object",
          id: allocation.id,
          parentId: level.id,
          name: label,
          transform,
          geometry:
            kind === "column"
              ? { kind: "cylinder", radiusMeters: 0.25, heightMeters: 2, radialSegments: 24 }
              : { kind: "box", sizeMeters: [1, 1, 1] },
          materials:
            kind === "column"
              ? { default: COLUMN_SIDE, side: COLUMN_SIDE, top: OBJECT_TOP }
              : { default: OBJECT_SIDE, side: OBJECT_SIDE, top: OBJECT_TOP },
          selectable: true,
        };
  return Object.freeze({
    document: nextDocument(document, {
      structure: createSpatialStructure(document.frame, [...document.structure.nodes, node]),
      labels: { ...document.labels, [allocation.id]: label },
      nextEntityNumber: allocation.nextNumber,
    }),
    createdId: allocation.id,
  });
}

/** Compatibility name for object placement; route, area, and goal use explicit constructors. */
export function addMapEntity(
  document: MapEditorDocument,
  kind: MapObjectKind,
  activeLevelId: EntityId,
  corePlacementPoint: Vec3,
): MapEditorMutationResult {
  return addMapObject(document, kind, activeLevelId, corePlacementPoint);
}

export function addMapRoute(
  document: MapEditorDocument,
  levelId: EntityId,
  points: readonly Vec3[],
  options: AddMapRouteOptions = {},
): MapEditorMutationResult {
  assertValidMapEditorDocument(document);
  findLevel(document.structure, levelId);
  const allocation = allocateEntity(document, "route");
  const route: MapRouteEntity = {
    kind: "route",
    id: allocation.id,
    frame: document.frame,
    levelId,
    points,
    traversal: options.traversal ?? "bidirectional",
    widthMeters: options.widthMeters ?? 0.12,
  };
  assertValidRoute(route, document.frame, document.structure);
  const label = labelForKind("route", allocation.number);
  return Object.freeze({
    document: nextDocument(document, {
      routes: [...document.routes, route],
      labels: { ...document.labels, [allocation.id]: label },
      nextEntityNumber: allocation.nextNumber,
    }),
    createdId: allocation.id,
  });
}

export function addMapArea(
  document: MapEditorDocument,
  levelId: EntityId,
  points: readonly Vec3[],
  options: AddMapAreaOptions = {},
): MapEditorMutationResult {
  assertValidMapEditorDocument(document);
  findLevel(document.structure, levelId);
  const allocation = allocateEntity(document, "area");
  const area: MapAreaEntity = {
    kind: "area",
    id: allocation.id,
    frame: document.frame,
    levelId,
    points,
    category: options.category ?? "generic",
  };
  assertValidArea(area, document.frame, document.structure);
  const label = labelForKind("area", allocation.number);
  return Object.freeze({
    document: nextDocument(document, {
      areas: [...document.areas, area],
      labels: { ...document.labels, [allocation.id]: label },
      nextEntityNumber: allocation.nextNumber,
    }),
    createdId: allocation.id,
  });
}

export function addMapGoal(
  document: MapEditorDocument,
  levelId: EntityId,
  goalPose: Pose3,
  options: AddMapGoalOptions = {},
): MapEditorMutationResult {
  assertValidMapEditorDocument(document);
  findLevel(document.structure, levelId);
  assertValidPose3(goalPose);
  if (goalPose.frame !== document.frame) {
    throw new RangeError("Goal pose must use the map document frame.");
  }
  const allocation = allocateEntity(document, "goal");
  const goal: MapGoalEntity = {
    kind: "goal",
    id: allocation.id,
    levelId,
    pose: goalPose,
    radiusMeters: options.radiusMeters ?? 0.3,
  };
  assertValidGoal(goal, document.frame, document.structure);
  const label = labelForKind("goal", allocation.number);
  return Object.freeze({
    document: nextDocument(document, {
      goals: [...document.goals, goal],
      labels: { ...document.labels, [allocation.id]: label },
      nextEntityNumber: allocation.nextNumber,
    }),
    createdId: allocation.id,
  });
}

function duplicateObjectKind(node: SpatialStructureNode): MapObjectKind {
  if (node.kind === "asset") return "asset";
  if (node.kind !== "primitive") {
    throw new RangeError("Only leaf map objects can be duplicated.");
  }
  return node.geometry.kind === "cylinder" ? "column" : "box";
}

function copyLabel(document: MapEditorDocument, id: EntityId): string {
  return `${document.labels[id] ?? id} copy`;
}

function offsetPoint(point: Vec3): Vec3 {
  return [point[0] + 0.5, point[1] + 0.5, point[2]];
}

export function duplicateMapEntity(
  document: MapEditorDocument,
  sourceId: EntityId,
): MapEditorMutationResult {
  assertValidMapEditorDocument(document);
  const goal = document.goals.find((candidate) => candidate.id === sourceId);
  if (goal !== undefined) {
    const allocation = allocateEntity(document, "goal");
    const duplicate: MapGoalEntity = {
      ...goal,
      id: allocation.id,
      pose: pose3(document.frame, offsetPoint(goal.pose.position), goal.pose.orientation),
    };
    return Object.freeze({
      document: nextDocument(document, {
        goals: [...document.goals, duplicate],
        labels: { ...document.labels, [allocation.id]: copyLabel(document, sourceId) },
        nextEntityNumber: allocation.nextNumber,
      }),
      createdId: allocation.id,
    });
  }
  const route = document.routes.find((candidate) => candidate.id === sourceId);
  if (route !== undefined) {
    const allocation = allocateEntity(document, "route");
    const duplicate: MapRouteEntity = {
      ...route,
      id: allocation.id,
      points: route.points.map(offsetPoint),
    };
    return Object.freeze({
      document: nextDocument(document, {
        routes: [...document.routes, duplicate],
        labels: { ...document.labels, [allocation.id]: copyLabel(document, sourceId) },
        nextEntityNumber: allocation.nextNumber,
      }),
      createdId: allocation.id,
    });
  }
  const area = document.areas.find((candidate) => candidate.id === sourceId);
  if (area !== undefined) {
    const allocation = allocateEntity(document, "area");
    const duplicate: MapAreaEntity = {
      ...area,
      id: allocation.id,
      points: area.points.map(offsetPoint),
    };
    return Object.freeze({
      document: nextDocument(document, {
        areas: [...document.areas, duplicate],
        labels: { ...document.labels, [allocation.id]: copyLabel(document, sourceId) },
        nextEntityNumber: allocation.nextNumber,
      }),
      createdId: allocation.id,
    });
  }

  const node = document.structure.nodes.find((candidate) => candidate.id === sourceId);
  if (node === undefined) throw new RangeError(`Missing map entity: ${sourceId}.`);
  if (node.kind === "site" || node.kind === "building" || node.kind === "level") {
    throw new RangeError("Site, building, and level containers cannot be duplicated.");
  }
  if (document.structure.nodes.some((candidate) => candidate.parentId === sourceId)) {
    throw new RangeError("Only leaf structure entities can be duplicated.");
  }
  const allocation = allocateEntity(document, duplicateObjectKind(node));
  const transform = spatialNodeTransform(
    allocation.sourceFrame,
    node.transform.targetFrame,
    offsetPoint(node.transform.translation),
    node.transform.rotation,
    node.transform.scale,
  );
  const name = copyLabel(document, sourceId);
  const duplicate: SpatialStructureNode =
    node.kind === "asset"
      ? {
          ...node,
          id: allocation.id,
          name,
          transform,
          ...(node.bounds === undefined
            ? {}
            : { bounds: bounds3(allocation.sourceFrame, node.bounds.min, node.bounds.max) }),
        }
      : { ...node, id: allocation.id, name, transform };
  return Object.freeze({
    document: nextDocument(document, {
      structure: createSpatialStructure(document.frame, [...document.structure.nodes, duplicate]),
      labels: { ...document.labels, [allocation.id]: name },
      nextEntityNumber: allocation.nextNumber,
    }),
    createdId: allocation.id,
  });
}

function withoutLabel(
  labels: Readonly<Record<string, string>>,
  removedId: EntityId,
): Readonly<Record<string, string>> {
  return Object.fromEntries(Object.entries(labels).filter(([id]) => id !== removedId));
}

export function deleteMapEntity(
  document: MapEditorDocument,
  removedId: EntityId,
): MapEditorDocument {
  assertValidMapEditorDocument(document);
  if (document.goals.some((goal) => goal.id === removedId)) {
    return nextDocument(document, {
      goals: document.goals.filter((goal) => goal.id !== removedId),
      labels: withoutLabel(document.labels, removedId),
    });
  }
  if (document.routes.some((route) => route.id === removedId)) {
    return nextDocument(document, {
      routes: document.routes.filter((route) => route.id !== removedId),
      labels: withoutLabel(document.labels, removedId),
    });
  }
  if (document.areas.some((area) => area.id === removedId)) {
    return nextDocument(document, {
      areas: document.areas.filter((area) => area.id !== removedId),
      labels: withoutLabel(document.labels, removedId),
    });
  }
  const node = document.structure.nodes.find((candidate) => candidate.id === removedId);
  if (node === undefined) throw new RangeError(`Missing map entity: ${removedId}.`);
  if (node.kind === "site" || node.kind === "building" || node.kind === "level") {
    throw new RangeError("Site, building, and level containers cannot be deleted.");
  }
  if (document.structure.nodes.some((candidate) => candidate.parentId === removedId)) {
    throw new RangeError("Only leaf structure entities can be deleted.");
  }
  return nextDocument(document, {
    structure: createSpatialStructure(
      document.frame,
      document.structure.nodes.filter((candidate) => candidate.id !== removedId),
    ),
    labels: withoutLabel(document.labels, removedId),
  });
}

export function renameMapEntity(
  document: MapEditorDocument,
  renamedId: EntityId,
  nextLabel: string,
): MapEditorDocument {
  assertValidMapEditorDocument(document);
  assertNonEmptyText(nextLabel, "nextLabel");
  const normalized = nextLabel.trim();
  const isFirstClassEntity =
    document.goals.some((goal) => goal.id === renamedId) ||
    document.routes.some((route) => route.id === renamedId) ||
    document.areas.some((area) => area.id === renamedId);
  const node = document.structure.nodes.find((candidate) => candidate.id === renamedId);
  if (!isFirstClassEntity && node === undefined) {
    throw new RangeError(`Missing map entity: ${renamedId}.`);
  }
  return nextDocument(document, {
    ...(node === undefined
      ? {}
      : {
          structure: createSpatialStructure(
            document.frame,
            document.structure.nodes.map((candidate) =>
              candidate.id === renamedId ? { ...candidate, name: normalized } : candidate,
            ),
          ),
        }),
    labels: { ...document.labels, [renamedId]: normalized },
  });
}

export function replaceMapEntityTransform(
  document: MapEditorDocument,
  targetId: EntityId,
  transform: SpatialStructureNode["transform"],
): MapEditorDocument {
  assertValidMapEditorDocument(document);
  assertValidSpatialNodeTransform(transform);
  const node = document.structure.nodes.find((candidate) => candidate.id === targetId);
  if (node === undefined || node.kind === "site" || node.kind === "building" || node.kind === "level") {
    throw new RangeError("Only leaf primitive and asset transforms can be edited.");
  }
  if (
    transform.sourceFrame !== node.transform.sourceFrame ||
    transform.targetFrame !== node.transform.targetFrame
  ) {
    throw new RangeError("Transform replacement cannot rename frames or reparent an entity.");
  }
  return nextDocument(document, {
    structure: createSpatialStructure(
      document.frame,
      document.structure.nodes.map((candidate) =>
        candidate.id === targetId ? { ...candidate, transform } : candidate,
      ),
    ),
  });
}

export function stepMapEntityTransform(
  document: MapEditorDocument,
  targetId: EntityId,
  options: SpatialTransformStepOptions,
): MapEditorDocument {
  const node = document.structure.nodes.find((candidate) => candidate.id === targetId);
  if (node === undefined) throw new RangeError(`Missing map entity: ${targetId}.`);
  return replaceMapEntityTransform(
    document,
    targetId,
    stepSpatialNodeTransform(node.transform, options),
  );
}

export function updateMapGoalPose(
  document: MapEditorDocument,
  goalId: EntityId,
  nextPose: Pose3,
): MapEditorDocument {
  assertValidMapEditorDocument(document);
  assertValidPose3(nextPose);
  if (nextPose.frame !== document.frame) {
    throw new RangeError("Goal pose must use the map document frame.");
  }
  if (!document.goals.some((goal) => goal.id === goalId)) {
    throw new RangeError(`Missing goal entity: ${goalId}.`);
  }
  return nextDocument(document, {
    goals: document.goals.map((goal) =>
      goal.id === goalId ? { ...goal, pose: nextPose } : goal,
    ),
  });
}

export function updateMapRoutePoints(
  document: MapEditorDocument,
  routeId: EntityId,
  nextPoints: readonly Vec3[],
): MapEditorDocument {
  assertValidMapEditorDocument(document);
  if (!document.routes.some((route) => route.id === routeId)) {
    throw new RangeError(`Missing route entity: ${routeId}.`);
  }
  assertValidPointSequence(nextPoints, 2, "nextPoints");
  return nextDocument(document, {
    routes: document.routes.map((route) =>
      route.id === routeId ? { ...route, points: nextPoints } : route,
    ),
  });
}

export function updateMapAreaPoints(
  document: MapEditorDocument,
  areaId: EntityId,
  nextPoints: readonly Vec3[],
): MapEditorDocument {
  assertValidMapEditorDocument(document);
  const area = document.areas.find((candidate) => candidate.id === areaId);
  if (area === undefined) throw new RangeError(`Missing area entity: ${areaId}.`);
  assertValidArea(
    { ...area, points: nextPoints },
    document.frame,
    document.structure,
  );
  return nextDocument(document, {
    areas: document.areas.map((candidate) =>
      candidate.id === areaId ? { ...candidate, points: nextPoints } : candidate,
    ),
  });
}
