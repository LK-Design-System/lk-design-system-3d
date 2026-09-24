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

/** Ground height sampler in core coordinates (+Z up), owned by the product's terrain data. */
export type PathGroundHeightSampler = (x: number, y: number) => number;

/**
 * Resamples a path every `spacingMeters` along its ground-plane length and
 * seats each sample on the ground plus `elevationMeters`, so a ribbon follows
 * terrain instead of floating at the height of its sparse input points.
 */
export function drapePathPoints(
  points: readonly (readonly [number, number, number])[],
  groundHeightAt: PathGroundHeightSampler,
  options: { readonly spacingMeters?: number; readonly elevationMeters?: number } = {},
): readonly (readonly [number, number, number])[] {
  const spacing = options.spacingMeters ?? 1;
  const elevation = options.elevationMeters ?? 0;
  if (!Number.isFinite(spacing) || spacing <= 0) {
    throw new RangeError("drape spacingMeters must be a positive finite number.");
  }
  if (!Number.isFinite(elevation)) throw new RangeError("drape elevationMeters must be finite.");
  const seat = (x: number, y: number): readonly [number, number, number] => {
    const height = groundHeightAt(x, y);
    if (!Number.isFinite(height))
      throw new RangeError("groundHeightAt must return a finite height.");
    return Object.freeze([x, y, height + elevation] as const);
  };
  const out: (readonly [number, number, number])[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index];
    if (start === undefined) continue;
    const end = points[index + 1];
    out.push(seat(start[0], start[1]));
    if (end === undefined) continue;
    const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
    const steps = Math.floor(length / spacing);
    for (let step = 1; step <= steps; step += 1) {
      const t = (step * spacing) / length;
      if (t >= 1) break;
      out.push(seat(start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t));
    }
  }
  return Object.freeze(out);
}

/**
 * Ribbon width that never renders thinner than `minimumPx` on screen. The
 * result is rounded up to quarter-octave steps so a moving camera rebuilds
 * the ribbon geometry only when the width changes noticeably.
 */
export function resolveMinimumScreenWidthMeters(
  widthMeters: number,
  minimumPx: number,
  distanceMeters: number,
  verticalFovRadians: number,
  viewportHeightPx: number,
): number {
  if (!Number.isFinite(widthMeters) || widthMeters <= 0) {
    throw new RangeError("widthMeters must be a positive finite number.");
  }
  if (
    !Number.isFinite(minimumPx) ||
    minimumPx <= 0 ||
    !Number.isFinite(distanceMeters) ||
    distanceMeters <= 0 ||
    !Number.isFinite(viewportHeightPx) ||
    viewportHeightPx <= 0
  ) {
    return widthMeters;
  }
  const metersPerPixel = (2 * distanceMeters * Math.tan(verticalFovRadians / 2)) / viewportHeightPx;
  const minimumMeters = minimumPx * metersPerPixel;
  if (minimumMeters <= widthMeters) return widthMeters;
  const step = 2 ** (Math.ceil(Math.log2(minimumMeters) * 4) / 4);
  return Math.max(widthMeters, step);
}
