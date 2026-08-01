import { describe, expect, it } from "vitest";
import { frameId } from "@lk-design-system/lds-3d-core";

import {
  KinematicsValidationError,
  computeLinkPoses,
  parseRobotKinematics,
  solveJointPoseIk,
  solveJointPositionIk,
  type RobotKinematicsV1,
} from "../src/index.js";

/** Planar 2-link arm: yaw about Z at the base, pitch about Y at the elbow. */
const ARM_INPUT = {
  schemaVersion: 1,
  assetId: "fixture/ik-arm",
  version: "1.0.0",
  baseLink: "base",
  links: [
    { linkId: "base", nodeName: "Base" },
    { linkId: "upper", nodeName: "Upper" },
    { linkId: "lower", nodeName: "Lower" },
    { linkId: "tool", nodeName: "Tool" },
  ],
  joints: [
    {
      jointId: "yaw",
      type: "revolute",
      parentLink: "base",
      childLink: "upper",
      origin: { translation: [0, 0, 0.1], rotation: [0, 0, 0, 1] },
      axis: [0, 0, 1],
      limits: { lower: -Math.PI, upper: Math.PI },
    },
    {
      jointId: "pitch",
      type: "revolute",
      parentLink: "upper",
      childLink: "lower",
      origin: { translation: [0, 0, 0.2], rotation: [0, 0, 0, 1] },
      axis: [0, 1, 0],
      limits: { lower: -Math.PI / 2, upper: Math.PI / 2 },
    },
    {
      jointId: "extend",
      type: "prismatic",
      parentLink: "lower",
      childLink: "tool",
      origin: { translation: [0, 0, 0.2], rotation: [0, 0, 0, 1] },
      axis: [0, 0, 1],
      limits: { lower: 0, upper: 0.15 },
    },
  ],
};

function parseArm(): RobotKinematicsV1 {
  const result = parseRobotKinematics(ARM_INPUT);
  if (!result.ok) throw new Error("Fixture must parse.");
  return result.value;
}

const TOOL = frameId("tool");

function effectorPosition(kinematics: RobotKinematicsV1, values: Readonly<Record<string, number>>) {
  const pose = computeLinkPoses(kinematics, values).get(TOOL);
  if (pose === undefined) throw new Error("Tool pose missing.");
  return pose.translation;
}

describe("computeLinkPoses", () => {
  it("returns identity for the base and composed poses down the chain", () => {
    const poses = computeLinkPoses(parseArm());
    expect(poses.get(frameId("base"))?.translation).toEqual([0, 0, 0]);
    expect(poses.get(TOOL)?.translation[2]).toBeCloseTo(0.5, 12);
  });

  it("moves the tool with pitch and extension", () => {
    const position = effectorPosition(parseArm(), { pitch: Math.PI / 2, extend: 0.1 });
    expect(position[0]).toBeCloseTo(0.3, 12);
    expect(position[2]).toBeCloseTo(0.3, 12);
  });
});

describe("solveJointPositionIk", () => {
  it("converges on a reachable target and satisfies it through forward kinematics", () => {
    const kinematics = parseArm();
    // 피치 피벗(z=0.3)으로부터 0.245m: 링크 도달 범위 [0.2, 0.35] 안이다.
    const target = [0.2, 0.1, 0.4] as const;
    const solution = solveJointPositionIk(kinematics, {
      effectorLink: TOOL,
      targetPosition: target,
    });
    expect(solution.kind).toBe("converged");
    expect(solution.residualMeters).toBeLessThanOrEqual(1e-3);
    const reached = effectorPosition(kinematics, solution.values);
    expect(reached[0]).toBeCloseTo(target[0], 3);
    expect(reached[1]).toBeCloseTo(target[1], 3);
    expect(reached[2]).toBeCloseTo(target[2], 3);
  });

  it("clamps every solved value into the declared limits", () => {
    const kinematics = parseArm();
    const solution = solveJointPositionIk(kinematics, {
      effectorLink: TOOL,
      targetPosition: [0.4, 0, 0.05],
    });
    for (const joint of kinematics.joints) {
      const value = solution.values[joint.jointId];
      expect(value).toBeGreaterThanOrEqual(joint.limits.lower);
      expect(value).toBeLessThanOrEqual(joint.limits.upper);
    }
  });

  it("reports an unreachable target as not-converged with the residual", () => {
    const solution = solveJointPositionIk(parseArm(), {
      effectorLink: TOOL,
      targetPosition: [2, 0, 0],
    });
    expect(solution.kind).toBe("not-converged");
    expect(solution.residualMeters).toBeGreaterThan(1);
    expect(solution.iterations).toBe(32);
  });

  it("is deterministic for identical inputs", () => {
    const kinematics = parseArm();
    const options = { effectorLink: TOOL, targetPosition: [0.1, -0.12, 0.3] as const };
    expect(solveJointPositionIk(kinematics, options)).toEqual(
      solveJointPositionIk(kinematics, options),
    );
  });

  it("rejects unknown effectors, disconnected targets, and invalid options", () => {
    const kinematics = parseArm();
    expect(() =>
      solveJointPositionIk(kinematics, {
        effectorLink: frameId("missing"),
        targetPosition: [0, 0, 0.3],
      }),
    ).toThrow(KinematicsValidationError);
    expect(() =>
      solveJointPositionIk(kinematics, {
        effectorLink: frameId("base"),
        targetPosition: [0, 0, 0.3],
      }),
    ).toThrow(/differ from the base link/u);
    expect(() =>
      solveJointPositionIk(kinematics, {
        effectorLink: TOOL,
        targetPosition: [Number.NaN, 0, 0],
      }),
    ).toThrow(KinematicsValidationError);
    expect(() =>
      solveJointPositionIk(kinematics, {
        effectorLink: TOOL,
        targetPosition: [0, 0, 0.3],
        maxIterations: 0,
      }),
    ).toThrow(KinematicsValidationError);
  });
});

