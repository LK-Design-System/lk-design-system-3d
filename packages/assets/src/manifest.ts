import {
  assetId,
  frameId,
  type AssetId,
  type Axis,
  type Bounds3,
  type FrameId,
  type Quat,
  type RigidTransform3,
  type Vec3,
} from "@lk-robotics/lds-3d-core";

import { axesAreOrthogonal, rotationMatchesCoordinate } from "./spatial.js";

const AXES = new Set<Axis>(["+X", "-X", "+Y", "-Y", "+Z", "-Z"]);
const ASSET_KINDS = new Set<AssetManifestV1["kind"]>([
  "robot",
  "map",
  "building",
  "floor",
  "site",
  "generic",
]);
const FORMATS = new Set<AssetManifestV1["format"]>(["glb", "gltf"]);
const NORMALIZED_QUATERNION_TOLERANCE = 1e-6;
const SHA256_PATTERN = /^[a-fA-F0-9]{64}$/;

export interface FileCoordinate {
  readonly handedness: "right";
  readonly upAxis: Axis;
  readonly forwardAxis: Axis;
  readonly metersPerUnit: number;
}

export interface AssetManifestV1 {
  readonly schemaVersion: 1;
  readonly assetId: AssetId;
  readonly version: string;
  readonly kind: "robot" | "map" | "building" | "floor" | "site" | "generic";
  readonly format: "glb" | "gltf";
  readonly fileFrame: FrameId;
  readonly fileCoordinate: FileCoordinate;
  readonly coreFrame: FrameId;
  readonly fileToCoreTransform: RigidTransform3;
  readonly boundsInCoreMeters: Bounds3;
  readonly integrity?: {
    readonly sha256: string;
  };
}

export interface AssetValidationIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
  readonly severity: "error" | "warning";
}

export interface AssetValidationReport {
  readonly valid: boolean;
  readonly issues: readonly AssetValidationIssue[];
  readonly manifest?: AssetManifestV1;
}

export type AssetManifestParseResult =
  | {
      readonly ok: true;
      readonly value: AssetManifestV1;
    }
  | {
      readonly ok: false;
      readonly issues: readonly AssetValidationIssue[];
    };

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function issue(issues: AssetValidationIssue[], path: string, code: string, message: string): void {
  issues.push(Object.freeze({ path, code, message, severity: "error" }));
}

function rejectUnexpectedProperties(
  input: JsonObject,
  allowed: readonly string[],
  path: string,
  issues: AssetValidationIssue[],
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(input)) {
    if (!allowedSet.has(key)) {
      issue(
        issues,
        `${path}.${key}`,
        "schema.unexpected_property",
        `Unexpected property '${key}'.`,
      );
    }
  }
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && !/\p{Cc}/u.test(value);
}

function validateIdentifier(
  value: unknown,
  path: string,
  issues: AssetValidationIssue[],
): value is string {
  if (!isIdentifier(value)) {
    issue(
      issues,
      path,
      "identifier.invalid",
      "Expected a non-empty string without control characters.",
    );
    return false;
  }
  return true;
}

function readFiniteTuple3(
  value: unknown,
  path: string,
  issues: AssetValidationIssue[],
): Vec3 | undefined {
  if (!Array.isArray(value) || value.length !== 3) {
    issue(issues, path, "number.invalid_vec3", "Expected exactly 3 numbers.");
    return undefined;
  }
  if (!value.every((entry) => typeof entry === "number" && Number.isFinite(entry))) {
    issue(issues, path, "number.non_finite", "Vector components must be finite numbers.");
    return undefined;
  }
  return [value[0] as number, value[1] as number, value[2] as number];
}

