import { type AssetLoader, type AssetOwnershipToken } from "@lk-robotics/design-system-3d-assets";
import {
  computeFocusCameraState,
  computeTopCameraState,
  createCameraState,
  createPickRay,
  framedPoint3,
  type AssetId,
  type Bounds3,
  type CameraCancellationReason,
  type CameraOperationResult,
  type CameraRigConfig,
  type CameraRigPort,
  type CameraState,
  type EntityId,
  type FramedPoint3,
  type LayerId,
  type P0SpatialEntity,
  type PickHit,
  type PickRequest,
  type RendererCapabilities,
  type RendererStatus,
  type SceneThemeOverrides,
  type SceneThemeValues,
  type SpatialEvent,
} from "@lk-robotics/design-system-3d-core";
import {
  AmbientLight,
  DirectionalLight,
  Group,
  OrthographicCamera,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector3,
  WebGLRenderer,
  type Camera,
  type Object3D,
} from "three";

import {
  CORE_TO_THREE_BASIS_QUATERNION,
  coreToThreePosition,
  threeToCorePosition,
} from "./coordinates.js";
import { type ThreeAssetHandle } from "./asset-resource.js";
import {
  consumeThreeAssetOwnership,
  createThreeVisualInstance,
  type ThreeResolvedAsset,
  type ThreeVisualInstance,
} from "./runtime.js";

export type ThreeRenderMode = "always" | "demand";

export interface ThreeSceneHostOptions {
  readonly canvas: HTMLCanvasElement;
  readonly frame: CameraState["frame"];
  readonly camera: CameraRigConfig;
  readonly renderMode?: ThreeRenderMode;
  readonly theme?: SceneThemeOverrides;
  readonly assetLoader?: AssetLoader<ThreeAssetHandle>;
}

export interface ThreeDisposalReport {
  readonly remainingGeometries: number;
  readonly remainingMaterials: number;
  readonly remainingTextures: number;
  readonly remainingListeners: number;
  readonly remainingAnimationLoops: number;
  readonly remainingPendingLoads: number;
}

export interface ThreeSceneHost {
  readonly cameraRig: CameraRigPort;
  readonly capabilities: RendererCapabilities;
  resize(width: number, height: number, dpr?: number): void;
  invalidate(): void;
  pause(): void;
  resume(): void;
  setVisibility(value: "visible" | "hidden"): void;
  adoptAsset(assetId: AssetId, asset: AssetOwnershipToken<ThreeAssetHandle>): () => void;
  updateEntities(entities: readonly P0SpatialEntity[]): void;
  pick(request: PickRequest): readonly PickHit[];
  subscribeSpatialEvent(listener: (event: SpatialEvent) => void): () => void;
  subscribeStatus(listener: (status: RendererStatus) => void): () => void;
  retry(): Promise<void>;
  dispose(): ThreeDisposalReport;
}

interface AssetLease {
  readonly asset: ThreeResolvedAsset;
  readonly revision: number;
}

interface EntityVisual {
  readonly entity: P0SpatialEntity;
  readonly visual: ThreeVisualInstance;
  readonly assetId?: AssetId;
  readonly assetRevision?: number;
}

interface PendingCameraOperation {
  readonly resolve: (result: CameraOperationResult) => void;
}

const DEFAULT_THEME: SceneThemeValues = Object.freeze({
  "scene.background": "#eef2f5",
  "grid.major": "#7890a1",
  "grid.minor": "#bac7d0",
  "axis.x": "#d74e45",
  "axis.y": "#37a36b",
  "axis.z": "#3a83cf",
  "selection.active": "#2678d6",
  "path.default": "#5d57d9",
  "goal.default": "#137f79",
  warning: "#b36c05",
});

const CAPABILITIES: RendererCapabilities = Object.freeze({
  supported: Object.freeze(["rendering", "picking", "selection"] as const),
});

