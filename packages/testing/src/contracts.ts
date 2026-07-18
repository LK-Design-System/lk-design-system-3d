import {
  LK_CORE_COORDINATE_SYSTEM,
  composeTransforms,
  invertTransform,
  transformPoint,
  transformToMatrix4,
  type FramedPoint3,
  type Mat4,
  type PickHit,
  type RigidTransform3,
  type Vec3,
} from "@lk-robotics/design-system-3d-core";
import {
  createAssetReport,
  normalizeAssetPointToCore,
  type AssetValidationIssue,
  type AssetValidationReport,
} from "@lk-robotics/design-system-3d-assets";
import {
  AUTHORITATIVE_FLOOR_HIT_FIXTURE,
  INVALID_ASSET_MANIFEST_FIXTURES,
  LEGACY_Z_UP_GLB_MANIFEST_FIXTURE,
  SHIFTED_ORIGIN_FIXTURE,
  SHIFTED_ORIGIN_IN_CORE,
  Y_UP_GLB_MANIFEST_FIXTURE,
  coordinateFixtures,
  type AuthoritativeFloorHitFixture,
  type CoordinateAdapterContract,
  type CoordinateFixture,
  type InvalidAssetManifestFixtureId,
  type ShiftedOriginFixture,
} from "./fixtures.js";

export const FOUNDATION_ABSOLUTE_TOLERANCE = 1e-6;

export interface ContractCheck {
  readonly id: string;
  readonly passed: boolean;
  readonly message: string;
  readonly measurements?: Readonly<Record<string, number | string | boolean>>;
}

export interface ContractViolation {
  readonly fixture: string;
  readonly code: string;
  readonly message: string;
  readonly actual?: unknown;
  readonly expected?: unknown;
}

export interface TransformRoundTripReport {
  readonly passed: boolean;
  readonly tolerance: number;
  readonly maxAbsoluteError: number;
  readonly sourcePoint: FramedPoint3;
  readonly corePoint?: FramedPoint3;
  readonly recoveredSourcePoint?: FramedPoint3;
  readonly checks: readonly ContractCheck[];
}

export interface CoordinateContractReport {
  readonly passed: boolean;
  readonly tolerance: number;
  readonly maxAbsoluteError: number;
  readonly coordinateSystem: typeof LK_CORE_COORDINATE_SYSTEM;
  readonly fixtureIds: readonly string[];
  readonly checks: readonly ContractCheck[];
}

export interface FloorHitProjectionInput {
  readonly legacyHit: FramedPoint3;
  readonly renderToCore: RigidTransform3;
  readonly coreToProductMap: RigidTransform3;
}

export interface FloorHitProjectionResult {
  readonly coreHit: FramedPoint3;
  readonly productMapHit: FramedPoint3;
}

export interface FloorHitProjectionReport {
  readonly passed: boolean;
  readonly tolerance: number;
  readonly maxAbsoluteError: number;
  readonly fixtureId: string;
  readonly projection?: FloorHitProjectionResult;
  readonly checks: readonly ContractCheck[];
}

export interface AssetManifestContractExpectation {
  readonly expectedValid: boolean;
  readonly expectedIssueCodes?: readonly string[];
  readonly expectedIssuePaths?: readonly string[];
}

export interface AssetManifestContractReport {
  readonly passed: boolean;
  readonly expectedValid: boolean;
  readonly validation: AssetValidationReport;
  readonly missingIssueCodes: readonly string[];
  readonly missingIssuePaths: readonly string[];
  readonly checks: readonly ContractCheck[];
}

export interface AssetFixtureContractResult {
  readonly fixtureId: string;
  readonly expectedValid: boolean;
  readonly report: AssetManifestContractReport;
}

export interface AssetFixtureContractReport {
  readonly passed: boolean;
  readonly results: readonly AssetFixtureContractResult[];
  readonly validFixtureCount: number;
  readonly invalidFixtureCount: number;
  readonly yUpNormalization: AssetNormalizationContractReport;
}

export interface AssetNormalizationContractReport {
  readonly passed: boolean;
  readonly fixtureId: "y-up-glb-manifest";
  readonly normalizedUp?: FramedPoint3;
  readonly normalizedForward?: FramedPoint3;
  readonly checks: readonly ContractCheck[];
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    const serialized: unknown = JSON.stringify(error);
    return typeof serialized === "string" ? serialized : "Unknown error";
  } catch {
    return "Unknown error";
  }
}

