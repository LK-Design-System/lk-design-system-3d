import type { AssetId, EntityId, LayerId } from "./identifiers.js";
import type { FrameId, Pose3, Vec3 } from "./coordinates.js";
import type { Timestamp } from "./time.js";

export { assetId, entityId, layerId } from "./identifiers.js";
export type { AssetId, EntityId, LayerId } from "./identifiers.js";

export interface RobotEntity {
  readonly kind: "robot";
  readonly id: EntityId;
  readonly pose: Pose3;
  readonly assetId?: AssetId;
  readonly layerId?: LayerId;
  readonly timestamp?: Timestamp;
}

/**
 * Renderer defaults for the optional sizes below. Every host draws with these
 * when the entity omits them — the three host used to fall back to a 0.3 m
 * goal and a 1 px path line while r3f drew 0.48 m and 0.16 m, so one scene
 * had two sizes depending on the host.
 */
export const DEFAULT_GOAL_RADIUS_METERS = 0.48;
export const DEFAULT_PATH_WIDTH_METERS = 0.16;

export interface GoalEntity {
  readonly kind: "goal";
  readonly id: EntityId;
  readonly pose: Pose3;
  readonly radiusMeters?: number;
  readonly layerId?: LayerId;
}

export interface PathEntity {
  readonly kind: "path";
  readonly id: EntityId;
  readonly frame: FrameId;
  readonly points: readonly Vec3[];
  readonly widthMeters?: number;
  readonly layerId?: LayerId;
}

export interface LandmarkEntity {
  readonly kind: "landmark";
  readonly id: EntityId;
  readonly pose: Pose3;
  readonly label?: string;
  readonly layerId?: LayerId;
}

export interface AssetEntity {
  readonly kind: "asset";
  readonly id: EntityId;
  readonly assetId: AssetId;
  /** Scene placement of an asset origin normalized to the core frame. */
  readonly pose: Pose3;
  readonly layerId?: LayerId;
  readonly pickable?: boolean;
  readonly selectable?: boolean;
}

export type P0SpatialEntity = AssetEntity | RobotEntity | GoalEntity | PathEntity | LandmarkEntity;
