import { describe, expect, it } from "vitest";
import {
  clockId,
  frameId,
  quaternionFromYaw,
  rigidTransform3,
  timestamp,
} from "@lk-design-system/lds-3d-core";

import { FrameGraphValidationError, createFrameGraph, lookupFrameTransform } from "../src/index.js";

const CLOCK = clockId("ros-time");
const MAP = frameId("map");
const BASE = frameId("base-link");
const LIDAR = frameId("lidar-front");

function sample(
  source = LIDAR,
  target = BASE,
  sec = 10,
  translation: readonly [number, number, number] = [0, 0, 0],
  yaw = 0,
) {
  return {
    transform: rigidTransform3(source, target, translation, quaternionFromYaw(yaw)),
    timestamp: timestamp(CLOCK, sec, 0),
  } as const;
}

describe("frame graph", () => {
  it("resolves and inverts a multi-hop transform at an exact timestamp", () => {
    const graph = createFrameGraph([
      sample(LIDAR, BASE, 10, [0.5, 0, 0.8]),
      sample(BASE, MAP, 10, [2, 3, 0]),
    ]);

    const forward = lookupFrameTransform(graph, LIDAR, MAP, timestamp(CLOCK, 10, 0), {
      staleAfterSeconds: 0.5,
    });
    expect(forward.kind).toBe("ready");
    if (forward.kind !== "ready") return;
    expect(forward.path).toEqual([LIDAR, BASE, MAP]);
    expect(forward.transform.translation).toEqual([2.5, 3, 0.8]);
    expect(forward.mode).toBe("exact");

    const reverse = lookupFrameTransform(graph, MAP, LIDAR, timestamp(CLOCK, 10, 0), {
      staleAfterSeconds: 0.5,
    });
    expect(reverse.kind).toBe("ready");
    if (reverse.kind === "ready") expect(reverse.transform.translation).toEqual([-2.5, -3, -0.8]);
  });

  it("interpolates translation and quaternion between bracketing samples", () => {
    const graph = createFrameGraph([
      sample(BASE, MAP, 10, [0, 0, 0], 0),
      sample(BASE, MAP, 12, [2, 0, 0], Math.PI),
    ]);
    const result = lookupFrameTransform(graph, BASE, MAP, timestamp(CLOCK, 11, 0), {
      staleAfterSeconds: 0.5,
    });
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.mode).toBe("interpolated");
    expect(result.transform.translation).toEqual([1, 0, 0]);
    expect(result.transform.rotation[2]).toBeCloseTo(Math.SQRT1_2);
    expect(result.transform.rotation[3]).toBeCloseTo(Math.SQRT1_2);
  });

  it("distinguishes bounded hold-last, stale, and extrapolation", () => {
    const graph = createFrameGraph([sample(BASE, MAP, 10)]);
    const held = lookupFrameTransform(graph, BASE, MAP, timestamp(CLOCK, 10, 100_000_000), {
      staleAfterSeconds: 0.2,
      extrapolationLimitSeconds: 0.5,
    });
    expect(held.kind).toBe("ready");
    if (held.kind === "ready") expect(held.mode).toBe("held");

    const stale = lookupFrameTransform(graph, BASE, MAP, timestamp(CLOCK, 10, 300_000_000), {
      staleAfterSeconds: 0.2,
      extrapolationLimitSeconds: 0.5,
    });
    expect(stale.kind).toBe("stale");

    const extrapolated = lookupFrameTransform(graph, BASE, MAP, timestamp(CLOCK, 11, 0), {
      staleAfterSeconds: 0.2,
      extrapolationLimitSeconds: 0.5,
    });
    expect(extrapolated.kind).toBe("extrapolation");
    if (extrapolated.kind === "extrapolation") {
      expect(extrapolated.direction).toBe("after-history");
    }
  });

  it("reports before-history and clock mismatch without guessing", () => {
    const graph = createFrameGraph([sample(BASE, MAP, 10)]);
    expect(
      lookupFrameTransform(graph, BASE, MAP, timestamp(CLOCK, 9, 0), {
        staleAfterSeconds: 1,
      }).kind,
    ).toBe("extrapolation");
    expect(
      lookupFrameTransform(graph, BASE, MAP, timestamp(clockId("wall-time"), 10, 0), {
        staleAfterSeconds: 1,
      }).kind,
    ).toBe("clock-mismatch");
  });

  it("rejects multiple parents and cycles", () => {
    expect(() => createFrameGraph([sample(LIDAR, BASE), sample(LIDAR, MAP)])).toThrow(
      FrameGraphValidationError,
    );
    expect(() =>
      createFrameGraph([sample(LIDAR, BASE), sample(BASE, MAP), sample(MAP, LIDAR)]),
    ).toThrow(FrameGraphValidationError);
  });

  it("keeps static transforms valid across query time", () => {
    const graph = createFrameGraph([{ ...sample(LIDAR, BASE, 1, [0.4, 0, 0.7]), static: true }]);
    const result = lookupFrameTransform(graph, LIDAR, BASE, timestamp(CLOCK, 500, 0), {
      staleAfterSeconds: 0,
    });
    expect(result.kind).toBe("ready");
    if (result.kind === "ready") expect(result.mode).toBe("static");
  });
});
