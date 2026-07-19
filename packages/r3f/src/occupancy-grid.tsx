import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import {
  createOccupancyGridCellPicker,
  framedPoint3,
  type FrameId,
  type OccupancyGridCell,
  type OccupancyGridCellPick,
  type OccupancyGridCellPicker,
  type OccupancyGridSnapshot,
  type Vec3,
} from "@lk-robotics/design-system-3d-core";

import { threeToCorePosition } from "./coordinates.js";
import {
  createOccupancyGridRenderResource,
  createOccupancyGridSelectionResource,
  resolveOccupancyGridRenderState,
  type OccupancyGridPalette,
  type OccupancyGridRenderResource,
  type OccupancyGridRenderState,
  type OccupancyGridSelectionResource,
} from "./occupancy-grid-resource.js";
import { useSceneRuntime } from "./runtime.js";

export interface OccupancyGridCellPointerDetail extends OccupancyGridCellPick {
  readonly distanceMeters: number;
}

type OccupancyGridCellHoverCallback = (detail: OccupancyGridCellPointerDetail | null) => void;

interface ActiveOccupancyGridHover {
  readonly snapshot: OccupancyGridSnapshot;
  readonly callback: OccupancyGridCellHoverCallback;
  readonly column: number;
  readonly row: number;
}

interface OccupancyGridHoverLifecycle {
  report(
    snapshot: OccupancyGridSnapshot,
    callback: OccupancyGridCellHoverCallback,
    detail: OccupancyGridCellPointerDetail,
  ): boolean;
  reconcile(
    snapshot: OccupancyGridSnapshot,
    callback: OccupancyGridCellHoverCallback | undefined,
    ready: boolean,
  ): boolean;
  clear(): boolean;
}

/** Internal transition owner shared by R3F handlers and lifecycle effects. */
export function createOccupancyGridHoverLifecycle(): OccupancyGridHoverLifecycle {
  let active: ActiveOccupancyGridHover | null = null;

  const clear = (): boolean => {
    if (active === null) return false;
    const callback = active.callback;
    active = null;
    callback(null);
    return true;
  };

  const lifecycle: OccupancyGridHoverLifecycle = {
    report(
      snapshot: OccupancyGridSnapshot,
      callback: OccupancyGridCellHoverCallback,
      detail: OccupancyGridCellPointerDetail,
    ): boolean {
      if (active !== null && (active.snapshot !== snapshot || active.callback !== callback)) {
        clear();
      }
      const current = active;
      if (
        current !== null &&
        current.snapshot === snapshot &&
        current.callback === callback &&
        current.column === detail.cell.column &&
        current.row === detail.cell.row
      ) {
        return false;
      }
      active = {
        snapshot,
        callback,
        column: detail.cell.column,
        row: detail.cell.row,
      };
      callback(detail);
      return true;
    },
    reconcile(
      snapshot: OccupancyGridSnapshot,
      callback: OccupancyGridCellHoverCallback | undefined,
      ready: boolean,
    ): boolean {
      if (
        active === null ||
        (ready && active.snapshot === snapshot && active.callback === callback)
      ) {
        return false;
      }
      return clear();
    },
    clear,
  };
  return Object.freeze(lifecycle);
}

export interface OccupancyGridSurfaceProps {
  readonly snapshot: OccupancyGridSnapshot;
  /** Required renderer budget. Over-budget rasters are rejected, never sampled implicitly. */
  readonly maxCells: number;
  readonly palette?: Partial<OccupancyGridPalette>;
  readonly opacity?: number;
  /** Local grid +Z offset used to avoid caller-owned coplanar surfaces. */
  readonly elevationOffsetMeters?: number;
  /** Caller-controlled persistent cell selection. */
  readonly selectedCell?: OccupancyGridCell | null;
  readonly onCellPick?: (detail: OccupancyGridCellPointerDetail) => void;
  readonly onCellHoverChange?: (detail: OccupancyGridCellPointerDetail | null) => void;
  /** Renderer-state observation for caller-owned LDS/product DOM summaries. */
  readonly onRenderStateChange?: (state: OccupancyGridRenderState) => void;
}

interface OccupancyGridResourceInput {
  readonly snapshot: OccupancyGridSnapshot;
  readonly palette: OccupancyGridPalette;
  readonly opacity: number;
  readonly elevationOffsetMeters: number;
}

