/**
 * JSON Schema 2020-12 representation of {@link AssetManifestV1}.
 *
 * Cross-field spatial invariants (axis orthogonality, frame equality,
 * quaternion normalization and bounds ordering) are intentionally enforced by
 * `validateAssetManifest`; JSON Schema cannot express all of them portably.
 */
export const assetManifestV1Schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.lk-robotics.com/design-system-3d/asset-manifest.v1.schema.json",
  title: "LK Design System 3D Asset Manifest V1",
  description:
    "A renderer-neutral contract that normalizes a right-handed glTF/GLB asset into LK's meter-based, right-handed, Z-up core coordinate system.",
  type: "object",
  additionalProperties: false,
  required: [
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
  ],
  properties: {
    schemaVersion: { const: 1 },
    assetId: { $ref: "#/$defs/nonEmptyIdentifier" },
    version: { type: "string", minLength: 1 },
    kind: {
      enum: ["robot", "map", "building", "floor", "site", "generic"],
    },
    format: { enum: ["glb", "gltf"] },
    fileFrame: { $ref: "#/$defs/nonEmptyIdentifier" },
    fileCoordinate: { $ref: "#/$defs/fileCoordinate" },
    coreFrame: { $ref: "#/$defs/nonEmptyIdentifier" },
    fileToCoreTransform: { $ref: "#/$defs/rigidTransform" },
    boundsInCoreMeters: { $ref: "#/$defs/bounds" },
    integrity: { $ref: "#/$defs/integrity" },
  },
  $defs: {
    nonEmptyIdentifier: {
      type: "string",
      minLength: 1,
      pattern: ".*\\S.*",
    },
    axis: { enum: ["+X", "-X", "+Y", "-Y", "+Z", "-Z"] },
    finiteNumber: { type: "number" },
    vec3: {
      type: "array",
      prefixItems: [
        { $ref: "#/$defs/finiteNumber" },
        { $ref: "#/$defs/finiteNumber" },
        { $ref: "#/$defs/finiteNumber" },
      ],
      minItems: 3,
      maxItems: 3,
    },
    quat: {
      type: "array",
      prefixItems: [
        { $ref: "#/$defs/finiteNumber" },
        { $ref: "#/$defs/finiteNumber" },
        { $ref: "#/$defs/finiteNumber" },
        { $ref: "#/$defs/finiteNumber" },
      ],
      minItems: 4,
      maxItems: 4,
    },
    fileCoordinate: {
      type: "object",
      additionalProperties: false,
      required: ["handedness", "upAxis", "forwardAxis", "metersPerUnit"],
      properties: {
        handedness: { const: "right" },
        upAxis: { $ref: "#/$defs/axis" },
        forwardAxis: { $ref: "#/$defs/axis" },
        metersPerUnit: { type: "number", exclusiveMinimum: 0 },
      },
    },
    rigidTransform: {
      type: "object",
      additionalProperties: false,
      required: ["sourceFrame", "targetFrame", "translation", "rotation"],
      properties: {
        sourceFrame: { $ref: "#/$defs/nonEmptyIdentifier" },
        targetFrame: { $ref: "#/$defs/nonEmptyIdentifier" },
        translation: { $ref: "#/$defs/vec3" },
        rotation: { $ref: "#/$defs/quat" },
      },
    },
    bounds: {
      type: "object",
      additionalProperties: false,
      required: ["frame", "min", "max"],
      properties: {
        frame: { $ref: "#/$defs/nonEmptyIdentifier" },
        min: { $ref: "#/$defs/vec3" },
        max: { $ref: "#/$defs/vec3" },
      },
    },
    integrity: {
      type: "object",
      additionalProperties: false,
      required: ["sha256"],
      properties: {
        sha256: { type: "string", pattern: "^[A-Fa-f0-9]{64}$" },
      },
    },
  },
} as const;

export type AssetManifestV1Schema = typeof assetManifestV1Schema;

/**
 * JSON Schema 2020-12 representation of {@link RobotKinematicsV1}.
 *
 * Cross-field kinematic invariants (unique identifiers, link references,
 * rooted-tree topology, quaternion and axis normalization, limit ordering) are
 * intentionally enforced by `validateRobotKinematics`; JSON Schema cannot
 * express all of them portably.
 */
export const robotKinematicsV1Schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.lk-robotics.com/design-system-3d/robot-kinematics.v1.schema.json",
  title: "LK Design System 3D Robot Kinematics V1",
  description:
    "A renderer-neutral joint-chain contract that maps an articulated robot asset's links to glTF nodes and declares each joint's motion in file-local units.",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "assetId", "version", "baseLink", "links", "joints"],
  properties: {
    schemaVersion: { const: 1 },
    assetId: { $ref: "#/$defs/nonEmptyIdentifier" },
    version: { type: "string", minLength: 1 },
    baseLink: { $ref: "#/$defs/nonEmptyIdentifier" },
    links: {
      type: "array",
      minItems: 1,
      items: { $ref: "#/$defs/link" },
    },
    joints: {
      type: "array",
      minItems: 1,
      items: { $ref: "#/$defs/joint" },
    },
  },
  $defs: {
    nonEmptyIdentifier: {
      type: "string",
      minLength: 1,
      pattern: ".*\\S.*",
    },
    finiteNumber: { type: "number" },
    vec3: {
      type: "array",
      prefixItems: [
        { $ref: "#/$defs/finiteNumber" },
        { $ref: "#/$defs/finiteNumber" },
        { $ref: "#/$defs/finiteNumber" },
      ],
      minItems: 3,
      maxItems: 3,
    },
    quat: {
      type: "array",
      prefixItems: [
        { $ref: "#/$defs/finiteNumber" },
        { $ref: "#/$defs/finiteNumber" },
        { $ref: "#/$defs/finiteNumber" },
        { $ref: "#/$defs/finiteNumber" },
      ],
      minItems: 4,
      maxItems: 4,
    },
    link: {
      type: "object",
      additionalProperties: false,
      required: ["linkId", "nodeName"],
      properties: {
        linkId: { $ref: "#/$defs/nonEmptyIdentifier" },
        nodeName: { $ref: "#/$defs/nonEmptyIdentifier" },
      },
    },
    joint: {
      type: "object",
      additionalProperties: false,
      required: ["jointId", "type", "parentLink", "childLink", "origin", "axis", "limits"],
      properties: {
        jointId: { $ref: "#/$defs/nonEmptyIdentifier" },
        type: { enum: ["revolute", "prismatic"] },
        parentLink: { $ref: "#/$defs/nonEmptyIdentifier" },
        childLink: { $ref: "#/$defs/nonEmptyIdentifier" },
        origin: { $ref: "#/$defs/origin" },
        axis: { $ref: "#/$defs/vec3" },
        limits: { $ref: "#/$defs/limits" },
      },
    },
    origin: {
      type: "object",
      additionalProperties: false,
      required: ["translation", "rotation"],
      properties: {
        translation: { $ref: "#/$defs/vec3" },
        rotation: { $ref: "#/$defs/quat" },
      },
    },
    limits: {
      type: "object",
      additionalProperties: false,
      required: ["lower", "upper"],
      properties: {
        lower: { $ref: "#/$defs/finiteNumber" },
        upper: { $ref: "#/$defs/finiteNumber" },
      },
    },
  },
} as const;

export type RobotKinematicsV1Schema = typeof robotKinematicsV1Schema;
