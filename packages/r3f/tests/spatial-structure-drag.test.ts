import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { Matrix4, Plane, Quaternion, Ray, Vector3 } from "three";
import {
  beginSpatialRotationDrag,
  beginSpatialScaleDrag,
  beginSpatialTranslationDrag,
  entityId,
  frameId,
  spatialNodeTransform,
  type SpatialTransformChangeSet,
} from "@lk-robotics/lds-3d-core";

import {
  createRotationDragLifecycle,
  createRotationDragProjection,
  createScaleDragLifecycle,
  createTranslationDragLifecycle,
  createTranslationDragProjection,
  projectRotationDragAngle,
  projectScaleDragDelta,
  projectTranslationDragDistance,
  resolveTransformGizmoSpace,
  unwrapRotationDragAngle,
} from "../src/spatial-structure.js";

const before = spatialNodeTransform(
  frameId("object-local"),
  frameId("level-local"),
  [1, 2, 3],
  [0, 0, 0, 1],
  [1, 1, 1],
);

describe("TransformGizmo transform-space contract", () => {
  it("uses target-frame axes explicitly and rejects target-frame non-uniform scale", () => {
    expect(resolveTransformGizmoSpace("translate", "target")).toBe("target");
    expect(resolveTransformGizmoSpace("rotate", "target")).toBe("target");
    expect(resolveTransformGizmoSpace("scale", "local")).toBe("local");
    expect(() => resolveTransformGizmoSpace("scale", "target")).toThrow(/Target-frame.*shear/);
  });
});

describe("TransformGizmo translation drag projection", () => {
  it("projects event rays onto one stable camera-facing axis plane", () => {
    const projection = createTranslationDragProjection(
      new Vector3(0, 0, 0),
      new Vector3(1, 0, 0),
      new Matrix4(),
      new Ray(new Vector3(0, 0, 10), new Vector3(0, 0, -1)),
    );
    expect(projection).not.toBeNull();
    if (projection === null) throw new Error("Expected a translation drag projection.");
    const distance = projectTranslationDragDistance(
      projection,
      new Ray(new Vector3(1.25, 0.4, 10), new Vector3(0, 0, -1)),
    );
    expect(distance).toBeCloseTo(1.25);
  });

  it("returns target-frame meters through a transformed parent matrix", () => {
    const targetToWorld = new Matrix4().compose(
      new Vector3(5, 7, 0),
      new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2),
      new Vector3(2, 3, 1),
    );
    const origin = new Vector3(0, 0, 0).applyMatrix4(targetToWorld);
    const projection = createTranslationDragProjection(
      origin,
      new Vector3(1, 0, 0),
      targetToWorld,
      new Ray(new Vector3(5, 7, 10), new Vector3(0, 0, -1)),
    );
    if (projection === null) throw new Error("Expected a transformed drag projection.");
    const movedWorld = new Vector3(1.5, 0, 10).applyMatrix4(targetToWorld);
    expect(
      projectTranslationDragDistance(projection, new Ray(movedWorld, new Vector3(0, 0, -1))),
    ).toBeCloseTo(1.5);
  });

  it("does not start when the pointer ray is parallel to the drag axis", () => {
    expect(
      createTranslationDragProjection(
        new Vector3(),
        new Vector3(1, 0, 0),
        new Matrix4(),
        new Ray(new Vector3(), new Vector3(1, 0, 0)),
      ),
    ).toBeNull();
  });
});

describe("TransformGizmo rotation and scale drag projection", () => {
  it("projects a signed axis-plane angle and unwraps the pi boundary", () => {
    const projection = createRotationDragProjection(
      new Vector3(),
      new Vector3(0, 0, 1),
      new Matrix4(),
      new Ray(new Vector3(1, 0, 10), new Vector3(0, 0, -1)),
    );
    expect(projection).not.toBeNull();
    if (projection === null) throw new Error("Expected a rotation drag projection.");
    expect(
      projectRotationDragAngle(projection, new Ray(new Vector3(0, 1, 10), new Vector3(0, 0, -1))),
    ).toBeCloseTo(Math.PI / 2);

    const beforeWrap = (179 * Math.PI) / 180;
    const afterWrap = (-179 * Math.PI) / 180;
    expect(unwrapRotationDragAngle(beforeWrap, afterWrap)).toBeCloseTo((2 * Math.PI) / 180);
    expect(unwrapRotationDragAngle(afterWrap, beforeWrap)).toBeCloseTo((-2 * Math.PI) / 180);
  });

  it("keeps the signed rotation angle in target coordinates under a transformed parent", () => {
    const targetToWorld = new Matrix4().compose(
      new Vector3(4, -3, 2),
      new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 5),
      new Vector3(2, 1.5, 0.75),
    );
    const originWorld = new Vector3().applyMatrix4(targetToWorld);
    const planeWorld = new Plane()
      .setFromNormalAndCoplanarPoint(new Vector3(0, 0, 1), new Vector3())
      .applyMatrix4(targetToWorld);
    const rayForTargetPoint = (point: Vector3): Ray => {
      const pointWorld = point.applyMatrix4(targetToWorld);
      return new Ray(
        pointWorld.clone().addScaledVector(planeWorld.normal, 5),
        planeWorld.normal.clone().negate(),
      );
    };
    const projection = createRotationDragProjection(
      originWorld,
      new Vector3(0, 0, 1),
      targetToWorld,
      rayForTargetPoint(new Vector3(1, 0, 0)),
    );
    if (projection === null) throw new Error("Expected a transformed rotation projection.");
    expect(
      projectRotationDragAngle(projection, rayForTargetPoint(new Vector3(0, 1, 0))),
    ).toBeCloseTo(Math.PI / 2);
  });

  it("converts start-relative target-frame travel to a dimensionless scale delta", () => {
    const projection = createTranslationDragProjection(
      new Vector3(),
      new Vector3(1, 0, 0),
      new Matrix4(),
      new Ray(new Vector3(0, 0, 10), new Vector3(0, 0, -1)),
    );
    if (projection === null) throw new Error("Expected a scale drag projection.");
    expect(
      projectScaleDragDelta(
        projection,
        new Ray(new Vector3(1.25, 0, 10), new Vector3(0, 0, -1)),
        2,
      ),
    ).toBeCloseTo(0.625);
    expect(() =>
      projectScaleDragDelta(projection, new Ray(new Vector3(1, 0, 10), new Vector3(0, 0, -1)), 0),
    ).toThrow(/positive/);
  });
});

