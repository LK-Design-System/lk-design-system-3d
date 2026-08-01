import type { ReactNode } from "react";
import type {
  EntityId,
  GoalEntity,
  PathEntity,
  Quat,
  RobotEntity,
  Vec3,
} from "@lk-design-system/lds-3d-core";

import { VisualAlphaModel, type VisualAlphaModelKey } from "./models.js";
import { AmrRobot, GoalMarker, PathRibbon, type RobotVisualStatus } from "./primitives.js";

const IDENTITY: Quat = Object.freeze([0, 0, 0, 1]);

export interface VisualAlphaAssetPlacement {
  readonly assetKey: Exclude<VisualAlphaModelKey, "amr">;
  readonly entityId: EntityId;
  readonly position: Vec3;
  readonly orientation?: Quat;
  readonly scale?: number;
  readonly selectable?: boolean;
}

export interface AmrOperationalSceneProps {
  readonly robot: RobotEntity;
  readonly robotStatus?: RobotVisualStatus;
  readonly goal?: GoalEntity;
  readonly path?: PathEntity;
  readonly modelBasePath?: string;
  readonly useGlbRobot?: boolean;
  readonly assets?: readonly VisualAlphaAssetPlacement[];
  readonly children?: ReactNode;
}

/**
 * A complete operational AMR scene slice. With a modelBasePath it renders the
 * Visual Alpha GLBs; without one it keeps an interactive procedural AMR so the
 * scene remains useful while assets are loading or during tests.
 */
export function AmrOperationalScene({
  robot,
  robotStatus = "live",
  goal,
  path,
  modelBasePath,
  useGlbRobot = modelBasePath !== undefined,
  assets = [],
  children,
}: AmrOperationalSceneProps) {
  return (
    <>
      {path === undefined ? null : <PathRibbon entity={path} />}
      {goal === undefined ? null : <GoalMarker entity={goal} />}
      {useGlbRobot && modelBasePath !== undefined ? (
        <VisualAlphaModel
          assetKey="amr"
          entityId={robot.id}
          modelBasePath={modelBasePath}
          orientation={robot.pose.orientation}
          position={robot.pose.position}
          sourceConvention="core"
        />
      ) : (
        <AmrRobot entity={robot} status={robotStatus} />
      )}
      {modelBasePath === undefined
        ? null
        : assets.map((asset) => (
            <VisualAlphaModel
              key={asset.entityId}
              assetKey={asset.assetKey}
              entityId={asset.entityId}
              modelBasePath={modelBasePath}
              orientation={asset.orientation ?? IDENTITY}
              position={asset.position}
              scale={asset.scale ?? 1}
              selectable={asset.selectable ?? true}
              sourceConvention="core"
            />
          ))}
      {children}
    </>
  );
}