function vectorMaxAbsoluteError(actual: Vec3, expected: Vec3): number {
  const differences = [
    Math.abs(actual[0] - expected[0]),
    Math.abs(actual[1] - expected[1]),
    Math.abs(actual[2] - expected[2]),
  ];
  return differences.every(Number.isFinite) ? Math.max(...differences) : Number.POSITIVE_INFINITY;
}

function requiredArrayItem<TValue>(
  values: readonly TValue[],
  index: number,
  label: string,
): TValue {
  const value = values[index];
  if (value === undefined) {
    throw new RangeError(`${label}[${String(index)}] is missing.`);
  }
  return value;
}

function exactFrameMatch(actual: FramedPoint3, expected: FramedPoint3): boolean {
  return actual.frame === expected.frame;
}

/**
 * Checks source -> core -> source without depending on a test runner. Exceptions
 * are converted into failed checks so this report can be serialized by CI or a
 * product characterization harness.
 */
export function createTransformRoundTripReport(
  fixture: ShiftedOriginFixture = SHIFTED_ORIGIN_FIXTURE,
  tolerance = FOUNDATION_ABSOLUTE_TOLERANCE,
): TransformRoundTripReport {
  const checks: ContractCheck[] = [];
  let corePoint: FramedPoint3 | undefined;
  let recoveredSourcePoint: FramedPoint3 | undefined;
  let maxAbsoluteError = Number.POSITIVE_INFINITY;

  try {
    corePoint = transformPoint(fixture.sourceToCore, fixture.sourcePoint);
    const coreError = vectorMaxAbsoluteError(corePoint.value, fixture.expectedCorePoint.value);
    checks.push({
      id: "source-to-core-value",
      passed: coreError <= tolerance,
      message: `Source to core maximum absolute error is ${String(coreError)}.`,
      measurements: { maximumAbsoluteError: coreError, tolerance },
    });
    checks.push({
      id: "source-to-core-frame",
      passed: exactFrameMatch(corePoint, fixture.expectedCorePoint),
      message: `Expected frame ${fixture.expectedCorePoint.frame}; received ${corePoint.frame}.`,
    });

    recoveredSourcePoint = transformPoint(invertTransform(fixture.sourceToCore), corePoint);
    maxAbsoluteError = vectorMaxAbsoluteError(
      recoveredSourcePoint.value,
      fixture.sourcePoint.value,
    );
    checks.push({
      id: "round-trip-value",
      passed: maxAbsoluteError <= tolerance,
      message: `Round-trip maximum absolute error is ${String(maxAbsoluteError)}.`,
      measurements: { maximumAbsoluteError: maxAbsoluteError, tolerance },
    });
    checks.push({
      id: "round-trip-frame",
      passed: exactFrameMatch(recoveredSourcePoint, fixture.sourcePoint),
      message: `Expected frame ${fixture.sourcePoint.frame}; received ${recoveredSourcePoint.frame}.`,
    });
  } catch (error) {
    checks.push({
      id: "round-trip-execution",
      passed: false,
      message: `Transform execution failed: ${errorMessage(error)}`,
    });
  }

  return {
    passed: checks.length > 0 && checks.every((check) => check.passed),
    tolerance,
    maxAbsoluteError,
    sourcePoint: fixture.sourcePoint,
    ...(corePoint === undefined ? {} : { corePoint }),
    ...(recoveredSourcePoint === undefined ? {} : { recoveredSourcePoint }),
    checks,
  };
}

