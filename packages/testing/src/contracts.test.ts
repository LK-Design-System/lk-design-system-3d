import { describe, expect, it } from "vitest";
import {
  entityId,
  invertTransform,
  transformPoint,
  transformToMatrix4,
  type FramedPoint3,
  type RigidTransform3,
  type Vec3,
} from "@lk-robotics/design-system-3d-core";

import {
  checkAssetFixtureContracts,
  checkAuthoritativeFloorHitProjection,
  checkCoordinateContract,
  checkTransformRoundTrip,
  createCoordinateContractReport,
  createTransformRoundTripReport,
  getInvalidAssetFixtureContractResult,
  projectAuthoritativeFloorHit,
  checkYUpAssetNormalization,
  assertNoContractViolations,
  checkPickingContract,
} from "./contracts.js";
import {
  AUTHORITATIVE_FLOOR_HIT_FIXTURE,
  FIXTURE_FRAMES,
  INVALID_ASSET_MANIFEST_FIXTURES,
  SHIFTED_ORIGIN_FIXTURE,
  coordinateFixtures,
  type CoordinateAdapterContract,
  type FramedRendererTransform,
  type RendererCoordinateContext,
} from "./fixtures.js";

describe("runner-neutral coordinate contracts", () => {
  it("round-trips the shifted origin within 1e-6", () => {
    const report = createTransformRoundTripReport();

    expect(report.passed).toBe(true);
    expect(report.maxAbsoluteError).toBeLessThanOrEqual(1e-6);
    expect(report.recoveredSourcePoint).toEqual(SHIFTED_ORIGIN_FIXTURE.sourcePoint);
  });

  it("enforces the LK right-handed Z-up, X-forward meter convention", () => {
    const report = createCoordinateContractReport();

    expect(report.passed).toBe(true);
    expect(report.checks.every((check) => check.passed)).toBe(true);
  });

  it("projects an authoritative floor hit from render to core to product map", () => {
    const projection = projectAuthoritativeFloorHit(AUTHORITATIVE_FLOOR_HIT_FIXTURE);
    const report = checkAuthoritativeFloorHitProjection();

    expect(projection.coreHit.frame).toBe(AUTHORITATIVE_FLOOR_HIT_FIXTURE.expectedCoreHit.frame);
    expect(projection.productMapHit.frame).toBe(
      AUTHORITATIVE_FLOOR_HIT_FIXTURE.expectedProductMapHit.frame,
    );
    projection.coreHit.value.forEach((value, index) => {
      const expected = AUTHORITATIVE_FLOOR_HIT_FIXTURE.expectedCoreHit.value[index];
      if (expected === undefined) {
        throw new RangeError(`Expected core hit component ${String(index)} is missing.`);
      }
      expect(value).toBeCloseTo(expected, 10);
    });
    projection.productMapHit.value.forEach((value, index) => {
      const expected = AUTHORITATIVE_FLOOR_HIT_FIXTURE.expectedProductMapHit.value[index];
      if (expected === undefined) {
        throw new RangeError(`Expected product-map hit component ${String(index)} is missing.`);
      }
      expect(value).toBeCloseTo(expected, 10);
    });
    expect(report.passed).toBe(true);
    expect(report.maxAbsoluteError).toBeLessThanOrEqual(1e-6);
  });

  it("reports a mismatched authoritative hit frame instead of hiding it", () => {
    const report = checkAuthoritativeFloorHitProjection({
      ...AUTHORITATIVE_FLOOR_HIT_FIXTURE,
      legacyHit: {
        frame: FIXTURE_FRAMES.productMap,
        value: AUTHORITATIVE_FLOOR_HIT_FIXTURE.legacyHit.value,
      },
    });

    expect(report.passed).toBe(false);
    expect(report.checks[0]?.id).toBe("floor-hit-projection");
  });
});

