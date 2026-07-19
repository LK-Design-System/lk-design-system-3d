import { describe, expect, it } from "vitest";

import {
  appendSpatialPointDraftPoint,
  beginSpatialGoalPoseDrag,
  beginSpatialPointDraft,
  beginSpatialRotationDrag,
  beginSpatialScaleDrag,
  beginSpatialTranslationDrag,
  cancelSpatialPointDraft,
  createSpatialTransformChangeSet,
  entityId,
  finishSpatialGoalPoseDrag,
  finishSpatialPointDraft,
  finishSpatialRotationDrag,
  finishSpatialScaleDrag,
  finishSpatialTranslationDrag,
  frameId,
  previewSpatialGoalPoseHeading,
  previewSpatialPointDraftCursor,
  previewSpatialRotationDrag,
  previewSpatialScaleDrag,
  previewSpatialTranslationDrag,
  removeLastSpatialPointDraftPoint,
  spatialNodeTransform,
  stepSpatialNodeTransform,
  validateSpatialPointDraft,
} from "../src/index.js";

const transform = spatialNodeTransform(
  frameId("object-local"),
  frameId("level-local"),
  [1, 2, 3],
  [0, 0, 0, 1],
  [1, 1, 1],
);

describe("spatial authoring change contract", () => {
  it("applies explicit target-frame and local snapped translation steps", () => {
    const target = stepSpatialNodeTransform(transform, {
      mode: "translate",
      axis: "x",
      space: "target",
      snap: { translationMeters: 0.5 },
    });
    expect(target.translation).toEqual([1.5, 2, 3]);

    const quarterTurn = spatialNodeTransform(
      transform.sourceFrame,
      transform.targetFrame,
      transform.translation,
      [0, 0, Math.SQRT1_2, Math.SQRT1_2],
      transform.scale,
    );
    const local = stepSpatialNodeTransform(quarterTurn, {
      mode: "translate",
      axis: "x",
      space: "local",
      snap: { translationMeters: 0.5 },
    });
    expect(local.translation[0]).toBeCloseTo(1);
    expect(local.translation[1]).toBeCloseTo(2.5);
    expect(local.translation[2]).toBeCloseTo(3);
  });

  it("rotates and scales without changing frame identity", () => {
    const rotated = stepSpatialNodeTransform(transform, {
      mode: "rotate",
      axis: "z",
      space: "local",
      snap: { rotationRadians: Math.PI / 2 },
    });
    expect(rotated.rotation[2]).toBeCloseTo(Math.SQRT1_2);
    expect(rotated.rotation[3]).toBeCloseTo(Math.SQRT1_2);

    const scaled = stepSpatialNodeTransform(transform, {
      mode: "scale",
      axis: "y",
      space: "local",
      direction: -1,
      snap: { scaleStep: 0.25 },
    });
    expect(scaled.scale).toEqual([1, 0.75, 1]);
    expect(scaled.sourceFrame).toBe(transform.sourceFrame);
    expect(scaled.targetFrame).toBe(transform.targetFrame);
  });

  it("rejects scale collapse and target-frame scale shear", () => {
    expect(() =>
      stepSpatialNodeTransform(transform, {
        mode: "scale",
        axis: "x",
        direction: -1,
        snap: { scaleStep: 1 },
      }),
    ).toThrow(/positive/);
    expect(() =>
      stepSpatialNodeTransform(transform, {
        mode: "scale",
        axis: "x",
        space: "target",
      }),
    ).toThrow(/shear/);
  });

  it("serializes an immutable before/after change set without product commands", () => {
    const after = stepSpatialNodeTransform(transform, {
      mode: "translate",
      axis: "z",
      space: "target",
    });
    const changeSet = createSpatialTransformChangeSet({
      mode: "translate",
      axis: "z",
      space: "target",
      phase: "commit",
      changes: [{ entityId: entityId("column"), before: transform, after }],
    });
    expect(Object.isFrozen(changeSet)).toBe(true);
    expect(Object.isFrozen(changeSet.changes)).toBe(true);
    expect(JSON.parse(JSON.stringify(changeSet))).toEqual(changeSet);
    expect(JSON.stringify(changeSet)).not.toMatch(/save|undo|permission|api/i);
  });

  it("does not allow one change set to reparent an entity", () => {
    const reparented = spatialNodeTransform(
      transform.sourceFrame,
      frameId("other-level"),
      transform.translation,
      transform.rotation,
      transform.scale,
    );
    expect(() =>
      createSpatialTransformChangeSet({
        mode: "translate",
        axis: "x",
        space: "local",
        phase: "commit",
        changes: [{ entityId: entityId("column"), before: transform, after: reparented }],
      }),
    ).toThrow(/reparent/);
  });

  it("rejects invalid serialized mode, axis, space, and phase values", () => {
    const value = {
      mode: "translate",
      axis: "x",
      space: "target",
      phase: "preview",
      changes: [{ entityId: entityId("column"), before: transform, after: transform }],
    } as const;
    expect(() => createSpatialTransformChangeSet({ ...value, mode: "move" as never })).toThrow(
      /mode/,
    );
    expect(() => createSpatialTransformChangeSet({ ...value, axis: "u" as never })).toThrow(/axis/);
    expect(() => createSpatialTransformChangeSet({ ...value, space: "screen" as never })).toThrow(
      /space/,
    );
    expect(() => createSpatialTransformChangeSet({ ...value, phase: "click" as never })).toThrow(
      /phase/,
    );
  });

  it("builds every snapped drag preview from the immutable pointer-down snapshot", () => {
    const session = beginSpatialTranslationDrag({
      entityId: entityId("column"),
      transform,
      axis: "x",
      space: "target",
      snap: { translationMeters: 0.25 },
    });
    const first = previewSpatialTranslationDrag(session, 0.62);
    const second = previewSpatialTranslationDrag(session, 1.12);
    const negativeHalfStep = previewSpatialTranslationDrag(session, -0.125);

    expect(Object.isFrozen(session)).toBe(true);
    expect(Object.isFrozen(session.before)).toBe(true);
    expect(first.changes[0]?.after.translation).toEqual([1.5, 2, 3]);
    expect(second.changes[0]?.after.translation).toEqual([2, 2, 3]);
    expect(negativeHalfStep.changes[0]?.after.translation).toEqual([0.75, 2, 3]);
    expect(second.changes[0]?.before).toEqual(transform);
  });

  it("uses the captured local axis for absolute drag previews", () => {
    const quarterTurn = spatialNodeTransform(
      transform.sourceFrame,
      transform.targetFrame,
      transform.translation,
      [0, 0, Math.SQRT1_2, Math.SQRT1_2],
      transform.scale,
    );
    const session = beginSpatialTranslationDrag({
      entityId: entityId("column"),
      transform: quarterTurn,
      axis: "x",
      space: "local",
      snap: { translationMeters: 0.5 },
    });
    const preview = previewSpatialTranslationDrag(session, 1.1);
    expect(preview.changes[0]?.after.translation[0]).toBeCloseTo(1);
    expect(preview.changes[0]?.after.translation[1]).toBeCloseTo(3);
    expect(preview.changes[0]?.after.translation[2]).toBeCloseTo(3);
  });

  it("commits the last preview and cancels back to before", () => {
    const session = beginSpatialTranslationDrag({
      entityId: entityId("column"),
      transform,
      axis: "z",
      space: "target",
    });
    const preview = previewSpatialTranslationDrag(session, 0.8);
    const commit = finishSpatialTranslationDrag(session, preview, "commit");
    const cancel = finishSpatialTranslationDrag(session, preview, "cancel");

    expect(commit.phase).toBe("commit");
    expect(commit.changes[0]?.after).toEqual(preview.changes[0]?.after);
    expect(cancel.phase).toBe("cancel");
    expect(cancel.changes[0]?.after).toEqual(cancel.changes[0]?.before);
  });

  it("does not finish a drag with a preview from another session", () => {
    const session = beginSpatialTranslationDrag({
      entityId: entityId("column"),
      transform,
      axis: "x",
      space: "target",
    });
    const other = beginSpatialTranslationDrag({
      entityId: entityId("other-column"),
      transform,
      axis: "x",
      space: "target",
    });
    expect(() =>
      finishSpatialTranslationDrag(session, previewSpatialTranslationDrag(other, 1), "commit"),
    ).toThrow(/does not belong/);
  });

  it("builds local and target-frame rotation previews with the correct quaternion order", () => {
    const rotatedStart = spatialNodeTransform(
      transform.sourceFrame,
      transform.targetFrame,
      transform.translation,
      [Math.SQRT1_2, 0, 0, Math.SQRT1_2],
      transform.scale,
    );
    const local = previewSpatialRotationDrag(
      beginSpatialRotationDrag({
        entityId: entityId("column"),
        transform: rotatedStart,
        axis: "z",
        space: "local",
        snap: { rotationRadians: Math.PI / 2 },
      }),
      Math.PI / 2,
    );
    const target = previewSpatialRotationDrag(
      beginSpatialRotationDrag({
        entityId: entityId("column"),
        transform: rotatedStart,
        axis: "z",
        space: "target",
        snap: { rotationRadians: Math.PI / 2 },
      }),
      Math.PI / 2,
    );

    const localRotation = local.changes[0]?.after.rotation;
    const targetRotation = target.changes[0]?.after.rotation;
    expect(localRotation?.[0]).toBeCloseTo(0.5);
    expect(localRotation?.[1]).toBeCloseTo(-0.5);
    expect(localRotation?.[2]).toBeCloseTo(0.5);
    expect(localRotation?.[3]).toBeCloseTo(0.5);
    expect(targetRotation?.[0]).toBeCloseTo(0.5);
    expect(targetRotation?.[1]).toBeCloseTo(0.5);
    expect(targetRotation?.[2]).toBeCloseTo(0.5);
    expect(targetRotation?.[3]).toBeCloseTo(0.5);
  });

  it("snaps rotation symmetrically and accepts unwrapped accumulated angles beyond pi", () => {
    const session = beginSpatialRotationDrag({
      entityId: entityId("column"),
      transform,
      axis: "z",
      space: "target",
      snap: { rotationRadians: Math.PI / 2 },
    });
    const positiveHalf = previewSpatialRotationDrag(session, Math.PI / 4);
    const negativeHalf = previewSpatialRotationDrag(session, -Math.PI / 4);
    const beyondFullTurn = previewSpatialRotationDrag(session, Math.PI * 2 + Math.PI / 4);

    expect(positiveHalf.changes[0]?.after.rotation[2]).toBeCloseTo(Math.SQRT1_2);
    expect(negativeHalf.changes[0]?.after.rotation[2]).toBeCloseTo(-Math.SQRT1_2);
    expect(Math.abs(beyondFullTurn.changes[0]?.after.rotation[2] ?? 0)).toBeCloseTo(Math.SQRT1_2);
    expect(beyondFullTurn.changes[0]?.before).toEqual(transform);
  });

  it("keeps scale local, additive, positive, and start-relative", () => {
    const scaledStart = spatialNodeTransform(
      transform.sourceFrame,
      transform.targetFrame,
      transform.translation,
      transform.rotation,
      [1, 2, 3],
    );
    const session = beginSpatialScaleDrag({
      entityId: entityId("column"),
      transform: scaledStart,
      axis: "x",
      snap: { scaleStep: 0.25 },
    });
    const first = previewSpatialScaleDrag(session, 0.62);
    const second = previewSpatialScaleDrag(session, 0.26);
    const clamped = previewSpatialScaleDrag(session, -10);

    expect(first.changes[0]?.after.scale).toEqual([1.5, 2, 3]);
    expect(second.changes[0]?.after.scale).toEqual([1.25, 2, 3]);
    expect(clamped.changes[0]?.after.scale).toEqual([0.25, 2, 3]);
    expect(second.changes[0]?.before).toEqual(scaledStart);
    expect(() =>
      beginSpatialScaleDrag({
        entityId: entityId("column"),
        transform: scaledStart,
        axis: "x",
        space: "target",
      }),
    ).toThrow(/shear/);
  });

  it("clamps floating-point scale collapse without inflating sub-step initial scales", () => {
    const nearGridStart = spatialNodeTransform(
      transform.sourceFrame,
      transform.targetFrame,
      transform.translation,
      transform.rotation,
      [0.30000000000000016, 1, 1],
    );
    const nearGridPreview = previewSpatialScaleDrag(
      beginSpatialScaleDrag({
        entityId: entityId("near-grid-column"),
        transform: nearGridStart,
        axis: "x",
        snap: { scaleStep: 0.1 },
      }),
      -10,
    );
    const nearGridScale = nearGridPreview.changes[0]?.after.scale[0];
    expect(nearGridScale).toBeGreaterThan(0.09);
    expect(nearGridScale).toBeCloseTo(0.1);

    const subStepStart = spatialNodeTransform(
      transform.sourceFrame,
      transform.targetFrame,
      transform.translation,
      transform.rotation,
      [0.04, 1, 1],
    );
    const subStepPreview = previewSpatialScaleDrag(
      beginSpatialScaleDrag({
        entityId: entityId("sub-step-column"),
        transform: subStepStart,
        axis: "x",
        snap: { scaleStep: 0.1 },
      }),
      -10,
    );
    expect(subStepPreview.changes[0]?.after.scale[0]).toBe(0.04);
  });

  it("commits and cancels rotation and scale without accepting cross-session previews", () => {
    const rotationSession = beginSpatialRotationDrag({
      entityId: entityId("column"),
      transform,
      axis: "y",
      space: "local",
    });
    const rotationPreview = previewSpatialRotationDrag(rotationSession, 0.8);
    expect(
      finishSpatialRotationDrag(rotationSession, rotationPreview, "commit").changes[0]?.after,
    ).toEqual(rotationPreview.changes[0]?.after);
    expect(
      finishSpatialRotationDrag(rotationSession, rotationPreview, "cancel").changes[0]?.after,
    ).toEqual(transform);

    const scaleSession = beginSpatialScaleDrag({
      entityId: entityId("column"),
      transform,
      axis: "z",
    });
    const scalePreview = previewSpatialScaleDrag(scaleSession, 0.36);
    expect(finishSpatialScaleDrag(scaleSession, scalePreview, "commit").changes[0]?.after).toEqual(
      scalePreview.changes[0]?.after,
    );
    expect(finishSpatialScaleDrag(scaleSession, scalePreview, "cancel").changes[0]?.after).toEqual(
      transform,
    );

    const otherRotation = beginSpatialRotationDrag({
      entityId: entityId("other-column"),
      transform,
      axis: "y",
      space: "local",
    });
    const otherScale = beginSpatialScaleDrag({
      entityId: entityId("other-column"),
      transform,
      axis: "z",
    });
    expect(() =>
      finishSpatialRotationDrag(
        rotationSession,
        previewSpatialRotationDrag(otherRotation, 0.8),
        "commit",
      ),
    ).toThrow(/does not belong/);
    expect(() =>
      finishSpatialScaleDrag(scaleSession, previewSpatialScaleDrag(otherScale, 0.36), "commit"),
    ).toThrow(/does not belong/);
  });
});

