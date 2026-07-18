export interface PathInteractionVisualState {
  readonly radiusScale: number;
  readonly emissiveIntensity: number;
  readonly useSelectionColor: boolean;
  readonly forceSolid: boolean;
}

export function resolvePathInteractionVisualState(
  selected: boolean,
  hovered: boolean,
  executing: boolean,
): PathInteractionVisualState {
  if (selected) {
    return Object.freeze({
      radiusScale: 1.45,
      emissiveIntensity: 0.72,
      useSelectionColor: true,
      forceSolid: true,
    });
  }
  if (hovered) {
    return Object.freeze({
      radiusScale: 1.18,
      emissiveIntensity: 0.46,
      useSelectionColor: true,
      forceSolid: false,
    });
  }
  return Object.freeze({
    radiusScale: 1,
    emissiveIntensity: executing ? 0.42 : 0.14,
    useSelectionColor: false,
    forceSolid: false,
  });
}
