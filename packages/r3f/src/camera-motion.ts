export type CameraMotionPolicy =
  | { readonly kind: "instant" }
  | { readonly kind: "animated"; readonly speed: number };

export function resolveCameraMotionPolicy(
  prefersReducedMotion: boolean,
  requestedSpeed = 6,
): CameraMotionPolicy {
  if (!Number.isFinite(requestedSpeed) || requestedSpeed <= 0) {
    throw new RangeError("Camera transition speed must be a finite positive number.");
  }
  return prefersReducedMotion
    ? Object.freeze({ kind: "instant" })
    : Object.freeze({ kind: "animated", speed: requestedSpeed });
}
