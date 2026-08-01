import type { SceneThemeOverrides, SceneThemeValues } from "@lk-design-system/lds-3d-core";

export type SceneVisualProfile = "operational-neutral" | "diagnostic-technical";

export interface SceneMaterialTokens {
  readonly ground: string;
  readonly assetBody: string;
  readonly assetStructure: string;
  readonly live: string;
  readonly intent: string;
  readonly selection: string;
  readonly warning: string;
  readonly error: string;
  readonly text: string;
  readonly panel: string;
  readonly panelBorder: string;
  readonly shadow: string;
}

export interface SceneVisualTheme {
  readonly id: SceneVisualProfile;
  readonly label: string;
  readonly scene: SceneThemeValues;
  readonly materials: SceneMaterialTokens;
  readonly environment: {
    readonly ambientIntensity: number;
    readonly keyIntensity: number;
    readonly fillIntensity: number;
    readonly fogNearMeters: number;
    readonly fogFarMeters: number;
  };
  readonly diagnostic: {
    readonly showAxes: boolean;
    readonly showMajorGrid: boolean;
    readonly showMinorGrid: boolean;
  };
}

const OPERATIONAL_SCENE_TOKENS: SceneThemeValues = Object.freeze({
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

const DIAGNOSTIC_SCENE_TOKENS: SceneThemeValues = Object.freeze({
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

export const OPERATIONAL_NEUTRAL_THEME: SceneVisualTheme = Object.freeze({
  id: "operational-neutral",
  label: "Operational Neutral",
  scene: OPERATIONAL_SCENE_TOKENS,
  materials: Object.freeze({
    ground: "#DCE3E8",
    assetBody: "#D9E1E6",
    assetStructure: "#60717E",
    live: "#007A66",
    intent: "#6D3CCB",
    selection: "#005FCC",
    warning: "#9A5B00",
    error: "#B42318",
    text: "#16202A",
    panel: "rgba(255, 255, 255, 0.94)",
    panelBorder: "rgba(96, 113, 126, 0.30)",
    shadow: "rgba(22, 32, 42, 0.20)",
  }),
  environment: Object.freeze({
    ambientIntensity: 1.35,
    keyIntensity: 2.4,
    fillIntensity: 0.8,
    fogNearMeters: 28,
    fogFarMeters: 72,
  }),
  diagnostic: Object.freeze({
    showAxes: false,
    showMajorGrid: true,
    showMinorGrid: true,
  }),
});

export const DIAGNOSTIC_TECHNICAL_THEME: SceneVisualTheme = Object.freeze({
  id: "diagnostic-technical",
  label: "Diagnostic Technical",
  scene: DIAGNOSTIC_SCENE_TOKENS,
  materials: Object.freeze({
    ground: "#0B1720",
    assetBody: "#20313A",
    assetStructure: "#526B78",
    live: "#4DE3C1",
    intent: "#D7A0FF",
    selection: "#43D9FF",
    warning: "#FFC857",
    error: "#FF6B78",
    text: "#E9F5FF",
    panel: "rgba(7, 16, 24, 0.92)",
    panelBorder: "rgba(67, 217, 255, 0.34)",
    shadow: "rgba(0, 0, 0, 0.50)",
  }),
  environment: Object.freeze({
    ambientIntensity: 0.72,
    keyIntensity: 2.1,
    fillIntensity: 0.48,
    fogNearMeters: 32,
    fogFarMeters: 84,
  }),
  diagnostic: Object.freeze({
    showAxes: true,
    showMajorGrid: true,
    showMinorGrid: true,
  }),
});

export const SCENE_VISUAL_THEMES: Readonly<Record<SceneVisualProfile, SceneVisualTheme>> =
  Object.freeze({
    "operational-neutral": OPERATIONAL_NEUTRAL_THEME,
    "diagnostic-technical": DIAGNOSTIC_TECHNICAL_THEME,
  });

export interface SceneThemeCustomization {
  readonly scene?: SceneThemeOverrides;
  readonly materials?: Readonly<Partial<SceneMaterialTokens>>;
}

export function resolveSceneTheme(
  profile: SceneVisualProfile | SceneVisualTheme = "operational-neutral",
  customization: SceneThemeCustomization = {},
): SceneVisualTheme {
  const base = typeof profile === "string" ? SCENE_VISUAL_THEMES[profile] : profile;
  if (customization.scene === undefined && customization.materials === undefined) {
    return base;
  }
  return Object.freeze({
    ...base,
    scene: Object.freeze({ ...base.scene, ...customization.scene }),
    materials: Object.freeze({ ...base.materials, ...customization.materials }),
  });
}
