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

/**
 * The canonical scene token values, one set per visual profile. Renderer
 * hosts read these instead of carrying their own defaults: the three host used
 * to ship a private palette with path and goal swapped (path violet, goal
 * teal) against the r3f host and docs/VISUAL_ALPHA_REFERENCE_RESEARCH.md
 * (live/executing teal, intent/goal violet), so the same scene rendered with
 * opposite meanings depending on the host.
 */
export const OPERATIONAL_SCENE_TOKENS: SceneThemeValues = Object.freeze({
  "scene.background": "#E9EEF2",
  "grid.major": "#94A4AF",
  "grid.minor": "#C5CFD6",
  "axis.x": "#D92D20",
  "axis.y": "#039855",
  "axis.z": "#1570EF",
  "selection.active": "#005FCC",
  "path.default": "#007A66",
  "goal.default": "#6D3CCB",
  warning: "#9A5B00",
});

export const DIAGNOSTIC_SCENE_TOKENS: SceneThemeValues = Object.freeze({
  "scene.background": "#071018",
  "grid.major": "#23607D",
  "grid.minor": "#153245",
  "axis.x": "#FF6B78",
  "axis.y": "#4DE3C1",
  "axis.z": "#43D9FF",
  "selection.active": "#43D9FF",
  "path.default": "#4DE3C1",
  "goal.default": "#D7A0FF",
  warning: "#FFC857",
});

/** Default tokens with overrides applied — the one resolution every host uses. */
export function resolveSceneTokens(
  overrides: SceneThemeOverrides = {},
  base: SceneThemeValues = OPERATIONAL_SCENE_TOKENS,
): SceneThemeValues {
  return Object.freeze({ ...base, ...overrides });
}

/**
 * Default key/ambient light intensities for the operational profile. Colour
 * alone does not make two hosts look alike: the three host lit its scenes at
 * 1.25/2.1 while the r3f operational profile used 1.35/2.4.
 */
export const DEFAULT_SCENE_LIGHTING = Object.freeze({
  ambientIntensity: 1.35,
  keyIntensity: 2.4,
});
