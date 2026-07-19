import {
  assertValidRigidTransform,
  framedPoint3,
  invertTransform,
  rigidTransform3,
  transformPoint,
  type FramedPoint3,
  type RigidTransform3,
  type Vec3,
} from "./coordinates.js";

/** Default maximum distance from the grid plane accepted by point lookups. */
export const DEFAULT_OCCUPANCY_GRID_PLANE_TOLERANCE_METERS = 1e-6;

export type OccupancyGridValidationCode =
  | "INVALID_DIMENSION"
  | "INVALID_RESOLUTION"
  | "INVALID_CELL"
  | "INVALID_IMAGE_PIXEL"
  | "INVALID_DATA_INDEX"
  | "INVALID_PLANE_TOLERANCE"
  | "INVALID_CELL_STATES"
  | "INVALID_REVISION";

export class OccupancyGridValidationError extends RangeError {
  override readonly name = "OccupancyGridValidationError";

  constructor(
    readonly code: OccupancyGridValidationCode,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Renderer-neutral geometry for a planar occupancy raster.
 *
 * The grid-local origin is the minimum corner of cell (0, 0), not its center.
 * Grid columns grow along local +X and rows grow along local +Y. The rigid
 * transform places that grid-local plane in an explicit target frame and must
 * preserve any source origin rotation.
 */
export interface OccupancyGridGeometry {
  readonly widthCells: number;
  readonly heightCells: number;
  readonly resolutionMeters: number;
  readonly gridToFrame: RigidTransform3;
}

/** Zero-based cell coordinates; row zero is the grid's minimum-Y row. */
export interface OccupancyGridCell {
  readonly column: number;
  readonly row: number;
}

/** Zero-based image coordinates; row zero is the top row of the source image. */
export interface OccupancyGridImagePixel {
  readonly column: number;
  readonly rowFromTop: number;
}

export interface OccupancyGridProjectionOptions {
  readonly planeToleranceMeters?: number;
}

/**
 * Explicit result of projecting a framed point into grid-local coordinates.
 * `cell` is present only when the point is both inside the half-open XY bounds
 * and within the requested grid-plane tolerance.
 */
export interface OccupancyGridProjection {
  readonly localPoint: FramedPoint3;
  readonly planeDistanceMeters: number;
  readonly withinGridBounds: boolean;
  readonly withinPlaneTolerance: boolean;
  readonly cell?: OccupancyGridCell;
}

/** Immutable semantic result captured from one accepted occupancy-grid hit. */
export interface OccupancyGridCellPick {
  readonly revision: OccupancyGridRevision;
  readonly cell: OccupancyGridCell;
  readonly imagePixel: OccupancyGridImagePixel;
  readonly dataIndex: number;
  readonly cellState: OccupancyGridCellState;
  readonly hitPoint: FramedPoint3;
  readonly cellCenter: FramedPoint3;
}

export const OCCUPANCY_GRID_CELL_UNKNOWN = 0;
export const OCCUPANCY_GRID_CELL_FREE = 1;
export const OCCUPANCY_GRID_CELL_OCCUPIED = 2;

export type OccupancyGridCellState =
  | typeof OCCUPANCY_GRID_CELL_UNKNOWN
  | typeof OCCUPANCY_GRID_CELL_FREE
  | typeof OCCUPANCY_GRID_CELL_OCCUPIED;
export type OccupancyGridRevision = string | number;
export type OccupancyGridBufferOwnership = "caller-retained";

export interface OccupancyGridSnapshotInput {
  readonly geometry: OccupancyGridGeometry;
  /** Normalized trinary states in grid row-major order, starting at cell (0, 0). */
  readonly cellStates: Uint8Array;
  /** Caller-defined immutable content revision used for GPU resource replacement. */
  readonly revision: OccupancyGridRevision;
}

/**
 * Validated immutable-by-replacement occupancy snapshot. LDS3D retains but
 * never mutates, clones, detaches, or disposes the caller-owned state buffer.
 */
export interface OccupancyGridSnapshot extends OccupancyGridSnapshotInput {
  readonly cellCount: number;
  readonly bufferOwnership: OccupancyGridBufferOwnership;
}

/**
 * Renderer-neutral picker bound to one validated immutable-by-replacement
 * snapshot. Creating the picker performs the O(cellCount) state validation;
 * each subsequent pick is O(1).
 */
export interface OccupancyGridCellPicker {
  readonly snapshot: OccupancyGridSnapshot;
  readonly revision: OccupancyGridRevision;
  pick(
    hitPoint: FramedPoint3,
    options?: OccupancyGridProjectionOptions,
  ): OccupancyGridCellPick | undefined;
}

function assertPositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new OccupancyGridValidationError(
      "INVALID_DIMENSION",
      `${label} must be a positive safe integer`,
    );
  }
}

