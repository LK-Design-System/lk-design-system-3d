import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type ForwardedRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Canvas, useThree } from "@react-three/fiber";
import {
  FrameMismatchError,
  assertValidBounds3,
  assertValidFrameId,
  type Bounds3,
  type EntityId,
  type FrameId,
  type Vec3,
} from "@lk-robotics/lds-3d-core";

import { CameraRig } from "./CameraRig.js";
import { CoreSpace } from "./CoreSpace.js";
import { OrientationTriad } from "./OrientationTriad.js";
import { coreToThreePosition } from "./coordinates.js";
import { SceneEnvironment, SceneStateMarker, type SceneEnvironmentProps } from "./primitives.js";
import {
  DEFAULT_SCENE_RENDER_QUALITY,
  resolveSceneRenderQuality,
  type SceneFrameLoop,
  type SceneRenderQuality,
} from "./rendering.js";
import { SceneRuntimeProvider, type ScenePointerDetail } from "./runtime.js";
import {
  SCENE_CANVAS_KEYBOARD_INSTRUCTIONS,
  SCENE_CANVAS_ORBIT_KEY_SHORTCUTS,
  SCENE_CANVAS_PRESET_KEY_SHORTCUTS,
  resolveSceneCameraKeyboardEvent,
  type SceneCameraKeyboardCommand,
} from "./scene-keyboard.js";
import {
  DEFAULT_HOME_CAMERA_POSE,
  EMPTY_INTERACTION_STATE,
  reduceSceneInteraction,
  type SceneCameraMode,
  type SceneCameraPose,
  type SceneInteractionState,
  type SceneRenderState,
} from "./state.js";
import {
  resolveSceneTheme,
  type SceneThemeCustomization,
  type SceneVisualProfile,
  type SceneVisualTheme,
} from "./themes.js";

export type SceneCameraChangeSource = "toolbar" | "keyboard" | "user" | "api" | "prop";
export type { SceneFrameLoop, SceneRenderQuality } from "./rendering.js";

export interface SceneSelectionChange {
  readonly entityId: EntityId | null;
  readonly detail?: ScenePointerDetail;
}

export interface SceneHoverChange {
  readonly entityId: EntityId | null;
  readonly detail?: ScenePointerDetail;
}

export interface SceneOverlayContext {
  readonly frame: FrameId;
  readonly profile: SceneVisualProfile;
  readonly theme: SceneVisualTheme;
  readonly renderState: SceneRenderState;
  readonly cameraMode: SceneCameraMode;
  readonly selectedEntityId: EntityId | null;
  readonly hoveredEntityId: EntityId | null;
  readonly requestCameraMode: (mode: Exclude<SceneCameraMode, "free">) => void;
  readonly clearSelection: () => void;
  readonly retry?: () => void;
}

export interface SceneCanvasSnapshot {
  readonly frame: FrameId;
  readonly cameraMode: SceneCameraMode;
  readonly selectedEntityId: EntityId | null;
  readonly hoveredEntityId: EntityId | null;
  readonly renderState: SceneRenderState;
}

export interface SceneCanvasHandle {
  readonly setCameraMode: (mode: Exclude<SceneCameraMode, "free">) => void;
  readonly select: (entityId: EntityId | null) => void;
  readonly clearSelection: () => void;
  readonly getSnapshot: () => SceneCanvasSnapshot;
}