/** 5-revolute SO-ARM-like chain for pose (position + orientation) targets. */
const POSE_ARM_INPUT = {
  schemaVersion: 1,
  assetId: "fixture/pose-arm",
  version: "1.0.0",
  baseLink: "base",
  links: [
    { linkId: "base", nodeName: "Base" },
    { linkId: "shoulder", nodeName: "Shoulder" },
    { linkId: "upper", nodeName: "Upper" },
    { linkId: "fore", nodeName: "Fore" },
    { linkId: "wrist", nodeName: "Wrist" },
    { linkId: "hand", nodeName: "Hand" },
  ],
  joints: [
    {
      jointId: "pan",
      type: "revolute",
      parentLink: "base",
      childLink: "shoulder",
      origin: { translation: [0, 0, 0.06], rotation: [0, 0, 0, 1] },
      axis: [0, 0, 1],
      limits: { lower: -Math.PI, upper: Math.PI },
    },
    {
      jointId: "lift",
      type: "revolute",
      parentLink: "shoulder",
      childLink: "upper",
      origin: { translation: [0, 0, 0.03], rotation: [0, 0, 0, 1] },
      axis: [0, 1, 0],
      limits: { lower: -1.75, upper: 1.75 },
    },
    {
      jointId: "elbow",
      type: "revolute",
      parentLink: "upper",
      childLink: "fore",
      origin: { translation: [0, 0, 0.11], rotation: [0, 0, 0, 1] },
      axis: [0, 1, 0],
      limits: { lower: -1.69, upper: 1.69 },
    },
    {
      jointId: "flex",
      type: "revolute",
      parentLink: "fore",
      childLink: "wrist",
      origin: { translation: [0, 0, 0.1], rotation: [0, 0, 0, 1] },
      axis: [0, 1, 0],
      limits: { lower: -1.66, upper: 1.66 },
    },
    {
      jointId: "roll",
      type: "revolute",
      parentLink: "wrist",
      childLink: "hand",
      origin: { translation: [0, 0, 0.045], rotation: [0, 0, 0, 1] },
      axis: [0, 0, 1],
      limits: { lower: -2.79, upper: 2.79 },
    },
  ],
};

function parsePoseArm(): RobotKinematicsV1 {
  const result = parseRobotKinematics(POSE_ARM_INPUT);
  if (!result.ok) throw new Error("Fixture must parse.");
  return result.value;
}

const HAND = frameId("hand");

describe("solveJointPoseIk", () => {
  it("converges on a pose produced by forward kinematics", () => {
    const kinematics = parsePoseArm();
    const goldenValues = { pan: 0.6, lift: 0.5, elbow: -0.9, flex: 0.4, roll: 1.1 };
    const goldenPose = computeLinkPoses(kinematics, goldenValues).get(HAND);
    if (goldenPose === undefined) throw new Error("Hand pose missing.");

    const solution = solveJointPoseIk(kinematics, {
      effectorLink: HAND,
      targetPosition: goldenPose.translation,
      targetOrientation: goldenPose.rotation,
      toleranceMeters: 2e-4,
    });
    expect(solution.kind).toBe("converged");

    const reached = computeLinkPoses(kinematics, solution.values).get(HAND);
    if (reached === undefined) throw new Error("Hand pose missing.");
    for (let axis = 0; axis < 3; axis += 1) {
      expect(reached.translation[axis]).toBeCloseTo(goldenPose.translation[axis] ?? 0, 3);
    }
    const orientationDot = Math.abs(
      reached.rotation[0] * goldenPose.rotation[0] +
        reached.rotation[1] * goldenPose.rotation[1] +
        reached.rotation[2] * goldenPose.rotation[2] +
        reached.rotation[3] * goldenPose.rotation[3],
    );
    expect(orientationDot).toBeGreaterThan(0.9999);
  });

  it("clamps into limits and reports both residuals when the pose is unreachable", () => {
    const kinematics = parsePoseArm();
    const solution = solveJointPoseIk(kinematics, {
      effectorLink: HAND,
      targetPosition: [1.5, 0, 0.1],
      targetOrientation: [0, 0, 0, 1],
    });
    expect(solution.kind).toBe("not-converged");
    expect(solution.residualMeters).toBeGreaterThan(1);
    for (const joint of kinematics.joints) {
      const value = solution.values[joint.jointId];
      expect(value).toBeGreaterThanOrEqual(joint.limits.lower);
      expect(value).toBeLessThanOrEqual(joint.limits.upper);
    }
  });

  it("is deterministic and validates its options", () => {
    const kinematics = parsePoseArm();
    const options = {
      effectorLink: HAND,
      targetPosition: [0.1, 0.05, 0.3] as const,
      targetOrientation: [0, 0, 0, 1] as const,
    };
    expect(solveJointPoseIk(kinematics, options)).toEqual(solveJointPoseIk(kinematics, options));
    expect(() =>
      solveJointPoseIk(kinematics, { ...options, targetOrientation: [0, 0, 0, 2] }),
    ).toThrow(KinematicsValidationError);
    expect(() => solveJointPoseIk(kinematics, { ...options, dampingFactor: 0 })).toThrow(
      KinematicsValidationError,
    );
  });
});