/** Verifies the fixed LK coordinate convention and the shifted-origin contract. */
export function createCoordinateContractReport(
  tolerance = FOUNDATION_ABSOLUTE_TOLERANCE,
): CoordinateContractReport {
  const roundTrip = createTransformRoundTripReport(SHIFTED_ORIGIN_FIXTURE, tolerance);
  const checks: ContractCheck[] = [
    {
      id: "right-handed",
      passed: LK_CORE_COORDINATE_SYSTEM.handedness === "right",
      message: `Core handedness is ${LK_CORE_COORDINATE_SYSTEM.handedness}.`,
    },
    {
      id: "z-up",
      passed: LK_CORE_COORDINATE_SYSTEM.upAxis === "+Z",
      message: `Core up axis is ${LK_CORE_COORDINATE_SYSTEM.upAxis}.`,
    },
    {
      id: "x-forward",
      passed: LK_CORE_COORDINATE_SYSTEM.forwardAxis === "+X",
      message: `Core forward axis is ${LK_CORE_COORDINATE_SYSTEM.forwardAxis}.`,
    },
    {
      id: "meters",
      passed: LK_CORE_COORDINATE_SYSTEM.metersPerUnit === 1,
      message: `Core meters per unit is ${String(LK_CORE_COORDINATE_SYSTEM.metersPerUnit)}.`,
    },
    ...roundTrip.checks,
  ];

  try {
    const composedIdentity = composeTransforms(
      SHIFTED_ORIGIN_FIXTURE.sourceToCore,
      invertTransform(SHIFTED_ORIGIN_FIXTURE.sourceToCore),
    );
    const recovered = transformPoint(composedIdentity, SHIFTED_ORIGIN_FIXTURE.sourcePoint);
    const composedError = vectorMaxAbsoluteError(
      recovered.value,
      SHIFTED_ORIGIN_FIXTURE.sourcePoint.value,
    );
    checks.push({
      id: "composed-inverse",
      passed:
        recovered.frame === SHIFTED_ORIGIN_FIXTURE.sourcePoint.frame && composedError <= tolerance,
      message: `Composed transform and inverse maximum absolute error is ${String(composedError)}.`,
      measurements: { maximumAbsoluteError: composedError, tolerance },
    });
  } catch (error) {
    checks.push({
      id: "composed-inverse",
      passed: false,
      message: `Composed inverse failed: ${errorMessage(error)}`,
    });
  }

  return {
    passed: checks.every((check) => check.passed),
    tolerance,
    maxAbsoluteError: roundTrip.maxAbsoluteError,
    coordinateSystem: LK_CORE_COORDINATE_SYSTEM,
    fixtureIds: [SHIFTED_ORIGIN_FIXTURE.id, "coordinate-axes"],
    checks,
  };
}

function matrixMaxAbsoluteError(actual: Mat4, expected: Mat4): number {
  let maximum = 0;
  for (let index = 0; index < actual.length; index += 1) {
    const difference = Math.abs(
      requiredArrayItem(actual, index, "actual matrix") -
        requiredArrayItem(expected, index, "expected matrix"),
    );
    if (!Number.isFinite(difference)) {
      return Number.POSITIVE_INFINITY;
    }
    maximum = Math.max(maximum, difference);
  }
  return maximum;
}

function violation(
  fixture: string,
  code: string,
  message: string,
  actual?: unknown,
  expected?: unknown,
): ContractViolation {
  return {
    fixture,
    code,
    message,
    ...(actual === undefined ? {} : { actual }),
    ...(expected === undefined ? {} : { expected }),
  };
}

/** Canonical P0 transform round-trip check returning only serializable violations. */
export function checkTransformRoundTrip(
  transform: RigidTransform3,
  tolerance = FOUNDATION_ABSOLUTE_TOLERANCE,
): readonly ContractViolation[] {
  const violations: ContractViolation[] = [];
  const fixture = `${transform.sourceFrame}->${transform.targetFrame}`;
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    return [
      violation(
        fixture,
        "transform.invalid_tolerance",
        "Tolerance must be a finite, non-negative number.",
        tolerance,
      ),
    ];
  }
  try {
    const inverse = invertTransform(transform);
    const sourceIdentity = composeTransforms(transform, inverse);
    const targetIdentity = composeTransforms(inverse, transform);
    const expectedSourceIdentity: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const sourceError = matrixMaxAbsoluteError(
      transformToMatrix4(sourceIdentity),
      expectedSourceIdentity,
    );
    const targetError = matrixMaxAbsoluteError(
      transformToMatrix4(targetIdentity),
      expectedSourceIdentity,
    );
    if (sourceError > tolerance || targetError > tolerance) {
      violations.push(
        violation(
          fixture,
          "transform.round_trip",
          `Transform round-trip exceeded tolerance ${String(tolerance)}.`,
          { sourceError, targetError },
          { maximumAbsoluteError: tolerance },
        ),
      );
    }
    if (
      sourceIdentity.sourceFrame !== transform.sourceFrame ||
      sourceIdentity.targetFrame !== transform.sourceFrame ||
      targetIdentity.sourceFrame !== transform.targetFrame ||
      targetIdentity.targetFrame !== transform.targetFrame
    ) {
      violations.push(
        violation(
          fixture,
          "transform.frame_round_trip",
          "Transform and inverse did not preserve the source and target frame identities.",
        ),
      );
    }
  } catch (error) {
    violations.push(
      violation(
        fixture,
        "transform.execution",
        `Transform round-trip failed: ${errorMessage(error)}`,
      ),
    );
  }
  return violations;
}

