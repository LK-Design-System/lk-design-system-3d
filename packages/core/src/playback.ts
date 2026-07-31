/**
 * Renderer-neutral playback clock for replaying recorded time ranges.
 *
 * The clock is a pure state machine: callers inject elapsed wall-clock deltas
 * and receive the next immutable state, so playback stays deterministic and
 * testable without any internal `Date.now()` access. Mapping the resulting
 * seconds onto a timestamped source (for example a frame graph or a joint
 * trajectory) is the consumer's job.
 */

export interface PlaybackRange {
  readonly startSeconds: number;
  readonly endSeconds: number;
}

/** `loop` wraps back to the range start; `hold-end` clamps and pauses. */
export type PlaybackEndBehavior = "loop" | "hold-end";

export interface PlaybackState {
  readonly range: PlaybackRange;
  readonly currentSeconds: number;
  readonly playing: boolean;
  /** Playback speed multiplier. Always a finite positive number. */
  readonly rate: number;
  readonly endBehavior: PlaybackEndBehavior;
}

export interface CreatePlaybackStateOptions {
  readonly playing?: boolean;
  readonly rate?: number;
  readonly endBehavior?: PlaybackEndBehavior;
  readonly currentSeconds?: number;
}

export class PlaybackValidationError extends RangeError {
  override readonly name = "PlaybackValidationError";
}

function assertFinite(value: number, label: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new PlaybackValidationError(`${label} must be a finite number.`);
  }
}

function assertValidRate(rate: number): void {
  assertFinite(rate, "rate");
  if (rate <= 0) {
    throw new PlaybackValidationError("rate must be greater than zero.");
  }
}

function assertValidRange(range: PlaybackRange): void {
  assertFinite(range.startSeconds, "range.startSeconds");
  assertFinite(range.endSeconds, "range.endSeconds");
  if (range.endSeconds <= range.startSeconds) {
    throw new PlaybackValidationError("range.endSeconds must be greater than range.startSeconds.");
  }
}

function clampToRange(range: PlaybackRange, seconds: number): number {
  return Math.min(range.endSeconds, Math.max(range.startSeconds, seconds));
}

function freezeState(state: PlaybackState): PlaybackState {
  return Object.freeze({
    ...state,
    range: Object.freeze({
      startSeconds: state.range.startSeconds,
      endSeconds: state.range.endSeconds,
    }),
  });
}

export function createPlaybackState(
  range: PlaybackRange,
  options: CreatePlaybackStateOptions = {},
): PlaybackState {
  assertValidRange(range);
  const rate = options.rate ?? 1;
  assertValidRate(rate);
  const endBehavior = options.endBehavior ?? "loop";
  if (endBehavior !== "loop" && (endBehavior as string) !== "hold-end") {
    throw new PlaybackValidationError("endBehavior must be 'loop' or 'hold-end'.");
  }
  const currentSeconds = options.currentSeconds ?? range.startSeconds;
  assertFinite(currentSeconds, "currentSeconds");
  return freezeState({
    range,
    currentSeconds: clampToRange(range, currentSeconds),
    playing: options.playing ?? false,
    rate,
    endBehavior,
  });
}

/**
 * Advances the clock by an elapsed wall-clock delta. A paused clock returns
 * the same state instance, so referential equality can gate downstream work.
 */
export function advancePlayback(state: PlaybackState, wallDeltaSeconds: number): PlaybackState {
  assertFinite(wallDeltaSeconds, "wallDeltaSeconds");
  if (wallDeltaSeconds < 0) {
    throw new PlaybackValidationError("wallDeltaSeconds must not be negative.");
  }
  if (!state.playing || wallDeltaSeconds === 0) return state;

  const advanced = state.currentSeconds + wallDeltaSeconds * state.rate;
  const { startSeconds, endSeconds } = state.range;
  if (advanced < endSeconds) {
    return freezeState({ ...state, currentSeconds: advanced });
  }
  if (state.endBehavior === "hold-end") {
    return freezeState({ ...state, currentSeconds: endSeconds, playing: false });
  }
  const duration = endSeconds - startSeconds;
  const wrapped = startSeconds + ((advanced - startSeconds) % duration);
  return freezeState({ ...state, currentSeconds: wrapped });
}

export function seekPlayback(state: PlaybackState, seconds: number): PlaybackState {
  assertFinite(seconds, "seconds");
  return freezeState({ ...state, currentSeconds: clampToRange(state.range, seconds) });
}

export function setPlaybackPlaying(state: PlaybackState, playing: boolean): PlaybackState {
  if (playing === state.playing) return state;
  if (
    playing &&
    state.endBehavior === "hold-end" &&
    state.currentSeconds >= state.range.endSeconds
  ) {
    // Resuming a clock held at the end restarts the range instead of
    // immediately re-pausing on the next advance.
    return freezeState({ ...state, playing: true, currentSeconds: state.range.startSeconds });
  }
  return freezeState({ ...state, playing });
}

export function setPlaybackRate(state: PlaybackState, rate: number): PlaybackState {
  assertValidRate(rate);
  if (rate === state.rate) return state;
  return freezeState({ ...state, rate });
}

/** Normalized position of the clock inside its range, in [0, 1]. */
export function playbackProgress(state: PlaybackState): number {
  const { startSeconds, endSeconds } = state.range;
  return (state.currentSeconds - startSeconds) / (endSeconds - startSeconds);
}
