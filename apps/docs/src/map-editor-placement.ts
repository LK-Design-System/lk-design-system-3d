import type {
  Bounds3,
  EntityId,
  SpatialStructureNode,
  Vec3,
} from "@lk-design-system/lds-3d-core";

import {
  MAP_EDITOR_TRON_MANIFEST,
  MAP_EDITOR_TRON_XY_FOOTPRINT,
} from "./map-editor-asset-catalog.js";
import type { MapEditorDocument, MapObjectKind } from "./map-editor-model.js";

interface XyFootprint {
  readonly center: readonly [number, number];
  readonly size: readonly [number, number];
}

export interface MapObjectPlacementValidity {
  readonly valid: boolean;
  readonly message: string;
}

export interface MapObjectPlacementOptions {
  readonly authoringBounds: Bounds3;
  readonly clearanceMeters?: number;
}

const DEFAULT_PLACEMENT_CLEARANCE_METERS = 0.06;

export function mapObjectFootprintSize(
  kind: MapObjectKind,
): readonly [number, number] {
  if (kind === "column") return [0.5, 0.5];
  if (kind === "asset") return MAP_EDITOR_TRON_XY_FOOTPRINT.sizeMeters;
  return [1, 1];
}

export function mapObjectFootprintCenterOffset(
  kind: MapObjectKind,
): readonly [number, number] {
  return kind === "asset"
    ? MAP_EDITOR_TRON_XY_FOOTPRINT.centerOffsetMeters
    : [0, 0];
}

function structureNodeLevelId(
  document: MapEditorDocument,
  nodeId: EntityId,
): EntityId | null {
  let current = document.structure.nodes.find((node) => node.id === nodeId);
  while (current !== undefined) {
    if (current.kind === "level") return current.id;
    if (current.parentId === undefined) return null;
    current = document.structure.nodes.find((node) => node.id === current?.parentId);
  }
  return null;
}

function objectFootprintAtPoint(kind: MapObjectKind, point: Vec3): XyFootprint {
  const offset = mapObjectFootprintCenterOffset(kind);
  return {
    center: [point[0] + offset[0], point[1] + offset[1]],
    size: mapObjectFootprintSize(kind),
  };
}

function structureNodeFootprint(node: SpatialStructureNode): XyFootprint | null {
  if (node.kind === "site" || node.kind === "building" || node.kind === "level") {
    return null;
  }
  const [scaleX, scaleY] = node.transform.scale;
  let localSize: readonly [number, number];
  let localCenter: readonly [number, number] = [0, 0];
  if (node.kind === "asset") {
    if (node.bounds === undefined) {
      if (node.assetId !== MAP_EDITOR_TRON_MANIFEST.assetId) return null;
      localSize = MAP_EDITOR_TRON_XY_FOOTPRINT.sizeMeters;
      localCenter = MAP_EDITOR_TRON_XY_FOOTPRINT.centerOffsetMeters;
    } else {
      localSize = [
        node.bounds.max[0] - node.bounds.min[0],
        node.bounds.max[1] - node.bounds.min[1],
      ];
      localCenter = [
        (node.bounds.min[0] + node.bounds.max[0]) / 2,
        (node.bounds.min[1] + node.bounds.max[1]) / 2,
      ];
    }
  } else if (node.geometry.kind === "cylinder") {
    localSize = [node.geometry.radiusMeters * 2, node.geometry.radiusMeters * 2];
  } else {
    localSize = [node.geometry.sizeMeters[0], node.geometry.sizeMeters[1]];
  }
  const [quaternionX, quaternionY, quaternionZ, quaternionW] =
    node.transform.rotation;
  const yawRadians = Math.atan2(
    2 * (quaternionW * quaternionZ + quaternionX * quaternionY),
    1 - 2 * (quaternionY * quaternionY + quaternionZ * quaternionZ),
  );
  const cosine = Math.cos(yawRadians);
  const sine = Math.sin(yawRadians);
  const scaledWidth = Math.abs(localSize[0] * scaleX);
  const scaledHeight = Math.abs(localSize[1] * scaleY);
  const rotatedCenterX =
    localCenter[0] * scaleX * cosine - localCenter[1] * scaleY * sine;
  const rotatedCenterY =
    localCenter[0] * scaleX * sine + localCenter[1] * scaleY * cosine;
  return {
    center: [
      node.transform.translation[0] + rotatedCenterX,
      node.transform.translation[1] + rotatedCenterY,
    ],
    size: [
      Math.abs(cosine) * scaledWidth + Math.abs(sine) * scaledHeight,
      Math.abs(sine) * scaledWidth + Math.abs(cosine) * scaledHeight,
    ],
  };
}