function assertFinitePositive(
  value: number,
  label: string,
  code: OccupancyGridValidationCode,
): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new OccupancyGridValidationError(code, `${label} must be finite and greater than zero`);
  }
}

function assertFiniteNonNegative(
  value: number,
  label: string,
  code: OccupancyGridValidationCode,
): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new OccupancyGridValidationError(code, `${label} must be finite and non-negative`);
  }
}

function assertRevision(value: OccupancyGridRevision): void {
  if (typeof value === "string") {
    if (value.trim().length > 0) return;
  } else if (Number.isSafeInteger(value) && value >= 0) {
    return;
  }
  throw new OccupancyGridValidationError(
    "INVALID_REVISION",
    "occupancyGrid revision must be a non-empty string or a non-negative safe integer",
  );
}

function assertCellStates(cellStates: Uint8Array, expectedLength: number): void {
  if (!(cellStates instanceof Uint8Array) || cellStates.length !== expectedLength) {
    throw new OccupancyGridValidationError(
      "INVALID_CELL_STATES",
      `occupancyGrid.cellStates must be a Uint8Array with ${expectedLength.toString()} entries`,
    );
  }
  for (let index = 0; index < cellStates.length; index += 1) {
    const state = cellStates[index];
    if (
      state !== OCCUPANCY_GRID_CELL_UNKNOWN &&
      state !== OCCUPANCY_GRID_CELL_FREE &&
      state !== OCCUPANCY_GRID_CELL_OCCUPIED
    ) {
      throw new OccupancyGridValidationError(
        "INVALID_CELL_STATES",
        `occupancyGrid.cellStates[${index.toString()}] must be unknown (0), free (1), or occupied (2)`,
      );
    }
  }
}

function assertIndex(
  value: number,
  upperExclusive: number,
  label: string,
  code: OccupancyGridValidationCode,
): void {
  if (!Number.isSafeInteger(value) || value < 0 || value >= upperExclusive) {
    throw new OccupancyGridValidationError(
      code,
      `${label} must be a safe integer in [0, ${upperExclusive.toString()})`,
    );
  }
}

function immutableCell(column: number, row: number): OccupancyGridCell {
  return Object.freeze({ column, row });
}

function immutablePixel(column: number, rowFromTop: number): OccupancyGridImagePixel {
  return Object.freeze({ column, rowFromTop });
}

const OCCUPANCY_GRID_BOUNDARY_ULP_FACTOR = 32;
const OCCUPANCY_GRID_BOUNDARY_MAX_CELL_FRACTION = 1e-6;

function occupancyGridBoundaryToleranceMeters(
  geometry: OccupancyGridGeometry,
  point: FramedPoint3,
  widthMeters: number,
  heightMeters: number,
): number {
  const numericScale = Math.max(
    1,
    widthMeters,
    heightMeters,
    ...geometry.gridToFrame.translation.map(Math.abs),
    ...point.value.map(Math.abs),
  );
  const transformRoundoff = Number.EPSILON * numericScale * OCCUPANCY_GRID_BOUNDARY_ULP_FACTOR;
  return Math.min(
    transformRoundoff,
    geometry.resolutionMeters * OCCUPANCY_GRID_BOUNDARY_MAX_CELL_FRACTION,
  );
}

function snapOccupancyGridOuterBoundary(
  valueMeters: number,
  maximumMeters: number,
  toleranceMeters: number,
): number {
  if (Math.abs(valueMeters) <= toleranceMeters) return 0;
  if (Math.abs(valueMeters - maximumMeters) <= toleranceMeters) return maximumMeters;
  return valueMeters;
}

