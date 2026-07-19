export type PathRibbonVariant = "actual" | "planned" | "executing" | "blocked";

export interface PathRibbonInterval {
  readonly start: number;
  readonly end: number;
}

export interface PathRibbonVisualState {
  readonly showBlockedBarriers: boolean;
  readonly showExecutionCursor: boolean;
  readonly surfacePattern: "solid" | "segmented";
}

export interface PathExecutionCursorMetrics {
  readonly arrowLength: number;
  readonly arrowWidth: number;
  readonly arrowHeight: number;
  readonly baseElevation: number;
}

export const STATIC_PATH_EXECUTION_PROGRESS = 0.55;

export function resolvePathRibbonVisualState(variant: PathRibbonVariant): PathRibbonVisualState {
  return Object.freeze({
    showBlockedBarriers: variant === "blocked",
    showExecutionCursor: variant === "executing",
    surfacePattern: variant === "planned" ? "segmented" : "solid",
  });
}

export function resolvePathExecutionCursorMetrics(width: number): PathExecutionCursorMetrics {
  if (!Number.isFinite(width) || width <= 0) {
    throw new RangeError("PathRibbon cursor width must be a positive finite number.");
  }
  return Object.freeze({
    arrowLength: Math.max(0.28, width * 1.75),
    arrowWidth: width * 0.82,
    arrowHeight: Math.max(0.032, width * 0.22),
    baseElevation: Math.max(0.012, width * 0.08),
  });
}

export function resolvePathExecutionProgress(elapsedSeconds: number, animated: boolean): number {
  if (!animated) return STATIC_PATH_EXECUTION_PROGRESS;
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    throw new RangeError("PathRibbon elapsedSeconds must be a non-negative finite number.");
  }
  return (elapsedSeconds * 0.16) % 1;
}

/** Returns arc-length-normalized ribbon intervals. Dash and gap lengths scale with path width. */
export function createPathRibbonIntervals(
  totalLength: number,
  width: number,
  pattern: PathRibbonVisualState["surfacePattern"],
): readonly PathRibbonInterval[] {
  if (!Number.isFinite(totalLength) || totalLength <= 0) {
    throw new RangeError("PathRibbon totalLength must be a positive finite number.");
  }
  if (!Number.isFinite(width) || width <= 0) {
    throw new RangeError("PathRibbon width must be a positive finite number.");
  }
  if (pattern === "solid") return Object.freeze([{ start: 0, end: 1 }]);

  const dashLength = width * 3;
  const gapLength = width * 1.5;
  const intervals: PathRibbonInterval[] = [];
  for (let distance = 0; distance < totalLength; distance += dashLength + gapLength) {
    intervals.push(
      Object.freeze({
        start: distance / totalLength,
        end: Math.min(distance + dashLength, totalLength) / totalLength,
      }),
    );
  }
  return Object.freeze(intervals);
}