export interface SceneCanvasProps {
  readonly children?: ReactNode;
  /** The required LK-core frame for all spatial scene children and bounds. */
  readonly frame: FrameId;
  readonly profile?: SceneVisualProfile;
  readonly theme?: SceneVisualTheme;
  readonly themeCustomization?: SceneThemeCustomization;
  readonly renderState?: SceneRenderState;
  readonly cameraMode?: SceneCameraMode;
  readonly defaultCameraMode?: Exclude<SceneCameraMode, "free">;
  readonly homePose?: SceneCameraPose;
  readonly focusTarget?: Vec3;
  readonly focusBounds?: Bounds3;
  readonly topTarget?: Vec3;
  readonly topBounds?: Bounds3;
  readonly selectedEntityId?: EntityId | null;
  readonly defaultSelectedEntityId?: EntityId | null;
  readonly hoveredEntityId?: EntityId | null;
  /** Opt-in, non-interactive renderer diagnostic for non-ready states. */
  readonly showStatusOverlay?: boolean;
  readonly enableOrbit?: boolean;
  readonly environment?: SceneEnvironmentProps;
  /** Caller-owned composition slot for application controls and summaries. */
  readonly overlay?: ReactNode | ((context: SceneOverlayContext) => ReactNode);
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly ariaLabel?: string;
  /** ID(s) of caller-owned instructions or scene summary associated with the host. */
  readonly ariaDescribedBy?: string;
  /** Enables the documented camera keys while this intentionally focusable host owns focus. */
  readonly enableKeyboardCameraControls?: boolean;
  /**
   * Visual and GPU-cost preset. Defaults to demand-driven `balanced`;
   * `high` raises DPR and shadow resolution without restoring idle rendering.
   */
  readonly renderQuality?: SceneRenderQuality;
  /**
   * Overrides the quality profile's frame loop. `always` is an explicit opt-in
   * for caller-owned continuous animation; `demand` redraws only invalidated
   * frames while built-in camera motion and active primitive animations request
   * the frames they need.
   */
  readonly frameLoop?: SceneFrameLoop;
  readonly devicePixelRatio?: number | readonly [number, number];
  readonly onSelectionChange?: (change: SceneSelectionChange) => void;
  readonly onHoverChange?: (change: SceneHoverChange) => void;
  readonly onCameraModeChange?: (mode: SceneCameraMode, source: SceneCameraChangeSource) => void;
  readonly onCameraSettled?: (mode: Exclude<SceneCameraMode, "free">) => void;
  /** Exposed to the caller-owned overlay; SceneCanvas never renders a retry action. */
  readonly onRetry?: () => void;
}

const READY_STATE: SceneRenderState = Object.freeze({ kind: "ready" });

function assertCanvasBoundsFrame(
  bounds: Bounds3 | undefined,
  frame: FrameId,
  operation: string,
): void {
  if (bounds === undefined) return;
  assertValidBounds3(bounds);
  if (bounds.frame !== frame) {
    throw new FrameMismatchError(frame, bounds.frame, operation);
  }
}

function statusCopy(state: SceneRenderState): { readonly title: string; readonly detail?: string } {
  switch (state.kind) {
    case "ready":
      return { title: "Scene ready" };
    case "loading":
      return {
        title: state.label ?? "Loading 3D scene",
        ...(state.progress === undefined
          ? {}
          : { detail: `${Math.round(state.progress * 100).toString()}%` }),
      };
    case "empty":
      return {
        title: state.title ?? "No spatial data",
        ...(state.description === undefined ? {} : { detail: state.description }),
      };
    case "error":
      return { title: state.title ?? "3D scene unavailable", detail: state.message };
  }
}

interface DefaultStatusOverlayProps {
  readonly context: SceneOverlayContext;
}

/** Keeps a demand-driven R3F canvas renderable after a WebGL context restore. */
function ContextRecovery(): null {
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    const canvas = gl.domElement;
    const onContextLost = (event: Event): void => {
      // WebGL restoration is opt-in after a lost event.
      event.preventDefault();
    };
    const onContextRestored = (): void => {
      gl.resetState();
      invalidate();
    };

    canvas.addEventListener("webglcontextlost", onContextLost, false);
    canvas.addEventListener("webglcontextrestored", onContextRestored, false);
    return () => {
      canvas.removeEventListener("webglcontextlost", onContextLost, false);
      canvas.removeEventListener("webglcontextrestored", onContextRestored, false);
    };
  }, [gl, invalidate]);

  return null;
}

