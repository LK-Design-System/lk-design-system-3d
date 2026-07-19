import { describe, expect, it } from "vitest";

import { resolvePathInteractionVisualState } from "../src/path-interaction.js";

describe("PathRibbon interaction visuals", () => {
  it("keeps a non-interacting path without a competing outline", () => {
    expect(resolvePathInteractionVisualState(false, false, false)).toEqual({
      emissiveIntensity: 0.14,
      outlineOpacity: 0,
      outlineScale: 1,
      showInteractionOutline: false,
    });
  });

  it("adds a separate outline on hover without replacing path status", () => {
    expect(resolvePathInteractionVisualState(false, true, false)).toMatchObject({
      outlineOpacity: 0.56,
      outlineScale: 1.28,
      showInteractionOutline: true,
    });
  });

  it("gives selection precedence with the strongest separate outline", () => {
    expect(resolvePathInteractionVisualState(true, true, false)).toEqual({
      emissiveIntensity: 0.72,
      outlineOpacity: 0.9,
      outlineScale: 1.5,
      showInteractionOutline: true,
    });
  });

  it("keeps the executing glow when the path is not interacting", () => {
    expect(resolvePathInteractionVisualState(false, false, true).emissiveIntensity).toBe(0.42);
  });
});
