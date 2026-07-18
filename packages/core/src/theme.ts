/** Experimental semantic scene tokens; subject to the G-D0 design gate. */
export type SceneTokenName =
  | "scene.background"
  | "grid.major"
  | "grid.minor"
  | "axis.x"
  | "axis.y"
  | "axis.z"
  | "selection.active"
  | "path.default"
  | "goal.default"
  | "warning";

export type SceneThemeValues = Readonly<Record<SceneTokenName, string>>;
export type SceneThemeOverrides = Readonly<Partial<Record<SceneTokenName, string>>>;
