/**
 * A1 unified LK Map Document model (DRAFT — not yet part of the public core
 * entry point). Mirrors docs/schemas/lk-map-document.v1.draft.schema.json and
 * adds the referential-integrity and coordinate-profile invariants JSON Schema
 * cannot express. See docs/A0-MAP-CONTRACT-DRAFT.md.
 *
 * This is the production document model, deliberately separate from the
 * Story-local `MapEditorDocument` V2 fixture in apps/docs. It is intentionally
 * NOT re-exported from `./index.js` until A0 sign-off promotes it (§10.1); tests
 * import it directly.
 */

import type { EntityId, FrameId } from "./identifiers.js";
import type { Quat, Vec3 } from "./coordinates.js";

export const LK_MAP_DOCUMENT_SCHEMA_VERSION = 1 as const;

export type LKMapVertexId = EntityId;

export interface LKMapPose {
  readonly frame: FrameId;
  readonly position: Vec3;
  readonly orientation: Quat;
}

export interface LKMapRasterProfile {
  readonly imageOrigin: "top-left";
  readonly gridRow0: "min-Y";
  readonly rowFlip?: string;
  readonly rosYamlOrigin: "lower-left";
  readonly dataIndex?: string;
  readonly originYaw?: number;
  readonly negate?: 0 | 1;
  readonly occupiedThresh?: number;
  readonly freeThresh?: number;
  readonly anchor?: {
    readonly anchorPixel: readonly [number, number];
    readonly metersPerPixel: number;
    readonly levelPose: LKMapPose;
    readonly yaw?: number;
  };
}

export interface LKMapCoordinateProfile {
  readonly handedness: "right";
  readonly up: "+Z";
  readonly forward: "+X";
  readonly unitsLength: "meter";
  readonly unitsAngle: "radian";
  readonly origin: LKMapPose;
  readonly raster?: LKMapRasterProfile;
}

export interface LKMapNodeTransform {
  readonly sourceFrame: FrameId;
  readonly targetFrame: FrameId;
  readonly translation: Vec3;
  readonly rotation: Quat;
  readonly scale: Vec3;
}

export interface LKMapLevelNode {
  readonly kind: "level";
  readonly id: EntityId;
  readonly parentId?: EntityId;
  readonly name?: string;
  readonly transform: LKMapNodeTransform;
  readonly elevationMeters: number;
  readonly visible?: boolean;
}

export interface LKMapVertex {
  readonly id: LKMapVertexId;
  readonly levelId: EntityId;
  readonly position: Vec3;
}

export interface LKMapFloorPolygon {
  readonly id: EntityId;
  readonly levelId: EntityId;
  readonly vertexIds: readonly LKMapVertexId[];
}

export interface LKMapWallPolyline {
  readonly id: EntityId;
  readonly levelId: EntityId;
  readonly vertexIds: readonly LKMapVertexId[];
  readonly thicknessMeters: number;
  readonly heightMeters: number;
  readonly closed?: boolean;
}

export interface LKMapStructure {
  readonly sites?: readonly LKMapStructureNode[];
  readonly buildings?: readonly LKMapStructureNode[];
  readonly levels?: readonly LKMapLevelNode[];
  readonly vertices?: readonly LKMapVertex[];
  readonly floors?: readonly LKMapFloorPolygon[];
  readonly walls?: readonly LKMapWallPolyline[];
  readonly openings?: readonly LKMapOpening[];
  readonly transitions?: readonly LKMapLevelTransition[];
  readonly primitives?: readonly LKMapStructureNode[];
  readonly assets?: readonly LKMapStructureNode[];
}

export interface LKMapStructureNode {
  readonly kind: string;
  readonly id: EntityId;
  readonly transform: LKMapNodeTransform;
}

export interface LKMapOpening {
  readonly id: EntityId;
  readonly wallId: EntityId;
  readonly kind: "door" | "opening";
  readonly distanceMeters: number;
  readonly widthMeters: number;
  readonly heightMeters?: number;
}

export interface LKMapLevelTransition {
  readonly id: EntityId;
  readonly kind: "lift" | "stair" | "ramp";
  readonly fromLevelId: EntityId;
  readonly toLevelId: EntityId;
}

export interface LKMapWaypoint {
  readonly id: EntityId;
  readonly levelId: EntityId;
  readonly vertexId: LKMapVertexId;
  readonly orientation?: Quat;
}

export interface LKMapRouteEdge {
  readonly id: EntityId;
  readonly fromWaypointId: EntityId;
  readonly toWaypointId: EntityId;
  readonly direction: "forward" | "reverse" | "bidirectional";
  readonly widthMeters?: number;
}

