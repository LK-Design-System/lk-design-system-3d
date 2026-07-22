import {
  assertValidBounds3,
  assertValidVec3,
  type Bounds3,
  type EntityId,
  type Vec3,
} from "@lk-robotics/lds-3d-core";

export type SceneCameraMode = "home" | "top" | "focus" | "free";

export interface SceneCameraPose {
  readonly position: Vec3;
  readonly target: Vec3;
  readonly up: Vec3;
}

export const DEFAULT_HOME_CAMERA_POSE: SceneCameraPose = Object.freeze({
  position: Object.freeze([8, -10, 7] as const),
  target: Object.freeze([0, 0, 0.45] as const),
  up: Object.freeze([0, 0, 1] as const),
} satisfies SceneCameraPose);

export interface ResolveCameraPoseOptions {
  readonly focusTarget?: Vec3;
  readonly focusBounds?: Bounds3;
  readonly topTarget?: Vec3;
  readonly topBounds?: Bounds3;
  readonly home?: SceneCameraPose;
  readonly minimumDistanceMeters?: number;
  readonly topHeightMeters?: number;
}

function immutableVec3(value: Vec3): Vec3 {
  assertValidVec3(value);
  return Object.freeze([value[0], value[1], value[2]]);
}

function centerOfBounds(value: Bounds3): Vec3 {
  assertValidBounds3(value);
  return [
    (value.min[0] + value.max[0]) / 2,
    (value.min[1] + value.max[1]) / 2,
    (value.min[2] + value.max[2]) / 2,
  ];
}

function boundsRadius(value: Bounds3): number {
  return (
    Math.hypot(
      value.max[0] - value.min[0],
      value.max[1] - value.min[1],
      value.max[2] - value.min[2],
    ) / 2
  );
}

function createCameraPose(position: Vec3, target: Vec3, up: Vec3): SceneCameraPose {
  return Object.freeze({
    position: immutableVec3(position),
    target: immutableVec3(target),
    up: immutableVec3(up),
  });
}

export function resolveCameraPose(
  mode: SceneCameraMode,
  options: ResolveCameraPoseOptions = {},
): SceneCameraPose {
  const home = options.home ?? DEFAULT_HOME_CAMERA_POSE;
  if (mode === "home" || mode === "free") {
    return createCameraPose(home.position, home.target, home.up);
  }

  const focus =
    options.focusBounds === undefined
      ? (options.focusTarget ?? home.target)
      : centerOfBounds(options.focusBounds);
  const minimumDistance = options.minimumDistanceMeters ?? 4;
  if (!Number.isFinite(minimumDistance) || minimumDistance <= 0) {
    throw new RangeError("minimumDistanceMeters must be a finite positive number.");
  }

  if (mode === "top") {
    const target =
      options.topBounds === undefined
        ? (options.topTarget ?? home.target)
        : centerOfBounds(options.topBounds);
    const topHalfExtent =
      options.topBounds === undefined
        ? undefined
        : Math.max(
            (options.topBounds.max[0] - options.topBounds.min[0]) / 2,
            (options.topBounds.max[1] - options.topBounds.min[1]) / 2,
          );
    const topHeight =
      options.topHeightMeters ??
      (topHalfExtent === undefined
        ? 26
        : Math.max(8, (topHalfExtent / Math.tan((42 * Math.PI) / 360)) * 1.12));
    if (!Number.isFinite(topHeight) || topHeight <= 0) {
      throw new RangeError("topHeightMeters must be a finite positive number.");
    }
    return createCameraPose([target[0], target[1], target[2] + topHeight], target, [0, 1, 0]);
  }

  const radius = options.focusBounds === undefined ? 1.5 : boundsRadius(options.focusBounds);
  const distance = Math.max(minimumDistance, radius * 3.2);
  return createCameraPose(
    [focus[0] + distance * 0.75, focus[1] - distance, focus[2] + distance * 0.62],
    focus,
    [0, 0, 1],
  );
}

export interface SceneInteractionState {
  readonly hovered: EntityId | null;
  readonly selected: EntityId | null;
}

export type SceneInteractionAction =
  | { readonly type: "hover"; readonly entityId: EntityId }
  | { readonly type: "leave"; readonly entityId: EntityId }
  | { readonly type: "select"; readonly entityId: EntityId }
  | { readonly type: "clear-selection" }
  | { readonly type: "reset" };

export const EMPTY_INTERACTION_STATE: SceneInteractionState = Object.freeze({
  hovered: null,
  selected: null,
});

export function reduceSceneInteraction(
  state: SceneInteractionState,
  action: SceneInteractionAction,
): SceneInteractionState {
  switch (action.type) {
    case "hover":
      return state.hovered === action.entityId
        ? state
        : Object.freeze({ ...state, hovered: action.entityId });
    case "leave":
      return state.hovered !== action.entityId ? state : Object.freeze({ ...state, hovered: null });
    case "select":
      return state.selected === action.entityId
        ? state
        : Object.freeze({ ...state, selected: action.entityId });
    case "clear-selection":
      return state.selected === null ? state : Object.freeze({ ...state, selected: null });
    case "reset":
      return EMPTY_INTERACTION_STATE;
  }
}

export type SceneRenderState =
  | { readonly kind: "ready" }
  | { readonly kind: "loading"; readonly label?: string; readonly progress?: number }
  | { readonly kind: "empty"; readonly title?: string; readonly description?: string }
  | {
      readonly kind: "error";
      readonly title?: string;
      readonly message: string;
      readonly recoverable?: boolean;
    };

export function validateSceneRenderState(state: SceneRenderState): SceneRenderState {
  if (
    state.kind === "loading" &&
    state.progress !== undefined &&
    (!Number.isFinite(state.progress) || state.progress < 0 || state.progress > 1)
  ) {
    throw new RangeError("Loading progress must be between 0 and 1.");
  }
  return Object.freeze({ ...state });
}

export interface PathSegment {
  readonly start: Vec3;
  readonly end: Vec3;
  readonly lengthMeters: number;
}

export function createPathSegments(points: readonly Vec3[]): readonly PathSegment[] {
  if (points.length < 2) return Object.freeze([]);
  const segments: PathSegment[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    if (start === undefined || end === undefined) continue;
    assertValidVec3(start, `path.points[${(index - 1).toString()}]`);
    assertValidVec3(end, `path.points[${index.toString()}]`);
    segments.push(
      Object.freeze({
        start: immutableVec3(start),
        end: immutableVec3(end),
        lengthMeters: Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]),
      }),
    );
  }
  return Object.freeze(segments);
}

export function calculatePathLength(points: readonly Vec3[]): number {
  return createPathSegments(points).reduce((total, segment) => total + segment.lengthMeters, 0);
}