function footprintContains(
  container: XyFootprint,
  candidate: XyFootprint,
  clearanceMeters: number,
): boolean {
  return (
    candidate.center[0] - candidate.size[0] / 2 >=
      container.center[0] - container.size[0] / 2 + clearanceMeters &&
    candidate.center[0] + candidate.size[0] / 2 <=
      container.center[0] + container.size[0] / 2 - clearanceMeters &&
    candidate.center[1] - candidate.size[1] / 2 >=
      container.center[1] - container.size[1] / 2 + clearanceMeters &&
    candidate.center[1] + candidate.size[1] / 2 <=
      container.center[1] + container.size[1] / 2 - clearanceMeters
  );
}

function footprintsOverlap(
  first: XyFootprint,
  second: XyFootprint,
  clearanceMeters: number,
): boolean {
  return (
    Math.abs(first.center[0] - second.center[0]) <
      (first.size[0] + second.size[0]) / 2 + clearanceMeters &&
    Math.abs(first.center[1] - second.center[1]) <
      (first.size[1] + second.size[1]) / 2 + clearanceMeters
  );
}

/** Validates one object/asset ghost against the active floor and placed entities. */
export function validateMapObjectPlacement(
  document: MapEditorDocument,
  levelId: EntityId,
  kind: MapObjectKind,
  point: Vec3,
  options: MapObjectPlacementOptions,
): MapObjectPlacementValidity {
  const clearanceMeters =
    options.clearanceMeters ?? DEFAULT_PLACEMENT_CLEARANCE_METERS;
  if (!Number.isFinite(clearanceMeters) || clearanceMeters < 0) {
    throw new RangeError("clearanceMeters must be finite and non-negative.");
  }
  const candidate = objectFootprintAtPoint(kind, point);
  const authoringFootprint: XyFootprint = {
    center: [
      (options.authoringBounds.min[0] + options.authoringBounds.max[0]) / 2,
      (options.authoringBounds.min[1] + options.authoringBounds.max[1]) / 2,
    ],
    size: [
      options.authoringBounds.max[0] - options.authoringBounds.min[0],
      options.authoringBounds.max[1] - options.authoringBounds.min[1],
    ],
  };
  const floor = document.structure.nodes.find(
    (node) =>
      node.kind === "primitive" &&
      node.role === "floor" &&
      structureNodeLevelId(document, node.id) === levelId,
  );
  const floorFootprint = floor === undefined ? null : structureNodeFootprint(floor);
  if (
    !footprintContains(authoringFootprint, candidate, clearanceMeters) ||
    (floorFootprint !== null &&
      !footprintContains(floorFootprint, candidate, clearanceMeters))
  ) {
    return { valid: false, message: "배치 불가 · 활성 층 바닥 경계를 벗어남" };
  }
  const collision = document.structure.nodes.find((node) => {
    if (structureNodeLevelId(document, node.id) !== levelId) return false;
    if (node.kind === "primitive" && node.role === "floor") return false;
    const footprint = structureNodeFootprint(node);
    return (
      footprint !== null &&
      footprintsOverlap(candidate, footprint, clearanceMeters)
    );
  });
  if (collision !== undefined) {
    return {
      valid: false,
      message: `배치 불가 · 겹치는 객체: ${document.labels[collision.id] ?? collision.id}`,
    };
  }
  return { valid: true, message: "배치 가능 · 클릭하면 한 번의 이력으로 확정" };
}
