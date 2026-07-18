import {
  assetId,
  clockId,
  entityId,
  frameId,
  layerId,
  type AssetId,
  type ClockId,
  type EntityId,
  type FrameId,
  type LayerId,
  type Pose3,
} from "../src/index.js";

const frame = frameId("fixture-frame");
const entity = entityId("fixture-entity");
const asset = assetId("fixture-asset");
const layer = layerId("fixture-layer");
const clock = clockId("fixture-clock");

// @ts-expect-error Entity identifiers must not cross a spatial frame boundary.
const entityAsFrame: FrameId = entity;
// @ts-expect-error Asset identifiers must not be accepted as entity identifiers.
const assetAsEntity: EntityId = asset;
// @ts-expect-error Layer identifiers must not be accepted as asset identifiers.
const layerAsAsset: AssetId = layer;
// @ts-expect-error Frame identifiers must not be accepted as clock identifiers.
const frameAsClock: ClockId = frame;
// @ts-expect-error Raw strings must pass through the validated FrameId constructor.
const rawFrame: FrameId = "raw-frame";
const poseWithEntityFrame: Pose3 = {
  // @ts-expect-error Pose3.frame requires FrameId rather than an arbitrary branded identifier.
  frame: entity,
  position: [0, 0, 0],
  orientation: [0, 0, 0, 1],
};

const validBrands: readonly [FrameId, EntityId, AssetId, LayerId, ClockId] = [
  frame,
  entity,
  asset,
  layer,
  clock,
];

void [
  entityAsFrame,
  assetAsEntity,
  layerAsAsset,
  frameAsClock,
  rawFrame,
  poseWithEntityFrame,
  validBrands,
];
