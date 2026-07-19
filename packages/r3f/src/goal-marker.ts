export type GoalMarkerVariant = "valid" | "preview" | "invalid";

export interface GoalMarkerVisualStateInput {
  readonly animated: boolean;
  readonly hovered: boolean;
  readonly reducedMotion: boolean;
  readonly selected: boolean;
  readonly variant: GoalMarkerVariant;
}

export interface GoalMarkerVisualState {
  readonly directionGlyph: "arrow";
  readonly directionPlacement: "ring-edge";
  readonly ringPattern: "solid" | "segmented";
  readonly showHoverOutline: boolean;
  readonly showInvalidGlyph: boolean;
  readonly showPulse: boolean;
  readonly showSelectionOutline: boolean;
}

/** Keeps spatial meaning, validity, and interaction emphasis on separate visual channels. */
export function resolveGoalMarkerVisualState({
  animated,
  hovered,
  reducedMotion,
  selected,
  variant,
}: GoalMarkerVisualStateInput): GoalMarkerVisualState {
  return {
    directionGlyph: "arrow",
    directionPlacement: "ring-edge",
    ringPattern: variant === "preview" ? "segmented" : "solid",
    showHoverOutline: hovered && !selected,
    showInvalidGlyph: variant === "invalid",
    showPulse: animated && !reducedMotion && variant !== "invalid",
    showSelectionOutline: selected,
  };
}
