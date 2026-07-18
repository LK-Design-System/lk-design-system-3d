import { describe, expect, it } from "vitest";

import {
  coreToThreePosition,
  coreToThreeQuaternion,
  threeToCorePosition,
  threeToCoreQuaternion,
} from "../src/coordinates.js";

describe("shared core/Three basis", () => {
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

  it("round-trips a normalized orientation", () => {
    const source = [0, 0, Math.SQRT1_2, Math.SQRT1_2] as const;
    const result = threeToCoreQuaternion(coreToThreeQuaternion(source));

    expect(result[0]).toBeCloseTo(source[0], 12);
    expect(result[1]).toBeCloseTo(source[1], 12);
    expect(result[2]).toBeCloseTo(source[2], 12);
    expect(result[3]).toBeCloseTo(source[3], 12);
  });
});
