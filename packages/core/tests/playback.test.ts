import { describe, expect, it } from "vitest";

import {
  PlaybackValidationError,
  advancePlayback,
  createPlaybackState,
  playbackProgress,
  seekPlayback,
  setPlaybackPlaying,
  setPlaybackRate,
} from "../src/playback.js";

const RANGE = { startSeconds: 0, endSeconds: 8 };

describe("createPlaybackState", () => {
  it("starts paused at the range start with rate 1 and loop behavior", () => {
    const state = createPlaybackState(RANGE);
    expect(state).toMatchObject({
      currentSeconds: 0,
      playing: false,
      rate: 1,
      endBehavior: "loop",
    });
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.range)).toBe(true);
  });

  it("clamps the initial position into the range", () => {
    expect(createPlaybackState(RANGE, { currentSeconds: 99 }).currentSeconds).toBe(8);
    expect(createPlaybackState(RANGE, { currentSeconds: -1 }).currentSeconds).toBe(0);
  });

  it("rejects invalid ranges, rates, and end behaviors", () => {
    expect(() => createPlaybackState({ startSeconds: 2, endSeconds: 2 })).toThrow(
      PlaybackValidationError,
    );
    expect(() => createPlaybackState(RANGE, { rate: 0 })).toThrow(PlaybackValidationError);
    expect(() => createPlaybackState(RANGE, { rate: Number.NaN })).toThrow(PlaybackValidationError);
    expect(() => createPlaybackState(RANGE, { endBehavior: "bounce" as never })).toThrow(
      PlaybackValidationError,
    );
  });
});

describe("advancePlayback", () => {
  it("returns the same instance while paused so consumers can gate on identity", () => {
    const state = createPlaybackState(RANGE);
    expect(advancePlayback(state, 0.5)).toBe(state);
  });

  it("advances by delta times rate", () => {
    const state = createPlaybackState(RANGE, { playing: true, rate: 2 });
    expect(advancePlayback(state, 1.5).currentSeconds).toBeCloseTo(3, 12);
  });

  it("wraps in loop mode and keeps playing", () => {
    const state = createPlaybackState(RANGE, { playing: true, currentSeconds: 7 });
    const next = advancePlayback(state, 3);
    expect(next.currentSeconds).toBeCloseTo(2, 12);
    expect(next.playing).toBe(true);
  });

  it("clamps and pauses in hold-end mode", () => {
    const state = createPlaybackState(RANGE, {
      playing: true,
      currentSeconds: 7,
      endBehavior: "hold-end",
    });
    const next = advancePlayback(state, 5);
    expect(next.currentSeconds).toBe(8);
    expect(next.playing).toBe(false);
  });

  it("rejects negative and non-finite deltas", () => {
    const state = createPlaybackState(RANGE, { playing: true });
    expect(() => advancePlayback(state, -0.1)).toThrow(PlaybackValidationError);
    expect(() => advancePlayback(state, Number.NaN)).toThrow(PlaybackValidationError);
  });
});

describe("seek, play, and rate transitions", () => {
  it("seeks with clamping", () => {
    const state = createPlaybackState(RANGE);
    expect(seekPlayback(state, 4.25).currentSeconds).toBe(4.25);
    expect(seekPlayback(state, 100).currentSeconds).toBe(8);
  });

  it("restarts from the range start when resuming a clock held at the end", () => {
    const held = createPlaybackState(RANGE, {
      currentSeconds: 8,
      endBehavior: "hold-end",
    });
    const resumed = setPlaybackPlaying(held, true);
    expect(resumed.playing).toBe(true);
    expect(resumed.currentSeconds).toBe(0);
  });

  it("returns the same instance for no-op transitions", () => {
    const state = createPlaybackState(RANGE, { rate: 2 });
    expect(setPlaybackPlaying(state, false)).toBe(state);
    expect(setPlaybackRate(state, 2)).toBe(state);
  });

  it("reports normalized progress", () => {
    const state = createPlaybackState({ startSeconds: 2, endSeconds: 10 }, { currentSeconds: 6 });
    expect(playbackProgress(state)).toBeCloseTo(0.5, 12);
  });
});