export interface LKMapWaypointEdgeGraph {
  readonly waypoints: readonly LKMapWaypoint[];
  readonly edges: readonly LKMapRouteEdge[];
}

export interface LKMapArea {
  readonly id: EntityId;
  readonly levelId: EntityId;
  readonly vertexIds: readonly LKMapVertexId[];
  readonly category: "generic" | "keepout" | "slow" | "work";
}

export interface LKMapGoal {
  readonly id: EntityId;
  readonly levelId: EntityId;
  readonly pose: LKMapPose;
  readonly radiusMeters?: number;
}

export interface LKMapSemantics {
  readonly routeGraph?: LKMapWaypointEdgeGraph;
  readonly areas?: readonly LKMapArea[];
  readonly goals?: readonly LKMapGoal[];
  readonly chargers?: readonly LKMapGoal[];
  readonly docks?: readonly LKMapGoal[];
}

export interface LKMapBindingEntity {
  readonly entityId: EntityId;
  readonly kind: "durable" | "weak";
  readonly durableId?: string;
  readonly path?: string;
  readonly tombstone?: boolean;
}

export interface LKMapExternalBinding {
  readonly source: {
    readonly tool: string;
    readonly version: string;
    readonly documentId: string;
    readonly hash: string;
  };
  readonly normalizedBaseRef?: string;
  readonly entities: readonly LKMapBindingEntity[];
}

export interface LKMapDocument {
  readonly schemaVersion: typeof LK_MAP_DOCUMENT_SCHEMA_VERSION;
  readonly documentId: EntityId;
  readonly name?: string;
  readonly coordinate: LKMapCoordinateProfile;
  readonly structure: LKMapStructure;
  readonly semantics?: LKMapSemantics;
  readonly binding?: LKMapExternalBinding;
  readonly provenance?: unknown;
  readonly extensions?: Readonly<Record<string, unknown>>;
  readonly "x-unknown"?: Readonly<Record<string, unknown>>;
}

