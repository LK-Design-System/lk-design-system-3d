import {
  assertUnitQuaternion,
  assertValidBounds3,
  assertValidFrameId,
  assertValidVec3,
  normalizeQuaternion,
  type Bounds3,
  type FrameId,
  type Quat,
  type Vec3,
} from "./coordinates.js";
import {
  assertValidAssetId,
  assertValidEntityId,
  type AssetId,
  type EntityId,
} from "./identifiers.js";

export type LinearRgba = readonly [number, number, number, number];

export interface SpatialPbrMaterial {
  readonly baseColorFactor: LinearRgba;
  readonly metallicFactor: number;
  readonly roughnessFactor: number;
  readonly doubleSided?: boolean;
}

export interface SpatialMaterialSlots {
  readonly default: SpatialPbrMaterial;
  readonly top?: SpatialPbrMaterial;
  readonly side?: SpatialPbrMaterial;
}

export interface SpatialNodeTransform {
  readonly sourceFrame: FrameId;
  readonly targetFrame: FrameId;
  readonly translation: Vec3;
  readonly rotation: Quat;
  readonly scale: Vec3;
}

interface SpatialNodeBase {
  readonly id: EntityId;
  readonly parentId?: EntityId;
  readonly name?: string;
  readonly transform: SpatialNodeTransform;
  readonly visible?: boolean;
}

export interface SpatialSiteNode extends SpatialNodeBase {
  readonly kind: "site";
}

export interface SpatialBuildingNode extends SpatialNodeBase {
  readonly kind: "building";
}

export interface SpatialLevelNode extends SpatialNodeBase {
  readonly kind: "level";
  readonly elevationMeters: number;
}

export interface SpatialBoxGeometry {
  readonly kind: "box";
  readonly sizeMeters: Vec3;
}

export interface SpatialCylinderGeometry {
  readonly kind: "cylinder";
  readonly radiusMeters: number;
  readonly heightMeters: number;
  readonly radialSegments?: number;
}

export type SpatialPrimitiveGeometry = SpatialBoxGeometry | SpatialCylinderGeometry;

export interface SpatialPrimitiveNode extends SpatialNodeBase {
  readonly kind: "primitive";
  readonly role: "floor" | "wall" | "object";
  readonly geometry: SpatialPrimitiveGeometry;
  readonly materials: SpatialMaterialSlots;
  readonly selectable?: boolean;
}

export interface SpatialAssetNode extends SpatialNodeBase {
  readonly kind: "asset";
  readonly assetId: AssetId;
  readonly bounds?: Bounds3;
  readonly selectable?: boolean;
}

export type SpatialStructureNode =
  | SpatialSiteNode
  | SpatialBuildingNode
  | SpatialLevelNode
  | SpatialPrimitiveNode
  | SpatialAssetNode;

export interface SpatialStructure {
  readonly frame: FrameId;
  readonly nodes: readonly SpatialStructureNode[];
}