function contextForFixture(fixture: CoordinateFixture) {
  const shiftedOriginInCore =
    fixture.name === "shifted-origin" ? SHIFTED_ORIGIN_IN_CORE : undefined;
  return {
    coreFrame: fixture.transform.sourceFrame,
    rendererFrame: fixture.transform.targetFrame,
    coreToRenderer: fixture.transform,
    ...(shiftedOriginInCore === undefined ? {} : { shiftedOriginInCore }),
  };
}

/**
 * Canonical P0 adapter check. It exercises point and transform conversion in
 * both directions and verifies the frame carried by reverse conversions.
 */
export function checkCoordinateContract(
  adapter: CoordinateAdapterContract,
  fixtures: readonly CoordinateFixture[] = Object.values(coordinateFixtures),
): readonly ContractViolation[] {
  const violations: ContractViolation[] = [];
  for (const fixture of fixtures) {
    const context = contextForFixture(fixture);
    for (const [pointIndex, point] of fixture.points.entries()) {
      const fixtureName = `${fixture.name}.point[${String(pointIndex)}]`;
      if (point.input.frame !== context.coreFrame) {
        violations.push(
          violation(
            fixtureName,
            "coordinate.input_frame",
            "Fixture input point is not in the context core frame.",
            point.input.frame,
            context.coreFrame,
          ),
        );
      }
      if (point.expected.frame !== context.rendererFrame) {
        violations.push(
          violation(
            fixtureName,
            "coordinate.expected_frame",
            "Fixture expected point is not in the context renderer frame.",
            point.expected.frame,
            context.rendererFrame,
          ),
        );
      }
      try {
        const rendererPoint = adapter.toRendererPoint(point.input, context);
        const rendererError = vectorMaxAbsoluteError(rendererPoint, point.expected.value);
        if (rendererError > FOUNDATION_ABSOLUTE_TOLERANCE) {
          violations.push(
            violation(
              fixtureName,
              "coordinate.to_renderer_point",
              "Renderer point does not match the fixture expectation.",
              rendererPoint,
              point.expected.value,
            ),
          );
        }
        const recovered = adapter.fromRendererPoint(rendererPoint, context);
        const recoveredError = vectorMaxAbsoluteError(recovered.value, point.input.value);
        if (
          recovered.frame !== context.coreFrame ||
          recoveredError > FOUNDATION_ABSOLUTE_TOLERANCE
        ) {
          violations.push(
            violation(
              fixtureName,
              "coordinate.from_renderer_point",
              "Reverse point conversion did not recover the core-framed input.",
              recovered,
              point.input,
            ),
          );
        }
      } catch (error) {
        violations.push(
          violation(
            fixtureName,
            "coordinate.point_execution",
            `Point conversion failed: ${errorMessage(error)}`,
          ),
        );
      }
    }

    try {
      const rendererTransform = adapter.toRendererTransform(fixture.transform, context);
      if (
        rendererTransform.sourceFrame !== fixture.transform.sourceFrame ||
        rendererTransform.targetFrame !== fixture.transform.targetFrame
      ) {
        violations.push(
          violation(
            fixture.name,
            "coordinate.renderer_transform_frames",
            "Renderer transform did not preserve source and target frame identity.",
            {
              sourceFrame: rendererTransform.sourceFrame,
              targetFrame: rendererTransform.targetFrame,
            },
            {
              sourceFrame: fixture.transform.sourceFrame,
              targetFrame: fixture.transform.targetFrame,
            },
          ),
        );
      }
      const recovered = adapter.fromRendererTransform(rendererTransform, context);
      const matrixError = matrixMaxAbsoluteError(
        transformToMatrix4(recovered),
        transformToMatrix4(fixture.transform),
      );
      if (
        recovered.sourceFrame !== fixture.transform.sourceFrame ||
        recovered.targetFrame !== fixture.transform.targetFrame ||
        matrixError > FOUNDATION_ABSOLUTE_TOLERANCE
      ) {
        violations.push(
          violation(
            fixture.name,
            "coordinate.transform_round_trip",
            "Renderer transform reverse conversion did not recover the framed transform.",
            recovered,
            fixture.transform,
          ),
        );
      }
    } catch (error) {
      violations.push(
        violation(
          fixture.name,
          "coordinate.transform_execution",
          `Transform conversion failed: ${errorMessage(error)}`,
        ),
      );
    }
  }
  return violations;
}

