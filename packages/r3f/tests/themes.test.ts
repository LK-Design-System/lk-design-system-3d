import { describe, expect, it } from "vitest";

import {
  DIAGNOSTIC_TECHNICAL_THEME,
  OPERATIONAL_NEUTRAL_THEME,
  resolveSceneTheme,
} from "../src/themes.js";

describe("visual themes", () => {
  it("uses Operational Neutral as the low-chroma default", () => {
    const theme = resolveSceneTheme();
    expect(theme).toBe(OPERATIONAL_NEUTRAL_THEME);
    expect(theme.scene["scene.background"]).toBe("#E9EEF2");
    expect(theme.materials.selection).toBe("#005FCC");
    expect(theme.materials.live).not.toBe(theme.materials.selection);
  });

  it("keeps Diagnostic Technical as the advanced profile", () => {
    const theme = resolveSceneTheme("diagnostic-technical");
    expect(theme).toBe(DIAGNOSTIC_TECHNICAL_THEME);
    expect(theme.diagnostic.showAxes).toBe(true);
    expect(theme.scene["grid.major"]).toBe("#23607D");
  });

  it("merges semantic overrides without mutating the baseline", () => {
    const theme = resolveSceneTheme("operational-neutral", {
      scene: { warning: "#FF00FF" },
      materials: { ground: "#101010" },
    });
    expect(theme.scene.warning).toBe("#FF00FF");
    expect(theme.materials.ground).toBe("#101010");
    expect(OPERATIONAL_NEUTRAL_THEME.scene.warning).toBe("#9A5B00");
    expect(OPERATIONAL_NEUTRAL_THEME.materials.ground).toBe("#DCE3E8");
  });
});
