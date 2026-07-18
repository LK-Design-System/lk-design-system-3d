import { useEffect, useMemo, useState } from "react";
import {
  resolvePointCloudRenderState,
  type PointCloudRenderState,
  type PointCloudSnapshot,
} from "@lk-robotics/design-system-3d-pointcloud";

import {
  createPointCloudRenderResource,
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
  readonly fallbackColor?: string;
  readonly opacity?: number;
  /** Renderer-state observation for caller-owned LDS/product DOM summaries. */
  readonly onRenderStateChange?: (state: PointCloudRenderState) => void;
}

interface PointCloudResourceInput {
  readonly fallbackColor: string;
  readonly opacity: number;
  readonly pointSize: number;
  readonly snapshot: PointCloudSnapshot;
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
  fallbackColor = DEFAULT_POINT_CLOUD_COLOR,
  opacity = 1,
  onRenderStateChange,
}: PointCloudLayerProps) {
  const runtime = useSceneRuntime();
  const [resourceState, setResourceState] = useState<PointCloudResourceState | null>(null);
  assertMaterialOptions(pointSize, opacity);
  const renderState = useMemo(
    () => resolvePointCloudRenderState(snapshot, runtime.frame, maxPoints),
    [maxPoints, runtime.frame, snapshot],
  );
  const resourceInput = useMemo(
    () => ({ fallbackColor, opacity, pointSize, snapshot }),
    [fallbackColor, opacity, pointSize, snapshot],
  );

  useEffect(() => {
    if (renderState.kind !== "ready") {
      setResourceState(null);
      return;
    }

    const resource = createPointCloudRenderResource(snapshot, resourceInput);
    setResourceState({ input: resourceInput, resource });
    return () => resource.dispose();
  }, [renderState.kind, resourceInput, snapshot]);

  useEffect(() => {
    onRenderStateChange?.(renderState);
  }, [onRenderStateChange, renderState]);

  const resource =
    renderState.kind === "ready" && resourceState?.input === resourceInput
      ? resourceState.resource
      : null;

  if (resource === null) return null;
  return <primitive dispose={null} object={resource.points} />;
}
