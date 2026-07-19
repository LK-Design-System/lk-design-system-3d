import { describe, expect, it } from "vitest";

import { resolveGoalMarkerVisualState } from "../src/goal-marker.js";

describe("GoalMarker visual state", () => {
  it("uses a solid radius ring and explicit direction arrow for a valid goal", () => {
    expect(
      resolveGoalMarkerVisualState({
        animated: false,
        hovered: false,
        reducedMotion: false,
        selected: false,
        variant: "valid",
      }),
    ).toEqual({
      directionGlyph: "arrow",
      directionPlacement: "ring-edge",
      ringPattern: "solid",
      showHoverOutline: false,
      showInvalidGlyph: false,
      showPulse: false,
      showSelectionOutline: false,
    });
  });

  it("uses segmented geometry rather than wireframe for a preview goal", () => {
    expect(
      resolveGoalMarkerVisualState({
        animated: true,
        hovered: true,
        reducedMotion: false,
        selected: false,
        variant: "preview",
      }),
    ).toMatchObject({
      directionGlyph: "arrow",
      directionPlacement: "ring-edge",
      ringPattern: "segmented",
      showHoverOutline: true,
      showPulse: true,
    });
  });

  it("uses a solid radius ring, invalid glyph, and the same ring-edge arrow", () => {
    expect(
      resolveGoalMarkerVisualState({
        animated: true,
        hovered: false,
        reducedMotion: false,
        selected: false,
        variant: "invalid",
      }),
    ).toMatchObject({
      directionGlyph: "arrow",
      directionPlacement: "ring-edge",
      ringPattern: "solid",
      showInvalidGlyph: true,
      showPulse: false,
    });
  });

  it("keeps direction geometry and placement invariant across validity variants", () => {
    expect(
      (["valid", "preview", "invalid"] as const).map((variant) => {
        const state = resolveGoalMarkerVisualState({
          animated: false,
          hovered: false,
          reducedMotion: false,
          selected: false,
          variant,
        });
        return [state.directionGlyph, state.directionPlacement];
      }),
    ).toEqual([
      ["arrow", "ring-edge"],
      ["arrow", "ring-edge"],
      ["arrow", "ring-edge"],
    ]);
  });

  it("keeps selection separate from status and suppresses competing hover emphasis", () => {
    expect(
      resolveGoalMarkerVisualState({
        animated: true,
        hovered: true,
        reducedMotion: true,
        selected: true,
        variant: "valid",
      }),
    ).toMatchObject({
      showHoverOutline: false,
      showPulse: false,
      showSelectionOutline: true,
    });
  });
});