function compareOptionalIdentity(
  fixture: string,
  field: string,
  actual: unknown,
  expected: unknown,
  violations: ContractViolation[],
): void {
  if (actual !== expected) {
    violations.push(
      violation(fixture, `picking.${field}`, `Pick hit ${field} does not match.`, actual, expected),
    );
  }
}

/** Compares renderer-neutral picking results, including framed points and normals. */
export function checkPickingContract(
  actual: readonly PickHit[],
  expected: readonly PickHit[],
  tolerance = FOUNDATION_ABSOLUTE_TOLERANCE,
): readonly ContractViolation[] {
  const violations: ContractViolation[] = [];
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    return [
      violation(
        "picking",
        "picking.invalid_tolerance",
        "Tolerance must be a finite, non-negative number.",
        tolerance,
      ),
    ];
  }
  if (actual.length !== expected.length) {
    violations.push(
      violation(
        "picking",
        "picking.hit_count",
        "Pick hit count does not match.",
        actual.length,
        expected.length,
      ),
    );
  }
  const comparedLength = Math.min(actual.length, expected.length);
  for (let index = 0; index < comparedLength; index += 1) {
    const actualHit = requiredArrayItem(actual, index, "actual hits");
    const expectedHit = requiredArrayItem(expected, index, "expected hits");
    const fixture = `picking[${String(index)}]`;
    compareOptionalIdentity(
      fixture,
      "entity_id",
      actualHit.entityId,
      expectedHit.entityId,
      violations,
    );
    compareOptionalIdentity(
      fixture,
      "point_frame",
      actualHit.point.frame,
      expectedHit.point.frame,
      violations,
    );
    if (vectorMaxAbsoluteError(actualHit.point.value, expectedHit.point.value) > tolerance) {
      violations.push(
        violation(
          fixture,
          "picking.point",
          "Pick point exceeds the allowed absolute error.",
          actualHit.point.value,
          expectedHit.point.value,
        ),
      );
    }
    const distanceError = Math.abs(actualHit.distanceMeters - expectedHit.distanceMeters);
    if (!Number.isFinite(distanceError) || distanceError > tolerance) {
      violations.push(
        violation(
          fixture,
          "picking.distance",
          "Pick distance exceeds the allowed absolute error.",
          actualHit.distanceMeters,
          expectedHit.distanceMeters,
        ),
      );
    }
    compareOptionalIdentity(
      fixture,
      "layer_id",
      actualHit.layerId,
      expectedHit.layerId,
      violations,
    );
    compareOptionalIdentity(
      fixture,
      "instance_id",
      actualHit.instanceId,
      expectedHit.instanceId,
      violations,
    );
    if (actualHit.normal === undefined || expectedHit.normal === undefined) {
      if (actualHit.normal !== expectedHit.normal) {
        violations.push(
          violation(fixture, "picking.normal_presence", "Pick normal presence does not match."),
        );
      }
    } else {
      compareOptionalIdentity(
        fixture,
        "normal_frame",
        actualHit.normal.frame,
        expectedHit.normal.frame,
        violations,
      );
      if (vectorMaxAbsoluteError(actualHit.normal.value, expectedHit.normal.value) > tolerance) {
        violations.push(
          violation(
            fixture,
            "picking.normal",
            "Pick normal exceeds the allowed absolute error.",
            actualHit.normal.value,
            expectedHit.normal.value,
          ),
        );
      }
    }
  }
  return violations;
}

export class ContractViolationError extends Error {
  override readonly name = "ContractViolationError";

  constructor(readonly violations: readonly ContractViolation[]) {
    super(
      `${String(violations.length)} LK Design System 3D contract violation${violations.length === 1 ? "" : "s"}: ${violations
        .map((item) => `${item.fixture}/${item.code}`)
        .join(", ")}`,
    );
  }
}

export function assertNoContractViolations(violations: readonly ContractViolation[]): void {
  if (violations.length > 0) {
    throw new ContractViolationError(violations);
  }
}

