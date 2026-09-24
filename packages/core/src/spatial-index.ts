/**
 * A uniform grid over the ground plane for narrowing picking and proximity
 * queries on large, mostly static scenes (thousands of trees or structures)
 * before an exact renderer test. Pure; items are identified by id.
 */

export interface GroundBounds2 {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface SpatialGridItem {
  readonly id: string;
  readonly bounds: GroundBounds2;
}

export interface SpatialGrid2 {
  readonly cellSizeMeters: number;
  readonly size: number;
  /** Ids whose bounds overlap `bounds`, in insertion order, without duplicates. */
  queryBounds(bounds: GroundBounds2): readonly string[];
  /** Ids whose bounds the segment from (x0, y0) to (x1, y1) touches. */
  querySegment(x0: number, y0: number, x1: number, y1: number): readonly string[];
}

function assertBounds(bounds: GroundBounds2, label: string): void {
  const values = [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY];
  if (values.some((value) => !Number.isFinite(value))) {
    throw new RangeError(`${label} must be finite.`);
  }
  if (bounds.maxX < bounds.minX || bounds.maxY < bounds.minY) {
    throw new RangeError(`${label} max must not be less than min.`);
  }
}

function boundsOverlap(a: GroundBounds2, b: GroundBounds2): boolean {
  return a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;
}

// Liang–Barsky clip of a segment against an axis-aligned box.
function segmentTouchesBounds(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  bounds: GroundBounds2,
): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const checks: readonly (readonly [number, number])[] = [
    [-dx, x0 - bounds.minX],
    [dx, bounds.maxX - x0],
    [-dy, y0 - bounds.minY],
    [dy, bounds.maxY - y0],
  ];
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return true;
}

export function createSpatialGrid2(
  items: readonly SpatialGridItem[],
  cellSizeMeters: number,
): SpatialGrid2 {
  if (!Number.isFinite(cellSizeMeters) || cellSizeMeters <= 0) {
    throw new RangeError("cellSizeMeters must be a finite positive number.");
  }
  const byId = new Map<string, { readonly order: number; readonly bounds: GroundBounds2 }>();
  const cells = new Map<string, string[]>();
  const cell = (value: number): number => Math.floor(value / cellSizeMeters);
  const key = (cx: number, cy: number): string => `${cx.toString()}:${cy.toString()}`;

  items.forEach((item, order) => {
    if (item.id.trim() === "") throw new RangeError("Spatial grid item id must be non-empty.");
    if (byId.has(item.id)) throw new RangeError(`Duplicate spatial grid item id "${item.id}".`);
    assertBounds(item.bounds, `item "${item.id}" bounds`);
    const bounds = Object.freeze({ ...item.bounds });
    byId.set(item.id, { order, bounds });
    for (let cx = cell(bounds.minX); cx <= cell(bounds.maxX); cx += 1) {
      for (let cy = cell(bounds.minY); cy <= cell(bounds.maxY); cy += 1) {
        const bucket = cells.get(key(cx, cy));
        if (bucket === undefined) cells.set(key(cx, cy), [item.id]);
        else bucket.push(item.id);
      }
    }
  });

  const collect = (
    region: GroundBounds2,
    accept: (bounds: GroundBounds2) => boolean,
  ): readonly string[] => {
    const found = new Set<string>();
    for (let cx = cell(region.minX); cx <= cell(region.maxX); cx += 1) {
      for (let cy = cell(region.minY); cy <= cell(region.maxY); cy += 1) {
        for (const id of cells.get(key(cx, cy)) ?? []) {
          if (found.has(id)) continue;
          const entry = byId.get(id);
          if (entry !== undefined && accept(entry.bounds)) found.add(id);
        }
      }
    }
    return Object.freeze(
      [...found].sort((a, b) => (byId.get(a)?.order ?? 0) - (byId.get(b)?.order ?? 0)),
    );
  };

  return Object.freeze({
    cellSizeMeters,
    size: byId.size,
    queryBounds(bounds: GroundBounds2): readonly string[] {
      assertBounds(bounds, "query bounds");
      return collect(bounds, (candidate) => boundsOverlap(candidate, bounds));
    },
    querySegment(x0: number, y0: number, x1: number, y1: number): readonly string[] {
      if (![x0, y0, x1, y1].every(Number.isFinite)) {
        throw new RangeError("segment coordinates must be finite.");
      }
      const region = {
        minX: Math.min(x0, x1),
        minY: Math.min(y0, y1),
        maxX: Math.max(x0, x1),
        maxY: Math.max(y0, y1),
      };
      return collect(region, (candidate) => segmentTouchesBounds(x0, y0, x1, y1, candidate));
    },
  });
}
