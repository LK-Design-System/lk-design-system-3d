import { useEffect, useMemo, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import {
  createPointCloudLayerSet,
  resolvePointCloudLayerSetRenderState,
  resolvePointCloudRenderState,
  type PointCloudFreshnessPolicy,
  type PointCloudLayerSetRenderState,
  type PointCloudLayerSnapshot,
  type PointCloudRenderState,
  type PointCloudSnapshot,
} from "@lk-robotics/design-system-3d-pointcloud";
import {
  FrameMismatchError,
  assertValidBounds3,
  type Bounds3,
  type FrameId,
  type RigidTransform3,
} from "@lk-robotics/design-system-3d-core";
import type { WebGLRenderer } from "three";

import {
  createPointCloudRenderResource,
  type PointCloudColorMode,
  type PointCloudHeightRange,
  type PointCloudRenderResource,
} from "./pointcloud-resource.js";
import { useSceneRuntime } from "./runtime.js";

export const DEFAULT_POINT_CLOUD_COLOR = "#3c9dff";
/** Small enough to keep dense review fixtures visibly point-like at DPR 1. */
export const DEFAULT_POINT_CLOUD_POINT_SIZE = 1.5;

export interface PointCloudLayerProps {
  readonly snapshot: PointCloudSnapshot;
  /** Required renderer budget. Over-budget snapshots are rejected, never sampled implicitly. */
  readonly maxPoints: number;
  /** Three.js point size in screen pixels. */
  readonly pointSize?: number;
  /** Source RGB, one uniform fallback color, or a scene-frame Z transfer function. */
  readonly colorMode?: PointCloudColorMode;
  readonly fallbackColor?: string;
  /** Explicit scene-frame Z range shared by comparable layers; auto-computed when omitted. */
  readonly heightRange?: PointCloudHeightRange;
  /** Scene-frame bounds kept by opt-in GPU clipping. Source arrays remain unchanged. */
  readonly clipBounds?: Bounds3;
  readonly opacity?: number;
  /** Renderer-state observation for caller-owned LDS/product DOM summaries. */
  readonly onRenderStateChange?: (state: PointCloudRenderState) => void;
}

interface PointCloudResourceInput {
  readonly clipBounds?: Bounds3;
  readonly colorMode: PointCloudColorMode;
  readonly fallbackColor: string;
  readonly heightRange?: PointCloudHeightRange;
  readonly opacity: number;
  readonly pointSize: number;
  readonly snapshot: PointCloudSnapshot;
  readonly sourceToScene?: RigidTransform3;
}

export interface PointCloudSceneLayer {
  readonly layer: PointCloudLayerSnapshot;
  /** Three.js point size in screen pixels. */
  readonly pointSize?: number;
  readonly colorMode?: PointCloudColorMode;
  readonly fallbackColor?: string;
  readonly heightRange?: PointCloudHeightRange;
  readonly opacity?: number;
}

export interface PointCloudLayersProps {
  readonly layers: readonly PointCloudSceneLayer[];
  /** One atomic budget across every visible, frame-resolved layer. */
  readonly maxPoints: number;
  readonly freshnessPolicy?: PointCloudFreshnessPolicy;
  /** Shared scene-frame bounds kept across every rendered layer. */
  readonly clipBounds?: Bounds3;
  /** Collection-state observation for caller-owned LDS/product DOM summaries. */
  readonly onRenderStateChange?: (state: PointCloudLayerSetRenderState) => void;
}

interface PointCloudResourceState {
  readonly input: PointCloudResourceInput;
  readonly resource: PointCloudRenderResource;
}

function assertMaterialOptions(pointSize: number, opacity: number): void {
  if (!Number.isFinite(pointSize) || pointSize <= 0) {
    throw new RangeError("PointCloudLayer pointSize must be a finite positive number.");
  }
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
    throw new RangeError("PointCloudLayer opacity must be a finite number in [0, 1].");
  }
}

function assertColorOptions(heightRange: PointCloudHeightRange | undefined): void {
  if (
    heightRange !== undefined &&
    (!Number.isFinite(heightRange[0]) ||
      !Number.isFinite(heightRange[1]) ||
      heightRange[0] > heightRange[1])
  ) {
    throw new RangeError(
      "PointCloudLayer heightRange must contain finite [minimum, maximum] values in ascending order.",
    );
  }
}

function assertClipBounds(bounds: Bounds3 | undefined, sceneFrame: FrameId): void {
  if (bounds === undefined) return;
  assertValidBounds3(bounds);
  if (bounds.frame !== sceneFrame) {
    throw new FrameMismatchError(sceneFrame, bounds.frame, "PointCloudLayer.clipBounds");
  }
}

interface LocalClippingLease {
  count: number;
  readonly previous: boolean;
}

const LOCAL_CLIPPING_LEASES = new WeakMap<WebGLRenderer, LocalClippingLease>();

function acquireLocalClipping(renderer: WebGLRenderer, invalidate: () => void): () => void {
  const existing = LOCAL_CLIPPING_LEASES.get(renderer);
  if (existing === undefined) {
    LOCAL_CLIPPING_LEASES.set(renderer, { count: 1, previous: renderer.localClippingEnabled });
    renderer.localClippingEnabled = true;
  } else {
    existing.count += 1;
  }
  invalidate();
  return () => {
    const lease = LOCAL_CLIPPING_LEASES.get(renderer);
    if (lease === undefined) return;
    lease.count -= 1;
    if (lease.count === 0) {
      renderer.localClippingEnabled = lease.previous;
      LOCAL_CLIPPING_LEASES.delete(renderer);
    }
    invalidate();
  };
}