interface OccupancyGridResourceState {
  readonly input: OccupancyGridResourceInput;
  readonly resource: OccupancyGridRenderResource;
}

interface OccupancyGridResourcePrimitiveProps {
  readonly input: OccupancyGridResourceInput;
  readonly onClick?: (event: ThreeEvent<MouseEvent>) => void;
  readonly onPointerMove?: (event: ThreeEvent<PointerEvent>) => void;
  readonly onPointerOut?: (event: ThreeEvent<PointerEvent>) => void;
}

function OccupancyGridResourcePrimitive({
  input,
  onClick,
  onPointerMove,
  onPointerOut,
}: OccupancyGridResourcePrimitiveProps) {
  const [resourceState, setResourceState] = useState<OccupancyGridResourceState | null>(null);

  useEffect(() => {
    const resource = createOccupancyGridRenderResource(input.snapshot, input);
    setResourceState({ input, resource });
    return () => resource.dispose();
  }, [input]);

  const resource = resourceState?.input === input ? resourceState.resource : null;
  if (resource === null) return null;
  return (
    <primitive
      dispose={null}
      object={resource.mesh}
      {...(onClick === undefined ? {} : { onClick })}
      {...(onPointerMove === undefined ? {} : { onPointerMove })}
      {...(onPointerOut === undefined ? {} : { onPointerOut })}
    />
  );
}

interface OccupancyGridSelectionInput {
  readonly snapshot: OccupancyGridSnapshot;
  readonly cell: OccupancyGridCell;
  readonly color: string;
  readonly elevationOffsetMeters: number;
}

interface OccupancyGridSelectionState {
  readonly input: OccupancyGridSelectionInput;
  readonly resource: OccupancyGridSelectionResource;
}

function OccupancyGridSelectionPrimitive({
  input,
}: {
  readonly input: OccupancyGridSelectionInput;
}) {
  const [resourceState, setResourceState] = useState<OccupancyGridSelectionState | null>(null);

  useEffect(() => {
    const resource = createOccupancyGridSelectionResource(input.snapshot, input.cell, input);
    setResourceState({ input, resource });
    return () => resource.dispose();
  }, [input]);

  const resource = resourceState?.input === input ? resourceState.resource : null;
  if (resource === null) return null;
  return <primitive dispose={null} object={resource.outline} />;
}

function pointerPlaneToleranceMeters(
  snapshot: OccupancyGridSnapshot,
  elevationOffsetMeters: number,
): number {
  const geometry = snapshot.geometry;
  const numericScale = Math.max(
    1,
    Math.abs(elevationOffsetMeters),
    geometry.widthCells * geometry.resolutionMeters,
    geometry.heightCells * geometry.resolutionMeters,
    ...geometry.gridToFrame.translation.map(Math.abs),
  );
  return Math.abs(elevationOffsetMeters) + Number.EPSILON * numericScale * 32;
}

/** Resolves one R3F world-space hit into an immutable occupancy-cell detail. */
export function resolveOccupancyGridCellPointerDetail(
  picker: OccupancyGridCellPicker,
  sceneFrame: FrameId,
  pointInThree: Vec3,
  distanceMeters: number,
  elevationOffsetMeters = 0,
): OccupancyGridCellPointerDetail | undefined {
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0) return undefined;
  const pointInCore = threeToCorePosition(pointInThree);
  const pick = picker.pick(framedPoint3(sceneFrame, pointInCore), {
    planeToleranceMeters: pointerPlaneToleranceMeters(picker.snapshot, elevationOffsetMeters),
  });
  if (pick === undefined) return undefined;
  return Object.freeze({ ...pick, distanceMeters });
}

/**
 * Actual WebGL occupancy raster for one normalized, immutable snapshot. PGM,
 * YAML, ROS messages, editing, history, persistence, and product controls stay
 * outside this renderer boundary.
 */
