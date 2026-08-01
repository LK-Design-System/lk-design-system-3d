import type { FrameId, Quat, Vec3 } from "@lk-design-system/lds-3d-core";

import {
  KinematicsValidationError,
  clampJointValue,
  type JointValues,
  type KinematicsJoint,
  type RobotKinematicsV1,
} from "./kinematics.js";
import { rotateVectorByQuaternion } from "./spatial.js";

/**
 * Deterministic position-target inverse kinematics.
 *
 * The solver runs cyclic coordinate descent (CCD) over the joint chain from
 * the base link to the effector link, clamping every candidate value into the
 * joint's declared limits, so a solution can never violate the kinematics
 * contract. It is renderer-neutral and allocation-light: targets and results
 * are expressed in base-link-local file units, exactly like
 * `computeLinkPoses`, and the output feeds `computeJointPoses` or
 * `ArticulatedGltfModel` unchanged.
 *
 * Non-convergence is a reported outcome, not an exception: real targets are
 * routinely out of reach and the caller decides how to present the residual.
 */
export interface SolveJointPositionIkOptions {
  /** Link whose frame origin should reach the target. */
  readonly effectorLink: FrameId;
  /** Target position in base-link-local file units. */
  readonly targetPosition: Vec3;
  /** Starting joint values; missing joints start at their rest value. */
  readonly initialValues?: JointValues;
  /** CCD sweeps over the whole chain. @defaultValue 32 */
  readonly maxIterations?: number;
  /** Convergence threshold on the effector residual. @defaultValue 1e-3 */
  readonly toleranceMeters?: number;
}

export interface JointPositionIkSolution {
  readonly kind: "converged" | "not-converged";
  /** Best joint values found, always clamped into the declared limits. */
  readonly values: JointValues;
  /** Euclidean distance from the effector to the target, in file units. */
  readonly residualMeters: number;
  /** CCD sweeps actually executed. */
  readonly iterations: number;
}

interface ChainJointState {
  readonly joint: KinematicsJoint;
  readonly pivot: Vec3;
  readonly worldAxis: Vec3;
}

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

function axisAngleQuaternion(axis: Vec3, angle: number): Quat {
  const half = angle / 2;
  const sin = Math.sin(half);
  return [axis[0] * sin, axis[1] * sin, axis[2] * sin, Math.cos(half)];
}

