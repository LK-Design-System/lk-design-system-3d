import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import type { EntityId, FrameId, Vec3 } from "@lk-robotics/design-system-3d-core";

import { threeToCorePosition } from "./coordinates.js";
import type { SceneCameraMode, SceneInteractionState } from "./state.js";
import type { SceneVisualTheme } from "./themes.js";

export interface ScenePointerDetail {
  readonly entityId: EntityId;
  readonly frame: FrameId;
  readonly pointInCore: Vec3;
  readonly distanceMeters: number;
  readonly instanceId?: number;
}

export interface SceneRuntimeValue {
  readonly frame: FrameId;
  readonly theme: SceneVisualTheme;
  readonly interaction: SceneInteractionState;
  readonly cameraMode: SceneCameraMode;
  readonly hover: (detail: ScenePointerDetail) => void;
  readonly leave: (entityId: EntityId) => void;
  readonly select: (detail: ScenePointerDetail) => void;
  readonly clearSelection: () => void;
  readonly requestCameraMode: (mode: Exclude<SceneCameraMode, "free">) => void;
}

const SceneRuntimeContext = createContext<SceneRuntimeValue | null>(null);

export interface SceneRuntimeProviderProps extends SceneRuntimeValue {
  readonly children: ReactNode;
}

export function SceneRuntimeProvider({ children, ...value }: SceneRuntimeProviderProps) {
  const stableValue = useMemo<SceneRuntimeValue>(
    () => value,
    [
      value.cameraMode,
      value.clearSelection,
      value.frame,
      value.hover,
      value.interaction,
      value.leave,
      value.requestCameraMode,
      value.select,
      value.theme,
    ],
  );
  return (
    <SceneRuntimeContext.Provider value={stableValue}>{children}</SceneRuntimeContext.Provider>
  );
}

export function useSceneRuntime(): SceneRuntimeValue {
  const value = useContext(SceneRuntimeContext);
  if (value === null) {
    throw new Error("useSceneRuntime must be used within SceneCanvas.");
  }
  return value;
}

function pointerDetail<TEvent extends MouseEvent | PointerEvent>(
  entityId: EntityId,
  event: ThreeEvent<TEvent>,
  frame: FrameId,
): ScenePointerDetail {
  const position: Vec3 = [event.point.x, event.point.y, event.point.z];
  return Object.freeze({
    entityId,
    frame,
    pointInCore: threeToCorePosition(position),
    distanceMeters: event.distance,
    ...(event.instanceId === undefined ? {} : { instanceId: event.instanceId }),
  });
}

export interface EntityInteractionBindings {
  readonly hovered: boolean;
  readonly selected: boolean;
  readonly onPointerOver: (event: ThreeEvent<PointerEvent>) => void;
  readonly onPointerOut: (event: ThreeEvent<PointerEvent>) => void;
  readonly onClick: (event: ThreeEvent<MouseEvent>) => void;
}

export function useEntityInteraction(
  entityId: EntityId,
  options: { readonly selectable?: boolean } = {},
): EntityInteractionBindings {
  const runtime = useSceneRuntime();
  return useMemo(
    () => ({
      hovered: runtime.interaction.hovered === entityId,
      selected: runtime.interaction.selected === entityId,
      onPointerOver(event: ThreeEvent<PointerEvent>): void {
        event.stopPropagation();
        runtime.hover(pointerDetail(entityId, event, runtime.frame));
      },
      onPointerOut(event: ThreeEvent<PointerEvent>): void {
        event.stopPropagation();
        runtime.leave(entityId);
      },
      onClick(event: ThreeEvent<MouseEvent>): void {
        event.stopPropagation();
        if (options.selectable !== false) {
          runtime.select(pointerDetail(entityId, event, runtime.frame));
        }
      },
    }),
    [entityId, options.selectable, runtime],
  );
}
