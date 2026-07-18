import { describe, expect, it } from "vitest";

import { resolveCameraMotionPolicy } from "../src/camera-motion.js";

describe("camera motion policy", () => {
  it("uses an instant preset transition when reduced motion is preferred", () => {
    expect(resolveCameraMotionPolicy(true, 8)).toEqual({ kind: "instant" });
  });

  it("keeps damped camera flight when motion is allowed", () => {
    expect(resolveCameraMotionPolicy(false, 8)).toEqual({ kind: "animated", speed: 8 });
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid transition speed %s",
    (speed) => {
      expect(() => resolveCameraMotionPolicy(false, speed)).toThrow(/finite positive/u);
    },
  );
});