function addVectors(left: Vec3, right: Vec3): Vec3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function subtractVectors(left: Vec3, right: Vec3): Vec3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function crossProduct(left: Vec3, right: Vec3): Vec3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function dotProduct(left: Vec3, right: Vec3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function vectorLength(value: Vec3): number {
  return Math.hypot(value[0], value[1], value[2]);
}

/** Base-to-effector joint chain, ordered base first. */
function effectorChain(
  kinematics: RobotKinematicsV1,
  effectorLink: FrameId,
): readonly KinematicsJoint[] {
  if (
    effectorLink !== kinematics.baseLink &&
    !kinematics.links.some((link) => link.linkId === effectorLink)
  ) {
    throw new KinematicsValidationError(
      `Effector link ${JSON.stringify(effectorLink)} is not declared by the kinematics.`,
    );
  }
  const jointByChild = new Map(kinematics.joints.map((joint) => [joint.childLink, joint]));
  const chain: KinematicsJoint[] = [];
  let current = effectorLink;
  while (current !== kinematics.baseLink) {
    const joint = jointByChild.get(current);
    if (joint === undefined) {
      throw new KinematicsValidationError(
        `Effector link ${JSON.stringify(effectorLink)} is not connected to the base link.`,
      );
    }
    chain.unshift(joint);
    current = joint.parentLink;
  }
  if (chain.length === 0) {
    throw new KinematicsValidationError("Effector link must differ from the base link.");
  }
  return chain;
}

/** Chain forward kinematics: per-joint pivot and world axis plus effector. */
function chainState(
  chain: readonly KinematicsJoint[],
  values: Readonly<Record<string, number>>,
): { readonly states: readonly ChainJointState[]; readonly effector: Vec3 } {
  let worldTranslation: Vec3 = [0, 0, 0];
  let worldRotation: Quat = [0, 0, 0, 1];
  const states: ChainJointState[] = [];
  for (const joint of chain) {
    const pivot = addVectors(
      worldTranslation,
      rotateVectorByQuaternion(worldRotation, joint.origin.translation),
    );
    const frameRotation = multiplyQuaternions(worldRotation, joint.origin.rotation);
    const worldAxis = rotateVectorByQuaternion(frameRotation, joint.axis);
    states.push({ joint, pivot, worldAxis });

    const value = values[joint.jointId] ?? 0;
    if (joint.type === "revolute") {
      worldTranslation = pivot;
      worldRotation = multiplyQuaternions(frameRotation, axisAngleQuaternion(joint.axis, value));
    } else {
      worldTranslation = addVectors(pivot, [
        worldAxis[0] * value,
        worldAxis[1] * value,
        worldAxis[2] * value,
      ]);
      worldRotation = frameRotation;
    }
  }
  return { states, effector: worldTranslation };
}

export interface SolveJointPoseIkOptions {
  /** Link whose frame should reach the target pose. */
  readonly effectorLink: FrameId;
  /** Target position in base-link-local file units. */
  readonly targetPosition: Vec3;
  /** Target orientation in base-link-local space. */
  readonly targetOrientation: Quat;
  /** Starting joint values; missing joints start at their rest value. */
  readonly initialValues?: JointValues;
  /** Damped-least-squares iterations. @defaultValue 64 */
  readonly maxIterations?: number;
  /** Convergence threshold on the position residual. @defaultValue 1e-3 */
  readonly toleranceMeters?: number;
  /** Convergence threshold on the orientation residual. @defaultValue 1e-2 */
  readonly toleranceRadians?: number;
  /** DLS damping; larger is more stable near singularities. @defaultValue 0.05 */
  readonly dampingFactor?: number;
}

export interface JointPoseIkSolution {
  readonly kind: "converged" | "not-converged";
  /** Best joint values found, always clamped into the declared limits. */
  readonly values: JointValues;
  readonly residualMeters: number;
  readonly residualRadians: number;
  readonly iterations: number;
}

function conjugateQuaternion(value: Quat): Quat {
  return [-value[0], -value[1], -value[2], value[3]];
}

/** Rotation vector (axis × angle) of a unit quaternion, in [-π, π]. */
function quaternionRotationVector(value: Quat): Vec3 {
  const [x, y, z, wRaw] = value;
  const sin = Math.hypot(x, y, z);
  if (sin < 1e-12) return [0, 0, 0];
  const w = Math.min(1, Math.max(-1, wRaw));
  let angle = 2 * Math.atan2(sin, w);
  if (angle > Math.PI) angle -= 2 * Math.PI;
  return [(x / sin) * angle, (y / sin) * angle, (z / sin) * angle];
}

/** Solves the 6×6 system (A x = b) with partial-pivot Gaussian elimination. */
function solveLinearSystem(matrix: number[][], vector: number[]): number[] | undefined {
  const size = vector.length;
  const rows = matrix.map((row, index) => [...row, vector[index] ?? 0]);
  for (let column = 0; column < size; column += 1) {
    let pivotRow = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(rows[row]?.[column] ?? 0) > Math.abs(rows[pivotRow]?.[column] ?? 0)) {
        pivotRow = row;
      }
    }
    const pivotValues = rows[pivotRow];
    const currentValues = rows[column];
    if (pivotValues === undefined || currentValues === undefined) return undefined;
    if (Math.abs(pivotValues[column] ?? 0) < 1e-12) return undefined;
    rows[pivotRow] = currentValues;
    rows[column] = pivotValues;
    const pivot = pivotValues[column] ?? 1;
    for (let row = column + 1; row < size; row += 1) {
      const target = rows[row];
      if (target === undefined) continue;
      const factor = (target[column] ?? 0) / pivot;
      for (let entry = column; entry <= size; entry += 1) {
        target[entry] = (target[entry] ?? 0) - factor * (rows[column]?.[entry] ?? 0);
      }
    }
  }
  const solution = Array<number>(size).fill(0);
  for (let row = size - 1; row >= 0; row -= 1) {
    const values = rows[row];
    if (values === undefined) return undefined;
    let sum = values[size] ?? 0;
    for (let column = row + 1; column < size; column += 1) {
      sum -= (values[column] ?? 0) * (solution[column] ?? 0);
    }
    solution[row] = sum / (values[row] ?? 1);
  }
  return solution;
}