const ELEVATION_TOLERANCE_METERS = 1e-9;

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite.`);
}

function assertPositive(value: number, label: string): void {
  assertFinite(value, label);
  if (value <= 0) throw new RangeError(`${label} must be greater than zero.`);
}

function immutableVec3(value: Vec3): Vec3 {
  return Object.freeze([
    value[0] === 0 ? 0 : value[0],
    value[1] === 0 ? 0 : value[1],
    value[2] === 0 ? 0 : value[2],
  ]);
}

function immutableRgba(value: LinearRgba): LinearRgba {
  return Object.freeze([value[0], value[1], value[2], value[3]]);
}

export function assertValidSpatialPbrMaterial(
  material: SpatialPbrMaterial,
  label = "material",
): void {
  material.baseColorFactor.forEach((value, index) => {
    assertFinite(value, `${label}.baseColorFactor[${index.toString()}]`);
    if (value < 0 || value > 1) {
      throw new RangeError(`${label}.baseColorFactor[${index.toString()}] must be in [0, 1].`);
    }
  });
  for (const [name, value] of [
    ["metallicFactor", material.metallicFactor],
    ["roughnessFactor", material.roughnessFactor],
  ] as const) {
    assertFinite(value, `${label}.${name}`);
    if (value < 0 || value > 1) throw new RangeError(`${label}.${name} must be in [0, 1].`);
  }
}

export function spatialPbrMaterial(
  baseColorFactor: LinearRgba,
  options: Readonly<{
    metallicFactor?: number;
    roughnessFactor?: number;
    doubleSided?: boolean;
  }> = {},
): SpatialPbrMaterial {
  const material: SpatialPbrMaterial = {
    baseColorFactor,
    metallicFactor: options.metallicFactor ?? 0,
    roughnessFactor: options.roughnessFactor ?? 0.82,
    ...(options.doubleSided === undefined ? {} : { doubleSided: options.doubleSided }),
  };
  assertValidSpatialPbrMaterial(material);
  return Object.freeze({ ...material, baseColorFactor: immutableRgba(baseColorFactor) });
}

export function assertValidSpatialNodeTransform(
  transform: SpatialNodeTransform,
  label = "transform",
): void {
  assertValidFrameId(transform.sourceFrame);
  assertValidFrameId(transform.targetFrame);
  assertValidVec3(transform.translation, `${label}.translation`);
  assertUnitQuaternion(transform.rotation, `${label}.rotation`);
  assertValidVec3(transform.scale, `${label}.scale`);
  transform.scale.forEach((value, index) =>
    assertPositive(value, `${label}.scale[${index.toString()}]`),
  );
}

export function spatialNodeTransform(
  sourceFrame: FrameId,
  targetFrame: FrameId,
  translation: Vec3 = [0, 0, 0],
  rotation: Quat = [0, 0, 0, 1],
  scale: Vec3 = [1, 1, 1],
): SpatialNodeTransform {
  const transform: SpatialNodeTransform = {
    sourceFrame,
    targetFrame,
    translation,
    rotation,
    scale,
  };
  assertValidSpatialNodeTransform(transform);
  return Object.freeze({
    sourceFrame,
    targetFrame,
    translation: immutableVec3(translation),
    rotation: normalizeQuaternion(rotation),
    scale: immutableVec3(scale),
  });
}

function assertMaterialSlots(materials: SpatialMaterialSlots, label: string): void {
  assertValidSpatialPbrMaterial(materials.default, `${label}.default`);
  if (materials.top !== undefined) assertValidSpatialPbrMaterial(materials.top, `${label}.top`);
  if (materials.side !== undefined) assertValidSpatialPbrMaterial(materials.side, `${label}.side`);
}

function assertNodeShape(node: SpatialStructureNode): void {
  if (node.kind === "level") {
    assertFinite(node.elevationMeters, `${node.id}.elevationMeters`);
    if (
      Math.abs(node.transform.translation[2] - node.elevationMeters) > ELEVATION_TOLERANCE_METERS
    ) {
      throw new RangeError(
        `${node.id}.elevationMeters must equal the local transform Z translation.`,
      );
    }
  }
  if (node.kind === "primitive") {
    assertMaterialSlots(node.materials, `${node.id}.materials`);
    if (node.geometry.kind === "box") {
      assertValidVec3(node.geometry.sizeMeters, `${node.id}.geometry.sizeMeters`);
      node.geometry.sizeMeters.forEach((value, index) =>
        assertPositive(value, `${node.id}.geometry.sizeMeters[${index.toString()}]`),
      );
    } else {
      assertPositive(node.geometry.radiusMeters, `${node.id}.geometry.radiusMeters`);
      assertPositive(node.geometry.heightMeters, `${node.id}.geometry.heightMeters`);
      if (node.geometry.radialSegments !== undefined) {
        if (!Number.isInteger(node.geometry.radialSegments) || node.geometry.radialSegments < 3) {
          throw new RangeError(
            `${node.id}.geometry.radialSegments must be an integer of at least 3.`,
          );
        }
      }
    }
  }
  if (node.kind === "asset") {
    assertValidAssetId(node.assetId);
    if (node.bounds !== undefined) {
      assertValidBounds3(node.bounds);
      if (node.bounds.frame !== node.transform.sourceFrame) {
        throw new RangeError(`${node.id}.bounds must use the asset node local frame.`);
      }
    }
  }
}

export function assertValidSpatialStructure(structure: SpatialStructure): void {
  assertValidFrameId(structure.frame);
  if (structure.nodes.length === 0) {
    throw new RangeError("SpatialStructure.nodes must contain exactly one rooted tree.");
  }

  const byId = new Map<EntityId, SpatialStructureNode>();
  const byFrame = new Map<FrameId, SpatialStructureNode>();
  for (const node of structure.nodes) {
    assertValidEntityId(node.id);
    assertValidSpatialNodeTransform(node.transform, `${node.id}.transform`);
    if (byId.has(node.id)) throw new RangeError(`Duplicate spatial node id: ${node.id}.`);
    if (byFrame.has(node.transform.sourceFrame)) {
      throw new RangeError(`Duplicate spatial node frame: ${node.transform.sourceFrame}.`);
    }
    byId.set(node.id, node);
    byFrame.set(node.transform.sourceFrame, node);
    assertNodeShape(node);
  }

  const roots = structure.nodes.filter((node) => node.parentId === undefined);
  const [root] = roots;
  if (root === undefined || roots.length !== 1) {
    throw new RangeError(
      `SpatialStructure must have exactly one root; received ${roots.length.toString()}.`,
    );
  }
  if (root.kind !== "site" && root.kind !== "building") {
    throw new RangeError("SpatialStructure root must be a site or building node.");
  }

  for (const node of structure.nodes) {
    if (node.parentId === undefined) {
      if (node.transform.targetFrame !== structure.frame) {
        throw new RangeError(`${node.id} root transform must target the structure frame.`);
      }
      continue;
    }
    if (node.parentId === node.id) throw new RangeError(`${node.id} cannot parent itself.`);
    const parent = byId.get(node.parentId);
    if (parent === undefined) throw new RangeError(`${node.id} references a missing parent.`);
    if (node.transform.targetFrame !== parent.transform.sourceFrame) {
      throw new RangeError(`${node.id} transform target must equal its parent local frame.`);
    }
  }

  for (const node of structure.nodes) {
    const seen = new Set<EntityId>();
    let current: SpatialStructureNode | undefined = node;
    while (current !== undefined) {
      if (seen.has(current.id))
        throw new RangeError(`SpatialStructure contains a cycle at ${current.id}.`);
      seen.add(current.id);
      current = current.parentId === undefined ? undefined : byId.get(current.parentId);
    }
  }
}

function cloneMaterial(material: SpatialPbrMaterial): SpatialPbrMaterial {
  return spatialPbrMaterial(material.baseColorFactor, {
    metallicFactor: material.metallicFactor,
    roughnessFactor: material.roughnessFactor,
    ...(material.doubleSided === undefined ? {} : { doubleSided: material.doubleSided }),
  });
}

function cloneNode(node: SpatialStructureNode): SpatialStructureNode {
  const base = {
    id: node.id,
    ...(node.parentId === undefined ? {} : { parentId: node.parentId }),
    ...(node.name === undefined ? {} : { name: node.name }),
    transform: spatialNodeTransform(
      node.transform.sourceFrame,
      node.transform.targetFrame,
      node.transform.translation,
      node.transform.rotation,
      node.transform.scale,
    ),
    ...(node.visible === undefined ? {} : { visible: node.visible }),
  };
  if (node.kind === "site" || node.kind === "building")
    return Object.freeze({ ...base, kind: node.kind });
  if (node.kind === "level") {
    return Object.freeze({ ...base, kind: "level", elevationMeters: node.elevationMeters });
  }
  if (node.kind === "asset") {
    return Object.freeze({
      ...base,
      kind: "asset",
      assetId: node.assetId,
      ...(node.bounds === undefined
        ? {}
        : {
            bounds: Object.freeze({
              frame: node.bounds.frame,
              min: immutableVec3(node.bounds.min),
              max: immutableVec3(node.bounds.max),
            }),
          }),
      ...(node.selectable === undefined ? {} : { selectable: node.selectable }),
    });
  }
  const geometry: SpatialPrimitiveGeometry =
    node.geometry.kind === "box"
      ? Object.freeze({ kind: "box", sizeMeters: immutableVec3(node.geometry.sizeMeters) })
      : Object.freeze({
          kind: "cylinder",
          radiusMeters: node.geometry.radiusMeters,
          heightMeters: node.geometry.heightMeters,
          ...(node.geometry.radialSegments === undefined
            ? {}
            : { radialSegments: node.geometry.radialSegments }),
        });
  return Object.freeze({
    ...base,
    kind: "primitive",
    role: node.role,
    geometry,
    materials: Object.freeze({
      default: cloneMaterial(node.materials.default),
      ...(node.materials.top === undefined ? {} : { top: cloneMaterial(node.materials.top) }),
      ...(node.materials.side === undefined ? {} : { side: cloneMaterial(node.materials.side) }),
    }),
    ...(node.selectable === undefined ? {} : { selectable: node.selectable }),
  });
}

/** Validates and detaches one immutable, renderer-neutral spatial tree from caller-owned input. */
export function createSpatialStructure(
  frame: FrameId,
  nodes: readonly SpatialStructureNode[],
): SpatialStructure {
  const input: SpatialStructure = { frame, nodes };
  assertValidSpatialStructure(input);
  const structure = Object.freeze({ frame, nodes: Object.freeze(nodes.map(cloneNode)) });
  assertValidSpatialStructure(structure);
  return structure;
}
