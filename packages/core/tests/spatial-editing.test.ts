import { describe, expect, it } from "vitest";

import {
  assertValidSpatialEditVolume,
  createSpatialEditBox,
  createSpatialEditSphere,
  entityId,
  frameId,
  quaternionFromYaw,
} from "../src/index.js";

const MAP = frameId("lk-map");
const POSE = {
  frame: MAP,
  position: [1, 2, 0.8] as const,
  orientation: quaternionFromYaw(Math.PI / 6),
};

describe("spatial edit volume contracts", () => {
  it("creates immutable framed sphere and box intents", () => {
    const sphere = createSpatialEditSphere({
      id: entityId("edit/sphere-01"),
      operation: "delete",
      pose: POSE,
      radiusMeters: 0.6,
    });
    const box = createSpatialEditBox({
      id: entityId("edit/box-01"),
      operation: "restore",
      pose: POSE,
      sizeMeters: [1, 2, 1.6],
    });

    expect(sphere).toMatchObject({
      kind: "sphere",
      id: "edit/sphere-01",
      operation: "delete",
      pose: { frame: MAP, position: POSE.position },
      radiusMeters: 0.6,
    });
    expect(sphere.pose.orientation[2]).toBeCloseTo(POSE.orientation[2], 12);
    expect(sphere.pose.orientation[3]).toBeCloseTo(POSE.orientation[3], 12);
    expect(box.kind).toBe("box");
    expect(box.sizeMeters).toEqual([1, 2, 1.6]);
    expect(Object.isFrozen(sphere)).toBe(true);
    expect(Object.isFrozen(sphere.pose)).toBe(true);
    expect(Object.isFrozen(box.sizeMeters)).toBe(true);
    expect(() => assertValidSpatialEditVolume(sphere)).not.toThrow();
    expect(() => assertValidSpatialEditVolume(box)).not.toThrow();
  });

  it("rejects non-positive dimensions", () => {
    expect(() =>
      createSpatialEditSphere({
        id: entityId("edit/sphere-invalid"),
        operation: "delete",
        pose: POSE,
        radiusMeters: 0,
      }),
    ).toThrow(/finite positive/u);
    expect(() =>
      createSpatialEditBox({
        id: entityId("edit/box-invalid"),
        operation: "restore",
        pose: POSE,
        sizeMeters: [1, Number.NaN, 2],
      }),
    ).toThrow(/finite positive/u);
  });

  it("does not encode crop ordering, point mutation, or commit state", () => {
    const sphere = createSpatialEditSphere({
      id: entityId("edit/intent-only"),
      operation: "restore",
      pose: POSE,
      radiusMeters: 0.4,
    });
    expect(sphere).not.toHaveProperty("points");
    expect(sphere).not.toHaveProperty("apply");
    expect(sphere).not.toHaveProperty("committed");
  });
});
