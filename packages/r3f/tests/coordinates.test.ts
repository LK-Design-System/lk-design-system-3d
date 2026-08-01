import { describe, expect, it } from "vitest";
import type { Quat, Vec3 } from "@lk-design-system/lds-3d-core";

import {
  coreToThreePosition,
  coreToThreeQuaternion,
  threeToCorePosition,
  threeToCoreQuaternion,
} from "../src/coordinates.js";

describe("core/Three basis", () => {
  it.each([
    [
      [1, 0, 0],
      [0, 0, -1],
    ],
    [
      [0, 1, 0],
      [-1, 0, 0],
    ],
    [
      [0, 0, 1],
      [0, 1, 0],
    ],
  ] as const)("maps %j to %j", (core, three) => {
    expect(coreToThreePosition(core)).toEqual(three);
    expect(threeToCorePosition(three)).toEqual(core);
  });

  it("round-trips arbitrary positions", () => {
    const value: Vec3 = [12.25, -3.5, 0.72];
    expect(threeToCorePosition(coreToThreePosition(value))).toEqual(value);
  });

  it("round-trips normalized orientations", () => {
    const value: Quat = [0, 0, Math.SQRT1_2, Math.SQRT1_2];
    const roundTrip = threeToCoreQuaternion(coreToThreeQuaternion(value));
    expect(roundTrip[0]).toBeCloseTo(value[0], 12);
    expect(roundTrip[1]).toBeCloseTo(value[1], 12);
    expect(roundTrip[2]).toBeCloseTo(value[2], 12);
    expect(roundTrip[3]).toBeCloseTo(value[3], 12);
  });

  it("rejects a zero quaternion", () => {
    expect(() => coreToThreeQuaternion([0, 0, 0, 0])).toThrow(/non-zero norm/u);
  });
});