describe("spatial point draft contract", () => {
  const mapFrame = frameId("map");

  it("begins, previews, and appends detached immutable point snapshots", () => {
    const callerPoints: [number, number, number][] = [[0, 0, 0]];
    const begin = beginSpatialPointDraft({
      kind: "polyline",
      frame: mapFrame,
      committedPoints: callerPoints,
      minPointDistanceMeters: 0.25,
    });
    const [callerFirstPoint] = callerPoints;
    if (callerFirstPoint === undefined) throw new Error("Test fixture requires one point.");
    callerFirstPoint[0] = 99;

    const preview = previewSpatialPointDraftCursor(begin, [1, 0, 0]);
    const appended = appendSpatialPointDraftPoint(preview.session);

    expect(begin.committedPoints).toEqual([[0, 0, 0]]);
    expect(begin.previewPoint).toBeUndefined();
    expect(preview.session.previewPoint).toEqual([1, 0, 0]);
    expect(preview.session.committedPoints).toEqual([[0, 0, 0]]);
    expect(appended.session.committedPoints).toEqual([
      [0, 0, 0],
      [1, 0, 0],
    ]);
    expect(appended.session.previewPoint).toBeUndefined();
    expect(Object.isFrozen(begin)).toBe(true);
    expect(Object.isFrozen(begin.committedPoints)).toBe(true);
    expect(Object.isFrozen(begin.committedPoints[0])).toBe(true);
    expect(Object.isFrozen(preview)).toBe(true);
    expect(Object.isFrozen(preview.session.previewPoint)).toBe(true);
    expect(Object.isFrozen(appended.session)).toBe(true);
  });

  it("returns explicit issues and rejects invalid point appends", () => {
    const session = beginSpatialPointDraft({
      kind: "polyline",
      frame: mapFrame,
      committedPoints: [[0, 0, 0]],
      minPointDistanceMeters: 0.25,
    });
    const duplicate = appendSpatialPointDraftPoint(session, [0, 0, 0]);
    const tooClose = appendSpatialPointDraftPoint(session, [0.1, 0, 0]);
    const nonFinite = appendSpatialPointDraftPoint(session, [Number.NaN, 0, 0]);
    const missing = appendSpatialPointDraftPoint(session);

    expect(duplicate.issues[0]).toMatchObject({
      code: "CONSECUTIVE_DUPLICATE_POINT",
      severity: "error",
      index: 1,
    });
    expect(tooClose.issues[0]).toMatchObject({
      code: "POINT_TOO_CLOSE",
      severity: "error",
      index: 1,
    });
    expect(nonFinite.issues[0]).toMatchObject({
      code: "NON_FINITE_POINT",
      severity: "error",
      index: 1,
    });
    expect(missing.issues[0]?.code).toBe("MISSING_DRAFT_POINT");
    expect(duplicate.session.committedPoints).toHaveLength(1);
    expect(tooClose.session.committedPoints).toHaveLength(1);
    expect(nonFinite.session.committedPoints).toHaveLength(1);
    expect(Object.isFrozen(duplicate.issues)).toBe(true);
    expect(Object.isFrozen(duplicate.issues[0])).toBe(true);
  });

  it("supports backspace and cancel without mutating an earlier draft or document", () => {
    const documentPoints: [number, number, number][] = [[10, 10, 0]];
    const empty = beginSpatialPointDraft({
      kind: "polyline",
      frame: mapFrame,
      minPointDistanceMeters: 0.25,
    });
    const first = appendSpatialPointDraftPoint(empty, [0, 0, 0]).session;
    const second = appendSpatialPointDraftPoint(first, [1, 0, 0]).session;
    const withPreview = previewSpatialPointDraftCursor(second, [2, 0, 0]).session;
    const removed = removeLastSpatialPointDraftPoint(withPreview);
    const cancelled = cancelSpatialPointDraft(removed.session);

    expect(removed.session.committedPoints).toEqual([[0, 0, 0]]);
    expect(removed.session.previewPoint).toEqual([2, 0, 0]);
    expect(second.committedPoints).toEqual([
      [0, 0, 0],
      [1, 0, 0],
    ]);
    expect(documentPoints).toEqual([[10, 10, 0]]);
    expect(cancelled).toEqual({ status: "cancel", kind: "polyline", frame: mapFrame });
    expect("points" in cancelled).toBe(false);
    expect(Object.isFrozen(cancelled)).toBe(true);
  });

  it("validates and finishes polyline drafts as commit or invalid", () => {
    const onePoint = beginSpatialPointDraft({
      kind: "polyline",
      frame: mapFrame,
      committedPoints: [[0, 0, 0]],
      minPointDistanceMeters: 0.25,
    });
    const invalid = finishSpatialPointDraft(onePoint);
    expect(invalid.status).toBe("invalid");
    expect(invalid.issues.some((issue) => issue.code === "TOO_FEW_POINTS")).toBe(true);

    const twoPoints = appendSpatialPointDraftPoint(onePoint, [1, 0, 0]).session;
    expect(validateSpatialPointDraft(twoPoints)).toEqual([]);
    const commit = finishSpatialPointDraft(twoPoints);
    expect(commit.status).toBe("commit");
    expect(commit.points).toEqual([
      [0, 0, 0],
      [1, 0, 0],
    ]);
    expect(Object.isFrozen(commit)).toBe(true);
    expect(Object.isFrozen(commit.points)).toBe(true);
    expect(Object.isFrozen(commit.points[0])).toBe(true);
  });

  it("requires three polygon points and non-zero XY area", () => {
    const collinear = beginSpatialPointDraft({
      kind: "polygon",
      frame: mapFrame,
      committedPoints: [
        [0, 0, 1],
        [1, 0, 2],
        [2, 0, 3],
      ],
      minPointDistanceMeters: 0.25,
    });
    expect(validateSpatialPointDraft(collinear).map((issue) => issue.code)).toContain(
      "ZERO_XY_AREA",
    );
    expect(finishSpatialPointDraft(collinear).status).toBe("invalid");

    const triangle = beginSpatialPointDraft({
      kind: "polygon",
      frame: mapFrame,
      committedPoints: [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
      ],
      minPointDistanceMeters: 0.25,
    });
    expect(validateSpatialPointDraft(triangle)).toEqual([]);
    expect(finishSpatialPointDraft(triangle).status).toBe("commit");
  });

  it("rejects non-planar and self-intersecting polygon rings", () => {
    const nonPlanar = beginSpatialPointDraft({
      kind: "polygon",
      frame: mapFrame,
      committedPoints: [
        [0, 0, 0],
        [2, 0, 0.1],
        [0, 2, 0],
      ],
      minPointDistanceMeters: 0.25,
    });
    expect(validateSpatialPointDraft(nonPlanar).map((issue) => issue.code)).toContain(
      "NON_PLANAR_POLYGON",
    );

    const selfIntersecting = beginSpatialPointDraft({
      kind: "polygon",
      frame: mapFrame,
      committedPoints: [
        [0, 0, 0],
        [3, 0, 0],
        [0, 2, 0],
        [3, 2, 0],
        [1.5, -1, 0],
      ],
      minPointDistanceMeters: 0.25,
    });
    const issues = validateSpatialPointDraft(selfIntersecting);
    expect(issues.map((issue) => issue.code)).toContain("SELF_INTERSECTING_POLYGON");
    expect(finishSpatialPointDraft(selfIntersecting).status).toBe("invalid");
  });

  it("rejects polygons below the shared authoring area tolerance", () => {
    const nearDegenerate = beginSpatialPointDraft({
      kind: "polygon",
      frame: mapFrame,
      committedPoints: [
        [0, 0, 0],
        [1, 0, 0],
        [2, 1e-8, 0],
      ],
      minPointDistanceMeters: 0.25,
    });

    expect(validateSpatialPointDraft(nearDegenerate).map((issue) => issue.code)).toContain(
      "ZERO_XY_AREA",
    );
    expect(finishSpatialPointDraft(nearDegenerate).status).toBe("invalid");
  });

  it("reports non-finite resumed draft points during validation", () => {
    const resumed = beginSpatialPointDraft({
      kind: "polyline",
      frame: mapFrame,
      committedPoints: [
        [0, 0, 0],
        [Number.POSITIVE_INFINITY, 1, 0],
      ],
      minPointDistanceMeters: 0.25,
    });
    expect(validateSpatialPointDraft(resumed)[0]).toMatchObject({
      code: "NON_FINITE_POINT",
      index: 1,
    });
    expect(finishSpatialPointDraft(resumed).status).toBe("invalid");
  });
});