function materializeTheme(overrides: SceneThemeOverrides | undefined): SceneThemeValues {
  return Object.freeze({ ...DEFAULT_THEME, ...overrides });
}

function assertViewportSize(width: number, height: number, dpr: number): void {
  for (const [label, value] of [
    ["width", width],
    ["height", height],
    ["dpr", dpr],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(`${label} must be a finite positive number.`);
    }
  }
}

function cameraAspect(state: CameraState, aspect: number): CameraState {
  return createCameraState({
    ...state,
    projection: { ...state.projection, aspect },
  });
}

function threeCameraFor(state: CameraState): Camera {
  if (state.projection.kind === "perspective") {
    return new PerspectiveCamera(
      (state.projection.verticalFovRadians * 180) / Math.PI,
      state.projection.aspect,
      state.projection.nearMeters,
      state.projection.farMeters,
    );
  }
  const halfHeight = state.projection.verticalSizeMeters / 2;
  const halfWidth = halfHeight * state.projection.aspect;
  return new OrthographicCamera(
    -halfWidth,
    halfWidth,
    halfHeight,
    -halfHeight,
    state.projection.nearMeters,
    state.projection.farMeters,
  );
}

function updateThreeCamera(camera: Camera, state: CameraState): Camera {
  const kindMatches =
    (state.projection.kind === "perspective" && camera instanceof PerspectiveCamera) ||
    (state.projection.kind === "orthographic" && camera instanceof OrthographicCamera);
  const next = kindMatches ? camera : threeCameraFor(state);
  if (next instanceof PerspectiveCamera && state.projection.kind === "perspective") {
    next.fov = (state.projection.verticalFovRadians * 180) / Math.PI;
    next.aspect = state.projection.aspect;
    next.near = state.projection.nearMeters;
    next.far = state.projection.farMeters;
  }
  if (next instanceof OrthographicCamera && state.projection.kind === "orthographic") {
    const halfHeight = state.projection.verticalSizeMeters / 2;
    const halfWidth = halfHeight * state.projection.aspect;
    next.left = -halfWidth;
    next.right = halfWidth;
    next.top = halfHeight;
    next.bottom = -halfHeight;
    next.near = state.projection.nearMeters;
    next.far = state.projection.farMeters;
  }
  const position = coreToThreePosition(state.position);
  const target = coreToThreePosition(state.target);
  const up = coreToThreePosition(state.up);
  next.position.set(position[0], position[1], position[2]);
  next.up.set(up[0], up[1], up[2]);
  next.lookAt(target[0], target[1], target[2]);
  if (next instanceof PerspectiveCamera || next instanceof OrthographicCamera) {
    next.updateProjectionMatrix();
  }
  next.updateMatrixWorld();
  return next;
}

function entityLayerId(entity: P0SpatialEntity): LayerId | undefined {
  return entity.layerId;
}

function entityPickable(entity: P0SpatialEntity): boolean {
  return entity.kind !== "asset" || entity.pickable !== false;
}

function entityAssetId(entity: P0SpatialEntity): AssetId | undefined {
  return entity.kind === "asset"
    ? entity.assetId
    : entity.kind === "robot"
      ? entity.assetId
      : undefined;
}

function cameraResult(status: "completed"): CameraOperationResult {
  return Object.freeze({ status });
}

