import {
  assertValidBounds3,
  assertValidVec3,
  computeFocusCameraState,
  computeFollowCameraState,
  computeTopCameraState,
  frameId,
  type Bounds3,
  type CameraState,
  type EntityId,
  type FollowCameraMode,
  type Vec3,
} from "@lk-design-system/lds-3d-core";

export type SceneCameraMode = "home" | "top" | "focus" | "follow" | "free";

/**
 * The subject a `follow` camera tracks, in the canvas core frame. Pass the
 * rendered (smoothed) pose, not the raw report, or the camera shakes with the
 * transport jitter the subject's own smoothing already removed.
 */
export interface SceneFollowSubject {
  readonly position: Vec3;
  /** Yaw about core +Z in radians; 0 faces +X. */
  readonly headingRadians: number;
  /** Default `third-person`. */
  readonly mode?: FollowCameraMode;
  readonly distanceMeters?: number;
  readonly heightMeters?: number;
  readonly lookAtHeightMeters?: number;
  readonly eyeHeightMeters?: number;
  readonly lookAheadMeters?: number;
}

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
  /** Width ÷ height of the canvas; bounds are fitted to it. Defaults to 16:9. */
  readonly viewportAspect?: number;
  /** Required for a `follow` pose; without it `follow` resolves to home. */
  readonly followSubject?: SceneFollowSubject;
}

const FOLLOW_POSE_FRAME = frameId("scene-follow");

function followPose(subject: SceneFollowSubject, aspect: number): SceneCameraPose {
  const state = computeFollowCameraState({
    frame: FOLLOW_POSE_FRAME,
    subjectPosition: subject.position,
    headingRadians: subject.headingRadians,
    mode: subject.mode ?? "third-person",
    projection: {
      kind: "perspective",
      verticalFovRadians: SCENE_CANVAS_VERTICAL_FOV_RADIANS,
      aspect,
      nearMeters: 0.05,
      farMeters: 10_000,
    },
    ...(subject.distanceMeters === undefined ? {} : { distanceMeters: subject.distanceMeters }),
    ...(subject.heightMeters === undefined ? {} : { heightMeters: subject.heightMeters }),
    ...(subject.lookAtHeightMeters === undefined
      ? {}
      : { lookAtHeightMeters: subject.lookAtHeightMeters }),
    ...(subject.eyeHeightMeters === undefined ? {} : { eyeHeightMeters: subject.eyeHeightMeters }),
    ...(subject.lookAheadMeters === undefined ? {} : { lookAheadMeters: subject.lookAheadMeters }),
  });
  return createCameraPose(state.position, state.target, state.up);
}

/** Vertical field of view of the SceneCanvas perspective camera (42°). */
export const SCENE_CANVAS_VERTICAL_FOV_RADIANS = (42 * Math.PI) / 180;
const DEFAULT_VIEWPORT_ASPECT = 16 / 9;
// The r3f focus view looks from this direction (x right-forward, -y, z up).
const FOCUS_VIEW_DIRECTION: Vec3 = [0.75, -1, 0.62];

// A camera state the core solver can fit against: this canvas's projection,
// looking along `direction` at `target`. Bounds fitting then comes from the
// same core function the three host uses (computeTopCameraState /
// computeFocusCameraState) instead of a second set of r3f-only constants.
function syntheticCurrent(bounds: Bounds3, direction: Vec3, up: Vec3, aspect: number): CameraState {
  const center = centerOfBounds(bounds);
  return {
    frame: bounds.frame,
    position: [center[0] + direction[0], center[1] + direction[1], center[2] + direction[2]],
    target: center,
    up,
    projection: {
      kind: "perspective",
      verticalFovRadians: SCENE_CANVAS_VERTICAL_FOV_RADIANS,
      aspect,
      nearMeters: 0.05,
      farMeters: 10_000,
    },
  };
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
  if (mode === "home" || mode === "free" || (mode === "follow" && !options.followSubject)) {
    return createCameraPose(home.position, home.target, home.up);
  }

  const focus =
    options.focusBounds === undefined
      ? (options.focusTarget ?? home.target)
      : centerOfBounds(options.focusBounds);
  const minimumDistance = options.minimumDistanceMeters ?? 4;
  const aspect = options.viewportAspect ?? DEFAULT_VIEWPORT_ASPECT;
  if (!Number.isFinite(aspect) || aspect <= 0) {
    throw new RangeError("viewportAspect must be a finite positive number.");
  }
  if (!Number.isFinite(minimumDistance) || minimumDistance <= 0) {
    throw new RangeError("minimumDistanceMeters must be a finite positive number.");
  }
  if (mode === "follow" && options.followSubject !== undefined) {
    return followPose(options.followSubject, aspect);
  }

  if (mode === "top") {
    const target =
      options.topBounds === undefined
        ? (options.topTarget ?? home.target)
        : centerOfBounds(options.topBounds);
    if (options.topBounds !== undefined && options.topHeightMeters === undefined) {
      const fitted = computeTopCameraState({
        current: syntheticCurrent(options.topBounds, [0, 0, 1], [0, 1, 0], aspect),
        target: options.topBounds,
        viewportAspect: aspect,
      });
      const height = Math.max(8, fitted.position[2] - fitted.target[2]);
      return createCameraPose([target[0], target[1], target[2] + height], target, [0, 1, 0]);
    }
    const topHeight = options.topHeightMeters ?? 26;
    if (!Number.isFinite(topHeight) || topHeight <= 0) {
      throw new RangeError("topHeightMeters must be a finite positive number.");
    }
    return createCameraPose([target[0], target[1], target[2] + topHeight], target, [0, 1, 0]);
  }

  if (options.focusBounds !== undefined) {
    const fitted = computeFocusCameraState({
      current: syntheticCurrent(options.focusBounds, FOCUS_VIEW_DIRECTION, [0, 0, 1], aspect),
      target: options.focusBounds,
      viewportAspect: aspect,
    });
    const offset: Vec3 = [
      fitted.position[0] - fitted.target[0],
      fitted.position[1] - fitted.target[1],
      fitted.position[2] - fitted.target[2],
    ];
    const fittedDistance = Math.hypot(offset[0], offset[1], offset[2]);
    const scale = Math.max(minimumDistance, fittedDistance) / fittedDistance;
    return createCameraPose(
      [
        fitted.target[0] + offset[0] * scale,
        fitted.target[1] + offset[1] * scale,
        fitted.target[2] + offset[2] * scale,
      ],
      fitted.target,
      [0, 0, 1],
    );
  }
  // A point target has no extent to fit; the fixed standoff is unchanged.
  const distance = Math.max(minimumDistance, 1.5 * 3.2);
  return createCameraPose(
    [
      focus[0] + distance * FOCUS_VIEW_DIRECTION[0],
      focus[1] + distance * FOCUS_VIEW_DIRECTION[1],
      focus[2] + distance * FOCUS_VIEW_DIRECTION[2],
    ],
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