describe("canonical P0 public contract", () => {
  it("checks rigid transform inversion with serializable violations", () => {
    expect(checkTransformRoundTrip(SHIFTED_ORIGIN_FIXTURE.sourceToCore)).toEqual([]);
  });

  it("checks a coordinate adapter in both directions, including shifted origin", () => {
    const adapter: CoordinateAdapterContract = {
      toRendererPoint(point: FramedPoint3, context: RendererCoordinateContext) {
        const shift: Vec3 = context.shiftedOriginInCore?.value ?? [0, 0, 0];
        return transformPoint(context.coreToRenderer, {
          frame: context.coreFrame,
          value: [point.value[0] - shift[0], point.value[1] - shift[1], point.value[2] - shift[2]],
        }).value;
      },
      fromRendererPoint(
        point: readonly [number, number, number],
        context: RendererCoordinateContext,
      ) {
        const shift: Vec3 = context.shiftedOriginInCore?.value ?? [0, 0, 0];
        const recovered = transformPoint(invertTransform(context.coreToRenderer), {
          frame: context.rendererFrame,
          value: point,
        });
        return {
          frame: context.coreFrame,
          value: [
            recovered.value[0] + shift[0],
            recovered.value[1] + shift[1],
            recovered.value[2] + shift[2],
          ],
        } as const;
      },
      toRendererTransform(transform: RigidTransform3) {
        return {
          sourceFrame: transform.sourceFrame,
          targetFrame: transform.targetFrame,
          value: transformToMatrix4(transform),
        };
      },
      fromRendererTransform(
        transform: FramedRendererTransform,
        context: RendererCoordinateContext,
      ) {
        return {
          sourceFrame: transform.sourceFrame,
          targetFrame: transform.targetFrame,
          translation: context.coreToRenderer.translation,
          rotation: context.coreToRenderer.rotation,
        };
      },
    };
    const fixtures = Object.values(coordinateFixtures);
    const violations = checkCoordinateContract(adapter, fixtures);

    expect(violations).toEqual([]);
    expect(() => assertNoContractViolations(violations)).not.toThrow();
  });

  it("reports picking differences and asserts them", () => {
    const expected = [
      {
        entityId: entityId("fixture-robot"),
        point: { frame: FIXTURE_FRAMES.core, value: [1, 2, 0] as const },
        distanceMeters: 3,
      },
    ];
    expect(checkPickingContract(expected, expected)).toEqual([]);
    const expectedHit = expected[0];
    if (expectedHit === undefined) {
      throw new Error("Expected picking fixture is missing.");
    }
    const violations = checkPickingContract(
      [{ ...expectedHit, point: { ...expectedHit.point, value: [2, 2, 0] } }],
      expected,
    );
    expect(violations.some((item) => item.code === "picking.point")).toBe(true);
    expect(() => assertNoContractViolations(violations)).toThrow();
  });
});

describe("runner-neutral asset contracts", () => {
  it("accepts the Y-up fixture and rejects every deliberate invalid manifest", () => {
    const report = checkAssetFixtureContracts();

    expect(report.passed).toBe(true);
    expect(report.validFixtureCount).toBe(2);
    expect(report.invalidFixtureCount).toBe(Object.keys(INVALID_ASSET_MANIFEST_FIXTURES).length);
    expect(report.yUpNormalization.passed).toBe(true);
  });

  it("normalizes GLB +Y up and +Z forward to LK +Z up and +X forward", () => {
    const report = checkYUpAssetNormalization();

    expect(report.passed).toBe(true);
    expect(report.normalizedUp?.value[2]).toBeCloseTo(1, 12);
    expect(report.normalizedForward?.value[0]).toBeCloseTo(1, 12);
  });

  it.each(Object.keys(INVALID_ASSET_MANIFEST_FIXTURES))(
    "rejects %s with an issue at the expected path",
    (fixtureId) => {
      const result = getInvalidAssetFixtureContractResult(
        fixtureId as keyof typeof INVALID_ASSET_MANIFEST_FIXTURES,
      );

      expect(result.report.passed).toBe(true);
      expect(result.report.validation.valid).toBe(false);
      expect(result.report.validation.issues.length).toBeGreaterThan(0);
    },
  );
});