describe("TransformGizmo translation drag lifecycle", () => {
  it("emits start-relative previews, one matching commit, and restores controls", () => {
    const changes: SpatialTransformChangeSet[] = [];
    let invalidations = 0;
    const controls = { enabled: true };
    const lifecycle = createTranslationDragLifecycle({
      session: beginSpatialTranslationDrag({
        entityId: entityId("column"),
        transform: before,
        axis: "x",
        space: "target",
        snap: { translationMeters: 0.25 },
      }),
      controls,
      onTransformChange: (change) => changes.push(change),
      invalidate: () => {
        invalidations += 1;
      },
    });

    expect(controls.enabled).toBe(false);
    expect(lifecycle.hasPreview).toBe(false);
    expect(lifecycle.preview(0.62)).toBe(true);
    expect(lifecycle.preview(0.61)).toBe(false);
    expect(lifecycle.preview(1.12)).toBe(true);
    expect(lifecycle.finish("commit")).toBe(true);
    expect(lifecycle.finish("cancel")).toBe(false);

    expect(changes.map((change) => change.phase)).toEqual(["preview", "preview", "commit"]);
    expect(changes[0]?.changes[0]?.after.translation).toEqual([1.5, 2, 3]);
    expect(changes[1]?.changes[0]?.after.translation).toEqual([2, 2, 3]);
    expect(changes[2]?.changes[0]?.after).toEqual(changes[1]?.changes[0]?.after);
    expect(controls.enabled).toBe(true);
    expect(invalidations).toBe(3);
  });

  it("cancels back to before exactly once and preserves an originally disabled control", () => {
    const changes: SpatialTransformChangeSet[] = [];
    const controls = { enabled: false };
    const lifecycle = createTranslationDragLifecycle({
      session: beginSpatialTranslationDrag({
        entityId: entityId("column"),
        transform: before,
        axis: "z",
        space: "target",
      }),
      controls,
      onTransformChange: (change) => changes.push(change),
      invalidate: () => undefined,
    });
    lifecycle.preview(0.6);
    expect(lifecycle.finish("cancel")).toBe(true);
    expect(lifecycle.finish("cancel")).toBe(false);

    const terminals = changes.filter((change) => change.phase !== "preview");
    expect(terminals).toHaveLength(1);
    expect(terminals[0]?.phase).toBe("cancel");
    expect(terminals[0]?.changes[0]?.after).toEqual(terminals[0]?.changes[0]?.before);
    expect(controls.enabled).toBe(false);
  });

  it("aborts a stale drag without emitting an obsolete terminal transform", () => {
    const changes: SpatialTransformChangeSet[] = [];
    let invalidations = 0;
    const controls = { enabled: true };
    const lifecycle = createTranslationDragLifecycle({
      session: beginSpatialTranslationDrag({
        entityId: entityId("column"),
        transform: before,
        axis: "x",
        space: "target",
      }),
      controls,
      onTransformChange: (change) => changes.push(change),
      invalidate: () => {
        invalidations += 1;
      },
    });

    expect(lifecycle.preview(0.6)).toBe(true);
    expect(lifecycle.abort()).toBe(true);
    expect(lifecycle.abort()).toBe(false);
    expect(lifecycle.finish("cancel")).toBe(false);

    expect(changes.map((change) => change.phase)).toEqual(["preview"]);
    expect(controls.enabled).toBe(true);
    expect(invalidations).toBe(2);
  });
});

