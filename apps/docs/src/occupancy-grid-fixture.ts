import {
  OCCUPANCY_GRID_CELL_FREE,
  OCCUPANCY_GRID_CELL_OCCUPIED,
  OCCUPANCY_GRID_CELL_UNKNOWN,
  bounds3,
  createOccupancyGridSnapshot,
  entityId,
  pose3,
  quaternionFromYaw,
  type GoalEntity,
  type OccupancyGridCellState,
  type PathEntity,
} from "@lk-design-system/lds-3d-core";
import {
  FIXTURE_FRAMES,
  ROTATED_OCCUPANCY_GRID_FIXTURE,
  type OccupancyGridFixtureCellState,
} from "@lk-design-system/lds-3d-testing";
import type { SceneCameraPose } from "@lk-design-system/lds-3d-r3f";

const CELL_STATE_CODES = Object.freeze({
  unknown: OCCUPANCY_GRID_CELL_UNKNOWN,
  free: OCCUPANCY_GRID_CELL_FREE,
  occupied: OCCUPANCY_GRID_CELL_OCCUPIED,
} satisfies Record<OccupancyGridFixtureCellState, OccupancyGridCellState>);

const cellStates = Uint8Array.from(
  ROTATED_OCCUPANCY_GRID_FIXTURE.cellStates,
  (state) => CELL_STATE_CODES[state],
);

/** Immutable-by-replacement snapshot used by the WebGL review stories. */
export const ROTATED_OCCUPANCY_GRID_SNAPSHOT = createOccupancyGridSnapshot({
  geometry: ROTATED_OCCUPANCY_GRID_FIXTURE.geometry,
  cellStates,
  revision: "rotated-occupancy-grid-v1",
});

/**
 * The +90 degree fixture spans core X 8.5..10 and core Y 20..22. The small Z
 * range leaves room for the path and goal primitives used in the scene story.
 */
export const OCCUPANCY_GRID_BOUNDS = bounds3(
  FIXTURE_FRAMES.core,
  [8.5, 20, 0],
  [10, 22, 0.8],
);

export const OCCUPANCY_GRID_HOME: SceneCameraPose = Object.freeze({
  position: Object.freeze([9.25, 21, 4.2] as const),
  target: Object.freeze([9.25, 21, 0] as const),
  up: Object.freeze([0, 1, 0] as const),
});

/** A path through three known-free cells, expressed only in the core frame. */
export const OCCUPANCY_GRID_FREE_PATH: PathEntity = Object.freeze({
  kind: "path",
  id: entityId("occupancy-grid-free-path"),
  frame: FIXTURE_FRAMES.core,
  points: Object.freeze([
    Object.freeze([9.25, 20.75, 0.04] as const),
    Object.freeze([8.75, 20.75, 0.04] as const),
    Object.freeze([8.75, 21.25, 0.04] as const),
  ]),
  widthMeters: 0.08,
});

export const OCCUPANCY_GRID_GOAL: GoalEntity = Object.freeze({
  kind: "goal",
  id: entityId("occupancy-grid-free-goal"),
  pose: pose3(
    FIXTURE_FRAMES.core,
    [8.75, 21.25, 0.07],
    quaternionFromYaw(Math.PI / 2),
  ),
  radiusMeters: 0.16,
});

export const OCCUPANCY_GRID_CELL_COUNTS = Object.freeze(
  ROTATED_OCCUPANCY_GRID_FIXTURE.cellStates.reduce(
    (counts, state) => ({ ...counts, [state]: counts[state] + 1 }),
    { unknown: 0, free: 0, occupied: 0 } satisfies Record<
      OccupancyGridFixtureCellState,
      number
    >,
  ),
);

export { FIXTURE_FRAMES, ROTATED_OCCUPANCY_GRID_FIXTURE };
