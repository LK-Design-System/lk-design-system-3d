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
