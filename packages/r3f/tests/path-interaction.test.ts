import { describe, expect, it } from "vitest";

import { resolvePathInteractionVisualState } from "../src/path-interaction.js";

describe("PathRibbon interaction visuals", () => {
  it("keeps a non-interacting path at its base width and color", () => {
    expect(resolvePathInteractionVisualState(false, false, false)).toEqual({
      radiusScale: 1,
      emissiveIntensity: 0.14,
      useSelectionColor: false,
      forceSolid: false,
    });
  });

  it("uses selection color and a wider radius on hover", () => {
    expect(resolvePathInteractionVisualState(false, true, false)).toMatchObject({
      radiusScale: 1.18,
      useSelectionColor: true,
      forceSolid: false,
    });
  });

  it("gives selection precedence with the strongest solid emphasis", () => {
    expect(resolvePathInteractionVisualState(true, true, false)).toEqual({
      radiusScale: 1.45,
      emissiveIntensity: 0.72,
      useSelectionColor: true,
      forceSolid: true,
    });
  });

  it("keeps the executing glow when the path is not interacting", () => {
    expect(resolvePathInteractionVisualState(false, false, true).emissiveIntensity).toBe(0.42);
  });
});
