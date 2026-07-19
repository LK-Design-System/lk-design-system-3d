export interface PathInteractionVisualState {
  readonly emissiveIntensity: number;
  readonly outlineOpacity: number;
  readonly outlineScale: number;
  readonly showInteractionOutline: boolean;
}

export function resolvePathInteractionVisualState(
  selected: boolean,
  hovered: boolean,
  executing: boolean,
): PathInteractionVisualState {
  if (selected) {
    return Object.freeze({
      emissiveIntensity: 0.72,
      outlineOpacity: 0.9,
      outlineScale: 1.5,
      showInteractionOutline: true,
    });
  }
  if (hovered) {
    return Object.freeze({
      emissiveIntensity: 0.46,
      outlineOpacity: 0.56,
      outlineScale: 1.28,
      showInteractionOutline: true,
    });
  }
  return Object.freeze({
    emissiveIntensity: executing ? 0.42 : 0.14,
    outlineOpacity: 0,
    outlineScale: 1,
    showInteractionOutline: false,
  });
}
