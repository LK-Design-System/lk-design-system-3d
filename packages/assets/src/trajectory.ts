import type { JointValues } from "./kinematics.js";

/**
 * A recorded joint-space episode: normalized joint values sampled over time.
 *
 * Times are seconds on the episode's own axis (typically starting at zero).
 * Every sample must declare the same joint id set so interpolation is total;
 * values use the kinematics units (radians for revolute joints, file units for
 * prismatic joints) and are clamped by `computeJointPoses` at pose time, not
 * here.
 */
export interface JointTrajectorySample {
  readonly timeSeconds: number;
  readonly values: JointValues;
}

export interface JointTrajectory {
  readonly samples: readonly JointTrajectorySample[];
}

export class TrajectoryValidationError extends RangeError {
  override readonly name = "TrajectoryValidationError";
}

function assertFinite(value: number, label: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TrajectoryValidationError(`${label} must be a finite number.`);
  }
}

function freezeSample(sample: JointTrajectorySample): JointTrajectorySample {
  return Object.freeze({
    timeSeconds: sample.timeSeconds,
    values: Object.freeze({ ...sample.values }),
  });
}

function isSampleArray(value: readonly JointTrajectorySample[]): boolean {
  return Array.isArray(value);
}

export function createJointTrajectory(samples: readonly JointTrajectorySample[]): JointTrajectory {
  if (!isSampleArray(samples) || samples.length === 0) {
    throw new TrajectoryValidationError("A trajectory requires at least one sample.");
  }

  const first = samples[0];
  if (first === undefined) {
    throw new TrajectoryValidationError("A trajectory requires at least one sample.");
  }
  const jointIds = Object.keys(first.values).sort();
  let previousTime = Number.NEGATIVE_INFINITY;
  for (const [index, sample] of samples.entries()) {
    const label = `samples[${String(index)}]`;
    assertFinite(sample.timeSeconds, `${label}.timeSeconds`);
    if (sample.timeSeconds <= previousTime) {
      throw new TrajectoryValidationError(
        `${label}.timeSeconds must be strictly greater than the previous sample.`,
      );
    }
    previousTime = sample.timeSeconds;

    const sampleJointIds = Object.keys(sample.values).sort();
    if (
      sampleJointIds.length !== jointIds.length ||
      sampleJointIds.some((jointId, position) => jointId !== jointIds[position])
    ) {
      throw new TrajectoryValidationError(
        `${label}.values must declare the same joint ids as the first sample.`,
      );
    }
    for (const jointId of sampleJointIds) {
      assertFinite(sample.values[jointId] ?? Number.NaN, `${label}.values.${jointId}`);
    }
  }

  return Object.freeze({ samples: Object.freeze(samples.map(freezeSample)) });
}

export function trajectoryStartSeconds(trajectory: JointTrajectory): number {
  const first = trajectory.samples[0];
  if (first === undefined) {
    throw new TrajectoryValidationError("Trajectory has no samples.");
  }
  return first.timeSeconds;
}

export function trajectoryEndSeconds(trajectory: JointTrajectory): number {
  const last = trajectory.samples[trajectory.samples.length - 1];
  if (last === undefined) {
    throw new TrajectoryValidationError("Trajectory has no samples.");
  }
  return last.timeSeconds;
}

/**
 * Samples the trajectory at a point in time with per-joint linear
 * interpolation. Queries before the first or after the last sample hold the
 * nearest sample's values, matching the frame graph's hold-last semantics.
 */
export function sampleJointTrajectory(
  trajectory: JointTrajectory,
  timeSeconds: number,
): JointValues {
  assertFinite(timeSeconds, "timeSeconds");
  const { samples } = trajectory;
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (first === undefined || last === undefined) {
    throw new TrajectoryValidationError("Trajectory has no samples.");
  }
  if (timeSeconds <= first.timeSeconds) return first.values;
  if (timeSeconds >= last.timeSeconds) return last.values;

  let low = 0;
  let high = samples.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    const candidate = samples[middle];
    if (candidate === undefined) break;
    if (candidate.timeSeconds <= timeSeconds) low = middle;
    else high = middle;
  }
  const before = samples[low];
  const after = samples[high];
  if (before === undefined || after === undefined) {
    throw new TrajectoryValidationError("Trajectory interpolation window is missing samples.");
  }

  const span = after.timeSeconds - before.timeSeconds;
  const amount = (timeSeconds - before.timeSeconds) / span;
  const interpolated: Record<string, number> = {};
  for (const [jointId, beforeValue] of Object.entries(before.values)) {
    const afterValue = after.values[jointId] ?? beforeValue;
    interpolated[jointId] = beforeValue + (afterValue - beforeValue) * amount;
  }
  return Object.freeze(interpolated);
}
