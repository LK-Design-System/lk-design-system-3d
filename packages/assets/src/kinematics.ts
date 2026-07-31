import {
  assetId,
  frameId,
  rigidTransform3,
  type AssetId,
  type FrameId,
  type Quat,
  type RigidTransform3,
  type Vec3,
} from "@lk-robotics/lds-3d-core";

import type { AssetValidationIssue } from "./manifest.js";
import { rotateVectorByQuaternion } from "./spatial.js";

const JOINT_TYPES = new Set<KinematicsJointType>(["revolute", "prismatic"]);
const NORMALIZED_QUATERNION_TOLERANCE = 1e-6;
const UNIT_AXIS_TOLERANCE = 1e-6;

export type KinematicsJointType = "revolute" | "prismatic";

export interface KinematicsLink {
  readonly linkId: FrameId;
  /** glTF node name that owns this link's subtree inside the asset file. */
  readonly nodeName: string;
}

export interface KinematicsJointLimits {
  /** Radians for revolute joints, file units for prismatic joints. */
  readonly lower: number;
  readonly upper: number;
}

export interface KinematicsJointOrigin {
  /** Rest pose of the child link node, in parent-link-local file units. */
  readonly translation: Vec3;
  readonly rotation: Quat;
}

export interface KinematicsJoint {
  readonly jointId: string;
  readonly type: KinematicsJointType;
  readonly parentLink: FrameId;
  readonly childLink: FrameId;
  readonly origin: KinematicsJointOrigin;
  /** Unit motion axis in child-link-local coordinates. */
  readonly axis: Vec3;
  readonly limits: KinematicsJointLimits;
}

/**
 * A renderer-neutral joint-chain contract for an articulated robot asset.
 *
 * All origins and prismatic values are expressed in the asset file's node-local
 * space and file units, exactly matching the glTF rest hierarchy, so joint
 * poses can drive glTF node transforms directly. Normalizing the whole model
 * into LK core meters remains the job of the paired `AssetManifestV1`
 * placement, as with any rigid asset.
 */
export interface RobotKinematicsV1 {
  readonly schemaVersion: 1;
  readonly assetId: AssetId;
  readonly version: string;
  readonly baseLink: FrameId;
  readonly links: readonly KinematicsLink[];
  readonly joints: readonly KinematicsJoint[];
}

export type RobotKinematicsParseResult =
  | {
      readonly ok: true;
      readonly value: RobotKinematicsV1;
    }
  | {
      readonly ok: false;
      readonly issues: readonly AssetValidationIssue[];
    };

export class KinematicsValidationError extends RangeError {
  override readonly name = "KinematicsValidationError";
}

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

