/**
 * Screen-space label placement. The renderer projects each anchor to pixels;
 * this module decides which labels fit. Pure and deterministic.
 */

export interface ScreenLabelCandidate {
  readonly id: string;
  /** Higher wins a collision. Selected labels win over any priority. */
  readonly priority: number;
  /** Projected anchor in CSS pixels from the viewport's top-left, or null when behind the camera. */
  readonly anchor: { readonly x: number; readonly y: number } | null;
  readonly widthPx: number;
  readonly heightPx: number;
  /** Eye-to-anchor distance, used for the cut-off and to break priority ties (nearer first). */
  readonly distanceMeters: number;
  /** Hidden beyond this distance. Omit for no limit. */
  readonly maxDistanceMeters?: number;
  readonly selected?: boolean;
}

export type ScreenLabelAnchor = "center" | "bottom";

export interface ScreenLabelLayoutOptions {
  readonly viewport: { readonly width: number; readonly height: number };
  /** Where the anchor sits on the label box. `bottom` draws the label above its point. Default `bottom`. */
  readonly anchor?: ScreenLabelAnchor;
  /** Extra clearance kept around every placed label. Default 4 px. */
  readonly paddingPx?: number;
  /** Upper bound on visible labels. */
  readonly maxVisible?: number;
}

export type ScreenLabelHiddenReason = "behind" | "offscreen" | "distance" | "collision" | "limit";

export interface ScreenLabelPlacement {
  readonly id: string;
  /** Top-left of the label box in CSS pixels. */
  readonly x: number;
  readonly y: number;
  readonly widthPx: number;
  readonly heightPx: number;
}

export interface ScreenLabelLayout {
  readonly visible: readonly ScreenLabelPlacement[];
  readonly hidden: readonly { readonly id: string; readonly reason: ScreenLabelHiddenReason }[];
}

interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

function compareCandidates(a: ScreenLabelCandidate, b: ScreenLabelCandidate): number {
  const selected = Number(b.selected === true) - Number(a.selected === true);
  if (selected !== 0) return selected;
  if (b.priority !== a.priority) return b.priority - a.priority;
  if (a.distanceMeters !== b.distanceMeters) return a.distanceMeters - b.distanceMeters;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Greedy placement: selected first, then by priority, then nearest. A label is
 * dropped when its anchor is behind the camera, off screen, beyond its
 * distance limit, or when its box would overlap one already placed.
 */
export function layoutScreenLabels(
  candidates: readonly ScreenLabelCandidate[],
  options: ScreenLabelLayoutOptions,
): ScreenLabelLayout {
  const { width, height } = options.viewport;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new RangeError("viewport width and height must be finite positive numbers.");
  }
  const padding = options.paddingPx ?? 4;
  if (!Number.isFinite(padding) || padding < 0) {
    throw new RangeError("paddingPx must be a finite non-negative number.");
  }
  const maxVisible = options.maxVisible ?? Number.POSITIVE_INFINITY;
  const anchorMode = options.anchor ?? "bottom";
  const ids = new Set<string>();
  for (const candidate of candidates) {
    if (ids.has(candidate.id)) throw new RangeError(`Duplicate label id "${candidate.id}".`);
    ids.add(candidate.id);
    if (
      !Number.isFinite(candidate.widthPx) ||
      !Number.isFinite(candidate.heightPx) ||
      candidate.widthPx <= 0 ||
      candidate.heightPx <= 0
    ) {
      throw new RangeError(`Label "${candidate.id}" needs a finite positive size.`);
    }
  }

  const visible: ScreenLabelPlacement[] = [];
  const hidden: { readonly id: string; readonly reason: ScreenLabelHiddenReason }[] = [];
  const placedBoxes: Box[] = [];
  for (const candidate of [...candidates].sort(compareCandidates)) {
    const { anchor } = candidate;
    if (anchor === null || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) {
      hidden.push(Object.freeze({ id: candidate.id, reason: "behind" }));
      continue;
    }
    if (
      candidate.selected !== true &&
      candidate.maxDistanceMeters !== undefined &&
      candidate.distanceMeters > candidate.maxDistanceMeters
    ) {
      hidden.push(Object.freeze({ id: candidate.id, reason: "distance" }));
      continue;
    }
    const x = anchor.x - candidate.widthPx / 2;
    const y =
      anchorMode === "bottom" ? anchor.y - candidate.heightPx : anchor.y - candidate.heightPx / 2;
    if (x + candidate.widthPx < 0 || y + candidate.heightPx < 0 || x > width || y > height) {
      hidden.push(Object.freeze({ id: candidate.id, reason: "offscreen" }));
      continue;
    }
    if (visible.length >= maxVisible) {
      hidden.push(Object.freeze({ id: candidate.id, reason: "limit" }));
      continue;
    }
    const box: Box = {
      left: x - padding,
      top: y - padding,
      right: x + candidate.widthPx + padding,
      bottom: y + candidate.heightPx + padding,
    };
    if (placedBoxes.some((placed) => overlaps(placed, box))) {
      hidden.push(Object.freeze({ id: candidate.id, reason: "collision" }));
      continue;
    }
    placedBoxes.push(box);
    visible.push(
      Object.freeze({
        id: candidate.id,
        x,
        y,
        widthPx: candidate.widthPx,
        heightPx: candidate.heightPx,
      }),
    );
  }
  return Object.freeze({ visible: Object.freeze(visible), hidden: Object.freeze(hidden) });
}