/** Chain FK returning the effector's full pose alongside per-joint states. */
function chainPoseState(
  chain: readonly KinematicsJoint[],
  values: Readonly<Record<string, number>>,
): {
  readonly states: readonly ChainJointState[];
  readonly effector: Vec3;
  readonly effectorRotation: Quat;
} {
  let worldTranslation: Vec3 = [0, 0, 0];
  let worldRotation: Quat = [0, 0, 0, 1];
  const states: ChainJointState[] = [];
  for (const joint of chain) {
    const pivot = addVectors(
      worldTranslation,
      rotateVectorByQuaternion(worldRotation, joint.origin.translation),
    );
    const frameRotation = multiplyQuaternions(worldRotation, joint.origin.rotation);
    const worldAxis = rotateVectorByQuaternion(frameRotation, joint.axis);
    states.push({ joint, pivot, worldAxis });

    const value = values[joint.jointId] ?? 0;
    if (joint.type === "revolute") {
      worldTranslation = pivot;
      worldRotation = multiplyQuaternions(frameRotation, axisAngleQuaternion(joint.axis, value));
    } else {
      worldTranslation = addVectors(pivot, [
        worldAxis[0] * value,
        worldAxis[1] * value,
        worldAxis[2] * value,
      ]);
      worldRotation = frameRotation;
    }
  }
  return { states, effector: worldTranslation, effectorRotation: worldRotation };
}

/**
 * Damped-least-squares inverse kinematics for a full 6-DoF pose target.
 *
 * Builds the analytic chain Jacobian (revolute: `axis × r` / `axis`;
 * prismatic: `axis` / `0`), damps it near singularities, and clamps every
 * update into the joint limits so a solution can never violate the kinematics
 * contract. Position and orientation residuals converge — and are reported —
 * independently; non-convergence is a result, not an exception.
 */
export function solveJointPoseIk(
  kinematics: RobotKinematicsV1,
  options: SolveJointPoseIkOptions,
): JointPoseIkSolution {
  const { targetPosition, targetOrientation } = options;
  if (targetPosition.some((component) => !Number.isFinite(component))) {
    throw new KinematicsValidationError("targetPosition must contain finite numbers.");
  }
  if (
    targetOrientation.some((component) => !Number.isFinite(component)) ||
    Math.abs(Math.hypot(...targetOrientation) - 1) > 1e-6
  ) {
    throw new KinematicsValidationError("targetOrientation must be a unit quaternion.");
  }
  const maxIterations = options.maxIterations ?? 64;
  const toleranceMeters = options.toleranceMeters ?? 1e-3;
  const toleranceRadians = options.toleranceRadians ?? 1e-2;
  const dampingFactor = options.dampingFactor ?? 0.05;
  if (!Number.isInteger(maxIterations) || maxIterations < 1) {
    throw new KinematicsValidationError("maxIterations must be a positive integer.");
  }
  for (const [label, value] of [
    ["toleranceMeters", toleranceMeters],
    ["toleranceRadians", toleranceRadians],
    ["dampingFactor", dampingFactor],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new KinematicsValidationError(`${label} must be a finite positive number.`);
    }
  }

  const chain = effectorChain(kinematics, options.effectorLink);
  const values: Record<string, number> = {};
  for (const joint of chain) {
    values[joint.jointId] = clampJointValue(joint, options.initialValues?.[joint.jointId] ?? 0);
  }

  const residuals = (): { position: Vec3; orientation: Vec3 } => {
    const { effector, effectorRotation } = chainPoseState(chain, values);
    return {
      position: subtractVectors(targetPosition, effector),
      orientation: quaternionRotationVector(
        multiplyQuaternions(targetOrientation, conjugateQuaternion(effectorRotation)),
      ),
    };
  };

  let iterations = 0;
  let error = residuals();
  let residualMeters = vectorLength(error.position);
  let residualRadians = vectorLength(error.orientation);

  while (
    (residualMeters > toleranceMeters || residualRadians > toleranceRadians) &&
    iterations < maxIterations
  ) {
    iterations += 1;
    const { states, effector } = chainPoseState(chain, values);
    const columns = states.map(({ joint, pivot, worldAxis }) =>
      joint.type === "revolute"
        ? [...crossProduct(worldAxis, subtractVectors(effector, pivot)), ...worldAxis]
        : [...worldAxis, 0, 0, 0],
    );
    const errorVector = [...error.position, ...error.orientation];
    // 오차 비례 감쇠(Levenberg-Marquardt): 오차가 크면 안정적으로, 해 근처에서는
    // 감쇠가 사라져 뉴턴급으로 수렴한다. 바닥값은 특이점 발산만 막는다.
    const errorSquared = errorVector.reduce((sum, entry) => sum + entry * entry, 0);
    const damping = dampingFactor * dampingFactor * errorSquared + 1e-9;

    // J Jᵀ + λ² I (6×6), then Δ = Jᵀ (…)⁻¹ e.
    const normal = Array.from({ length: 6 }, (_, row) =>
      Array.from({ length: 6 }, (_, column) => {
        let sum = row === column ? damping : 0;
        for (const jointColumn of columns) {
          sum += (jointColumn[row] ?? 0) * (jointColumn[column] ?? 0);
        }
        return sum;
      }),
    );
    const intermediate = solveLinearSystem(normal, errorVector);
    if (intermediate === undefined) break;
    states.forEach(({ joint }, index) => {
      const column = columns[index];
      if (column === undefined) return;
      let delta = 0;
      for (let entry = 0; entry < 6; entry += 1) {
        delta += (column[entry] ?? 0) * (intermediate[entry] ?? 0);
      }
      values[joint.jointId] = clampJointValue(joint, (values[joint.jointId] ?? 0) + delta);
    });

    error = residuals();
    residualMeters = vectorLength(error.position);
    residualRadians = vectorLength(error.orientation);
  }

  return Object.freeze({
    kind:
      residualMeters <= toleranceMeters && residualRadians <= toleranceRadians
        ? "converged"
        : "not-converged",
    values: Object.freeze({ ...values }),
    residualMeters,
    residualRadians,
    iterations,
  });
}

