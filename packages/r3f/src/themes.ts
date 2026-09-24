import {
  DEFAULT_SCENE_LIGHTING,
  DIAGNOSTIC_SCENE_TOKENS,
  OPERATIONAL_SCENE_TOKENS,
  type SceneThemeOverrides,
  type SceneThemeValues,
} from "@lk-design-system/lds-3d-core";

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
  /**
   * Overlay families that had hard-coded colours in their components
   * (CameraFrustum, VoxelLayer, PointCloudLayer). Optional so an existing
   * custom theme stays valid; the built-in profiles define all three.
   */
  readonly sensor?: string;
  readonly occupancy?: string;
  readonly pointCloud?: string;
}

/** Screen-space line weights, in CSS pixels, so thin lines stay legible at any distance. */
export interface SceneLineTokens {
  /** Travelled trail. */
  readonly trailWidthPx: number;
  /** Planned route. */
  readonly routeWidthPx: number;
  readonly routeDashPx: number;
  readonly routeGapPx: number;
  /** Floor for ribbons measured in metres (PathRibbon `minScreenWidthPx`). */
  readonly ribbonMinWidthPx: number;
}

/**
 * Map-label style. Colours map to LDS semantic roles in the composition
 * layer (text, elevated surface, line, primary); the renderer only reads the
 * resolved values.
 */
export interface SceneLabelTokens {
  readonly fontFamily: string;
  readonly fontWeight: number;
  readonly fontSizePx: number;
  readonly lineHeightPx: number;
  readonly paddingXPx: number;
  readonly paddingYPx: number;
  readonly radiusPx: number;
  readonly text: string;
  readonly background: string;
  readonly border: string;
  /** Selected or emphasised label. */
  readonly accent: string;
}

/**
 * Natural surfaces with no LDS UI counterpart. They stay LDS3D defaults
 * rather than borrowing UI roles that mean something else.
 */
export interface SceneNatureTokens {
  readonly skyZenith: string;
  readonly skyHorizon: string;
  readonly terrain: string;
  readonly vegetation: string;
  readonly pavement: string;
}

