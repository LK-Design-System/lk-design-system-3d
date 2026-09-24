import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  aggregateSceneLayerStatus,
  type SceneLayerEntry,
  type SceneLayerStatus,
  type SceneLayerSummary,
} from "@lk-design-system/lds-3d-core";

export interface SceneLayerProps {
  readonly id: string;
  readonly children: ReactNode;
  /** Reports loading (suspended), ready (mounted) and error (threw while rendering). */
  readonly onStatusChange: (id: string, status: SceneLayerStatus) => void;
  /** Whether the error can be retried; passed through in the error status. Default true. */
  readonly recoverable?: boolean;
  /** Bump to remount a failed layer (retry). */
  readonly retryKey?: number;
}

function Report({
  id,
  status,
  onStatusChange,
}: {
  readonly id: string;
  readonly status: SceneLayerStatus;
  readonly onStatusChange: SceneLayerProps["onStatusChange"];
}): null {
  useEffect(() => {
    onStatusChange(id, status);
  }, [id, onStatusChange, status]);
  return null;
}

const LOADING: SceneLayerStatus = Object.freeze({ kind: "loading" });
const READY: SceneLayerStatus = Object.freeze({ kind: "ready" });

interface BoundaryProps {
  readonly id: string;
  readonly recoverable: boolean;
  readonly onStatusChange: SceneLayerProps["onStatusChange"];
  readonly children: ReactNode;
}

interface BoundaryState {
  readonly error: Error | null;
}

class SceneLayerBoundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: Error): void {
    this.props.onStatusChange(this.props.id, {
      kind: "error",
      message: error.message,
      recoverable: this.props.recoverable,
    });
  }

  override render(): ReactNode {
    return this.state.error === null ? this.props.children : null;
  }
}

/**
 * Isolates one scene layer: a layer that suspends reports `loading`, one that
 * mounts reports `ready`, and one that throws reports `error` and renders
 * nothing, so the rest of the scene keeps drawing.
 */
export function SceneLayer({
  id,
  children,
  onStatusChange,
  recoverable = true,
  retryKey = 0,
}: SceneLayerProps) {
  return (
    <SceneLayerBoundary
      key={retryKey}
      id={id}
      recoverable={recoverable}
      onStatusChange={onStatusChange}
    >
      <Suspense fallback={<Report id={id} status={LOADING} onStatusChange={onStatusChange} />}>
        {children}
        <Report id={id} status={READY} onStatusChange={onStatusChange} />
      </Suspense>
    </SceneLayerBoundary>
  );
}

export interface SceneLayerRegistry {
  readonly entries: readonly SceneLayerEntry[];
  readonly summary: SceneLayerSummary;
  /** Pass to `SceneLayer.onStatusChange`. */
  readonly report: (id: string, status: SceneLayerStatus) => void;
  /**
   * Marks failed layers as loading again. Call it together with bumping the
   * layers' `retryKey`: while a required layer is in error the scene is in
   * error too, and a host that hides its children then could never remount the
   * layer to report recovery.
   */
  readonly retry: (ids?: readonly string[]) => void;
}

/**
 * Collects layer statuses for one scene. `required` lists the layers whose
 * failure fails the scene; `disabled` lists layers the operator turned off.
 */
export function useSceneLayerRegistry(
  layerIds: readonly string[],
  options: { readonly required?: readonly string[]; readonly disabled?: readonly string[] } = {},
): SceneLayerRegistry {
  const [statuses, setStatuses] = useState<Readonly<Record<string, SceneLayerStatus>>>({});
  const report = useCallback((id: string, status: SceneLayerStatus): void => {
    setStatuses((current) => (current[id] === status ? current : { ...current, [id]: status }));
  }, []);
  const retry = useCallback((ids?: readonly string[]): void => {
    setStatuses((current) => {
      let changed = false;
      const next: Record<string, SceneLayerStatus> = { ...current };
      for (const [id, status] of Object.entries(current)) {
        if (status.kind !== "error" || (ids !== undefined && !ids.includes(id))) continue;
        next[id] = LOADING;
        changed = true;
      }
      return changed ? next : current;
    });
  }, []);
  const required = options.required;
  const disabled = options.disabled;
  const entries = useMemo<readonly SceneLayerEntry[]>(
    () =>
      layerIds.map((id) => ({
        id,
        required: required?.includes(id) === true,
        status: disabled?.includes(id) === true ? { kind: "disabled" } : (statuses[id] ?? LOADING),
      })),
    [disabled, layerIds, required, statuses],
  );
  const summary = useMemo(() => aggregateSceneLayerStatus(entries), [entries]);
  return useMemo(() => ({ entries, summary, report, retry }), [entries, report, retry, summary]);
}