describe("TransformGizmo rotation and scale drag lifecycle", () => {
  it("commits one rotation terminal and restores an enabled camera control", () => {
    const changes: SpatialTransformChangeSet[] = [];
    const controls = { enabled: true };
    const lifecycle = createRotationDragLifecycle({
      session: beginSpatialRotationDrag({
        entityId: entityId("column"),
        transform: before,
        axis: "z",
        space: "target",
        snap: { rotationRadians: Math.PI / 4 },
      }),
      controls,
      onTransformChange: (change) => changes.push(change),
      invalidate: () => undefined,
    });

    expect(controls.enabled).toBe(false);
    expect(lifecycle.preview(Math.PI * 0.6)).toBe(true);
    expect(lifecycle.preview(Math.PI * 0.61)).toBe(false);
    expect(lifecycle.finish("commit")).toBe(true);
    expect(lifecycle.finish("cancel")).toBe(false);
    expect(changes.map((change) => change.phase)).toEqual(["preview", "commit"]);
    expect(changes[1]?.changes[0]?.after).toEqual(changes[0]?.changes[0]?.after);
    expect(controls.enabled).toBe(true);
  });

  it("cancels scale exactly once, restores disabled controls, and avoids a no-op commit", () => {
    const changes: SpatialTransformChangeSet[] = [];
    const controls = { enabled: false };
    const lifecycle = createScaleDragLifecycle({
      session: beginSpatialScaleDrag({
        entityId: entityId("column"),
        transform: before,
        axis: "x",
        snap: { scaleStep: 0.1 },
      }),
      controls,
      onTransformChange: (change) => changes.push(change),
      invalidate: () => undefined,
    });

    expect(lifecycle.preview(0.26)).toBe(true);
    expect(lifecycle.hasPreview).toBe(true);
    expect(lifecycle.preview(0)).toBe(true);
    expect(lifecycle.hasPreview).toBe(false);
    expect(lifecycle.finish("cancel")).toBe(true);
    expect(lifecycle.finish("commit")).toBe(false);
    const terminals = changes.filter((change) => change.phase !== "preview");
    expect(terminals).toHaveLength(1);
    expect(terminals[0]?.phase).toBe("cancel");
    expect(terminals[0]?.changes[0]?.after).toEqual(before);
    expect(controls.enabled).toBe(false);
  });
});

describe("TransformGizmo pointer policy", () => {
  const source = readFileSync(new URL("../src/spatial-structure.tsx", import.meta.url), "utf8");

  it("uses primary left-pointer capture, event rays, and DOM cancellation fallbacks", () => {
    expect(source).toContain("pointerEvent.button !== 0");
    expect(source).toContain("!pointerEvent.isPrimary");
    expect(source).toContain("setPointerCapture(pointerEvent.pointerId)");
    expect(source).toContain("releasePointerCapture(active.pointerId)");
    expect(source).toContain('addEventListener("pointercancel"');
    expect(source).toContain('addEventListener("lostpointercapture"');
    expect(source).toContain('terminateActive("cancel", false)');
    expect(source).toContain("event.ray.clone()");
  });

  it("cancels on Escape, locks controls, and does not retain click-step commits", () => {
    expect(source).toContain('event.key !== "Escape"');
    expect(source).toContain("get().controls");
    expect(source).toContain("onClick: stopClick");
    expect(source).toContain("{...handleProps}");
    expect(source).not.toContain("stepSpatialNodeTransform");
    expect(source).not.toContain('if (mode !== "translate") return null');
    expect(source).toContain("createRotationDragLifecycle");
    expect(source).toContain("createScaleDragLifecycle");
    expect(source).toContain("unwrapRotationDragAngle");
  });

  it("aborts safely on observed reparenting and documents stale-state limits", () => {
    expect(source).toContain("transform.sourceFrame");
    expect(source).toContain("transform.targetFrame");
    expect(source).toContain("previews never reparent");
    expect(source).toContain('terminateActive("abort")');
    expect(source).toContain("active.lifecycle.abort()");
    expect(source).toContain("without a revision/session token");
    expect(source).toContain("Direct unmount remains an ordinary cancellation");
  });

  it("provides distinct arrow, ring, and cube geometry with transparent hit targets", () => {
    expect(source).toContain(":shaft-hit-target`");
    expect(source).toContain(":tip-hit-target`");
    expect(source).toContain(":ring-hit-target`");
    expect(source).toContain(":cube-hit-target`");
    expect(source).toContain("Mesh.prototype.raycast.call");
    expect(source).toContain("axisPriority * 1e-6 + intersection.distance * 1e-12");
    expect(source).toContain("raycast={TRANSFORM_GIZMO_RAYCAST[axis]}");
    expect(source).toContain("colorWrite={false}");
    expect(source).toContain("opacity={0}");
    expect(source).toContain("sizeMeters * 0.035");
    expect(source).toContain("sizeMeters * 0.12");
    expect(source).toContain("<torusGeometry");
    expect(source).toContain("<boxGeometry");
  });
});