function cancelledCameraResult(reason: CameraCancellationReason): CameraOperationResult {
  return Object.freeze({ status: "cancelled", reason });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Creates an imperative, canvas-bound scene host. The public root never returns
 * raw Three objects; products communicate through serializable core contracts.
 */
export function createThreeSceneHost(options: ThreeSceneHostOptions): ThreeSceneHost {
  const initialCamera = createCameraState(options.camera.initialState ?? options.camera.homeState);
  if (initialCamera.frame !== options.frame || options.camera.homeState.frame !== options.frame) {
    throw new RangeError("ThreeSceneHost camera states must use the host frame.");
  }
  const theme = materializeTheme(options.theme);
  const renderMode = options.renderMode ?? "demand";
  const renderer = new WebGLRenderer({
    canvas: options.canvas,
    alpha: false,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(theme["scene.background"]);
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));

  const scene = new Scene();
  const coreRoot = new Group();
  coreRoot.name = "lkds3d:core-root";
  coreRoot.quaternion.set(
    CORE_TO_THREE_BASIS_QUATERNION[0],
    CORE_TO_THREE_BASIS_QUATERNION[1],
    CORE_TO_THREE_BASIS_QUATERNION[2],
    CORE_TO_THREE_BASIS_QUATERNION[3],
  );
  scene.add(coreRoot);
  scene.add(new AmbientLight("#ffffff", 1.25));
  const keyLight = new DirectionalLight("#ffffff", 2.1);
  keyLight.position.set(5, 8, 6);
  scene.add(keyLight);

  const assets = new Map<AssetId, AssetLease>();
  const entities = new Map<EntityId, EntityVisual>();
  const spatialListeners = new Set<(event: SpatialEvent) => void>();
  const statusListeners = new Set<(status: RendererStatus) => void>();
  const raycaster = new Raycaster();

  let cameraState = initialCamera;
  let homeState = createCameraState(options.camera.homeState);
  let threeCamera = updateThreeCamera(threeCameraFor(cameraState), cameraState);
  let status: RendererStatus = Object.freeze({ state: "initializing", snapshotUsable: false });
  let paused = false;
  let visible = true;
  let disposed = false;
  let contextLost = false;
  let raf: number | undefined;
  let assetRevision = 0;
  let pendingCameraOperation: PendingCameraOperation | undefined;
  let viewportWidth = Math.max(1, options.canvas.clientWidth || options.canvas.width || 1);
  let viewportHeight = Math.max(1, options.canvas.clientHeight || options.canvas.height || 1);
  let viewportDpr = Math.min(globalThis.devicePixelRatio || 1, 2);

  const emitStatus = (): void => {
    statusListeners.forEach((listener) => listener(status));
  };
  const setStatus = (next: RendererStatus): void => {
    status = Object.freeze(next);
    emitStatus();
  };
  const setErrorStatus = (error: unknown, recoverable: boolean): void => {
    setStatus({
      state: "error",
      snapshotUsable: false,
      error: { code: "three_scene_host", message: errorMessage(error), recoverable },
    });
  };
  const cancelFrame = (): void => {
    if (raf === undefined) return;
    cancelAnimationFrame(raf);
    raf = undefined;
  };
  const render = (): void => {
    if (disposed || paused || !visible || contextLost) return;
    scene.updateMatrixWorld(true);
    renderer.render(scene, threeCamera);
  };
  const scheduleAlways = (): void => {
    if (
      renderMode !== "always" ||
      disposed ||
      paused ||
      !visible ||
      contextLost ||
      raf !== undefined
    )
      return;
    const tick = (): void => {
      raf = undefined;
      render();
      scheduleAlways();
    };
    raf = requestAnimationFrame(tick);
  };
  const invalidate = (): void => {
    if (disposed || paused || !visible || contextLost) return;
    if (renderMode === "always") {
      scheduleAlways();
      return;
    }
    if (raf !== undefined) return;
    raf = requestAnimationFrame(() => {
      raf = undefined;
      render();
    });
  };
  const applyCameraState = (next: CameraState): void => {
    cameraState = createCameraState(next);
    threeCamera = updateThreeCamera(threeCamera, cameraState);
    invalidate();
  };
  const cancelCamera = (reason: CameraCancellationReason): void => {
    if (pendingCameraOperation === undefined) return;
    const pending = pendingCameraOperation;
    pendingCameraOperation = undefined;
    pending.resolve(cancelledCameraResult(reason));
  };
  const requestCamera = (next: CameraState): Promise<CameraOperationResult> => {
    if (disposed) return Promise.resolve(cancelledCameraResult("disposed"));
    cancelCamera("superseded");
    return new Promise((resolve) => {
      const pending: PendingCameraOperation = { resolve };
      pendingCameraOperation = pending;
      queueMicrotask(() => {
        if (pendingCameraOperation !== pending) return;
        pendingCameraOperation = undefined;
        if (disposed) {
          resolve(cancelledCameraResult("disposed"));
          return;
        }
        applyCameraState(next);
        resolve(cameraResult("completed"));
      });
    });
  };
  const cameraRig: CameraRigPort = Object.freeze({
    getState: (): CameraState => createCameraState(cameraState),
    setState: (next: CameraState): Promise<CameraOperationResult> => requestCamera(next),
    setHomeState: (next: CameraState): void => {
      const validated = createCameraState(next);
      if (validated.frame !== options.frame)
        throw new RangeError("homeState must use the host frame.");
      homeState = validated;
    },
    home: (): Promise<CameraOperationResult> => requestCamera(homeState),
    top: (target: Bounds3): Promise<CameraOperationResult> =>
      requestCamera(
        computeTopCameraState({
          current: cameraState,
          target,
          viewportAspect: viewportWidth / viewportHeight,
        }),
      ),
    focus: (target: Bounds3 | FramedPoint3): Promise<CameraOperationResult> =>
      requestCamera(
        computeFocusCameraState({
          current: cameraState,
          target,
          viewportAspect: viewportWidth / viewportHeight,
        }),
      ),
    cancel: (reason: "explicit" | "rollback" = "explicit"): void => cancelCamera(reason),
  });

  const removeVisual = (entry: EntityVisual): void => {
    coreRoot.remove(entry.visual.object);
    entry.visual.dispose();
  };
  const buildVisual = (entity: P0SpatialEntity): EntityVisual => {
    const requestedAssetId = entityAssetId(entity);
    const lease = requestedAssetId === undefined ? undefined : assets.get(requestedAssetId);
    const visual = createThreeVisualInstance({
      entity,
      sceneFrame: options.frame,
      theme,
      ...(lease === undefined ? {} : { asset: lease.asset }),
    });
    visual.object.userData.lkds3dEntityId = entity.id;
    coreRoot.add(visual.object);
    return Object.freeze({
      entity,
      visual,
      ...(requestedAssetId === undefined ? {} : { assetId: requestedAssetId }),
      ...(lease === undefined ? {} : { assetRevision: lease.revision }),
    });
  };
  const replaceVisual = (entity: P0SpatialEntity): EntityVisual => {
    const previous = entities.get(entity.id);
    if (previous !== undefined) removeVisual(previous);
    const next = buildVisual(entity);
    entities.set(entity.id, next);
    return next;
  };
  const refreshAssetVisuals = (assetId: AssetId): void => {
    for (const entry of [...entities.values()]) {
      if (entityAssetId(entry.entity) === assetId) replaceVisual(entry.entity);
    }
  };

  const contextLostListener = (event: Event): void => {
    event.preventDefault();
    contextLost = true;
    cancelFrame();
    setStatus({ state: "lost", snapshotUsable: false });
  };
  const contextRestoredListener = (): void => {
    if (disposed) return;
    setStatus({ state: "restoring", snapshotUsable: false });
    try {
      renderer.resetState();
      contextLost = false;
      setStatus({ state: "ready", snapshotUsable: true });
      invalidate();
    } catch (error) {
      setErrorStatus(error, false);
    }
  };
  options.canvas.addEventListener("webglcontextlost", contextLostListener, false);
  options.canvas.addEventListener("webglcontextrestored", contextRestoredListener, false);

  const host: ThreeSceneHost = Object.freeze({
    cameraRig,
    capabilities: CAPABILITIES,
    resize(width: number, height: number, dpr = viewportDpr): void {
      if (disposed) return;
      assertViewportSize(width, height, dpr);
      viewportWidth = width;
      viewportHeight = height;
      viewportDpr = dpr;
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height, false);
      applyCameraState(cameraAspect(cameraState, width / height));
    },
    invalidate,
    pause(): void {
      if (disposed || paused) return;
      paused = true;
      cancelFrame();
      setStatus({ state: "paused", snapshotUsable: true });
    },
    resume(): void {
      if (disposed || !paused) return;
      paused = false;
      setStatus({ state: "ready", snapshotUsable: true });
      invalidate();
      scheduleAlways();
    },
    setVisibility(value: "visible" | "hidden"): void {
      if (disposed || visible === (value === "visible")) return;
      visible = value === "visible";
      if (!visible) {
        cancelFrame();
        setStatus({ state: "paused", snapshotUsable: true });
        return;
      }
      if (!paused) {
        setStatus({ state: "ready", snapshotUsable: true });
        invalidate();
        scheduleAlways();
      }
    },
    adoptAsset(assetId: AssetId, token: AssetOwnershipToken<ThreeAssetHandle>): () => void {
      if (disposed) throw new Error("Cannot adopt an asset after the ThreeSceneHost is disposed.");
      const previous = assets.get(assetId);
      const lease: AssetLease = Object.freeze({
        asset: consumeThreeAssetOwnership(token),
        revision: ++assetRevision,
      });
      assets.set(assetId, lease);
      refreshAssetVisuals(assetId);
      previous?.asset.dispose();
      invalidate();
      let released = false;
      return (): void => {
        if (released) return;
        released = true;
        if (assets.get(assetId) !== lease) return;
        assets.delete(assetId);
        refreshAssetVisuals(assetId);
        lease.asset.dispose();
        invalidate();
      };
    },
    updateEntities(nextEntities: readonly P0SpatialEntity[]): void {
      if (disposed) return;
      const incoming = new Set<EntityId>();
      for (const entity of nextEntities) {
        if (incoming.has(entity.id)) {
          throw new RangeError(
            `Duplicate entity id ${JSON.stringify(entity.id)} in one scene snapshot.`,
          );
        }
        incoming.add(entity.id);
        const current = entities.get(entity.id);
        const nextAssetId = entityAssetId(entity);
        const nextLease = nextAssetId === undefined ? undefined : assets.get(nextAssetId);
        const needsReplacement =
          current === undefined ||
          current.entity.kind !== entity.kind ||
          current.assetId !== nextAssetId ||
          current.assetRevision !== nextLease?.revision;
        if (needsReplacement) {
          replaceVisual(entity);
        } else {
          current.visual.update({ entity, sceneFrame: options.frame, theme });
          entities.set(entity.id, Object.freeze({ ...current, entity }));
        }
      }
      for (const [id, entry] of entities) {
        if (incoming.has(id)) continue;
        entities.delete(id);
        removeVisual(entry);
      }
      invalidate();
    },
    pick(request: PickRequest): readonly PickHit[] {
      if (disposed || contextLost) return Object.freeze([]);
      const coreRay = createPickRay(cameraState, request);
      const origin = coreToThreePosition(coreRay.origin);
      const direction = coreToThreePosition(coreRay.direction);
      raycaster.set(
        new Vector3(origin[0], origin[1], origin[2]),
        new Vector3(direction[0], direction[1], direction[2]).normalize(),
      );
      scene.updateMatrixWorld(true);
      const roots = [...entities.values()]
        .filter((entry) => entityPickable(entry.entity))
        .filter((entry) => {
          const layerId = entityLayerId(entry.entity);
          return (
            request.layers === undefined ||
            layerId === undefined ||
            request.layers.includes(layerId)
          );
        })
        .map((entry) => entry.visual.object);
      const seen = new Set<EntityId>();
      const hits: PickHit[] = [];
      for (const hit of raycaster.intersectObjects(roots, true)) {
        let cursor: Object3D | null = hit.object;
        let id: EntityId | undefined;
        while (cursor !== null) {
          const candidate = (cursor.userData as Record<string, unknown>).lkds3dEntityId;
          if (typeof candidate === "string") {
            id = candidate as EntityId;
            break;
          }
          cursor = cursor.parent;
        }
        if (id === undefined || seen.has(id)) continue;
        const entry = entities.get(id);
        if (entry === undefined) continue;
        seen.add(id);
        const point = threeToCorePosition([hit.point.x, hit.point.y, hit.point.z]);
        hits.push(
          Object.freeze({
            entityId: id,
            point: framedPoint3(options.frame, point),
            distanceMeters: hit.distance,
            ...(entityLayerId(entry.entity) === undefined ? {} : { layerId: entry.entity.layerId }),
            ...(hit.instanceId === undefined ? {} : { instanceId: hit.instanceId }),
          }),
        );
        if (request.mode !== "all") break;
      }
      const frozenHits = Object.freeze(hits);
      const event: SpatialEvent = Object.freeze({
        type: frozenHits.length === 0 ? "pick-miss" : "pick",
        request,
        hits: frozenHits,
        modifiers: Object.freeze({ alt: false, ctrl: false, meta: false, shift: false }),
      });
      spatialListeners.forEach((listener) => listener(event));
      return frozenHits;
    },
    subscribeSpatialEvent(listener: (event: SpatialEvent) => void): () => void {
      if (disposed) return (): void => undefined;
      spatialListeners.add(listener);
      return (): void => {
        spatialListeners.delete(listener);
      };
    },
    subscribeStatus(listener: (next: RendererStatus) => void): () => void {
      if (disposed) return (): void => undefined;
      statusListeners.add(listener);
      listener(status);
      return (): void => {
        statusListeners.delete(listener);
      };
    },
    retry(): Promise<void> {
      if (disposed) return Promise.resolve();
      if (!contextLost) {
        setStatus({ state: "ready", snapshotUsable: true });
        invalidate();
        return Promise.resolve();
      }
      setStatus({ state: "restoring", snapshotUsable: false });
      try {
        renderer.resetState();
        contextLost = false;
        setStatus({ state: "ready", snapshotUsable: true });
        invalidate();
        return Promise.resolve();
      } catch (error) {
        setErrorStatus(error, false);
        return Promise.reject(error instanceof Error ? error : new Error(errorMessage(error)));
      }
    },
    dispose(): ThreeDisposalReport {
      if (disposed) {
        return Object.freeze({
          remainingGeometries: 0,
          remainingMaterials: 0,
          remainingTextures: 0,
          remainingListeners: 0,
          remainingAnimationLoops: 0,
          remainingPendingLoads: 0,
        });
      }
      disposed = true;
      cancelFrame();
      cancelCamera("disposed");
      options.canvas.removeEventListener("webglcontextlost", contextLostListener, false);
      options.canvas.removeEventListener("webglcontextrestored", contextRestoredListener, false);
      entities.forEach(removeVisual);
      entities.clear();
      assets.forEach((lease) => lease.asset.dispose());
      assets.clear();
      spatialListeners.clear();
      statusListeners.clear();
      scene.clear();
      renderer.renderLists.dispose();
      renderer.dispose();
      setStatus({ state: "disposed", snapshotUsable: false });
      return Object.freeze({
        remainingGeometries: 0,
        remainingMaterials: 0,
        remainingTextures: 0,
        remainingListeners: 0,
        remainingAnimationLoops: 0,
        remainingPendingLoads: 0,
      });
    },
  });

  host.resize(viewportWidth, viewportHeight, viewportDpr);
  setStatus({ state: "ready", snapshotUsable: true });
  host.invalidate();
  scheduleAlways();
  return host;
}