export function solveJointPositionIk(
  kinematics: RobotKinematicsV1,
  options: SolveJointPositionIkOptions,
): JointPositionIkSolution {
  const { targetPosition } = options;
  if (targetPosition.some((component) => !Number.isFinite(component))) {
    throw new KinematicsValidationError("targetPosition must contain finite numbers.");
  }
  const maxIterations = options.maxIterations ?? 32;
  const toleranceMeters = options.toleranceMeters ?? 1e-3;
  if (!Number.isInteger(maxIterations) || maxIterations < 1) {
    throw new KinematicsValidationError("maxIterations must be a positive integer.");
  }
  if (!Number.isFinite(toleranceMeters) || toleranceMeters <= 0) {
    throw new KinematicsValidationError("toleranceMeters must be a finite positive number.");
  }

  const chain = effectorChain(kinematics, options.effectorLink);
  const values: Record<string, number> = {};
  for (const joint of chain) {
    values[joint.jointId] = clampJointValue(joint, options.initialValues?.[joint.jointId] ?? 0);
  }

  let iterations = 0;
  let residualMeters = vectorLength(
    subtractVectors(targetPosition, chainState(chain, values).effector),
  );

  while (residualMeters > toleranceMeters && iterations < maxIterations) {
    iterations += 1;
    for (let index = chain.length - 1; index >= 0; index -= 1) {
      const { states, effector } = chainState(chain, values);
      const state = states[index];
      if (state === undefined) continue;
      const { joint, pivot, worldAxis } = state;

      if (joint.type === "revolute") {
        // Project both arms onto the plane perpendicular to the joint axis;
        // the signed angle between the projections is the CCD update.
        const project = (vector: Vec3): Vec3 => {
          const along = dotProduct(worldAxis, vector);
          return subtractVectors(vector, [
            worldAxis[0] * along,
            worldAxis[1] * along,
            worldAxis[2] * along,
          ]);
        };
        const toEffector = project(subtractVectors(effector, pivot));
        const toTarget = project(subtractVectors(targetPosition, pivot));
        if (vectorLength(toEffector) < 1e-9 || vectorLength(toTarget) < 1e-9) continue;
        const delta = Math.atan2(
          dotProduct(worldAxis, crossProduct(toEffector, toTarget)),
          dotProduct(toEffector, toTarget),
        );
        values[joint.jointId] = clampJointValue(joint, (values[joint.jointId] ?? 0) + delta);
      } else {
        const delta = dotProduct(subtractVectors(targetPosition, effector), worldAxis);
        values[joint.jointId] = clampJointValue(joint, (values[joint.jointId] ?? 0) + delta);
      }
    }
    residualMeters = vectorLength(
      subtractVectors(targetPosition, chainState(chain, values).effector),
    );
  }

  return Object.freeze({
    kind: residualMeters <= toleranceMeters ? "converged" : "not-converged",
    values: Object.freeze({ ...values }),
    residualMeters,
    iterations,
  });
}
