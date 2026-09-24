/**
 * Per-layer load status and how it rolls up into one scene status. A scene is
 * made of layers that load and fail independently (terrain, buildings, point
 * cloud, robots); an optional layer failing must not blank the whole scene.
 */

export type SceneLayerStatus =
  | { readonly kind: "disabled" }
  | { readonly kind: "loading"; readonly progress?: number }
  | { readonly kind: "ready" }
  | { readonly kind: "error"; readonly message: string; readonly recoverable?: boolean };

export interface SceneLayerEntry {
  readonly id: string;
  readonly status: SceneLayerStatus;
  /** A required layer failing fails the scene. Optional failures degrade it. Default false. */
  readonly required?: boolean;
}

export type SceneLayerSummary =
  | {
      readonly kind: "loading";
      readonly loading: readonly string[];
      /** Mean progress of loading layers that report one; undefined when none do. */
      readonly progress?: number;
      readonly degraded: readonly string[];
    }
  | { readonly kind: "ready"; readonly degraded: readonly string[] }
  | {
      readonly kind: "error";
      readonly failed: readonly string[];
      readonly message: string;
      /** True only when every failed required layer is recoverable. */
      readonly recoverable: boolean;
    }
  | { readonly kind: "empty" };

function assertStatus(entry: SceneLayerEntry): void {
  if (entry.id.trim() === "") throw new RangeError("Layer id must be non-empty.");
  const { status } = entry;
  if (
    status.kind === "loading" &&
    status.progress !== undefined &&
    (!Number.isFinite(status.progress) || status.progress < 0 || status.progress > 1)
  ) {
    throw new RangeError(`Layer "${entry.id}" progress must be between 0 and 1.`);
  }
}

/**
 * Rolls layer statuses into one scene status:
 * - any required layer in error → error;
 * - otherwise any enabled layer still loading → loading;
 * - otherwise ready, listing optional layers that failed as `degraded`;
 * - no enabled layers at all → empty.
 */
export function aggregateSceneLayerStatus(layers: readonly SceneLayerEntry[]): SceneLayerSummary {
  const ids = new Set<string>();
  for (const layer of layers) {
    assertStatus(layer);
    if (ids.has(layer.id)) throw new RangeError(`Duplicate layer id "${layer.id}".`);
    ids.add(layer.id);
  }
  const enabled = layers.filter((layer) => layer.status.kind !== "disabled");
  if (enabled.length === 0) return Object.freeze({ kind: "empty" as const });

  const failedRequired = enabled.filter(
    (layer) => layer.required === true && layer.status.kind === "error",
  );
  if (failedRequired.length > 0) {
    const messages = failedRequired.map((layer) =>
      layer.status.kind === "error" ? layer.status.message : "",
    );
    return Object.freeze({
      kind: "error" as const,
      failed: Object.freeze(failedRequired.map((layer) => layer.id)),
      message: messages.join(" · "),
      recoverable: failedRequired.every(
        (layer) => layer.status.kind === "error" && layer.status.recoverable === true,
      ),
    });
  }

  const degraded = Object.freeze(
    enabled.filter((layer) => layer.status.kind === "error").map((layer) => layer.id),
  );
  const loading = enabled.filter((layer) => layer.status.kind === "loading");
  if (loading.length > 0) {
    const reported = loading
      .map((layer) => (layer.status.kind === "loading" ? layer.status.progress : undefined))
      .filter((value): value is number => value !== undefined);
    const progress =
      reported.length === 0
        ? undefined
        : reported.reduce((sum, value) => sum + value, 0) / reported.length;
    return Object.freeze({
      kind: "loading" as const,
      loading: Object.freeze(loading.map((layer) => layer.id)),
      ...(progress === undefined ? {} : { progress }),
      degraded,
    });
  }
  return Object.freeze({ kind: "ready" as const, degraded });
}
