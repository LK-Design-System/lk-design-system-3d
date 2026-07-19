import {
  createSpatialStructure,
  entityId,
  frameId,
  quaternionFromYaw,
  spatialNodeTransform,
  spatialPbrMaterial,
  type EntityId,
  type SpatialNodeTransform,
  type SpatialStructure,
  type SpatialStructureNode,
} from "@lk-robotics/design-system-3d-core";

export const SPATIAL_STRUCTURE_FRAME = frameId("lk-map");
export const SPATIAL_STRUCTURE_TARGET_ID = entityId("site/object/work-cell");

const SITE_FRAME = frameId("site-local");
const BUILDING_FRAME = frameId("building-local");
const GROUND_LEVEL_FRAME = frameId("level-ground");
const UPPER_LEVEL_FRAME = frameId("level-upper");

const FLOOR_BOTTOM = spatialPbrMaterial([0.3, 0.36, 0.42, 1], { roughnessFactor: 0.92 });
const FLOOR_TOP = spatialPbrMaterial([0.66, 0.73, 0.8, 1], { roughnessFactor: 0.84 });
const WALL_SIDE = spatialPbrMaterial([0.38, 0.48, 0.58, 1], { roughnessFactor: 0.88 });
const WALL_TOP = spatialPbrMaterial([0.76, 0.82, 0.88, 1], { roughnessFactor: 0.78 });
const OBJECT_SIDE = spatialPbrMaterial([0.12, 0.34, 0.48, 1], {
  metallicFactor: 0.08,
  roughnessFactor: 0.62,
});
const OBJECT_TOP = spatialPbrMaterial([0.18, 0.56, 0.58, 1], {
  metallicFactor: 0.05,
  roughnessFactor: 0.52,
});
const CAUTION = spatialPbrMaterial([0.86, 0.48, 0.08, 1], {
  metallicFactor: 0.04,
  roughnessFactor: 0.66,
});

function boxNode(
  id: string,
  parentId: EntityId,
  frame: string,
  targetFrame: typeof GROUND_LEVEL_FRAME,
  role: "floor" | "wall" | "object",
  translation: readonly [number, number, number],
  sizeMeters: readonly [number, number, number],
  options: Readonly<{
    rotationRadians?: number;
    top?: typeof FLOOR_TOP;
    side?: typeof FLOOR_BOTTOM;
  }> = {},
): SpatialStructureNode {
  return {
    kind: "primitive",
    role,
    id: entityId(id),
    parentId,
    transform: spatialNodeTransform(
      frameId(frame),
      targetFrame,
      translation,
      quaternionFromYaw(options.rotationRadians ?? 0),
    ),
    geometry: { kind: "box", sizeMeters },
    materials: {
      default: options.side ?? FLOOR_BOTTOM,
      top: options.top ?? FLOOR_TOP,
      side: options.side ?? FLOOR_BOTTOM,
    },
  };
}

const NODES: readonly SpatialStructureNode[] = [
  {
    kind: "site",
    id: entityId("site"),
    name: "LK Robotics 캠퍼스",
    transform: spatialNodeTransform(SITE_FRAME, SPATIAL_STRUCTURE_FRAME),
  },
  {
    kind: "building",
    id: entityId("site/building"),
    parentId: entityId("site"),
    name: "운영동",
    transform: spatialNodeTransform(BUILDING_FRAME, SITE_FRAME),
  },
  {
    kind: "level",
    id: entityId("site/building/ground"),
    parentId: entityId("site/building"),
    name: "지상층",
    elevationMeters: 0,
    transform: spatialNodeTransform(GROUND_LEVEL_FRAME, BUILDING_FRAME),
  },
  boxNode(
    "site/floor/ground",
    entityId("site/building/ground"),
    "ground-floor-local",
    GROUND_LEVEL_FRAME,
    "floor",
    [0, 0, -0.12],
    [8, 6, 0.24],
  ),
  boxNode(
    "site/wall/ground-north",
    entityId("site/building/ground"),
    "ground-wall-north-local",
    GROUND_LEVEL_FRAME,
    "wall",
    [0, 2.92, 1.3],
    [8, 0.16, 2.6],
    { top: WALL_TOP, side: WALL_SIDE },
  ),
  boxNode(
    "site/wall/ground-west",
    entityId("site/building/ground"),
    "ground-wall-west-local",
    GROUND_LEVEL_FRAME,
    "wall",
    [-3.92, 0, 1.3],
    [0.16, 6, 2.6],
    { top: WALL_TOP, side: WALL_SIDE },
  ),
  boxNode(
    "site/object/work-cell",
    entityId("site/building/ground"),
    "work-cell-local",
    GROUND_LEVEL_FRAME,
    "object",
    [1.1, -0.65, 0.62],
    [1.8, 1.25, 1.24],
    { rotationRadians: Math.PI / 10, top: OBJECT_TOP, side: OBJECT_SIDE },
  ),
  {
    kind: "primitive",
    role: "object",
    id: entityId("site/object/safety-column"),
    parentId: entityId("site/building/ground"),
    transform: spatialNodeTransform(
      frameId("safety-column-local"),
      GROUND_LEVEL_FRAME,
      [2.8, 1.5, 1],
    ),
    geometry: { kind: "cylinder", radiusMeters: 0.28, heightMeters: 2, radialSegments: 24 },
    materials: { default: CAUTION, top: WALL_TOP, side: CAUTION },
  },
  {
    kind: "level",
    id: entityId("site/building/upper"),
    parentId: entityId("site/building"),
    name: "상층",
    elevationMeters: 3.35,
    transform: spatialNodeTransform(UPPER_LEVEL_FRAME, BUILDING_FRAME, [0, 0, 3.35]),
  },
  boxNode(
    "site/floor/upper",
    entityId("site/building/upper"),
    "upper-floor-local",
    UPPER_LEVEL_FRAME,
    "floor",
    [0.9, 0.3, -0.1],
    [5.8, 4.4, 0.2],
  ),
  boxNode(
    "site/wall/upper-north",
    entityId("site/building/upper"),
    "upper-wall-north-local",
    UPPER_LEVEL_FRAME,
    "wall",
    [0.9, 2.42, 1.15],
    [5.8, 0.16, 2.3],
    { top: WALL_TOP, side: WALL_SIDE },
  ),
  boxNode(
    "site/wall/upper-east",
    entityId("site/building/upper"),
    "upper-wall-east-local",
    UPPER_LEVEL_FRAME,
    "wall",
    [3.72, 0.3, 1.15],
    [0.16, 4.4, 2.3],
    { top: WALL_TOP, side: WALL_SIDE },
  ),
];

export const SPATIAL_STRUCTURE_FIXTURE = createSpatialStructure(SPATIAL_STRUCTURE_FRAME, NODES);

export function replaceSpatialStructureTransform(
  structure: SpatialStructure,
  entity: EntityId,
  transform: SpatialNodeTransform,
): SpatialStructure {
  return createSpatialStructure(
    structure.frame,
    structure.nodes.map((node) => (node.id === entity ? { ...node, transform } : node)),
  );
}

export function getSpatialStructureTransform(
  structure: SpatialStructure,
  entity: EntityId,
): SpatialNodeTransform {
  const node = structure.nodes.find((candidate) => candidate.id === entity);
  if (node === undefined) throw new RangeError(`Missing fixture node: ${entity}`);
  return node.transform;
}
