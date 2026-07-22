import { describe, expect, it } from "vitest";

import {
  entityId,
  frameId,
  pose3,
  quaternionFromYaw,
  spatialNodeTransform,
  type Vec3,
} from "@lk-robotics/lds-3d-core";

import { MAP_EDITOR_TRON_MANIFEST } from "./map-editor-asset-catalog.js";
import {
  MAP_EDITOR_SCHEMA_VERSION,
  addMapArea,
  addMapEntity,
  addMapGoal,
  addMapObject,
  addMapRoute,
  assertValidMapEditorDocument,
  cloneMapEditorDocument,
  createMapEditorDocument,
  deleteMapEntity,
  duplicateMapEntity,
  parseMapEditorDocument,
  renameMapEntity,
  replaceMapEntityTransform,
  serializeMapEditorDocument,
  stepMapEntityTransform,
  updateMapAreaPoints,
  updateMapGoalPose,
  updateMapRoutePoints,
  type MapEditorDocument,
  type MapObjectKind,
} from "./map-editor-model.js";
import { SPATIAL_STRUCTURE_FIXTURE } from "./spatial-structure-fixture.js";

const GROUND_LEVEL = entityId("site/building/ground");
const UPPER_LEVEL = entityId("site/building/upper");

function baseDocument(): MapEditorDocument {
  return createMapEditorDocument(SPATIAL_STRUCTURE_FIXTURE);
}

function addedObjectDocument(kind: MapObjectKind): MapEditorDocument {
  return addMapEntity(baseDocument(), kind, GROUND_LEVEL, [1, 2, 0]).document;
}