function DefaultStatusOverlay({ context }: DefaultStatusOverlayProps) {
  const { theme, renderState } = context;
  const copy = statusCopy(renderState);
  if (renderState.kind === "ready") return null;

  return (
    <div
      role={renderState.kind === "error" ? "alert" : "status"}
      aria-live="polite"
      aria-atomic="true"
      data-lkds3d-render-state={renderState.kind}
      style={{
        pointerEvents: "none",
        position: "absolute",
        left: "50%",
        top: "50%",
        width: "min(360px, calc(100% - 40px))",
        transform: "translate(-50%, -50%)",
        border: `1px solid ${theme.materials.panelBorder}`,
        borderRadius: 12,
        color: theme.materials.text,
        background: theme.materials.panel,
        boxShadow: `0 10px 30px ${theme.materials.shadow}`,
        padding: "16px 18px",
        textAlign: "center",
        font: "500 13px/1.45 system-ui, sans-serif",
      }}
    >
      <strong style={{ display: "block", fontSize: 14 }}>{copy.title}</strong>
      {copy.detail === undefined ? null : (
        <span style={{ display: "block", marginTop: 5, opacity: 0.75 }}>{copy.detail}</span>
      )}
      {renderState.kind === "loading" && renderState.progress !== undefined ? (
        <div
          aria-label="Loading progress"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={Math.round(renderState.progress * 100)}
          role="progressbar"
          style={{
            height: 4,
            marginTop: 12,
            overflow: "hidden",
            borderRadius: 99,
            background: theme.scene["grid.minor"],
          }}
        >
          <div
            style={{
              width: `${(renderState.progress * 100).toString()}%`,
              height: "100%",
              background: theme.materials.live,
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function SceneCanvasComponent(
  {
    children,
    frame,
    profile = "operational-neutral",
    theme,
    themeCustomization,
    renderState = READY_STATE,
    cameraMode,
    defaultCameraMode = "home",
    homePose = DEFAULT_HOME_CAMERA_POSE,
    focusTarget,
    focusBounds,
    topTarget,
    topBounds,
    selectedEntityId,
    defaultSelectedEntityId = null,
    hoveredEntityId,
    showStatusOverlay = false,
    enableOrbit = true,
    environment,
    overlay,
    className,
    style,
    ariaLabel = "Interactive 3D scene",
    ariaDescribedBy,
    enableKeyboardCameraControls = true,
    renderQuality = DEFAULT_SCENE_RENDER_QUALITY,
    frameLoop,
    devicePixelRatio,
    onSelectionChange,
    onHoverChange,
    onCameraModeChange,
    onCameraSettled,
    onRetry,
  }: SceneCanvasProps,
  ref: ForwardedRef<SceneCanvasHandle>,
) {
  assertValidFrameId(frame);
  assertCanvasBoundsFrame(focusBounds, frame, "SceneCanvas.focusBounds");
  assertCanvasBoundsFrame(topBounds, frame, "SceneCanvas.topBounds");
  const resolvedTheme = useMemo(
    () => resolveSceneTheme(theme ?? profile, themeCustomization),
    [profile, theme, themeCustomization],
  );
  const resolvedRenderQuality = useMemo(
    () =>
      resolveSceneRenderQuality(renderQuality, {
        ...(devicePixelRatio === undefined ? {} : { devicePixelRatio }),
        ...(frameLoop === undefined ? {} : { frameLoop }),
        ...(environment?.shadowMapSize === undefined
          ? {}
          : { shadowMapSize: environment.shadowMapSize }),
      }),
    [devicePixelRatio, environment?.shadowMapSize, frameLoop, renderQuality],
  );
  const resolvedEnvironment = useMemo<SceneEnvironmentProps>(
    () => ({ ...environment, shadowMapSize: resolvedRenderQuality.shadowMapSize }),
    [environment, resolvedRenderQuality.shadowMapSize],
  );
  const [internalInteraction, setInternalInteraction] = useState<SceneInteractionState>(() =>
    Object.freeze({ ...EMPTY_INTERACTION_STATE, selected: defaultSelectedEntityId }),
  );
  const interaction = useMemo<SceneInteractionState>(
    () =>
      Object.freeze({
        selected: selectedEntityId === undefined ? internalInteraction.selected : selectedEntityId,
        hovered: hoveredEntityId === undefined ? internalInteraction.hovered : hoveredEntityId,
      }),
    [hoveredEntityId, internalInteraction, selectedEntityId],
  );
  const [internalCameraMode, setInternalCameraMode] = useState<SceneCameraMode>(defaultCameraMode);
  const resolvedCameraMode = cameraMode ?? internalCameraMode;
  const [hostFocused, setHostFocused] = useState(false);
  const keyboardInstructionsId = useId();
  const keyboardInstructions = enableKeyboardCameraControls
    ? enableOrbit
      ? SCENE_CANVAS_KEYBOARD_INSTRUCTIONS
      : "Camera keys: Home resets the view, T shows Top, and F focuses the target."
    : undefined;
  const describedBy =
    [keyboardInstructions === undefined ? undefined : keyboardInstructionsId, ariaDescribedBy]
      .filter((id): id is string => id !== undefined && id.length > 0)
      .join(" ") || undefined;
  const keyboardSequence = useRef(0);
  const [keyboardCommand, setKeyboardCommand] = useState<{
    readonly sequence: number;
    readonly command: Exclude<SceneCameraKeyboardCommand, { readonly kind: "preset" }>;
  }>();

  const select = useCallback(
    (detail: ScenePointerDetail): void => {
      if (selectedEntityId === undefined) {
        setInternalInteraction((current) =>
          reduceSceneInteraction(current, { type: "select", entityId: detail.entityId }),
        );
      }
      onSelectionChange?.({ entityId: detail.entityId, detail });
    },
    [onSelectionChange, selectedEntityId],
  );
  const selectById = useCallback(
    (entityId: EntityId | null): void => {
      if (selectedEntityId === undefined) {
        setInternalInteraction((current) =>
          entityId === null
            ? reduceSceneInteraction(current, { type: "clear-selection" })
            : reduceSceneInteraction(current, { type: "select", entityId }),
        );
      }
      onSelectionChange?.({ entityId });
    },
    [onSelectionChange, selectedEntityId],
  );
  const clearSelection = useCallback((): void => selectById(null), [selectById]);
  const hover = useCallback(
    (detail: ScenePointerDetail): void => {
      if (hoveredEntityId === undefined) {
        setInternalInteraction((current) =>
          reduceSceneInteraction(current, { type: "hover", entityId: detail.entityId }),
        );
      }
      onHoverChange?.({ entityId: detail.entityId, detail });
    },
    [hoveredEntityId, onHoverChange],
  );
  const leave = useCallback(
    (entityId: EntityId): void => {
      if (interaction.hovered !== entityId) return;
      if (hoveredEntityId === undefined) {
        setInternalInteraction((current) =>
          reduceSceneInteraction(current, { type: "leave", entityId }),
        );
      }
      onHoverChange?.({ entityId: null });
    },
    [hoveredEntityId, interaction.hovered, onHoverChange],
  );
  const requestCameraMode = useCallback(
    (mode: Exclude<SceneCameraMode, "free">, source: SceneCameraChangeSource = "api"): void => {
      if (cameraMode === undefined) setInternalCameraMode(mode);
      onCameraModeChange?.(mode, source);
    },
    [cameraMode, onCameraModeChange],
  );
  const markFreeCamera = useCallback(
    (source: "keyboard" | "user"): void => {
      if (cameraMode === undefined) setInternalCameraMode("free");
      onCameraModeChange?.("free", source);
    },
    [cameraMode, onCameraModeChange],
  );
  const requestCameraFromToolbar = useCallback(
    (mode: Exclude<SceneCameraMode, "free">): void => requestCameraMode(mode, "toolbar"),
    [requestCameraMode],
  );
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>): void => {
      if (
        !enableKeyboardCameraControls ||
        event.nativeEvent.isComposing ||
        event.key === "Process"
      ) {
        return;
      }
      const command = resolveSceneCameraKeyboardEvent({
        key: event.key,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        isComposing: event.nativeEvent.isComposing,
        defaultPrevented: event.defaultPrevented,
        target: event.target,
        currentTarget: event.currentTarget,
        activeElement: event.currentTarget.ownerDocument.activeElement,
        enableOrbit,
      });
      if (command === null) return;
      event.preventDefault();
      event.stopPropagation();
      if (command.kind === "preset") {
        requestCameraMode(command.mode, "keyboard");
        return;
      }
      keyboardSequence.current += 1;
      setKeyboardCommand({ sequence: keyboardSequence.current, command });
    },
    [enableKeyboardCameraControls, enableOrbit, requestCameraMode],
  );
  const handleBlur = useCallback((event: FocusEvent<HTMLDivElement>): void => {
    if (!event.currentTarget.contains(event.relatedTarget)) setHostFocused(false);
  }, []);

  const snapshot = useMemo<SceneCanvasSnapshot>(
    () => ({
      frame,
      cameraMode: resolvedCameraMode,
      selectedEntityId: interaction.selected,
      hoveredEntityId: interaction.hovered,
      renderState,
    }),
    [frame, interaction.hovered, interaction.selected, renderState, resolvedCameraMode],
  );
  useImperativeHandle(
    ref,
    () => ({
      setCameraMode(mode): void {
        requestCameraMode(mode, "api");
      },
      select: selectById,
      clearSelection,
      getSnapshot(): SceneCanvasSnapshot {
        return snapshot;
      },
    }),
    [clearSelection, requestCameraMode, selectById, snapshot],
  );

  const overlayContext = useMemo<SceneOverlayContext>(
    () => ({
      frame,
      profile: resolvedTheme.id,
      theme: resolvedTheme,
      renderState,
      cameraMode: resolvedCameraMode,
      selectedEntityId: interaction.selected,
      hoveredEntityId: interaction.hovered,
      requestCameraMode: requestCameraFromToolbar,
      clearSelection,
      ...(onRetry === undefined ? {} : { retry: onRetry }),
    }),
    [
      clearSelection,
      frame,
      interaction.hovered,
      interaction.selected,
      onRetry,
      renderState,
      requestCameraFromToolbar,
      resolvedCameraMode,
      resolvedTheme,
    ],
  );
  const initialCameraPosition = coreToThreePosition(homePose.position);
  const rootStyle: CSSProperties = {
    position: "relative",
    width: "100%",
    minHeight: 320,
    overflow: "hidden",
    borderRadius: 12,
    background: resolvedTheme.scene["scene.background"],
    ...style,
    outline: hostFocused
      ? `3px solid ${resolvedTheme.materials.selection}`
      : "3px solid transparent",
    outlineOffset: 2,
  };

  return (
    <div
      aria-describedby={describedBy}
      aria-keyshortcuts={
        enableKeyboardCameraControls
          ? enableOrbit
            ? `${SCENE_CANVAS_PRESET_KEY_SHORTCUTS} ${SCENE_CANVAS_ORBIT_KEY_SHORTCUTS}`
            : SCENE_CANVAS_PRESET_KEY_SHORTCUTS
          : undefined
      }
      aria-label={ariaLabel}
      className={className}
      data-lkds3d-profile={resolvedTheme.id}
      role="application"
      style={rootStyle}
      tabIndex={0}
      onBlur={handleBlur}
      onFocus={() => setHostFocused(true)}
      onKeyDown={handleKeyDown}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget || event.target instanceof HTMLCanvasElement) {
          event.currentTarget.focus({ preventScroll: true });
        }
      }}
    >
      {keyboardInstructions === undefined ? null : (
        <span
          id={keyboardInstructionsId}
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: "hidden",
            clip: "rect(0, 0, 0, 0)",
            whiteSpace: "nowrap",
            border: 0,
          }}
        >
          {keyboardInstructions}
        </span>
      )}
      <Canvas
        camera={{
          far: 200,
          fov: 42,
          near: 0.05,
          position: [initialCameraPosition[0], initialCameraPosition[1], initialCameraPosition[2]],
          up: [0, 1, 0],
        }}
        dpr={
          typeof resolvedRenderQuality.devicePixelRatio === "number"
            ? resolvedRenderQuality.devicePixelRatio
            : [resolvedRenderQuality.devicePixelRatio[0], resolvedRenderQuality.devicePixelRatio[1]]
        }
        fallback={<div role="alert">WebGL is unavailable in this browser.</div>}
        frameloop={resolvedRenderQuality.frameLoop}
        gl={{
          alpha: false,
          antialias: resolvedRenderQuality.antialias,
          powerPreference: resolvedRenderQuality.powerPreference,
        }}
        onPointerMissed={clearSelection}
        shadows={resolvedRenderQuality.shadows}
        style={{ display: "block", minHeight: 320, width: "100%", height: "100%" }}
      >
        <ContextRecovery />
        <SceneRuntimeProvider
          cameraMode={resolvedCameraMode}
          clearSelection={clearSelection}
          frame={frame}
          hover={hover}
          interaction={interaction}
          leave={leave}
          requestCameraMode={requestCameraFromToolbar}
          select={select}
          theme={resolvedTheme}
        >
          <CameraRig
            mode={resolvedCameraMode}
            homePose={homePose}
            enableOrbit={enableOrbit}
            {...(keyboardCommand === undefined ? {} : { keyboardCommand })}
            onManualControl={markFreeCamera}
            {...(focusTarget === undefined ? {} : { focusTarget })}
            {...(focusBounds === undefined ? {} : { focusBounds })}
            {...(topTarget === undefined ? {} : { topTarget })}
            {...(topBounds === undefined ? {} : { topBounds })}
            {...(onCameraSettled === undefined ? {} : { onSettled: onCameraSettled })}
          />
          <SceneEnvironment {...resolvedEnvironment} />
          <OrientationTriad />
          <CoreSpace>
            {renderState.kind === "ready" ? children : <SceneStateMarker state={renderState} />}
          </CoreSpace>
        </SceneRuntimeProvider>
      </Canvas>
      {showStatusOverlay || overlay !== undefined ? (
        <div
          data-lkds3d-overlay="true"
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        >
          {showStatusOverlay ? <DefaultStatusOverlay context={overlayContext} /> : null}
          {typeof overlay === "function" ? overlay(overlayContext) : overlay}
        </div>
      ) : null}
    </div>
  );
}

export const SceneCanvas = forwardRef(SceneCanvasComponent);
SceneCanvas.displayName = "SceneCanvas";