function readFiniteQuaternion(
  value: unknown,
  path: string,
  issues: AssetValidationIssue[],
): Quat | undefined {
  if (!Array.isArray(value) || value.length !== 4) {
    issue(issues, path, "transform.invalid_quaternion", "Expected quaternion [x, y, z, w].");
    return undefined;
  }
  if (!value.every((entry) => typeof entry === "number" && Number.isFinite(entry))) {
    issue(issues, path, "number.non_finite", "Quaternion components must be finite numbers.");
    return undefined;
  }

  const quaternion: Quat = [
    value[0] as number,
    value[1] as number,
    value[2] as number,
    value[3] as number,
  ];
  const norm = Math.hypot(...quaternion);
  if (norm <= Number.EPSILON) {
    issue(
      issues,
      path,
      "transform.non_invertible",
      "A zero quaternion does not define an invertible rigid transform.",
    );
    return undefined;
  }
  if (Math.abs(norm - 1) > NORMALIZED_QUATERNION_TOLERANCE) {
    issue(
      issues,
      path,
      "transform.quaternion_not_normalized",
      `Quaternion norm must be 1 ± ${String(NORMALIZED_QUATERNION_TOLERANCE)}.`,
    );
    return undefined;
  }
  return quaternion;
}

function readAxis(value: unknown, path: string, issues: AssetValidationIssue[]): Axis | undefined {
  if (typeof value !== "string" || !AXES.has(value as Axis)) {
    issue(
      issues,
      path,
      "coordinate.invalid_axis",
      "Axis must be one of +X, -X, +Y, -Y, +Z, or -Z.",
    );
    return undefined;
  }
  return value as Axis;
}

function validateCoordinate(
  value: unknown,
  issues: AssetValidationIssue[],
): {
  upAxis: Axis | undefined;
  forwardAxis: Axis | undefined;
  metersPerUnit: number | undefined;
} {
  const path = "$.fileCoordinate";
  if (!isObject(value)) {
    issue(issues, path, "coordinate.invalid", "Expected a coordinate object.");
    return {
      upAxis: undefined,
      forwardAxis: undefined,
      metersPerUnit: undefined,
    };
  }
  rejectUnexpectedProperties(
    value,
    ["handedness", "upAxis", "forwardAxis", "metersPerUnit"],
    path,
    issues,
  );

  if (value.handedness !== "right") {
    issue(
      issues,
      `${path}.handedness`,
      "coordinate.left_handed_unsupported",
      "Foundation Alpha accepts right-handed assets only.",
    );
  }
  const upAxis = readAxis(value.upAxis, `${path}.upAxis`, issues);
  const forwardAxis = readAxis(value.forwardAxis, `${path}.forwardAxis`, issues);
  if (
    upAxis !== undefined &&
    forwardAxis !== undefined &&
    !axesAreOrthogonal(upAxis, forwardAxis)
  ) {
    issue(
      issues,
      path,
      "coordinate.invalid_axis_pair",
      "upAxis and forwardAxis cannot use the same or opposite base axis.",
    );
  }

  let metersPerUnit: number | undefined;
  if (
    typeof value.metersPerUnit !== "number" ||
    !Number.isFinite(value.metersPerUnit) ||
    value.metersPerUnit <= 0
  ) {
    issue(
      issues,
      `${path}.metersPerUnit`,
      "coordinate.invalid_unit",
      "metersPerUnit must be a finite positive number.",
    );
  } else {
    metersPerUnit = value.metersPerUnit;
  }
  return { upAxis, forwardAxis, metersPerUnit };
}