/** Validates dimensions, scale, and the complete framed placement transform. */
export function assertValidOccupancyGridGeometry(value: OccupancyGridGeometry): void {
  assertPositiveSafeInteger(value.widthCells, "occupancyGrid.widthCells");
  assertPositiveSafeInteger(value.heightCells, "occupancyGrid.heightCells");
  if (!Number.isSafeInteger(value.widthCells * value.heightCells)) {
    throw new OccupancyGridValidationError(
      "INVALID_DIMENSION",
      "occupancyGrid cell count must be a safe integer",
    );
  }
  assertFinitePositive(
    value.resolutionMeters,
    "occupancyGrid.resolutionMeters",
    "INVALID_RESOLUTION",
  );
  if (
    !Number.isFinite(value.widthCells * value.resolutionMeters) ||
    !Number.isFinite(value.heightCells * value.resolutionMeters)
  ) {
    throw new OccupancyGridValidationError(
      "INVALID_DIMENSION",
      "occupancyGrid metric extents must be finite",
    );
  }
  assertValidRigidTransform(value.gridToFrame);
}

/** Creates an immutable, detached occupancy-grid geometry contract. */
export function occupancyGridGeometry(value: OccupancyGridGeometry): OccupancyGridGeometry {
  assertValidOccupancyGridGeometry(value);
  const gridToFrame = rigidTransform3(
    value.gridToFrame.sourceFrame,
    value.gridToFrame.targetFrame,
    value.gridToFrame.translation,
    value.gridToFrame.rotation,
  );
  return Object.freeze({
    widthCells: value.widthCells,
    heightCells: value.heightCells,
    resolutionMeters: value.resolutionMeters,
    gridToFrame,
  });
}

/** Creates a validated snapshot while retaining the caller-owned state buffer. */
export function createOccupancyGridSnapshot(
  value: OccupancyGridSnapshotInput,
): OccupancyGridSnapshot {
  const geometry = occupancyGridGeometry(value.geometry);
  const cellCount = geometry.widthCells * geometry.heightCells;
  assertCellStates(value.cellStates, cellCount);
  assertRevision(value.revision);
  return Object.freeze({
    geometry,
    cellStates: value.cellStates,
    revision: value.revision,
    cellCount,
    bufferOwnership: "caller-retained",
  });
}

/** Revalidates a snapshot received across a package or product boundary. */
export function assertValidOccupancyGridSnapshot(value: OccupancyGridSnapshot): void {
  assertValidOccupancyGridGeometry(value.geometry);
  const expectedCellCount = value.geometry.widthCells * value.geometry.heightCells;
  assertCellStates(value.cellStates, expectedCellCount);
  assertRevision(value.revision);
  if (value.cellCount !== expectedCellCount) {
    throw new OccupancyGridValidationError(
      "INVALID_CELL_STATES",
      "occupancyGrid.cellCount must equal widthCells * heightCells",
    );
  }
  const bufferOwnership: unknown = value.bufferOwnership;
  if (bufferOwnership !== "caller-retained") {
    throw new OccupancyGridValidationError(
      "INVALID_CELL_STATES",
      'occupancyGrid.bufferOwnership must be "caller-retained"',
    );
  }
}

function stableValidatedOccupancyGridSnapshot(value: OccupancyGridSnapshot): OccupancyGridSnapshot {
  return Object.freeze({
    geometry: occupancyGridGeometry(value.geometry),
    cellStates: value.cellStates,
    revision: value.revision,
    cellCount: value.cellCount,
    bufferOwnership: "caller-retained",
  });
}

function assertValidCell(geometry: OccupancyGridGeometry, cell: OccupancyGridCell): void {
  assertIndex(cell.column, geometry.widthCells, "cell.column", "INVALID_CELL");
  assertIndex(cell.row, geometry.heightCells, "cell.row", "INVALID_CELL");
}

function assertValidImagePixel(
  geometry: OccupancyGridGeometry,
  pixel: OccupancyGridImagePixel,
): void {
  assertIndex(pixel.column, geometry.widthCells, "pixel.column", "INVALID_IMAGE_PIXEL");
  assertIndex(pixel.rowFromTop, geometry.heightCells, "pixel.rowFromTop", "INVALID_IMAGE_PIXEL");
}

/** Converts top-down image coordinates to bottom-up occupancy-grid cells. */
export function occupancyImagePixelToCell(
  geometry: OccupancyGridGeometry,
  pixel: OccupancyGridImagePixel,
): OccupancyGridCell {
  assertValidOccupancyGridGeometry(geometry);
  assertValidImagePixel(geometry, pixel);
  return immutableCell(pixel.column, geometry.heightCells - 1 - pixel.rowFromTop);
}