export interface SceneVisualTheme {
  readonly id: SceneVisualProfile;
  readonly label: string;
  readonly scene: SceneThemeValues;
  readonly materials: SceneMaterialTokens;
  /** Optional so a custom theme written before 2026-09 stays valid; resolve with `resolveSceneLineTokens`. */
  readonly lines?: SceneLineTokens;
  readonly labels?: SceneLabelTokens;
  readonly nature?: SceneNatureTokens;
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

// Scene token values live in core (OPERATIONAL_/DIAGNOSTIC_SCENE_TOKENS) so
// every host reads one palette. Four materials are the same semantics as
// scene tokens and are DERIVED from them rather than restated: an override
// of "path.default" used to recolour the three host and leave r3f's
// `materials.live` on the old value.
function linkedMaterials(scene: SceneThemeValues) {
  return {
    live: scene["path.default"],
    intent: scene["goal.default"],
    selection: scene["selection.active"],
    warning: scene.warning,
  } as const;
}

/** Last-resort overlay colours for a theme that omits the optional tokens. */
export const DEFAULT_OVERLAY_COLORS = Object.freeze({
  sensor: "#43D9FF",
  occupancy: "#F0803C",
  pointCloud: "#3C9DFF",
} as const);

export const DEFAULT_SCENE_LINE_TOKENS: SceneLineTokens = Object.freeze({
  trailWidthPx: 3,
  routeWidthPx: 2,
  routeDashPx: 8,
  routeGapPx: 6,
  ribbonMinWidthPx: 6,
});

const LABEL_BASE = Object.freeze({
  fontFamily: 'Pretendard, "Noto Sans KR", system-ui, sans-serif',
  fontWeight: 600,
  fontSizePx: 13,
  lineHeightPx: 18,
  paddingXPx: 8,
  paddingYPx: 3,
  radiusPx: 4,
});

export const OPERATIONAL_SCENE_LABEL_TOKENS: SceneLabelTokens = Object.freeze({
  ...LABEL_BASE,
  text: "#16202A",
  background: "rgba(255, 255, 255, 0.94)",
  border: "rgba(96, 113, 126, 0.30)",
  accent: OPERATIONAL_SCENE_TOKENS["selection.active"],
});

export const DIAGNOSTIC_SCENE_LABEL_TOKENS: SceneLabelTokens = Object.freeze({
  ...LABEL_BASE,
  text: "#E9F5FF",
  background: "rgba(7, 16, 24, 0.92)",
  border: "rgba(67, 217, 255, 0.34)",
  accent: DIAGNOSTIC_SCENE_TOKENS["selection.active"],
});

export const OPERATIONAL_SCENE_NATURE_TOKENS: SceneNatureTokens = Object.freeze({
  skyZenith: "#5B86BD",
  skyHorizon: "#C3D2DE",
  terrain: "#B8B39E",
  vegetation: "#4F6B3E",
  pavement: "#B4A184",
});

export const DIAGNOSTIC_SCENE_NATURE_TOKENS: SceneNatureTokens = Object.freeze({
  skyZenith: "#050B11",
  skyHorizon: "#12222C",
  terrain: "#1C2A31",
  vegetation: "#23402F",
  pavement: "#3A4650",
});

export const OPERATIONAL_NEUTRAL_THEME: SceneVisualTheme = Object.freeze({
  id: "operational-neutral",
  label: "Operational Neutral",
  scene: OPERATIONAL_SCENE_TOKENS,
  materials: Object.freeze({
    ground: "#DCE3E8",
    assetBody: "#D9E1E6",
    assetStructure: "#60717E",
    ...linkedMaterials(OPERATIONAL_SCENE_TOKENS),
    error: "#B42318",
    sensor: "#1570EF",
    occupancy: "#B54708",
    pointCloud: "#2E90FA",
    text: "#16202A",
    panel: "rgba(255, 255, 255, 0.94)",
    panelBorder: "rgba(96, 113, 126, 0.30)",
    shadow: "rgba(22, 32, 42, 0.20)",
  }),
  lines: DEFAULT_SCENE_LINE_TOKENS,
  labels: OPERATIONAL_SCENE_LABEL_TOKENS,
  nature: OPERATIONAL_SCENE_NATURE_TOKENS,
  environment: Object.freeze({
    ...DEFAULT_SCENE_LIGHTING,
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
    ...linkedMaterials(DIAGNOSTIC_SCENE_TOKENS),
    error: "#FF6B78",
    // The values these components hard-coded, which were tuned on this profile.
    sensor: "#43D9FF",
    occupancy: "#F0803C",
    pointCloud: "#3C9DFF",
    text: "#E9F5FF",
    panel: "rgba(7, 16, 24, 0.92)",
    panelBorder: "rgba(67, 217, 255, 0.34)",
    shadow: "rgba(0, 0, 0, 0.50)",
  }),
  lines: DEFAULT_SCENE_LINE_TOKENS,
  labels: DIAGNOSTIC_SCENE_LABEL_TOKENS,
  nature: DIAGNOSTIC_SCENE_NATURE_TOKENS,
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
  readonly lines?: Readonly<Partial<SceneLineTokens>>;
  readonly labels?: Readonly<Partial<SceneLabelTokens>>;
  readonly nature?: Readonly<Partial<SceneNatureTokens>>;
}

/** Line weights for a theme, falling back to the LDS3D defaults. */
export function resolveSceneLineTokens(theme: SceneVisualTheme): SceneLineTokens {
  return theme.lines ?? DEFAULT_SCENE_LINE_TOKENS;
}

/** Label style for a theme, falling back to the operational defaults. */
export function resolveSceneLabelTokens(theme: SceneVisualTheme): SceneLabelTokens {
  return theme.labels ?? OPERATIONAL_SCENE_LABEL_TOKENS;
}

/** Natural surface colours for a theme, falling back to the operational defaults. */
export function resolveSceneNatureTokens(theme: SceneVisualTheme): SceneNatureTokens {
  return theme.nature ?? OPERATIONAL_SCENE_NATURE_TOKENS;
}

export function resolveSceneTheme(
  profile: SceneVisualProfile | SceneVisualTheme = "operational-neutral",
  customization: SceneThemeCustomization = {},
): SceneVisualTheme {
  const base = typeof profile === "string" ? SCENE_VISUAL_THEMES[profile] : profile;
  if (
    customization.scene === undefined &&
    customization.materials === undefined &&
    customization.lines === undefined &&
    customization.labels === undefined &&
    customization.nature === undefined
  ) {
    return base;
  }
  const scene = Object.freeze({ ...base.scene, ...customization.scene });
  return Object.freeze({
    ...base,
    scene,
    // Linked materials follow the resolved scene tokens; an explicit material
    // override still wins.
    materials: Object.freeze({
      ...base.materials,
      ...linkedMaterials(scene),
      ...customization.materials,
    }),
    lines: Object.freeze({ ...resolveSceneLineTokens(base), ...customization.lines }),
    labels: Object.freeze({ ...resolveSceneLabelTokens(base), ...customization.labels }),
    nature: Object.freeze({ ...resolveSceneNatureTokens(base), ...customization.nature }),
  });
}