function validateTransform(
  value: unknown,
  fileFrame: unknown,
  coreFrame: unknown,
  coordinate: ReturnType<typeof validateCoordinate>,
  issues: AssetValidationIssue[],
): void {
  const path = "$.fileToCoreTransform";
  if (!isObject(value)) {
    issue(issues, path, "transform.invalid", "Expected a rigid transform object.");
    return;
  }
  rejectUnexpectedProperties(
    value,
    ["sourceFrame", "targetFrame", "translation", "rotation"],
    path,
    issues,
  );

  const sourceValid = validateIdentifier(value.sourceFrame, `${path}.sourceFrame`, issues);
  const targetValid = validateIdentifier(value.targetFrame, `${path}.targetFrame`, issues);
  if (sourceValid && isIdentifier(fileFrame) && value.sourceFrame !== fileFrame) {
    issue(
      issues,
      `${path}.sourceFrame`,
      "transform.source_frame_mismatch",
      "Transform sourceFrame must equal manifest fileFrame.",
    );
  }
  if (targetValid && isIdentifier(coreFrame) && value.targetFrame !== coreFrame) {
    issue(
      issues,
      `${path}.targetFrame`,
      "transform.target_frame_mismatch",
      "Transform targetFrame must equal manifest coreFrame.",
    );
  }

  readFiniteTuple3(value.translation, `${path}.translation`, issues);
  const rotation = readFiniteQuaternion(value.rotation, `${path}.rotation`, issues);
  if (
    rotation !== undefined &&
    coordinate.upAxis !== undefined &&
    coordinate.forwardAxis !== undefined &&
    axesAreOrthogonal(coordinate.upAxis, coordinate.forwardAxis) &&
    !rotationMatchesCoordinate(rotation, {
      upAxis: coordinate.upAxis,
      forwardAxis: coordinate.forwardAxis,
    })
  ) {
    issue(
      issues,
      `${path}.rotation`,
      "transform.axis_mapping_mismatch",
      "Rotation must map declared upAxis to core +Z and forwardAxis to core +X.",
    );
  }
}

function validateBounds(value: unknown, coreFrame: unknown, issues: AssetValidationIssue[]): void {
  const path = "$.boundsInCoreMeters";
  if (!isObject(value)) {
    issue(issues, path, "bounds.invalid", "Expected a framed bounds object.");
    return;
  }
  rejectUnexpectedProperties(value, ["frame", "min", "max"], path, issues);

  const frameValid = validateIdentifier(value.frame, `${path}.frame`, issues);
  if (frameValid && isIdentifier(coreFrame) && value.frame !== coreFrame) {
    issue(
      issues,
      `${path}.frame`,
      "bounds.frame_mismatch",
      "Bounds frame must equal manifest coreFrame.",
    );
  }
  const min = readFiniteTuple3(value.min, `${path}.min`, issues);
  const max = readFiniteTuple3(value.max, `${path}.max`, issues);
  if (
    min !== undefined &&
    max !== undefined &&
    (min[0] > max[0] || min[1] > max[1] || min[2] > max[2])
  ) {
    issue(
      issues,
      path,
      "bounds.invalid_order",
      "Every bounds minimum must be less than or equal to its maximum.",
    );
  }
}

function validateIntegrity(value: unknown, issues: AssetValidationIssue[]): void {
  const path = "$.integrity";
  if (!isObject(value)) {
    issue(issues, path, "integrity.invalid", "Expected an integrity object.");
    return;
  }
  rejectUnexpectedProperties(value, ["sha256"], path, issues);
  if (typeof value.sha256 !== "string" || !SHA256_PATTERN.test(value.sha256)) {
    issue(
      issues,
      `${path}.sha256`,
      "integrity.invalid_sha256",
      "sha256 must contain exactly 64 hexadecimal characters.",
    );
  }
}