/** Converts bottom-up occupancy-grid cells to top-down image coordinates. */
export function occupancyCellToImagePixel(
  geometry: OccupancyGridGeometry,
  cell: OccupancyGridCell,
): OccupancyGridImagePixel {
  assertValidOccupancyGridGeometry(geometry);
  assertValidCell(geometry, cell);
  return immutablePixel(cell.column, geometry.heightCells - 1 - cell.row);
}

/** Returns the ROS-compatible row-major data index (`row * width + column`). */
export function occupancyCellDataIndex(
  geometry: OccupancyGridGeometry,
  cell: OccupancyGridCell,
): number {
  assertValidOccupancyGridGeometry(geometry);
  assertValidCell(geometry, cell);
  return cell.row * geometry.widthCells + cell.column;
}

/** Recovers a cell from a ROS-compatible row-major data index. */
export function occupancyDataIndexToCell(
  geometry: OccupancyGridGeometry,
  dataIndex: number,
): OccupancyGridCell {
  assertValidOccupancyGridGeometry(geometry);
  const cellCount = geometry.widthCells * geometry.heightCells;
  assertIndex(dataIndex, cellCount, "dataIndex", "INVALID_DATA_INDEX");
  const row = Math.floor(dataIndex / geometry.widthCells);
  return immutableCell(dataIndex - row * geometry.widthCells, row);
}

function localCellPoint(
  geometry: OccupancyGridGeometry,
  cell: OccupancyGridCell,
  offsetCells: 0 | 0.5,
): FramedPoint3 {
  assertValidOccupancyGridGeometry(geometry);
  assertValidCell(geometry, cell);
  const localValue: Vec3 = [
    (cell.column + offsetCells) * geometry.resolutionMeters,
    (cell.row + offsetCells) * geometry.resolutionMeters,
    0,
  ];
  return framedPoint3(geometry.gridToFrame.sourceFrame, localValue);
}

/** Returns the cell's minimum-X/minimum-Y corner in the target frame. */
export function occupancyCellMinimumCorner(
  geometry: OccupancyGridGeometry,
  cell: OccupancyGridCell,
): FramedPoint3 {
  return transformPoint(geometry.gridToFrame, localCellPoint(geometry, cell, 0));
}

/** Returns the cell center in the target frame, including the origin rotation. */
export function occupancyCellCenter(
  geometry: OccupancyGridGeometry,
  cell: OccupancyGridCell,
): FramedPoint3 {
  return transformPoint(geometry.gridToFrame, localCellPoint(geometry, cell, 0.5));
}

/** Converts a top-down image pixel directly to its cell center in the target frame. */
export function occupancyImagePixelCenter(
  geometry: OccupancyGridGeometry,
  pixel: OccupancyGridImagePixel,
): FramedPoint3 {
  return occupancyCellCenter(geometry, occupancyImagePixelToCell(geometry, pixel));
}

/**
 * Projects one target-frame point into grid-local coordinates without silently
 * accepting out-of-bounds or off-plane points.
 */
export function projectPointToOccupancyGrid(
  geometry: OccupancyGridGeometry,
  point: FramedPoint3,
  options: OccupancyGridProjectionOptions = {},
): OccupancyGridProjection {
  assertValidOccupancyGridGeometry(geometry);
  const planeToleranceMeters =
    options.planeToleranceMeters ?? DEFAULT_OCCUPANCY_GRID_PLANE_TOLERANCE_METERS;
  assertFiniteNonNegative(
    planeToleranceMeters,
    "options.planeToleranceMeters",
    "INVALID_PLANE_TOLERANCE",
  );

  const projectedLocalPoint = transformPoint(invertTransform(geometry.gridToFrame), point);
  const widthMeters = geometry.widthCells * geometry.resolutionMeters;
  const heightMeters = geometry.heightCells * geometry.resolutionMeters;
  const boundaryToleranceMeters = occupancyGridBoundaryToleranceMeters(
    geometry,
    point,
    widthMeters,
    heightMeters,
  );
  const xMeters = snapOccupancyGridOuterBoundary(
    projectedLocalPoint.value[0],
    widthMeters,
    boundaryToleranceMeters,
  );
  const yMeters = snapOccupancyGridOuterBoundary(
    projectedLocalPoint.value[1],
    heightMeters,
    boundaryToleranceMeters,
  );
  const zMeters = projectedLocalPoint.value[2];
  const localPoint = framedPoint3(projectedLocalPoint.frame, [xMeters, yMeters, zMeters]);
  const withinGridBounds =
    xMeters >= 0 && xMeters < widthMeters && yMeters >= 0 && yMeters < heightMeters;
  const planeDistanceMeters = Math.abs(zMeters);
  const withinPlaneTolerance = planeDistanceMeters <= planeToleranceMeters;

  let cell: OccupancyGridCell | undefined;
  if (withinGridBounds && withinPlaneTolerance) {
    cell = immutableCell(
      Math.floor(xMeters / geometry.resolutionMeters),
      Math.floor(yMeters / geometry.resolutionMeters),
    );
  }

  return Object.freeze({
    localPoint,
    planeDistanceMeters,
    withinGridBounds,
    withinPlaneTolerance,
    ...(cell === undefined ? {} : { cell }),
  });
}