function readUnitQuaternion(
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
  if (Math.abs(Math.hypot(...quaternion) - 1) > NORMALIZED_QUATERNION_TOLERANCE) {
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

function validateLinks(value: unknown, issues: AssetValidationIssue[]): void {
  const path = "$.links";
  if (!Array.isArray(value) || value.length === 0) {
    issue(issues, path, "kinematics.invalid_links", "Expected a non-empty array of links.");
    return;
  }
  const linkIds = new Set<string>();
  const nodeNames = new Set<string>();
  value.forEach((entry, index) => {
    const entryPath = `${path}[${String(index)}]`;
    if (!isObject(entry)) {
      issue(issues, entryPath, "kinematics.invalid_link", "Expected a link object.");
      return;
    }
    rejectUnexpectedProperties(entry, ["linkId", "nodeName"], entryPath, issues);
    if (validateIdentifier(entry.linkId, `${entryPath}.linkId`, issues)) {
      if (linkIds.has(entry.linkId)) {
        issue(
          issues,
          `${entryPath}.linkId`,
          "kinematics.duplicate_link",
          `Duplicate linkId ${JSON.stringify(entry.linkId)}.`,
        );
      }
      linkIds.add(entry.linkId);
    }
    if (validateIdentifier(entry.nodeName, `${entryPath}.nodeName`, issues)) {
      if (nodeNames.has(entry.nodeName)) {
        issue(
          issues,
          `${entryPath}.nodeName`,
          "kinematics.duplicate_node_name",
          `Duplicate nodeName ${JSON.stringify(entry.nodeName)}.`,
        );
      }
      nodeNames.add(entry.nodeName);
    }
  });
}

function validateJoint(
  entry: unknown,
  entryPath: string,
  jointIds: Set<string>,
  linkIds: ReadonlySet<string>,
  issues: AssetValidationIssue[],
): void {
  if (!isObject(entry)) {
    issue(issues, entryPath, "kinematics.invalid_joint", "Expected a joint object.");
    return;
  }
  rejectUnexpectedProperties(
    entry,
    ["jointId", "type", "parentLink", "childLink", "origin", "axis", "limits"],
    entryPath,
    issues,
  );

  if (validateIdentifier(entry.jointId, `${entryPath}.jointId`, issues)) {
    if (jointIds.has(entry.jointId)) {
      issue(
        issues,
        `${entryPath}.jointId`,
        "kinematics.duplicate_joint",
        `Duplicate jointId ${JSON.stringify(entry.jointId)}.`,
      );
    }
    jointIds.add(entry.jointId);
  }
  if (typeof entry.type !== "string" || !JOINT_TYPES.has(entry.type as KinematicsJointType)) {
    issue(
      issues,
      `${entryPath}.type`,
      "kinematics.invalid_joint_type",
      "Joint type must be revolute or prismatic.",
    );
  }
  for (const key of ["parentLink", "childLink"] as const) {
    if (validateIdentifier(entry[key], `${entryPath}.${key}`, issues) && !linkIds.has(entry[key])) {
      issue(
        issues,
        `${entryPath}.${key}`,
        "kinematics.unknown_link",
        `Joint references undeclared link ${JSON.stringify(entry[key])}.`,
      );
    }
  }
  if (
    isIdentifier(entry.parentLink) &&
    isIdentifier(entry.childLink) &&
    entry.parentLink === entry.childLink
  ) {
    issue(
      issues,
      entryPath,
      "kinematics.self_parented_joint",
      "A joint cannot parent a link to itself.",
    );
  }

  if (!isObject(entry.origin)) {
    issue(issues, `${entryPath}.origin`, "kinematics.invalid_origin", "Expected an origin object.");
  } else {
    rejectUnexpectedProperties(
      entry.origin,
      ["translation", "rotation"],
      `${entryPath}.origin`,
      issues,
    );
    readFiniteTuple3(entry.origin.translation, `${entryPath}.origin.translation`, issues);
    readUnitQuaternion(entry.origin.rotation, `${entryPath}.origin.rotation`, issues);
  }

  const axis = readFiniteTuple3(entry.axis, `${entryPath}.axis`, issues);
  if (axis !== undefined && Math.abs(Math.hypot(...axis) - 1) > UNIT_AXIS_TOLERANCE) {
    issue(
      issues,
      `${entryPath}.axis`,
      "kinematics.axis_not_normalized",
      `Axis norm must be 1 ± ${String(UNIT_AXIS_TOLERANCE)}.`,
    );
  }

  if (!isObject(entry.limits)) {
    issue(issues, `${entryPath}.limits`, "kinematics.invalid_limits", "Expected a limits object.");
  } else {
    rejectUnexpectedProperties(entry.limits, ["lower", "upper"], `${entryPath}.limits`, issues);
    const { lower, upper } = entry.limits;
    const finite = (candidate: unknown): candidate is number =>
      typeof candidate === "number" && Number.isFinite(candidate);
    if (!finite(lower) || !finite(upper)) {
      issue(
        issues,
        `${entryPath}.limits`,
        "kinematics.non_finite_limits",
        "Joint limits must be finite numbers.",
      );
    } else if (lower > upper) {
      issue(
        issues,
        `${entryPath}.limits`,
        "kinematics.invalid_limit_order",
        "limits.lower must be less than or equal to limits.upper.",
      );
    }
  }
}

function validateTopology(
  baseLink: unknown,
  links: unknown,
  joints: unknown,
  issues: AssetValidationIssue[],
): void {
  if (!isIdentifier(baseLink) || !Array.isArray(links) || !Array.isArray(joints)) return;
  const linkIds = new Set(
    links
      .filter(isObject)
      .map((entry) => entry.linkId)
      .filter(isIdentifier),
  );
  if (!linkIds.has(baseLink)) {
    issue(
      issues,
      "$.baseLink",
      "kinematics.unknown_base_link",
      `baseLink ${JSON.stringify(baseLink)} is not a declared link.`,
    );
    return;
  }

  const parentByChild = new Map<string, string>();
  for (const [index, entry] of joints.entries()) {
    if (!isObject(entry) || !isIdentifier(entry.parentLink) || !isIdentifier(entry.childLink)) {
      continue;
    }
    if (entry.childLink === baseLink) {
      issue(
        issues,
        `$.joints[${String(index)}].childLink`,
        "kinematics.base_link_has_parent",
        "The base link cannot be the child of a joint.",
      );
      continue;
    }
    if (parentByChild.has(entry.childLink)) {
      issue(
        issues,
        `$.joints[${String(index)}].childLink`,
        "kinematics.multiple_parents",
        `Link ${JSON.stringify(entry.childLink)} has more than one parent joint.`,
      );
      continue;
    }
    parentByChild.set(entry.childLink, entry.parentLink);
  }

  for (const linkId of linkIds) {
    if (linkId === baseLink) continue;
    if (!parentByChild.has(linkId)) {
      issue(
        issues,
        "$.joints",
        "kinematics.orphan_link",
        `Link ${JSON.stringify(linkId)} is not connected to the base link by any joint.`,
      );
    }
  }

  for (const start of parentByChild.keys()) {
    const visited = new Set<string>();
    let current: string | undefined = start;
    while (current !== undefined) {
      if (visited.has(current)) {
        issue(
          issues,
          "$.joints",
          "kinematics.cycle",
          `Joint chain contains a cycle through ${JSON.stringify(current)}.`,
        );
        return;
      }
      visited.add(current);
      current = parentByChild.get(current);
    }
  }
}

export function validateRobotKinematics(input: unknown): readonly AssetValidationIssue[] {
  const issues: AssetValidationIssue[] = [];
  if (!isObject(input)) {
    issue(issues, "$", "schema.invalid_root", "Expected a kinematics object.");
    return Object.freeze(issues);
  }

  rejectUnexpectedProperties(
    input,
    ["schemaVersion", "assetId", "version", "baseLink", "links", "joints"],
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
  validateIdentifier(input.baseLink, "$.baseLink", issues);
  validateLinks(input.links, issues);

  if (!Array.isArray(input.joints) || input.joints.length === 0) {
    issue(issues, "$.joints", "kinematics.invalid_joints", "Expected a non-empty array of joints.");
  } else {
    const jointIds = new Set<string>();
    const linkIds = new Set(
      (Array.isArray(input.links) ? input.links : [])
        .filter(isObject)
        .map((entry) => entry.linkId)
        .filter(isIdentifier),
    );
    input.joints.forEach((entry, index) => {
      validateJoint(entry, `$.joints[${String(index)}]`, jointIds, linkIds, issues);
    });
  }

  validateTopology(input.baseLink, input.links, input.joints, issues);
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

function buildKinematics(input: JsonObject): RobotKinematicsV1 {
  const links = (input.links as readonly JsonObject[]).map((entry) =>
    Object.freeze({
      linkId: frameId(entry.linkId as string),
      nodeName: entry.nodeName as string,
    }),
  );
  const joints = (input.joints as readonly JsonObject[]).map((entry) => {
    const origin = entry.origin as JsonObject;
    const limits = entry.limits as JsonObject;
    return Object.freeze({
      jointId: entry.jointId as string,
      type: entry.type as KinematicsJointType,
      parentLink: frameId(entry.parentLink as string),
      childLink: frameId(entry.childLink as string),
      origin: Object.freeze({
        translation: freezeVec3(origin.translation),
        rotation: freezeQuat(origin.rotation),
      }),
      axis: freezeVec3(entry.axis),
      limits: Object.freeze({
        lower: limits.lower as number,
        upper: limits.upper as number,
      }),
    });
  });
  return Object.freeze({
    schemaVersion: 1,
    assetId: assetId(input.assetId as string),
    version: input.version as string,
    baseLink: frameId(input.baseLink as string),
    links: Object.freeze(links),
    joints: Object.freeze(joints),
  });
}

export function parseRobotKinematics(input: unknown): RobotKinematicsParseResult {
  const issues = validateRobotKinematics(input);
  if (issues.some((entry) => entry.severity === "error")) {
    return Object.freeze({ ok: false, issues });
  }

  try {
    return Object.freeze({ ok: true, value: buildKinematics(input as JsonObject) });
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

/**
 * The pose a joint's child link node takes in parent-link-local file space for
 * one applied joint value.
 */
export interface JointPose {
  readonly jointId: string;
  readonly childLink: FrameId;
  readonly nodeName: string;
  /** The applied value after clamping to the joint's declared limits. */
  readonly value: number;
  readonly translation: Vec3;
  readonly rotation: Quat;
}

/** Joint values keyed by jointId: radians (revolute) or file units (prismatic). */
export type JointValues = Readonly<Record<string, number>>;

function multiplyQuaternions(left: Quat, right: Quat): Quat {
  const [lx, ly, lz, lw] = left;
  const [rx, ry, rz, rw] = right;
  return [
    lw * rx + lx * rw + ly * rz - lz * ry,
    lw * ry - lx * rz + ly * rw + lz * rx,
    lw * rz + lx * ry - ly * rx + lz * rw,
    lw * rw - lx * rx - ly * ry - lz * rz,
  ];
}

function axisAngleQuaternion(axis: Vec3, angleRadians: number): Quat {
  const half = angleRadians / 2;
  const sin = Math.sin(half);
  return [axis[0] * sin, axis[1] * sin, axis[2] * sin, Math.cos(half)];
}

export function clampJointValue(joint: KinematicsJoint, value: number): number {
  if (!Number.isFinite(value)) {
    throw new KinematicsValidationError(
      `Joint ${JSON.stringify(joint.jointId)} received a non-finite value.`,
    );
  }
  return Math.min(joint.limits.upper, Math.max(joint.limits.lower, value));
}

function computeJointPose(
  joint: KinematicsJoint,
  nodeName: string,
  requestedValue: number | undefined,
): JointPose {
  const value = clampJointValue(joint, requestedValue ?? 0);
  const { translation, rotation } = joint.origin;
  if (joint.type === "revolute") {
    const motion = axisAngleQuaternion(joint.axis, value);
    return Object.freeze({
      jointId: joint.jointId,
      childLink: joint.childLink,
      nodeName,
      value,
      translation,
      rotation: freezeQuat(multiplyQuaternions(rotation, motion)),
    });
  }
  const displacement = rotateVectorByQuaternion(rotation, [
    joint.axis[0] * value,
    joint.axis[1] * value,
    joint.axis[2] * value,
  ]);
  return Object.freeze({
    jointId: joint.jointId,
    childLink: joint.childLink,
    nodeName,
    value,
    translation: freezeVec3([
      translation[0] + displacement[0],
      translation[1] + displacement[1],
      translation[2] + displacement[2],
    ]),
    rotation,
  });
}

/**
 * Computes each joint's child link node pose for the requested joint values.
 *
 * A missing joint value applies the joint's rest value: zero clamped into the
 * declared limits. Out-of-range values clamp to the nearest limit, matching
 * how a physical servo saturates. Unknown jointId keys and non-finite values
 * throw, so a typo never poses silently.
 */
export function computeJointPoses(
  kinematics: RobotKinematicsV1,
  jointValues: JointValues = {},
): readonly JointPose[] {
  const knownJoints = new Set(kinematics.joints.map((joint) => joint.jointId));
  for (const key of Object.keys(jointValues)) {
    if (!knownJoints.has(key)) {
      throw new KinematicsValidationError(
        `Joint values reference unknown jointId ${JSON.stringify(key)}.`,
      );
    }
  }
  const nodeNameByLink = new Map(kinematics.links.map((link) => [link.linkId, link.nodeName]));
  return Object.freeze(
    kinematics.joints.map((joint) => {
      const nodeName = nodeNameByLink.get(joint.childLink);
      if (nodeName === undefined) {
        throw new KinematicsValidationError(
          `Joint ${JSON.stringify(joint.jointId)} references undeclared link ${JSON.stringify(joint.childLink)}.`,
        );
      }
      return computeJointPose(joint, nodeName, jointValues[joint.jointId]);
    }),
  );
}

/** A link's pose in base-link-local file space for one set of joint values. */
export interface LinkPose {
  readonly linkId: FrameId;
  readonly translation: Vec3;
  readonly rotation: Quat;
}

/**
 * Forward kinematics to the base link: composes every joint pose down the
 * chain and returns each link's pose in base-link-local file space. The base
 * link itself is included with an identity pose.
 */
export function computeLinkPoses(
  kinematics: RobotKinematicsV1,
  jointValues: JointValues = {},
): ReadonlyMap<FrameId, LinkPose> {
  const poses = new Map<FrameId, LinkPose>();
  poses.set(
    kinematics.baseLink,
    Object.freeze({
      linkId: kinematics.baseLink,
      translation: freezeVec3([0, 0, 0]),
      rotation: freezeQuat([0, 0, 0, 1]),
    }),
  );

  const jointPoses = computeJointPoses(kinematics, jointValues);
  const pending = kinematics.joints.map((joint, index) => ({ joint, pose: jointPoses[index] }));
  while (pending.length > 0) {
    const readyIndex = pending.findIndex((entry) => poses.has(entry.joint.parentLink));
    if (readyIndex === -1) {
      throw new KinematicsValidationError("Joint chain is not connected to the base link.");
    }
    const entry = pending[readyIndex];
    pending.splice(readyIndex, 1);
    if (entry?.pose === undefined) {
      throw new KinematicsValidationError("Joint chain is not connected to the base link.");
    }
    const { joint, pose } = entry;
    const parent = poses.get(joint.parentLink);
    if (parent === undefined) {
      throw new KinematicsValidationError("Joint chain is not connected to the base link.");
    }
    const rotated = rotateVectorByQuaternion(parent.rotation, pose.translation);
    poses.set(
      joint.childLink,
      Object.freeze({
        linkId: joint.childLink,
        translation: freezeVec3([
          parent.translation[0] + rotated[0],
          parent.translation[1] + rotated[1],
          parent.translation[2] + rotated[2],
        ]),
        rotation: freezeQuat(multiplyQuaternions(parent.rotation, pose.rotation)),
      }),
    );
  }
  return poses;
}

/**
 * Expresses the same joint poses as child-link → parent-link rigid transforms,
 * ready to feed a frame graph as timestamped samples. Transforms stay in file
 * units; composing them into core meters is the paired asset manifest's job.
 */
export function createJointFrameTransforms(
  kinematics: RobotKinematicsV1,
  jointValues: JointValues = {},
): readonly RigidTransform3[] {
  const jointsById = new Map(kinematics.joints.map((joint) => [joint.jointId, joint]));
  return Object.freeze(
    computeJointPoses(kinematics, jointValues).map((pose) => {
      const joint = jointsById.get(pose.jointId);
      if (joint === undefined) {
        throw new KinematicsValidationError(
          `Missing joint definition for ${JSON.stringify(pose.jointId)}.`,
        );
      }
      return rigidTransform3(joint.childLink, joint.parentLink, pose.translation, pose.rotation);
    }),
  );
}