/** Applies only the post-raycast frame projection owned by Foundation Alpha.1. */
export function projectAuthoritativeFloorHit(
  input: FloorHitProjectionInput,
): FloorHitProjectionResult {
  const coreHit = transformPoint(input.renderToCore, input.legacyHit);
  const productMapHit = transformPoint(input.coreToProductMap, coreHit);
  return { coreHit, productMapHit };
}

/**
 * Checks an authoritative legacy floor hit through render -> core -> product-map.
 * It does not perform or simulate geometry raycasting.
 */
export function checkAuthoritativeFloorHitProjection(
  fixture: AuthoritativeFloorHitFixture = AUTHORITATIVE_FLOOR_HIT_FIXTURE,
  tolerance = FOUNDATION_ABSOLUTE_TOLERANCE,
): FloorHitProjectionReport {
  const checks: ContractCheck[] = [];
  let projection: FloorHitProjectionResult | undefined;
  let maxAbsoluteError = Number.POSITIVE_INFINITY;

  try {
    projection = projectAuthoritativeFloorHit(fixture);
    const coreError = vectorMaxAbsoluteError(
      projection.coreHit.value,
      fixture.expectedCoreHit.value,
    );
    const productError = vectorMaxAbsoluteError(
      projection.productMapHit.value,
      fixture.expectedProductMapHit.value,
    );
    maxAbsoluteError = Math.max(coreError, productError);

    checks.push(
      {
        id: "render-to-core",
        passed:
          projection.coreHit.frame === fixture.expectedCoreHit.frame && coreError <= tolerance,
        message: `Render to core maximum absolute error is ${String(coreError)}.`,
        measurements: { maximumAbsoluteError: coreError, tolerance },
      },
      {
        id: "core-to-product-map",
        passed:
          projection.productMapHit.frame === fixture.expectedProductMapHit.frame &&
          productError <= tolerance,
        message: `Core to product-map maximum absolute error is ${String(productError)}.`,
        measurements: { maximumAbsoluteError: productError, tolerance },
      },
    );
  } catch (error) {
    checks.push({
      id: "floor-hit-projection",
      passed: false,
      message: `Floor-hit projection failed: ${errorMessage(error)}`,
    });
  }

  return {
    passed: checks.length > 0 && checks.every((check) => check.passed),
    tolerance,
    maxAbsoluteError,
    fixtureId: fixture.id,
    ...(projection === undefined ? {} : { projection }),
    checks,
  };
}

function containsIssueCode(issues: readonly AssetValidationIssue[], code: string): boolean {
  return issues.some((issue) => issue.code === code);
}

function containsIssuePath(issues: readonly AssetValidationIssue[], path: string): boolean {
  return issues.some((issue) => issue.path === path);
}

/** Runs the public asset validator and compares it with an explicit expectation. */
export function checkAssetManifestContract(
  input: unknown,
  expectation: AssetManifestContractExpectation,
): AssetManifestContractReport {
  const validation = createAssetReport(input);
  const expectedIssueCodes = expectation.expectedIssueCodes ?? [];
  const expectedIssuePaths = expectation.expectedIssuePaths ?? [];
  const missingIssueCodes = expectedIssueCodes.filter(
    (code) => !containsIssueCode(validation.issues, code),
  );
  const missingIssuePaths = expectedIssuePaths.filter(
    (path) => !containsIssuePath(validation.issues, path),
  );
  const checks: ContractCheck[] = [
    {
      id: "expected-validity",
      passed: validation.valid === expectation.expectedValid,
      message: `Expected valid=${String(expectation.expectedValid)}; received valid=${String(validation.valid)}.`,
    },
    {
      id: "validation-report-shape",
      passed:
        (validation.valid && validation.manifest !== undefined) ||
        (!validation.valid && validation.manifest === undefined),
      message: validation.valid
        ? "A valid report must expose its parsed manifest."
        : "An invalid report must not expose a parsed manifest.",
    },
    {
      id: "expected-issue-codes",
      passed: missingIssueCodes.length === 0,
      message:
        missingIssueCodes.length === 0
          ? "All expected issue codes were reported."
          : `Missing issue codes: ${missingIssueCodes.join(", ")}.`,
    },
    {
      id: "expected-issue-paths",
      passed: missingIssuePaths.length === 0,
      message:
        missingIssuePaths.length === 0
          ? "All expected issue paths were reported."
          : `Missing issue paths: ${missingIssuePaths.join(", ")}.`,
    },
  ];

  return {
    passed: checks.every((check) => check.passed),
    expectedValid: expectation.expectedValid,
    validation,
    missingIssueCodes,
    missingIssuePaths,
    checks,
  };
}