export function OccupancyGridSurface({
  snapshot,
  maxCells,
  palette,
  opacity = 1,
  elevationOffsetMeters = 0,
  selectedCell,
  onCellPick,
  onCellHoverChange,
  onRenderStateChange,
}: OccupancyGridSurfaceProps) {
  const runtime = useSceneRuntime();
  const hoverLifecycleRef = useRef<OccupancyGridHoverLifecycle | null>(null);
  hoverLifecycleRef.current ??= createOccupancyGridHoverLifecycle();
  const hoverLifecycle = hoverLifecycleRef.current;
  const maxTextureDimension = useThree((state) => state.gl.capabilities.maxTextureSize);
  const resolvedPalette = useMemo<OccupancyGridPalette>(
    () =>
      Object.freeze({
        unknown: palette?.unknown ?? runtime.theme.materials.assetStructure,
        free: palette?.free ?? runtime.theme.materials.ground,
        occupied: palette?.occupied ?? runtime.theme.materials.text,
        gridLine: palette?.gridLine ?? runtime.theme.scene["grid.major"],
      }),
    [palette, runtime.theme],
  );
  const renderState = useMemo(
    () => resolveOccupancyGridRenderState(snapshot, runtime.frame, maxCells, maxTextureDimension),
    [maxCells, maxTextureDimension, runtime.frame, snapshot],
  );
  const cellPicker = useMemo(() => createOccupancyGridCellPicker(snapshot), [snapshot]);
  const resourceInput = useMemo<OccupancyGridResourceInput>(
    () =>
      Object.freeze({
        snapshot,
        palette: resolvedPalette,
        opacity,
        elevationOffsetMeters,
      }),
    [elevationOffsetMeters, opacity, resolvedPalette, snapshot],
  );
  const selectionInput = useMemo<OccupancyGridSelectionInput | null>(
    () =>
      selectedCell === undefined || selectedCell === null
        ? null
        : Object.freeze({
            snapshot,
            cell: Object.freeze({ column: selectedCell.column, row: selectedCell.row }),
            color: runtime.theme.materials.selection,
            elevationOffsetMeters,
          }),
    [
      elevationOffsetMeters,
      runtime.theme.materials.selection,
      selectedCell?.column,
      selectedCell?.row,
      snapshot,
    ],
  );

  const resolvePointerDetail = useCallback(
    (event: ThreeEvent<MouseEvent | PointerEvent>) =>
      resolveOccupancyGridCellPointerDetail(
        cellPicker,
        runtime.frame,
        [event.point.x, event.point.y, event.point.z],
        event.distance,
        elevationOffsetMeters,
      ),
    [cellPicker, elevationOffsetMeters, runtime.frame],
  );
  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>): void => {
      const detail = resolvePointerDetail(event);
      if (detail === undefined) return;
      event.stopPropagation();
      onCellPick?.(detail);
    },
    [onCellPick, resolvePointerDetail],
  );
  const handlePointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>): void => {
      const detail = resolvePointerDetail(event);
      if (detail === undefined) {
        hoverLifecycle.clear();
        return;
      }
      event.stopPropagation();
      if (onCellHoverChange !== undefined) {
        hoverLifecycle.report(snapshot, onCellHoverChange, detail);
      }
    },
    [hoverLifecycle, onCellHoverChange, resolvePointerDetail, snapshot],
  );
  const handlePointerOut = useCallback((): void => {
    hoverLifecycle.clear();
  }, [hoverLifecycle]);

  const renderReady = renderState.kind === "ready";
  useEffect(() => {
    hoverLifecycle.reconcile(snapshot, onCellHoverChange, renderReady);
  }, [hoverLifecycle, onCellHoverChange, renderReady, snapshot]);

  useEffect(
    () => () => {
      hoverLifecycle.clear();
    },
    [hoverLifecycle],
  );

  useEffect(() => {
    onRenderStateChange?.(renderState);
  }, [onRenderStateChange, renderState]);

  if (!renderReady) return null;
  return (
    <>
      <OccupancyGridResourcePrimitive
        input={resourceInput}
        {...(onCellPick === undefined ? {} : { onClick: handleClick })}
        {...(onCellHoverChange === undefined
          ? {}
          : { onPointerMove: handlePointerMove, onPointerOut: handlePointerOut })}
      />
      {selectionInput === null ? null : <OccupancyGridSelectionPrimitive input={selectionInput} />}
    </>
  );
}

export type { OccupancyGridPalette, OccupancyGridRenderState } from "./occupancy-grid-resource.js";