describe("Story-local MapEditorDocument V2", () => {
  it("keeps objects in the spatial structure and exposes empty first-class map arrays", () => {
    const base = baseDocument();
    expect(base.schemaVersion).toBe(MAP_EDITOR_SCHEMA_VERSION);
    expect(base.schemaVersion).toBe(2);
    expect(base.routes).toEqual([]);
    expect(base.areas).toEqual([]);
    expect(base.goals).toEqual([]);
    expect(base).not.toHaveProperty("paths");

    const box = addMapEntity(base, "box", GROUND_LEVEL, [1, 2, 0]);
    const column = addMapObject(box.document, "column", GROUND_LEVEL, [2, 2, 0]);
    const asset = addMapObject(column.document, "asset", UPPER_LEVEL, [1, 2, 3.35]);
    const document = asset.document;

    expect(document.structure.nodes).toHaveLength(SPATIAL_STRUCTURE_FIXTURE.nodes.length + 3);
    expect(document.routes).toEqual([]);
    expect(document.areas).toEqual([]);
    expect(document.goals).toEqual([]);
    expect(
      document.structure.nodes.find((node) => node.id === box.createdId)?.transform.translation,
    ).toEqual([1, 2, 0.5]);
    expect(
      document.structure.nodes.find((node) => node.id === column.createdId)?.transform.translation,
    ).toEqual([2, 2, 1]);
    const assetNode = document.structure.nodes.find((node) => node.id === asset.createdId);
    expect(assetNode?.kind).toBe("asset");
    expect(assetNode?.transform.translation).toEqual([1, 2, 0]);
    expect(assetNode?.transform.targetFrame).toBe("level-upper");
    expect(assetNode?.parentId).toBe(UPPER_LEVEL);
    expect(assetNode?.kind === "asset" ? assetNode.bounds?.min : undefined).toEqual(
      MAP_EDITOR_TRON_MANIFEST.boundsInCoreMeters.min,
    );
    expect(assetNode?.kind === "asset" ? assetNode.bounds?.max : undefined).toEqual(
      MAP_EDITOR_TRON_MANIFEST.boundsInCoreMeters.max,
    );
    expect(assetNode?.kind === "asset" ? assetNode.bounds?.frame : undefined).toBe(
      assetNode?.transform.sourceFrame,
    );
    expect(() => assertValidMapEditorDocument(document)).not.toThrow();
  });

  it("adds route, area, and goal as level-owned first-class entities without placeholder geometry", () => {
    const routePoints: readonly Vec3[] = [
      [0, 0, 0],
      [1, 0.5, 0],
      [2, 1, 0],
    ];
    const areaPoints: readonly Vec3[] = [
      [0, 0, 0],
      [2, 0, 0],
      [2, 1, 0],
      [0, 1, 0],
    ];
    const base = baseDocument();
    const route = addMapRoute(base, GROUND_LEVEL, routePoints, {
      traversal: "reverse",
      widthMeters: 0.4,
    });
    const area = addMapArea(route.document, GROUND_LEVEL, areaPoints, {
      category: "keepout",
    });
    const goal = addMapGoal(
      area.document,
      UPPER_LEVEL,
      pose3(area.document.frame, [3, 4, 3.35], quaternionFromYaw(Math.PI / 2)),
      { radiusMeters: 0.45 },
    );
    const document = goal.document;

    expect(document.structure.nodes).toHaveLength(base.structure.nodes.length);
    expect(document.routes).toEqual([
      expect.objectContaining({
        kind: "route",
        id: route.createdId,
        frame: document.frame,
        levelId: GROUND_LEVEL,
        points: routePoints,
        traversal: "reverse",
        widthMeters: 0.4,
      }),
    ]);
    expect(document.areas).toEqual([
      expect.objectContaining({
        kind: "area",
        id: area.createdId,
        frame: document.frame,
        levelId: GROUND_LEVEL,
        points: areaPoints,
        category: "keepout",
      }),
    ]);
    expect(document.goals).toEqual([
      expect.objectContaining({
        kind: "goal",
        id: goal.createdId,
        levelId: UPPER_LEVEL,
        radiusMeters: 0.45,
      }),
    ]);
    expect(document.routes[0]?.points).toHaveLength(3);
    expect(document.labels[route.createdId]).toBe("Route 1");
    expect(document.labels[area.createdId]).toBe("Area 2");
    expect(document.labels[goal.createdId]).toBe("Goal 3");
    expect(Object.isFrozen(document)).toBe(true);
    expect(Object.isFrozen(document.routes)).toBe(true);
    expect(Object.isFrozen(document.routes[0]?.points)).toBe(true);
    expect(Object.isFrozen(document.routes[0]?.points[0])).toBe(true);
    expect(Object.isFrozen(document.areas[0]?.points)).toBe(true);
    expect(Object.isFrozen(document.goals[0]?.pose.position)).toBe(true);
  });

  it("rejects incomplete, duplicate, non-finite, zero-area, wrong-level, and wrong-frame input", () => {
    const document = baseDocument();
    expect(() => addMapRoute(document, GROUND_LEVEL, [[0, 0, 0]])).toThrow(
      /at least 2 points/,
    );
    expect(() =>
      addMapRoute(document, GROUND_LEVEL, [
        [0, 0, 0],
        [0, 0, 0],
      ]),
    ).toThrow(/consecutive duplicate/);
    expect(() =>
      addMapRoute(document, GROUND_LEVEL, [
        [0, 0, 0],
        [Number.NaN, 1, 0],
      ]),
    ).toThrow(/finite number/);
    expect(() =>
      addMapRoute(document, entityId("site"), [
        [0, 0, 0],
        [1, 0, 0],
      ]),
    ).toThrow(/is not a level/);

    expect(() =>
      addMapArea(document, GROUND_LEVEL, [
        [0, 0, 0],
        [1, 0, 0],
      ]),
    ).toThrow(/at least 3 points/);
    expect(() =>
      addMapArea(document, GROUND_LEVEL, [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 0],
      ]),
    ).toThrow(/closing point/);
    expect(() =>
      addMapArea(document, GROUND_LEVEL, [
        [0, 0, 0],
        [1, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
      ]),
    ).toThrow(/consecutive duplicate/);
    expect(() =>
      addMapArea(document, GROUND_LEVEL, [
        [0, 0, 0],
        [1, 0, 0],
        [2, 0, 0],
      ]),
    ).toThrow(/non-zero XY area/);
    expect(() =>
      addMapArea(document, GROUND_LEVEL, [
        [0, 0, 0],
        [1, 0, 0],
        [2, 1e-8, 0],
      ]),
    ).toThrow(/non-zero XY area/);
    expect(() =>
      addMapArea(document, GROUND_LEVEL, [
        [0, 0, 0],
        [2, 0, 0.1],
        [0, 2, 0],
      ]),
    ).toThrow(/one XY elevation/);
    expect(() =>
      addMapArea(document, GROUND_LEVEL, [
        [0, 0, 0],
        [3, 0, 0],
        [0, 2, 0],
        [3, 2, 0],
        [1.5, -1, 0],
      ]),
    ).toThrow(/self-intersect/);
    expect(() =>
      addMapGoal(
        document,
        GROUND_LEVEL,
        pose3(frameId("other-map"), [0, 0, 0], quaternionFromYaw(0)),
      ),
    ).toThrow(/document frame/);
  });

  it("renames, duplicates, and deletes objects, routes, areas, and goals by explicit kind", () => {
    const object = addMapObject(baseDocument(), "box", GROUND_LEVEL, [0, 0, 0]);
    const route = addMapRoute(
      object.document,
      GROUND_LEVEL,
      [
        [0, 0, 0],
        [1, 0, 0],
      ],
      { traversal: "forward", widthMeters: 0.3 },
    );
    const area = addMapArea(
      route.document,
      UPPER_LEVEL,
      [
        [0, 0, 3.35],
        [2, 0, 3.35],
        [0, 2, 3.35],
      ],
      { category: "work" },
    );
    const goal = addMapGoal(
      area.document,
      GROUND_LEVEL,
      pose3(area.document.frame, [1, 1, 0], quaternionFromYaw(0)),
    );
    let document = renameMapEntity(goal.document, route.createdId, "Outbound route");
    expect(document.labels[route.createdId]).toBe("Outbound route");

    const objectCopy = duplicateMapEntity(document, object.createdId);
    const routeCopy = duplicateMapEntity(objectCopy.document, route.createdId);
    const areaCopy = duplicateMapEntity(routeCopy.document, area.createdId);
    const goalCopy = duplicateMapEntity(areaCopy.document, goal.createdId);
    document = goalCopy.document;

    expect(document.labels[routeCopy.createdId]).toBe("Outbound route copy");
    expect(document.routes.find((candidate) => candidate.id === routeCopy.createdId)).toEqual(
      expect.objectContaining({
        levelId: GROUND_LEVEL,
        traversal: "forward",
        widthMeters: 0.3,
        points: [
          [0.5, 0.5, 0],
          [1.5, 0.5, 0],
        ],
      }),
    );
    expect(document.areas.find((candidate) => candidate.id === areaCopy.createdId)).toEqual(
      expect.objectContaining({ levelId: UPPER_LEVEL, category: "work" }),
    );
    expect(document.goals.find((candidate) => candidate.id === goalCopy.createdId)).toEqual(
      expect.objectContaining({ levelId: GROUND_LEVEL }),
    );
    expect(
      document.structure.nodes.find((node) => node.id === objectCopy.createdId)?.transform
        .translation,
    ).toEqual([0.5, 0.5, 0.5]);

    for (const removedId of [object.createdId, route.createdId, area.createdId, goal.createdId]) {
      document = deleteMapEntity(document, removedId);
      expect(document.labels[removedId]).toBeUndefined();
    }
    expect(document.routes.map((candidate) => candidate.id)).toEqual([routeCopy.createdId]);
    expect(document.areas.map((candidate) => candidate.id)).toEqual([areaCopy.createdId]);
    expect(document.goals.map((candidate) => candidate.id)).toEqual([goalCopy.createdId]);
    expect(document.structure.nodes.some((node) => node.id === object.createdId)).toBe(false);
    expect(() => deleteMapEntity(document, GROUND_LEVEL)).toThrow(/containers cannot be deleted/);
    expect(() => duplicateMapEntity(document, entityId("site"))).toThrow(
      /containers cannot be duplicated/,
    );
  });

  it("replaces and steps object transforms while preserving frame identity and hierarchy", () => {
    const added = addMapObject(baseDocument(), "box", GROUND_LEVEL, [0, 0, 0]);
    const before = added.document.structure.nodes.find((node) => node.id === added.createdId);
    if (before === undefined) throw new Error("Expected the added box.");
    const translated = stepMapEntityTransform(added.document, added.createdId, {
      mode: "translate",
      axis: "x",
      space: "target",
      snap: { translationMeters: 0.25 },
    });
    expect(
      translated.structure.nodes.find((node) => node.id === added.createdId)?.transform.translation,
    ).toEqual([0.25, 0, 0.5]);

    const replaced = replaceMapEntityTransform(
      translated,
      added.createdId,
      spatialNodeTransform(
        before.transform.sourceFrame,
        before.transform.targetFrame,
        [2, 3, 0.5],
        quaternionFromYaw(Math.PI / 2),
        [1.2, 1, 1],
      ),
    );
    const after = replaced.structure.nodes.find((node) => node.id === added.createdId);
    expect(after?.transform.translation).toEqual([2, 3, 0.5]);
    expect(after?.transform.sourceFrame).toBe(before.transform.sourceFrame);
    expect(after?.parentId).toBe(before.parentId);

    expect(() =>
      replaceMapEntityTransform(
        replaced,
        added.createdId,
        spatialNodeTransform(frameId("renamed-frame"), before.transform.targetFrame),
      ),
    ).toThrow(/cannot rename frames/);
  });

  it("updates route rings, area rings, and goal poses while retaining level ownership", () => {
    const route = addMapRoute(baseDocument(), GROUND_LEVEL, [
      [0, 0, 0],
      [1, 0, 0],
    ]);
    const area = addMapArea(route.document, GROUND_LEVEL, [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
    ]);
    const goal = addMapGoal(
      area.document,
      UPPER_LEVEL,
      pose3(area.document.frame, [0, 0, 3.35], quaternionFromYaw(0)),
    );
    let document = updateMapRoutePoints(goal.document, route.createdId, [
      [0, 0, 0],
      [1, 1, 0],
      [2, 1, 0],
    ]);
    document = updateMapAreaPoints(document, area.createdId, [
      [0, 0, 0],
      [3, 0, 0],
      [3, 2, 0],
      [0, 2, 0],
    ]);
    document = updateMapGoalPose(
      document,
      goal.createdId,
      pose3(document.frame, [4, 5, 3.35], quaternionFromYaw(Math.PI / 2)),
    );

    expect(document.routes[0]?.points).toHaveLength(3);
    expect(document.routes[0]?.levelId).toBe(GROUND_LEVEL);
    expect(document.areas[0]?.points).toHaveLength(4);
    expect(document.areas[0]?.levelId).toBe(GROUND_LEVEL);
    expect(document.goals[0]?.pose.position).toEqual([4, 5, 3.35]);
    expect(document.goals[0]?.levelId).toBe(UPPER_LEVEL);
    expect(() =>
      updateMapRoutePoints(document, route.createdId, [
        [0, 0, 0],
        [0, 0, 0],
      ]),
    ).toThrow(/consecutive duplicate/);
    expect(() =>
      updateMapAreaPoints(document, area.createdId, [
        [0, 0, 0],
        [1, 0, 0],
        [2, 0, 0],
      ]),
    ).toThrow(/non-zero XY area/);
  });

  it("serializes deterministically, validates ownership and frame, and round-trips V2", () => {
    const route = addMapRoute(
      createMapEditorDocument(SPATIAL_STRUCTURE_FIXTURE, {
        documentId: entityId("facility-map"),
        name: "Facility map",
      }),
      GROUND_LEVEL,
      [
        [0, 0, 0],
        [1, 0, 0],
      ],
    );
    const area = addMapArea(route.document, GROUND_LEVEL, [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
    ]);
    const goal = addMapGoal(
      area.document,
      GROUND_LEVEL,
      pose3(area.document.frame, [1, 2, 0], quaternionFromYaw(0)),
    );
    const first = serializeMapEditorDocument(goal.document);
    const second = serializeMapEditorDocument(cloneMapEditorDocument(goal.document));
    expect(second).toBe(first);

    const restored = parseMapEditorDocument(first);
    expect(restored).toEqual(goal.document);
    expect(serializeMapEditorDocument(restored)).toBe(first);
    expect(Object.isFrozen(restored)).toBe(true);

    const plain = JSON.parse(first) as Record<string, unknown>;
    expect(Object.keys(plain).sort()).toEqual([
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
    expect(plain).not.toHaveProperty("paths");
    for (const productField of [
      "permissions",
      "savedAt",
      "storage",
      "transport",
      "commands",
      "workflow",
    ]) {
      expect(plain).not.toHaveProperty(productField);
    }

    expect(() =>
      parseMapEditorDocument(JSON.stringify({ ...plain, permissions: ["map:write"] })),
    ).toThrow(/unsupported fields/);
    expect(() =>
      parseMapEditorDocument(JSON.stringify({ ...plain, schemaVersion: 1 })),
    ).toThrow(/Unsupported map editor schema version/);

    const routes = plain.routes as Record<string, unknown>[];
    const wrongFrame = {
      ...plain,
      routes: [{ ...routes[0], frame: "other-map" }],
    };
    expect(() => parseMapEditorDocument(JSON.stringify(wrongFrame))).toThrow(/document frame/);
    const wrongLevel = {
      ...plain,
      routes: [{ ...routes[0], levelId: "site" }],
    };
    expect(() => parseMapEditorDocument(JSON.stringify(wrongLevel))).toThrow(/is not a level/);
  });

  it.each(["box", "column", "asset"] as const)(
    "keeps %s object addition valid after a JSON clone",
    (kind) => {
      const serialized = serializeMapEditorDocument(addedObjectDocument(kind));
      expect(() => assertValidMapEditorDocument(parseMapEditorDocument(serialized))).not.toThrow();
    },
  );
});
