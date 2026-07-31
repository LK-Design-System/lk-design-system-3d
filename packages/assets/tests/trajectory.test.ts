import { describe, expect, it } from "vitest";

import {
  TrajectoryValidationError,
  createJointTrajectory,
  sampleJointTrajectory,
  trajectoryEndSeconds,
  trajectoryStartSeconds,
} from "../src/trajectory.js";

const EPISODE = createJointTrajectory([
  { timeSeconds: 0, values: { yaw: 0, lift: 0 } },
  { timeSeconds: 2, values: { yaw: 1, lift: -0.5 } },
  { timeSeconds: 3, values: { yaw: 1, lift: 0.5 } },
]);

describe("createJointTrajectory", () => {
  it("freezes samples and reports the time range", () => {
    expect(Object.isFrozen(EPISODE.samples)).toBe(true);
    expect(Object.isFrozen(EPISODE.samples[0]?.values)).toBe(true);
    expect(trajectoryStartSeconds(EPISODE)).toBe(0);
    expect(trajectoryEndSeconds(EPISODE)).toBe(3);
  });

  it("rejects empty input, unordered times, and mismatched joint sets", () => {
    expect(() => createJointTrajectory([])).toThrow(TrajectoryValidationError);
    expect(() =>
      createJointTrajectory([
        { timeSeconds: 1, values: { yaw: 0 } },
        { timeSeconds: 1, values: { yaw: 1 } },
      ]),
    ).toThrow(/strictly greater/u);
    expect(() =>
      createJointTrajectory([
        { timeSeconds: 0, values: { yaw: 0 } },
        { timeSeconds: 1, values: { lift: 1 } },
      ]),
    ).toThrow(/same joint ids/u);
    expect(() => createJointTrajectory([{ timeSeconds: 0, values: { yaw: Number.NaN } }])).toThrow(
      TrajectoryValidationError,
    );
  });
});

describe("sampleJointTrajectory", () => {
  it("holds the nearest sample outside the recorded range", () => {
    expect(sampleJointTrajectory(EPISODE, -5)).toEqual({ yaw: 0, lift: 0 });
    expect(sampleJointTrajectory(EPISODE, 99)).toEqual({ yaw: 1, lift: 0.5 });
  });

  it("returns exact samples at their timestamps", () => {
    expect(sampleJointTrajectory(EPISODE, 2)).toEqual({ yaw: 1, lift: -0.5 });
  });

  it("linearly interpolates every joint between samples", () => {
    const values = sampleJointTrajectory(EPISODE, 1);
    expect(values.yaw).toBeCloseTo(0.5, 12);
    expect(values.lift).toBeCloseTo(-0.25, 12);
    const late = sampleJointTrajectory(EPISODE, 2.5);
    expect(late.yaw).toBeCloseTo(1, 12);
    expect(late.lift).toBeCloseTo(0, 12);
  });

  it("rejects non-finite query times", () => {
    expect(() => sampleJointTrajectory(EPISODE, Number.NaN)).toThrow(TrajectoryValidationError);
  });
});
