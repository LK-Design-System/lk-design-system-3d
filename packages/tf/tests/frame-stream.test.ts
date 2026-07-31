import { describe, expect, it } from "vitest";
import {
  clockId,
  frameId,
  quaternionFromYaw,
  rigidTransform3,
  timestamp,
} from "@lk-robotics/lds-3d-core";

import {
  FrameGraphValidationError,
  appendFrameStreamSamples,
  createFrameStream,
  frameStreamGraph,
  latestFrameStreamTimestamp,
  lookupFrameTransform,
  pruneFrameStream,
} from "../src/index.js";

const CLOCK = clockId("ros-time");
const BASE = frameId("base-link");
const MAP = frameId("lk-map");
const LIDAR = frameId("lidar-front");

function baseSample(seconds: number, x: number) {
  return {
    transform: rigidTransform3(BASE, MAP, [x, 0, 0], quaternionFromYaw(0)),
    timestamp: timestamp(CLOCK, seconds, 0),
  };
}

describe("createFrameStream", () => {
  it("rejects invalid retention and per-edge caps", () => {
    expect(() => createFrameStream({ retentionSeconds: 0 })).toThrow(FrameGraphValidationError);
    expect(() => createFrameStream({ retentionSeconds: 5, maxSamplesPerEdge: 0 })).toThrow(
      FrameGraphValidationError,
    );
    expect(() => createFrameStream({ retentionSeconds: 5, maxSamplesPerEdge: 1.5 })).toThrow(
      FrameGraphValidationError,
    );
  });

  it("returns frozen values and never mutates the previous stream", () => {
    const empty = createFrameStream({ retentionSeconds: 5 });
    const appended = appendFrameStreamSamples(empty, [baseSample(1, 0.1)]);
    expect(Object.isFrozen(appended)).toBe(true);
    expect(empty.samples).toHaveLength(0);
    expect(appended.samples).toHaveLength(1);
    expect(appendFrameStreamSamples(appended, [])).toBe(appended);
  });
});

describe("appendFrameStreamSamples", () => {
  it("replaces a re-delivered (edge, timestamp) sample idempotently", () => {
    const stream = appendFrameStreamSamples(createFrameStream({ retentionSeconds: 10 }), [
      baseSample(1, 0.1),
      baseSample(1, 0.4),
    ]);
    expect(stream.samples).toHaveLength(1);
    expect(stream.samples[0]?.transform.translation[0]).toBe(0.4);
  });

  it("rejects mixing static and dynamic samples on one edge", () => {
    const stream = appendFrameStreamSamples(createFrameStream({ retentionSeconds: 10 }), [
      baseSample(1, 0.1),
    ]);
    expect(() =>
      appendFrameStreamSamples(stream, [{ ...baseSample(2, 0.2), static: true }]),
    ).toThrow(/cannot mix static and dynamic/u);
  });

  it("caps buffered dynamic samples per edge, dropping the oldest first", () => {
    const stream = appendFrameStreamSamples(
      createFrameStream({ retentionSeconds: 100, maxSamplesPerEdge: 2 }),
      [baseSample(1, 0.1), baseSample(2, 0.2), baseSample(3, 0.3)],
    );
    expect(stream.samples.map((sample) => sample.timestamp.sec)).toEqual([2, 3]);
  });
});

describe("pruneFrameStream", () => {
  it("drops dynamic samples beyond retention but keeps static and other clocks", () => {
    const stream = appendFrameStreamSamples(createFrameStream({ retentionSeconds: 3 }), [
      baseSample(1, 0.1),
      baseSample(6, 0.6),
      {
        transform: rigidTransform3(LIDAR, BASE, [0.4, 0, 0.7], quaternionFromYaw(0)),
        timestamp: timestamp(CLOCK, 1, 0),
        static: true,
      },
      {
        transform: rigidTransform3(frameId("cam"), BASE, [0, 0, 1], quaternionFromYaw(0)),
        timestamp: timestamp(clockId("wall-time"), 1, 0),
      },
    ]);
    const pruned = pruneFrameStream(stream, timestamp(CLOCK, 7, 0));
    const kinds = pruned.samples.map(
      (sample) => `${sample.transform.sourceFrame}@${String(sample.timestamp.sec)}`,
    );
    expect(kinds).toContain("base-link@6");
    expect(kinds).not.toContain("base-link@1");
    expect(kinds).toContain("lidar-front@1");
    expect(kinds).toContain("cam@1");
    expect(pruneFrameStream(pruned, timestamp(CLOCK, 7, 0))).toBe(pruned);
  });
});

describe("frameStreamGraph integration", () => {
  it("materializes lookups that interpolate, hold, then go stale as telemetry stops", () => {
    const stream = appendFrameStreamSamples(createFrameStream({ retentionSeconds: 30 }), [
      baseSample(1, 0.1),
      baseSample(2, 0.3),
    ]);
    const graph = frameStreamGraph(stream);
    const options = { staleAfterSeconds: 1.5, extrapolationLimitSeconds: 5 };

    const interpolated = lookupFrameTransform(
      graph,
      BASE,
      MAP,
      timestamp(CLOCK, 1, 500_000_000),
      options,
    );
    expect(interpolated.kind).toBe("ready");
    if (interpolated.kind === "ready") {
      expect(interpolated.mode).toBe("interpolated");
      expect(interpolated.transform.translation[0]).toBeCloseTo(0.2, 12);
    }

    const held = lookupFrameTransform(graph, BASE, MAP, timestamp(CLOCK, 3, 0), options);
    expect(held.kind).toBe("ready");
    if (held.kind === "ready") expect(held.mode).toBe("held");

    const stale = lookupFrameTransform(graph, BASE, MAP, timestamp(CLOCK, 4, 0), options);
    expect(stale.kind).toBe("stale");
  });

  it("reports the latest buffered dynamic timestamp per clock", () => {
    const stream = appendFrameStreamSamples(createFrameStream({ retentionSeconds: 30 }), [
      baseSample(1, 0.1),
      baseSample(4, 0.4),
    ]);
    expect(latestFrameStreamTimestamp(stream, CLOCK)?.sec).toBe(4);
    expect(latestFrameStreamTimestamp(stream, clockId("wall-time"))).toBeUndefined();
  });
});