export interface LKMapDocumentIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export class LKMapDocumentValidationError extends Error {
  readonly issues: readonly LKMapDocumentIssue[];
  constructor(issues: readonly LKMapDocumentIssue[]) {
    super(
      `Invalid LK Map Document: ${issues.map((issue) => `${issue.path} ${issue.message}`).join("; ")}`,
    );
    this.name = "LKMapDocumentValidationError";
    this.issues = issues;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isString(value: unknown): value is string {
  return typeof value === "string";
}
function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}
function nonEmptyString(value: unknown): value is string {
  return isString(value) && value.length > 0;
}

/** Returns a deterministic, ordered list of contract violations (empty if valid). */
export function validateLKMapDocument(value: unknown): readonly LKMapDocumentIssue[] {
  const issues: LKMapDocumentIssue[] = [];
  const add = (code: string, path: string, message: string): void => {
    issues.push({ code, path, message });
  };

  if (!isRecord(value)) {
    add("NOT_OBJECT", "$", "document must be an object");
    return issues;
  }

  if (value.schemaVersion !== LK_MAP_DOCUMENT_SCHEMA_VERSION) {
    add("SCHEMA_VERSION", "$.schemaVersion", `must be ${String(LK_MAP_DOCUMENT_SCHEMA_VERSION)}`);
  }
  if (!nonEmptyString(value.documentId)) {
    add("DOCUMENT_ID", "$.documentId", "must be a non-empty string");
  }

  validateCoordinate(value.coordinate, add);

  const structure = isRecord(value.structure) ? value.structure : undefined;
  if (structure === undefined) {
    add("STRUCTURE", "$.structure", "must be an object");
  }

  // Collect entity IDs across the document and check uniqueness.
  const seenIds = new Set<string>();
  const levelIds = new Set<string>();
  const vertexIds = new Set<string>();
  const wallIds = new Set<string>();
  const waypointIds = new Set<string>();

  const registerId = (id: unknown, path: string): void => {
    if (!nonEmptyString(id)) {
      add("ENTITY_ID", path, "must be a non-empty string");
      return;
    }
    if (seenIds.has(id)) add("DUPLICATE_ID", path, `duplicate entity id "${id}"`);
    seenIds.add(id);
  };

  if (structure !== undefined) {
    for (const [i, raw] of asArray(structure.levels).entries()) {
      const level = isRecord(raw) ? raw : {};
      registerId(level.id, `$.structure.levels[${String(i)}].id`);
      if (nonEmptyString(level.id)) levelIds.add(level.id);
      if (typeof level.elevationMeters !== "number") {
        add(
          "LEVEL_ELEVATION",
          `$.structure.levels[${String(i)}].elevationMeters`,
          "must be a number",
        );
      }
    }
    for (const [i, raw] of asArray(structure.vertices).entries()) {
      const vertex = isRecord(raw) ? raw : {};
      registerId(vertex.id, `$.structure.vertices[${String(i)}].id`);
      if (nonEmptyString(vertex.id)) vertexIds.add(vertex.id);
      requireLevel(vertex.levelId, `$.structure.vertices[${String(i)}].levelId`, levelIds, add);
    }
    for (const [i, raw] of asArray(structure.floors).entries()) {
      const floor = isRecord(raw) ? raw : {};
      registerId(floor.id, `$.structure.floors[${String(i)}].id`);
      requireLevel(floor.levelId, `$.structure.floors[${String(i)}].levelId`, levelIds, add);
      requireVertexRefs(
        floor.vertexIds,
        `$.structure.floors[${String(i)}].vertexIds`,
        vertexIds,
        add,
      );
    }
    for (const [i, raw] of asArray(structure.walls).entries()) {
      const wall = isRecord(raw) ? raw : {};
      registerId(wall.id, `$.structure.walls[${String(i)}].id`);
      if (nonEmptyString(wall.id)) wallIds.add(wall.id);
      requireLevel(wall.levelId, `$.structure.walls[${String(i)}].levelId`, levelIds, add);
      requireVertexRefs(
        wall.vertexIds,
        `$.structure.walls[${String(i)}].vertexIds`,
        vertexIds,
        add,
      );
    }
    for (const [i, raw] of asArray(structure.openings).entries()) {
      const opening = isRecord(raw) ? raw : {};
      registerId(opening.id, `$.structure.openings[${String(i)}].id`);
      if (!wallIds.has(String(opening.wallId))) {
        add(
          "OPENING_WALL_REF",
          `$.structure.openings[${String(i)}].wallId`,
          `unknown wall "${String(opening.wallId)}"`,
        );
      }
    }
    for (const [i, raw] of asArray(structure.transitions).entries()) {
      const transition = isRecord(raw) ? raw : {};
      registerId(transition.id, `$.structure.transitions[${String(i)}].id`);
      requireLevel(
        transition.fromLevelId,
        `$.structure.transitions[${String(i)}].fromLevelId`,
        levelIds,
        add,
      );
      requireLevel(
        transition.toLevelId,
        `$.structure.transitions[${String(i)}].toLevelId`,
        levelIds,
        add,
      );
    }
  }

  const semantics = isRecord(value.semantics) ? value.semantics : undefined;
  if (semantics !== undefined) {
    const graph = isRecord(semantics.routeGraph) ? semantics.routeGraph : undefined;
    if (graph !== undefined) {
      for (const [i, raw] of asArray(graph.waypoints).entries()) {
        const wp = isRecord(raw) ? raw : {};
        registerId(wp.id, `$.semantics.routeGraph.waypoints[${String(i)}].id`);
        if (nonEmptyString(wp.id)) waypointIds.add(wp.id);
        requireLevel(
          wp.levelId,
          `$.semantics.routeGraph.waypoints[${String(i)}].levelId`,
          levelIds,
          add,
        );
        if (!vertexIds.has(String(wp.vertexId))) {
          add(
            "WAYPOINT_VERTEX_REF",
            `$.semantics.routeGraph.waypoints[${String(i)}].vertexId`,
            `unknown vertex "${String(wp.vertexId)}"`,
          );
        }
      }
      for (const [i, raw] of asArray(graph.edges).entries()) {
        const edge = isRecord(raw) ? raw : {};
        registerId(edge.id, `$.semantics.routeGraph.edges[${String(i)}].id`);
        for (const key of ["fromWaypointId", "toWaypointId"] as const) {
          if (!waypointIds.has(String(edge[key]))) {
            add(
              "EDGE_WAYPOINT_REF",
              `$.semantics.routeGraph.edges[${String(i)}].${key}`,
              `unknown waypoint "${String(edge[key])}"`,
            );
          }
        }
      }
    }
    for (const group of ["areas", "goals", "chargers", "docks"] as const) {
      for (const [i, raw] of asArray(semantics[group]).entries()) {
        const item = isRecord(raw) ? raw : {};
        registerId(item.id, `$.semantics.${group}[${String(i)}].id`);
        requireLevel(item.levelId, `$.semantics.${group}[${String(i)}].levelId`, levelIds, add);
        if (group === "areas")
          requireVertexRefs(
            item.vertexIds,
            `$.semantics.${group}[${String(i)}].vertexIds`,
            vertexIds,
            add,
          );
      }
    }
  }

  validateBinding(value.binding, add);

  return issues;
}

function validateCoordinate(
  coordinate: unknown,
  add: (code: string, path: string, message: string) => void,
): void {
  if (!isRecord(coordinate)) {
    add("COORDINATE", "$.coordinate", "must be an object");
    return;
  }
  const expected: Record<string, unknown> = {
    handedness: "right",
    up: "+Z",
    forward: "+X",
    unitsLength: "meter",
    unitsAngle: "radian",
  };
  for (const [key, want] of Object.entries(expected)) {
    if (coordinate[key] !== want) {
      add("COORDINATE_PROFILE", `$.coordinate.${key}`, `must be "${String(want)}"`);
    }
  }
  if (!isRecord(coordinate.origin) || !nonEmptyString(coordinate.origin.frame)) {
    add("COORDINATE_ORIGIN", "$.coordinate.origin", "must have a frame");
  }
  if (coordinate.raster !== undefined) {
    const raster = isRecord(coordinate.raster) ? coordinate.raster : {};
    const rasterExpected: Record<string, unknown> = {
      imageOrigin: "top-left",
      gridRow0: "min-Y",
      rosYamlOrigin: "lower-left",
    };
    for (const [key, want] of Object.entries(rasterExpected)) {
      if (raster[key] !== want) {
        add(
          "RASTER_PROFILE",
          `$.coordinate.raster.${key}`,
          `must be "${String(want)}" (Contract 1)`,
        );
      }
    }
  }
}

function validateBinding(
  binding: unknown,
  add: (code: string, path: string, message: string) => void,
): void {
  if (binding === undefined) return;
  if (!isRecord(binding)) {
    add("BINDING", "$.binding", "must be an object");
    return;
  }
  const source = isRecord(binding.source) ? binding.source : undefined;
  if (source === undefined) {
    add("BINDING_SOURCE", "$.binding.source", "must be an object");
  } else {
    for (const key of ["tool", "version", "documentId", "hash"]) {
      if (!nonEmptyString(source[key])) {
        add("BINDING_SOURCE_FIELD", `$.binding.source.${key}`, "must be a non-empty string");
      }
    }
  }
  for (const [i, raw] of asArray(binding.entities).entries()) {
    const entity = isRecord(raw) ? raw : {};
    if (entity.kind === "durable" && !nonEmptyString(entity.durableId)) {
      add(
        "BINDING_DURABLE",
        `$.binding.entities[${String(i)}].durableId`,
        "durable binding requires a durableId",
      );
    }
    if (entity.kind === "weak" && !nonEmptyString(entity.path)) {
      add(
        "BINDING_WEAK",
        `$.binding.entities[${String(i)}].path`,
        "weak binding requires a path (remap-required)",
      );
    }
    if (entity.kind !== "durable" && entity.kind !== "weak") {
      add("BINDING_KIND", `$.binding.entities[${String(i)}].kind`, 'must be "durable" or "weak"');
    }
  }
}

function requireLevel(
  levelId: unknown,
  path: string,
  levelIds: ReadonlySet<string>,
  add: (code: string, path: string, message: string) => void,
): void {
  if (!levelIds.has(String(levelId))) {
    add("LEVEL_REF", path, `unknown level "${String(levelId)}"`);
  }
}

function requireVertexRefs(
  vertexRefs: unknown,
  path: string,
  vertexIds: ReadonlySet<string>,
  add: (code: string, path: string, message: string) => void,
): void {
  const refs = asArray(vertexRefs);
  if (refs.length === 0) {
    add("VERTEX_REFS_EMPTY", path, "must reference at least one vertex");
    return;
  }
  for (const [i, ref] of refs.entries()) {
    if (!vertexIds.has(String(ref))) {
      add("VERTEX_REF", `${path}[${String(i)}]`, `unknown vertex "${String(ref)}"`);
    }
  }
}

export function isValidLKMapDocument(value: unknown): value is LKMapDocument {
  return validateLKMapDocument(value).length === 0;
}

export function assertValidLKMapDocument(value: unknown): asserts value is LKMapDocument {
  const issues = validateLKMapDocument(value);
  if (issues.length > 0) throw new LKMapDocumentValidationError(issues);
}