/** Proves the declared GLB +Y-up/+Z-forward basis maps to LK +Z-up/+X-forward. */
export function checkYUpAssetNormalization(
  tolerance = FOUNDATION_ABSOLUTE_TOLERANCE,
): AssetNormalizationContractReport {
  const checks: ContractCheck[] = [];
  let normalizedUp: FramedPoint3 | undefined;
  let normalizedForward: FramedPoint3 | undefined;
  try {
    normalizedUp = normalizeAssetPointToCore(Y_UP_GLB_MANIFEST_FIXTURE, [0, 1, 0]);
    normalizedForward = normalizeAssetPointToCore(Y_UP_GLB_MANIFEST_FIXTURE, [0, 0, 1]);
    const upError = vectorMaxAbsoluteError(normalizedUp.value, [0, 0, 1]);
    const forwardError = vectorMaxAbsoluteError(normalizedForward.value, [1, 0, 0]);
    checks.push(
      {
        id: "y-up-to-z-up",
        passed: normalizedUp.frame === Y_UP_GLB_MANIFEST_FIXTURE.coreFrame && upError <= tolerance,
        message: `File +Y to core +Z maximum absolute error is ${String(upError)}.`,
        measurements: { maximumAbsoluteError: upError, tolerance },
      },
      {
        id: "file-forward-to-core-forward",
        passed:
          normalizedForward.frame === Y_UP_GLB_MANIFEST_FIXTURE.coreFrame &&
          forwardError <= tolerance,
        message: `File +Z to core +X maximum absolute error is ${String(forwardError)}.`,
        measurements: { maximumAbsoluteError: forwardError, tolerance },
      },
    );
  } catch (error) {
    checks.push({
      id: "y-up-normalization",
      passed: false,
      message: `Y-up normalization failed: ${errorMessage(error)}`,
    });
  }
  return {
    passed: checks.length > 0 && checks.every((check) => check.passed),
    fixtureId: "y-up-glb-manifest",
    ...(normalizedUp === undefined ? {} : { normalizedUp }),
    ...(normalizedForward === undefined ? {} : { normalizedForward }),
    checks,
  };
}

/** Validates the canonical Y-up manifest and every deliberate invalid case. */
export function checkAssetFixtureContracts(): AssetFixtureContractReport {
  const results: AssetFixtureContractResult[] = [
    {
      fixtureId: "y-up-glb-manifest",
      expectedValid: true,
      report: checkAssetManifestContract(Y_UP_GLB_MANIFEST_FIXTURE, {
        expectedValid: true,
      }),
    },
    {
      fixtureId: "legacy-z-up-glb-manifest",
      expectedValid: true,
      report: checkAssetManifestContract(LEGACY_Z_UP_GLB_MANIFEST_FIXTURE, {
        expectedValid: true,
      }),
    },
  ];

  for (const fixture of Object.values(INVALID_ASSET_MANIFEST_FIXTURES)) {
    results.push({
      fixtureId: fixture.id,
      expectedValid: false,
      report: checkAssetManifestContract(fixture.manifest, {
        expectedValid: false,
        expectedIssueCodes: [fixture.expectedIssueCode],
        expectedIssuePaths: [fixture.expectedIssuePath],
      }),
    });
  }

  const yUpNormalization = checkYUpAssetNormalization();
  return {
    passed: results.every((result) => result.report.passed) && yUpNormalization.passed,
    results,
    validFixtureCount: results.filter((result) => result.expectedValid).length,
    invalidFixtureCount: results.filter((result) => !result.expectedValid).length,
    yUpNormalization,
  };
}

/** Retrieves one invalid fixture result without coupling a consumer to a runner. */
export function getInvalidAssetFixtureContractResult(
  id: InvalidAssetManifestFixtureId,
): AssetFixtureContractResult {
  const fixture = INVALID_ASSET_MANIFEST_FIXTURES[id];
  return {
    fixtureId: fixture.id,
    expectedValid: false,
    report: checkAssetManifestContract(fixture.manifest, {
      expectedValid: false,
      expectedIssueCodes: [fixture.expectedIssueCode],
      expectedIssuePaths: [fixture.expectedIssuePath],
    }),
  };
}