function PointCloudResourcePrimitive({ input }: { readonly input: PointCloudResourceInput }) {
  const [resourceState, setResourceState] = useState<PointCloudResourceState | null>(null);
  const renderer = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    if (input.clipBounds === undefined) return;
    return acquireLocalClipping(renderer, invalidate);
  }, [input.clipBounds, invalidate, renderer]);

  useEffect(() => {
    const resource = createPointCloudRenderResource(input.snapshot, input, input.sourceToScene);
    setResourceState({ input, resource });
    return () => resource.dispose();
  }, [input]);

  const resource = resourceState?.input === input ? resourceState.resource : null;
  if (resource === null) return null;
  return <primitive dispose={null} object={resource.points} />;
}

/**
 * Actual WebGL point geometry for one already-normalized point-cloud snapshot.
 * It performs no ROS/TF conversion, parsing, sampling, point picking, or DOM
 * UI. A frame mismatch or budget violation creates no geometry and is reported
 * through the caller-owned state callback.
 */
export function PointCloudLayer({
  snapshot,
  maxPoints,
  pointSize = DEFAULT_POINT_CLOUD_POINT_SIZE,
  colorMode = "source",
  fallbackColor = DEFAULT_POINT_CLOUD_COLOR,
  heightRange,
  clipBounds,
  opacity = 1,
  onRenderStateChange,
}: PointCloudLayerProps) {
  const runtime = useSceneRuntime();
  assertMaterialOptions(pointSize, opacity);
  assertColorOptions(heightRange);
  assertClipBounds(clipBounds, runtime.frame);
  const renderState = useMemo(
    () => resolvePointCloudRenderState(snapshot, runtime.frame, maxPoints),
    [maxPoints, runtime.frame, snapshot],
  );
  const resourceInput = useMemo(
    () => ({
      colorMode,
      fallbackColor,
      opacity,
      pointSize,
      snapshot,
      ...(clipBounds === undefined ? {} : { clipBounds }),
      ...(heightRange === undefined ? {} : { heightRange }),
    }),
    [clipBounds, colorMode, fallbackColor, heightRange, opacity, pointSize, snapshot],
  );

  useEffect(() => {
    onRenderStateChange?.(renderState);
  }, [onRenderStateChange, renderState]);

  if (renderState.kind !== "ready") return null;
  return <PointCloudResourcePrimitive input={resourceInput} />;
}

/**
 * Renders multiple immutable point-cloud layers into the SceneCanvas frame.
 * Callers resolve source-frame transforms and retain transport, TF graph,
 * sampling, and product UI ownership. LDS3D applies the supplied rigid
 * transforms without rewriting caller-retained point buffers.
 */
export function PointCloudLayers({
  layers,
  maxPoints,
  freshnessPolicy,
  clipBounds,
  onRenderStateChange,
}: PointCloudLayersProps) {
  const runtime = useSceneRuntime();
  assertClipBounds(clipBounds, runtime.frame);
  const reportedStateKey = useRef<string | null>(null);
  const normalizedLayers = useMemo(
    () =>
      layers.map((entry) => {
        const pointSize = entry.pointSize ?? DEFAULT_POINT_CLOUD_POINT_SIZE;
        const opacity = entry.opacity ?? 1;
        const colorMode = entry.colorMode ?? "source";
        assertMaterialOptions(pointSize, opacity);
        assertColorOptions(entry.heightRange);
        return Object.freeze({
          layer: entry.layer,
          pointSize,
          opacity,
          colorMode,
          fallbackColor: entry.fallbackColor ?? DEFAULT_POINT_CLOUD_COLOR,
          ...(entry.heightRange === undefined ? {} : { heightRange: entry.heightRange }),
        });
      }),
    [layers],
  );
  const layerSet = useMemo(
    () => createPointCloudLayerSet({ layers: normalizedLayers.map((entry) => entry.layer) }),
    [normalizedLayers],
  );
  const renderState = useMemo(
    () => resolvePointCloudLayerSetRenderState(layerSet, runtime.frame, maxPoints, freshnessPolicy),
    [freshnessPolicy, layerSet, maxPoints, runtime.frame],
  );
  const stateByLayer = useMemo(
    () => new Map(renderState.layers.map((state) => [state.layerId, state] as const)),
    [renderState.layers],
  );
  const renderableLayers = useMemo(
    () =>
      normalizedLayers.flatMap((entry) => {
        const state = stateByLayer.get(entry.layer.id);
        if (state?.kind !== "ready") return [];
        return [
          Object.freeze({
            id: entry.layer.id,
            input: Object.freeze({
              snapshot: entry.layer.snapshot,
              sourceToScene: state.sourceToScene,
              colorMode: entry.colorMode,
              pointSize: entry.pointSize,
              opacity: entry.opacity,
              fallbackColor: entry.fallbackColor,
              ...(clipBounds === undefined ? {} : { clipBounds }),
              ...(entry.heightRange === undefined ? {} : { heightRange: entry.heightRange }),
            }),
          }),
        ];
      }),
    [clipBounds, normalizedLayers, stateByLayer],
  );
  const renderStateKey = useMemo(() => JSON.stringify(renderState), [renderState]);

  useEffect(() => {
    if (reportedStateKey.current === renderStateKey) return;
    reportedStateKey.current = renderStateKey;
    onRenderStateChange?.(renderState);
  }, [onRenderStateChange, renderState, renderStateKey]);

  return (
    <>
      {renderableLayers.map((entry) => (
        <PointCloudResourcePrimitive key={entry.id} input={entry.input} />
      ))}
    </>
  );
}

export type { PointCloudColorMode, PointCloudHeightRange } from "./pointcloud-resource.js";