describe("spatial goal pose heading contract", () => {
  const mapFrame = frameId("map");

  it("finishes a Z-up XY heading as a core-frame Pose3 quaternion", () => {
    const session = beginSpatialGoalPoseDrag({
      frame: mapFrame,
      origin: [1, 2, 3],
      minHeadingDistanceMeters: 0.1,
    });
    const preview = previewSpatialGoalPoseHeading(session, [1, 3, 99]);
    const finish = finishSpatialGoalPoseDrag(session, preview);

    expect(preview.distanceMeters).toBe(1);
    expect(preview.yawRadians).toBeCloseTo(Math.PI / 2);
    expect(finish.status).toBe("commit");
    if (finish.status === "commit") {
      expect(finish.pose.frame).toBe(mapFrame);
      expect(finish.pose.position).toEqual([1, 2, 3]);
      expect(finish.pose.orientation[0]).toBe(0);
      expect(finish.pose.orientation[1]).toBe(0);
      expect(finish.pose.orientation[2]).toBeCloseTo(Math.SQRT1_2);
      expect(finish.pose.orientation[3]).toBeCloseTo(Math.SQRT1_2);
      expect(finish.yawRadians).toBeCloseTo(Math.PI / 2);
      expect(Object.isFrozen(finish.pose)).toBe(true);
      expect(Object.isFrozen(finish.pose.orientation)).toBe(true);
    }
    expect(Object.isFrozen(session)).toBe(true);
    expect(Object.isFrozen(session.origin)).toBe(true);
    expect(Object.isFrozen(preview)).toBe(true);
    expect(Object.isFrozen(preview.cursor)).toBe(true);
  });

  it("returns an explicit invalid issue for a short heading drag", () => {
    const session = beginSpatialGoalPoseDrag({
      frame: mapFrame,
      origin: [1, 2, 3],
      minHeadingDistanceMeters: 0.1,
    });
    const preview = previewSpatialGoalPoseHeading(session, [1.01, 2, -100]);
    const finish = finishSpatialGoalPoseDrag(session, preview);

    expect(preview.issues[0]).toMatchObject({
      code: "GOAL_HEADING_TOO_SHORT",
      severity: "error",
      index: 1,
    });
    expect(finish.status).toBe("invalid");
    expect(finish.issues[0]?.code).toBe("GOAL_HEADING_TOO_SHORT");
    expect(Object.isFrozen(finish.issues)).toBe(true);
  });

  it("rejects a heading preview from a different drag threshold", () => {
    const first = beginSpatialGoalPoseDrag({
      frame: mapFrame,
      origin: [0, 0, 0],
      minHeadingDistanceMeters: 0.1,
    });
    const other = beginSpatialGoalPoseDrag({
      frame: mapFrame,
      origin: [0, 0, 0],
      minHeadingDistanceMeters: 0.5,
    });
    expect(() =>
      finishSpatialGoalPoseDrag(first, previewSpatialGoalPoseHeading(other, [1, 0, 0])),
    ).toThrow(/does not belong/);
  });
});
