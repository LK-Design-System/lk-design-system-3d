/**
 * How much the displayed pose can be trusted, in the LDS Robotics
 * NavigationCoordinateSystem freshness vocabulary so 2D and 3D read alike.
 * LDS3D does not judge freshness; the product (or Robotics UI) decides and
 * passes the result.
 *
 * - `fresh`: the pose is current.
 * - `stale`: the pose stopped updating (including a stream that keeps
 *   republishing the same coordinates); it is the last known position.
 * - `expired`: stale for long enough that the position should not be relied on.
 * - `future`: timestamped ahead of the clock; shown but not trusted.
 */
export type RobotPoseFreshness = "fresh" | "stale" | "expired" | "future";

/** Optional localization uncertainty around the pose, drawn as a ground disc. */
export interface RobotLocalizationUncertainty {
  /** 1-sigma (or product-defined) horizontal radius in metres. */
  readonly radiusMeters: number;
}

export interface RobotPoseFreshnessVisual {
  /** Body opacity. Fresh robots are solid; untrusted poses fade. */
  readonly bodyOpacity: number;
  /** A dashed ground ring marks "last known position" without relying on colour. */
  readonly lastKnownRing: boolean;
  /** Whether the status beacon may stay lit. */
  readonly beaconAllowed: boolean;
}

const VISUALS: Readonly<Record<RobotPoseFreshness, RobotPoseFreshnessVisual>> = Object.freeze({
  fresh: Object.freeze({ bodyOpacity: 1, lastKnownRing: false, beaconAllowed: true }),
  stale: Object.freeze({ bodyOpacity: 0.62, lastKnownRing: true, beaconAllowed: false }),
  expired: Object.freeze({ bodyOpacity: 0.36, lastKnownRing: true, beaconAllowed: false }),
  future: Object.freeze({ bodyOpacity: 0.62, lastKnownRing: true, beaconAllowed: false }),
});

export function resolveRobotPoseFreshnessVisual(
  freshness: RobotPoseFreshness,
): RobotPoseFreshnessVisual {
  return VISUALS[freshness];
}

export function assertValidLocalizationUncertainty(value: RobotLocalizationUncertainty): void {
  if (!Number.isFinite(value.radiusMeters) || value.radiusMeters < 0) {
    throw new RangeError("localization.radiusMeters must be a finite non-negative number.");
  }
}