/** Returns the containing cell only for an in-bounds point on the grid plane. */
export function occupancyPointToCell(
  geometry: OccupancyGridGeometry,
  point: FramedPoint3,
  options?: OccupancyGridProjectionOptions,
): OccupancyGridCell | undefined {
  return projectPointToOccupancyGrid(geometry, point, options).cell;
}

/** Returns the containing top-down image pixel for an accepted grid-plane point. */
export function occupancyPointToImagePixel(
  geometry: OccupancyGridGeometry,
  point: FramedPoint3,
  options?: OccupancyGridProjectionOptions,
): OccupancyGridImagePixel | undefined {
  const cell = occupancyPointToCell(geometry, point, options);
  return cell === undefined ? undefined : occupancyCellToImagePixel(geometry, cell);
}

/** Internal O(1) path for a snapshot already validated at a public boundary. */
function pickValidatedOccupancyGridCell(
  snapshot: OccupancyGridSnapshot,
  hitPoint: FramedPoint3,
  options?: OccupancyGridProjectionOptions,
): OccupancyGridCellPick | undefined {
  const cell = projectPointToOccupancyGrid(snapshot.geometry, hitPoint, options).cell;
  if (cell === undefined) return undefined;

  const dataIndex = occupancyCellDataIndex(snapshot.geometry, cell);
  const cellState = snapshot.cellStates[dataIndex] as OccupancyGridCellState;

  return Object.freeze({
    revision: snapshot.revision,
    cell,
    imagePixel: occupancyCellToImagePixel(snapshot.geometry, cell),
    dataIndex,
    cellState,
    hitPoint: framedPoint3(hitPoint.frame, hitPoint.value),
    cellCenter: occupancyCellCenter(snapshot.geometry, cell),
  });
}

/**
 * Validates and binds one snapshot for repeated pointer-rate cell lookups.
 * The caller-owned state buffer is retained, never copied or mutated, and must
 * continue to follow the snapshot contract's immutable-by-replacement rule.
 */
export function createOccupancyGridCellPicker(
  snapshot: OccupancyGridSnapshot,
): OccupancyGridCellPicker {
  assertValidOccupancyGridSnapshot(snapshot);
  const stableSnapshot = stableValidatedOccupancyGridSnapshot(snapshot);
  return Object.freeze({
    snapshot: stableSnapshot,
    revision: stableSnapshot.revision,
    pick(
      hitPoint: FramedPoint3,
      options?: OccupancyGridProjectionOptions,
    ): OccupancyGridCellPick | undefined {
      return pickValidatedOccupancyGridCell(stableSnapshot, hitPoint, options);
    },
  });
}

/**
 * Resolves an accepted surface hit to a stable occupancy-cell snapshot.
 * Out-of-bounds and off-plane hits return `undefined`; frame mismatches and
 * invalid snapshots remain explicit validation errors.
 */
export function pickOccupancyGridCell(
  snapshot: OccupancyGridSnapshot,
  hitPoint: FramedPoint3,
  options?: OccupancyGridProjectionOptions,
): OccupancyGridCellPick | undefined {
  assertValidOccupancyGridSnapshot(snapshot);
  return pickValidatedOccupancyGridCell(snapshot, hitPoint, options);
}
