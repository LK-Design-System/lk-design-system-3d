/**
 * The subset of R3F frame loops that SceneCanvas can own safely. `never` is
 * deliberately excluded because it requires caller-managed manual advancement.
 */
export type SceneFrameLoop = "always" | "demand";

/**
 * Rendering cost and visual-fidelity policy for a SceneCanvas host.
 *
 * Every preset is demand-driven so a scene becomes idle after camera and
 * primitive motion settles. Continuous rendering remains an explicit
 * `frameLoop="always"` override for caller-owned animation.
 */
export type SceneRenderQuality = "performance" | "balanced" | "high";

type SceneDevicePixelRatio = number | readonly [number, number];
type ScenePowerPreference = "default" | "low-power" | "high-performance";

interface SceneRenderQualityPreset {
  readonly antialias: boolean;
  readonly devicePixelRatio: SceneDevicePixelRatio;
  readonly frameLoop: SceneFrameLoop;
  readonly powerPreference: ScenePowerPreference;
  readonly shadowMapSize: number;
  readonly shadows: boolean;
}

interface SceneRenderQualityOverrides {
  readonly devicePixelRatio?: SceneDevicePixelRatio;
  readonly frameLoop?: SceneFrameLoop;
  readonly shadowMapSize?: number;
}

type ResolvedSceneRenderQuality = SceneRenderQualityPreset;

const PERFORMANCE_RENDER_QUALITY: SceneRenderQualityPreset = Object.freeze({
  antialias: false,
  devicePixelRatio: 1,
  frameLoop: "demand",
  powerPreference: "low-power",
  shadowMapSize: 512,
  shadows: false,
});

const BALANCED_RENDER_QUALITY: SceneRenderQualityPreset = Object.freeze({
  antialias: true,
  devicePixelRatio: Object.freeze([1, 1.5] as const),
  frameLoop: "demand",
  powerPreference: "default",
  shadowMapSize: 1024,
  shadows: true,
});

const HIGH_RENDER_QUALITY: SceneRenderQualityPreset = Object.freeze({
  antialias: true,
  devicePixelRatio: Object.freeze([1, 2] as const),
  frameLoop: "demand",
  powerPreference: "high-performance",
  shadowMapSize: 2048,
  shadows: true,
});

const SCENE_RENDER_QUALITY_PRESETS: Readonly<Record<SceneRenderQuality, SceneRenderQualityPreset>> =
  Object.freeze({
    performance: PERFORMANCE_RENDER_QUALITY,
    balanced: BALANCED_RENDER_QUALITY,
    high: HIGH_RENDER_QUALITY,
  });

/** Default public policy: visually useful while avoiding idle continuous rendering. */
export const DEFAULT_SCENE_RENDER_QUALITY: SceneRenderQuality = "balanced";

/** The balanced profile's demand-driven frame-loop default. */
export const DEFAULT_SCENE_FRAME_LOOP: SceneFrameLoop = "demand";

/** The balanced profile's primary directional-light shadow-map resolution. */
export const DEFAULT_SCENE_SHADOW_MAP_SIZE = 1024;

/**
 * Resolves an explicit quality profile, then applies caller-owned cost
 * overrides. The profile itself never enables continuous rendering.
 */
export function resolveSceneRenderQuality(
  quality: SceneRenderQuality = DEFAULT_SCENE_RENDER_QUALITY,
  overrides: SceneRenderQualityOverrides = {},
): ResolvedSceneRenderQuality {
  const preset = SCENE_RENDER_QUALITY_PRESETS[quality];
  return {
    ...preset,
    ...(overrides.devicePixelRatio === undefined
      ? {}
      : { devicePixelRatio: overrides.devicePixelRatio }),
    ...(overrides.frameLoop === undefined ? {} : { frameLoop: overrides.frameLoop }),
    ...(overrides.shadowMapSize === undefined ? {} : { shadowMapSize: overrides.shadowMapSize }),
  };
}

/**
 * Returns whether an active scene behavior needs to request one more frame
 * under R3F's demand loop. Continuous and manually advanced roots must not
 * accumulate invalidations.
 */
export function shouldScheduleDemandFrame(
  frameLoop: SceneFrameLoop | "never",
  active: boolean,
): boolean {
  return frameLoop === "demand" && active;
}
