import { describe, expect, it } from "vitest";

import { entityId, type Bounds3 } from "@lk-robotics/design-system-3d-core";

import { addMapObject, createMapEditorDocument } from "./map-editor-model.js";
import { validateMapObjectPlacement } from "./map-editor-placement.js";
import { SPATIAL_STRUCTURE_FIXTURE } from "./spatial-structure-fixture.js";

const GROUND_LEVEL = entityId("site/building/ground");
const AUTHORING_BOUNDS: Bounds3 = {
  frame: SPATIAL_STRUCTURE_FIXTURE.frame,
  min: [-5, -4, -0.3],
  max: [5, 4, 6],
};

describe("map editor placement validity", () => {
  it("rejects a second TRON placement that overlaps the first asset bounds", () => {
    const point = [-2, -1.5, 0] as const;
    const document = createMapEditorDocument(SPATIAL_STRUCTURE_FIXTURE);
    expect(
      validateMapObjectPlacement(document, GROUND_LEVEL, "asset", point, {
        authoringBounds: AUTHORING_BOUNDS,
      }),
    ).toEqual(expect.objectContaining({ valid: true }));

    const placed = addMapObject(document, "asset", GROUND_LEVEL, point);
    expect(
      validateMapObjectPlacement(placed.document, GROUND_LEVEL, "asset", point, {
        authoringBounds: AUTHORING_BOUNDS,
      }),
    ).toEqual({ valid: false, message: "배치 불가 · 겹치는 객체: TRON 1" });
  });
});
