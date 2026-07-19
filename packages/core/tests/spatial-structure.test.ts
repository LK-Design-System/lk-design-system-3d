import { describe, expect, it } from "vitest";

import {
  assertValidSpatialStructure,
  assetId,
  bounds3,
  createSpatialStructure,
  entityId,
  frameId,
  spatialNodeTransform,
  spatialPbrMaterial,
  type SpatialStructureNode,
} from "../src/index.js";

const SCENE = frameId("site-map");
const SITE = frameId("site-local");
const BUILDING = frameId("building-local");
const LEVEL = frameId("level-01");

function fixtureNodes(): readonly SpatialStructureNode[] {
  const concrete = spatialPbrMaterial([0.48, 0.58, 0.72, 1], { roughnessFactor: 0.9 });
  const floorTop = spatialPbrMaterial([0.72, 0.78, 0.84, 1], { roughnessFactor: 0.82 });
  return [
    {
      kind: "site",
      id: entityId("site"),
      transform: spatialNodeTransform(SITE, SCENE),
    },
    {
      kind: "building",
      id: entityId("building"),
      parentId: entityId("site"),
      transform: spatialNodeTransform(BUILDING, SITE, [2, -1, 0]),
    },
    {
      kind: "level",
      id: entityId("level-01"),
      parentId: entityId("building"),
      elevationMeters: 4,
      transform: spatialNodeTransform(LEVEL, BUILDING, [0, 0, 4]),
    },
    {
      kind: "primitive",
      role: "floor",
      id: entityId("floor-slab"),
      parentId: entityId("level-01"),
      transform: spatialNodeTransform(frameId("floor-slab-local"), LEVEL, [0, 0, -0.1]),
      geometry: { kind: "box", sizeMeters: [12, 8, 0.2] },
      materials: { default: concrete, top: floorTop, side: concrete },
    },
    {
      kind: "primitive",
      role: "object",
      id: entityId("column"),
      parentId: entityId("level-01"),
      transform: spatialNodeTransform(frameId("column-local"), LEVEL, [1, 2, 1.5]),
      geometry: { kind: "cylinder", radiusMeters: 0.3, heightMeters: 3 },
      materials: { default: concrete },
    },
    {
      kind: "asset",
      id: entityId("asset-rack"),
      parentId: entityId("level-01"),
      assetId: assetId("rack-v1"),
      transform: spatialNodeTransform(frameId("rack-local"), LEVEL, [-2, 0, 0]),
      bounds: bounds3(frameId("rack-local"), [-0.5, -1, 0], [0.5, 1, 2]),
    },
  ];
}

describe("SpatialStructure", () => {
  it("creates one immutable framed site/building/level tree that survives JSON serialization", () => {
    const structure = createSpatialStructure(SCENE, fixtureNodes());
    expect(structure.nodes).toHaveLength(6);
    expect(Object.isFrozen(structure)).toBe(true);
    expect(Object.isFrozen(structure.nodes)).toBe(true);
    const floor = structure.nodes.at(3);
    expect(floor).toBeDefined();
    if (floor === undefined) throw new Error("Expected the floor fixture node.");
    expect(Object.isFrozen(floor.transform.translation)).toBe(true);

    const restored = JSON.parse(JSON.stringify(structure)) as typeof structure;
    expect(() => assertValidSpatialStructure(restored)).not.toThrow();
    expect(restored).toEqual(structure);
  });

  it("requires the level elevation to agree with local Z", () => {
    const nodes = fixtureNodes().map((node) =>
      node.kind === "level" ? { ...node, elevationMeters: 3 } : node,
    );
    expect(() => createSpatialStructure(SCENE, nodes)).toThrow(/elevationMeters/);
  });

  it("rejects frame guesses, missing parents, and cycles", () => {
    const wrongFrame = fixtureNodes().map((node) =>
      node.id === entityId("floor-slab")
        ? {
            ...node,
            transform: spatialNodeTransform(node.transform.sourceFrame, SCENE),
          }
        : node,
    );
    expect(() => createSpatialStructure(SCENE, wrongFrame)).toThrow(/parent local frame/);

    const missingParent = fixtureNodes().map((node) =>
      node.id === entityId("column") ? { ...node, parentId: entityId("missing") } : node,
    );
    expect(() => createSpatialStructure(SCENE, missingParent)).toThrow(/missing parent/);

    const cycle = fixtureNodes().map((node) => {
      if (node.id === entityId("building")) {
        return {
          ...node,
          parentId: entityId("level-01"),
          transform: spatialNodeTransform(BUILDING, LEVEL),
        };
      }
      return node;
    });
    expect(() => createSpatialStructure(SCENE, cycle)).toThrow(/cycle|exactly one root/);
  });

  it("rejects invalid material factors, dimensions, and asset-local bounds", () => {
    expect(() => spatialPbrMaterial([1.1, 0, 0, 1])).toThrow(/\[0, 1\]/);
    const invalidSize = fixtureNodes().map((node) =>
      node.kind === "primitive" && node.role === "floor"
        ? { ...node, geometry: { kind: "box" as const, sizeMeters: [12, 0, 0.2] as const } }
        : node,
    );
    expect(() => createSpatialStructure(SCENE, invalidSize)).toThrow(/greater than zero/);

    const invalidBounds = fixtureNodes().map((node) =>
      node.kind === "asset" ? { ...node, bounds: bounds3(LEVEL, [-1, -1, 0], [1, 1, 2]) } : node,
    );
    expect(() => createSpatialStructure(SCENE, invalidBounds)).toThrow(/local frame/);
  });
});