export function validateAssetManifest(input: unknown): readonly AssetValidationIssue[] {
  const issues: AssetValidationIssue[] = [];
  if (!isObject(input)) {
    issue(issues, "$", "schema.invalid_root", "Expected a manifest object.");
    return Object.freeze(issues);
  }

  rejectUnexpectedProperties(
    input,
    [
      "schemaVersion",
      "assetId",
      "version",
      "kind",
      "format",
      "fileFrame",
      "fileCoordinate",
      "coreFrame",
      "fileToCoreTransform",
      "boundsInCoreMeters",
      "integrity",
    ],
    "$",
    issues,
  );

  if (input.schemaVersion !== 1) {
    issue(issues, "$.schemaVersion", "schema.unsupported_version", "schemaVersion must be 1.");
  }
  validateIdentifier(input.assetId, "$.assetId", issues);
  if (typeof input.version !== "string" || input.version.trim().length === 0) {
    issue(issues, "$.version", "schema.invalid_version", "version is required.");
  }
  if (typeof input.kind !== "string" || !ASSET_KINDS.has(input.kind as AssetManifestV1["kind"])) {
    issue(issues, "$.kind", "schema.invalid_kind", "Unsupported asset kind.");
  }
  if (typeof input.format !== "string" || !FORMATS.has(input.format as AssetManifestV1["format"])) {
    issue(issues, "$.format", "schema.invalid_format", "format must be glb or gltf.");
  }
  validateIdentifier(input.fileFrame, "$.fileFrame", issues);
  validateIdentifier(input.coreFrame, "$.coreFrame", issues);

  const coordinate = validateCoordinate(input.fileCoordinate, issues);
  validateTransform(
    input.fileToCoreTransform,
    input.fileFrame,
    input.coreFrame,
    coordinate,
    issues,
  );
  validateBounds(input.boundsInCoreMeters, input.coreFrame, issues);
  if (input.integrity !== undefined) {
    validateIntegrity(input.integrity, issues);
  }

  return Object.freeze(issues);
}

function freezeVec3(value: unknown): Vec3 {
  const tuple = value as [number, number, number];
  return Object.freeze([tuple[0], tuple[1], tuple[2]]) as Vec3;
}

function freezeQuat(value: unknown): Quat {
  const tuple = value as [number, number, number, number];
  return Object.freeze([tuple[0], tuple[1], tuple[2], tuple[3]]) as Quat;
}

function buildManifest(input: JsonObject): AssetManifestV1 {
  const coordinate = input.fileCoordinate as JsonObject;
  const transform = input.fileToCoreTransform as JsonObject;
  const bounds = input.boundsInCoreMeters as JsonObject;
  const fileFrameValue = frameId(input.fileFrame as string);
  const coreFrameValue = frameId(input.coreFrame as string);

  const result: AssetManifestV1 = {
    schemaVersion: 1,
    assetId: assetId(input.assetId as string),
    version: input.version as string,
    kind: input.kind as AssetManifestV1["kind"],
    format: input.format as AssetManifestV1["format"],
    fileFrame: fileFrameValue,
    fileCoordinate: Object.freeze({
      handedness: "right",
      upAxis: coordinate.upAxis as Axis,
      forwardAxis: coordinate.forwardAxis as Axis,
      metersPerUnit: coordinate.metersPerUnit as number,
    }),
    coreFrame: coreFrameValue,
    fileToCoreTransform: Object.freeze({
      sourceFrame: frameId(transform.sourceFrame as string),
      targetFrame: frameId(transform.targetFrame as string),
      translation: freezeVec3(transform.translation),
      rotation: freezeQuat(transform.rotation),
    }),
    boundsInCoreMeters: Object.freeze({
      frame: frameId(bounds.frame as string),
      min: freezeVec3(bounds.min),
      max: freezeVec3(bounds.max),
    }),
    ...(input.integrity === undefined
      ? {}
      : {
          integrity: Object.freeze({
            sha256: ((input.integrity as JsonObject).sha256 as string).toLowerCase(),
          }),
        }),
  };
  return Object.freeze(result);
}

export function parseAssetManifest(input: unknown): AssetManifestParseResult {
  const issues = validateAssetManifest(input);
  if (issues.some((entry) => entry.severity === "error")) {
    return Object.freeze({ ok: false, issues });
  }

  try {
    return Object.freeze({ ok: true, value: buildManifest(input as JsonObject) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown parse error.";
    return Object.freeze({
      ok: false,
      issues: Object.freeze([
        Object.freeze({
          path: "$",
          code: "schema.construction_failed",
          message,
          severity: "error" as const,
        }),
      ]),
    });
  }
}

export function createAssetReport(input: unknown): AssetValidationReport {
  const parsed = parseAssetManifest(input);
  if (!parsed.ok) {
    return Object.freeze({ valid: false, issues: parsed.issues });
  }
  return Object.freeze({
    valid: true,
    issues: Object.freeze([]),
    manifest: parsed.value,
  });
}
