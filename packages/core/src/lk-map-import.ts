/**
 * A2 vertical-slice contract (DRAFT — not re-exported from core index): normalize
 * a declared-metadata Isaac/OpenUSD reference mapping manifest into the canonical
 * {@link LKMapDocument}. Per Contract 2 (ADR-0002 '도구별 우선순위'), the input is a
 * versioned LK mapping manifest with namespaced durable entity metadata
 * (`lk:entityId:*`), NOT arbitrary mesh geometry or prim-name inference.
 *
 * This proves the dual-path convergence at the contract layer: the same one-level
 * document (floor + polyline wall + waypoint-edge route) that the Native Builder
 * authors directly is produced from the Isaac import path, differing only by the
 * durable source binding the import path records. Actual USD parsing, Native
 * Builder gestures, and derived GLB/occupancy generation are runtime concerns
 * beyond this contract.
 */

import type { EntityId } from "./identifiers.js";
import type { Vec3 } from "./coordinates.js";
import type {
  LKMapBindingEntity,
  LKMapCoordinateProfile,
  LKMapDocument,
  LKMapNodeTransform,
} from "./lk-map-document.js";

interface IsaacMappingLevel {
  readonly lkId: EntityId;
  readonly durableId: string;
  readonly elevationMeters: number;
  readonly transform: LKMapNodeTransform;
}
interface IsaacMappingVertex {
  readonly lkId: EntityId;
  readonly durableId: string;
  readonly levelLkId: EntityId;
  readonly position: Vec3;
}
interface IsaacMappingFloor {
  readonly lkId: EntityId;
  readonly durableId: string;
  readonly levelLkId: EntityId;
  readonly vertexLkIds: readonly EntityId[];
}
interface IsaacMappingWall {
  readonly lkId: EntityId;
  readonly durableId: string;
  readonly levelLkId: EntityId;
  readonly vertexLkIds: readonly EntityId[];
  readonly thicknessMeters: number;
  readonly heightMeters: number;
}
interface IsaacMappingWaypoint {
  readonly lkId: EntityId;
  readonly durableId: string;
  readonly levelLkId: EntityId;
  readonly vertexLkId: EntityId;
}
interface IsaacMappingEdge {
  readonly lkId: EntityId;
  readonly durableId: string;
  readonly fromWaypointLkId: EntityId;
  readonly toWaypointLkId: EntityId;
  readonly direction: "forward" | "reverse" | "bidirectional";
  readonly widthMeters?: number;
}

export interface IsaacMappingManifest {
  readonly manifestVersion: number;
  readonly targetSchemaVersion: number;
  readonly source: {
    readonly tool: string;
    readonly version: string;
    readonly documentId: string;
    readonly hash: string;
  };
  readonly coordinate: LKMapCoordinateProfile;
  readonly documentId: EntityId;
  readonly name?: string;
  readonly levels: readonly IsaacMappingLevel[];
  readonly vertices: readonly IsaacMappingVertex[];
  readonly floors: readonly IsaacMappingFloor[];
  readonly walls: readonly IsaacMappingWall[];
  readonly route?: {
    readonly waypoints: readonly IsaacMappingWaypoint[];
    readonly edges: readonly IsaacMappingEdge[];
  };
}

/**
 * Produce the canonical document plus a durable binding. Every mapped entity is
 * bound durably to the manifest's `lk:entityId:*` metadata; no path-only (weak)
 * binding is created because the source declared durable identity.
 */
export function normalizeIsaacReferenceMapping(manifest: IsaacMappingManifest): LKMapDocument {
  const bindingEntities: LKMapBindingEntity[] = [];
  const bindDurable = (entityId: EntityId, durableId: string): void => {
    bindingEntities.push({ entityId, kind: "durable", durableId });
  };

  const levels = manifest.levels.map((level) => {
    bindDurable(level.lkId, level.durableId);
    return {
      kind: "level" as const,
      id: level.lkId,
      elevationMeters: level.elevationMeters,
      transform: level.transform,
    };
  });
  const vertices = manifest.vertices.map((vertex) => {
    bindDurable(vertex.lkId, vertex.durableId);
    return { id: vertex.lkId, levelId: vertex.levelLkId, position: vertex.position };
  });
  const floors = manifest.floors.map((floor) => {
    bindDurable(floor.lkId, floor.durableId);
    return { id: floor.lkId, levelId: floor.levelLkId, vertexIds: floor.vertexLkIds };
  });
  const walls = manifest.walls.map((wall) => {
    bindDurable(wall.lkId, wall.durableId);
    return {
      id: wall.lkId,
      levelId: wall.levelLkId,
      vertexIds: wall.vertexLkIds,
      thicknessMeters: wall.thicknessMeters,
      heightMeters: wall.heightMeters,
    };
  });

  const routeGraph = manifest.route
    ? {
        waypoints: manifest.route.waypoints.map((waypoint) => {
          bindDurable(waypoint.lkId, waypoint.durableId);
          return { id: waypoint.lkId, levelId: waypoint.levelLkId, vertexId: waypoint.vertexLkId };
        }),
        edges: manifest.route.edges.map((edge) => {
          bindDurable(edge.lkId, edge.durableId);
          return {
            id: edge.lkId,
            fromWaypointId: edge.fromWaypointLkId,
            toWaypointId: edge.toWaypointLkId,
            direction: edge.direction,
            ...(edge.widthMeters === undefined ? {} : { widthMeters: edge.widthMeters }),
          };
        }),
      }
    : undefined;

  return {
    schemaVersion: 1,
    documentId: manifest.documentId,
    ...(manifest.name === undefined ? {} : { name: manifest.name }),
    coordinate: manifest.coordinate,
    structure: { levels, vertices, floors, walls },
    ...(routeGraph === undefined ? {} : { semantics: { routeGraph } }),
    binding: { source: manifest.source, entities: bindingEntities },
  };
}
