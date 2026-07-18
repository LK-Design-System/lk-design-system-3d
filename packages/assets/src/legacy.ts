/* eslint-disable @typescript-eslint/no-deprecated -- This isolated subpath implements the deprecated migration API itself. */

import type { Axis, RigidTransform3, Vec3 } from "@lk-robotics/design-system-3d-core";

import type { AssetManifestV1 } from "./manifest.js";
import { axisToVector, rotateVectorByQuaternion } from "./spatial.js";

/** @deprecated Migration-only evidence. Use an owner-approved manifest. */
export interface LegacyAssetEvidence {
  readonly bounds: {
    readonly min: Vec3;
    readonly max: Vec3;
  };
  readonly knownPlacement?: RigidTransform3;
}

/** @deprecated Migration-only report. Inference is never production authority. */
export interface LegacyAssetInferenceReport {
  readonly inferred: boolean;
  readonly confidence: "low" | "medium" | "high";
  readonly coordinate?: AssetManifestV1["fileCoordinate"];
  readonly warnings: readonly string[];
}

const SIGNED_AXES: readonly Axis[] = ["+X", "-X", "+Y", "-Y", "+Z", "-Z"];

function isFiniteBounds(bounds: LegacyAssetEvidence["bounds"]): boolean {
  return (
    bounds.min.every(Number.isFinite) &&
    bounds.max.every(Number.isFinite) &&
    bounds.min[0] <= bounds.max[0] &&
    bounds.min[1] <= bounds.max[1] &&
    bounds.min[2] <= bounds.max[2]
  );
}

function dot(left: Vec3, right: Vec3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function bestSourceAxisForCoreDirection(
  placement: RigidTransform3,
  target: Vec3,
): { axis: Axis; alignment: number } | undefined {
  const norm = Math.hypot(...placement.rotation);
  if (!Number.isFinite(norm) || Math.abs(norm - 1) > 1e-6) {
    return undefined;
  }

  let best: { axis: Axis; alignment: number } | undefined;
  for (const axis of SIGNED_AXES) {
    const alignment = dot(rotateVectorByQuaternion(placement.rotation, axisToVector(axis)), target);
    if (best === undefined || alignment > best.alignment) {
      best = { axis, alignment };
    }
  }
  return best;
}

function inferFromKnownPlacement(
  placement: RigidTransform3,
): LegacyAssetInferenceReport | undefined {
  const up = bestSourceAxisForCoreDirection(placement, [0, 0, 1]);
  const forward = bestSourceAxisForCoreDirection(placement, [1, 0, 0]);
  if (
    up === undefined ||
    forward === undefined ||
    up.axis[1] === forward.axis[1] ||
    up.alignment < 0.95 ||
    forward.alignment < 0.95
  ) {
    return undefined;
  }

  const minimumAlignment = Math.min(up.alignment, forward.alignment);
  return Object.freeze({
    inferred: true,
    confidence: minimumAlignment >= 1 - 1e-6 ? "high" : "medium",
    coordinate: Object.freeze({
      handedness: "right",
      upAxis: up.axis,
      forwardAxis: forward.axis,
      metersPerUnit: 1,
    }),
    warnings: Object.freeze([
      "Axes were inferred from a known placement rotation; the asset owner must approve them.",
      "metersPerUnit cannot be inferred from rotation and defaults to 1.",
    ]),
  });
}

function unsignedAxis(index: number): Axis {
  switch (index) {
    case 0:
      return "+X";
    case 1:
      return "+Y";
    default:
      return "+Z";
  }
}

/**
 * @deprecated Migration-only heuristic. It never replaces explicit asset
 * metadata and its result must be approved before creating a V1 manifest.
 */
export function inferLegacyAssetCoordinate(input: LegacyAssetEvidence): LegacyAssetInferenceReport {
  if (!isFiniteBounds(input.bounds)) {
    return Object.freeze({
      inferred: false,
      confidence: "low",
      warnings: Object.freeze(["Cannot infer coordinates from non-finite or inverted bounds."]),
    });
  }

  if (input.knownPlacement !== undefined) {
    const placementInference = inferFromKnownPlacement(input.knownPlacement);
    if (placementInference !== undefined) {
      return placementInference;
    }
  }

  const dimensions = [
    input.bounds.max[0] - input.bounds.min[0],
    input.bounds.max[1] - input.bounds.min[1],
    input.bounds.max[2] - input.bounds.min[2],
  ] as const;
  const ordered = [
    { index: 0, extent: dimensions[0] },
    { index: 1, extent: dimensions[1] },
    { index: 2, extent: dimensions[2] },
  ].sort((left, right) => right.extent - left.extent);
  const upIndex = ordered[0]?.index ?? 2;
  const forwardIndex = ordered[1]?.index ?? 0;

  return Object.freeze({
    inferred: true,
    confidence: "low",
    coordinate: Object.freeze({
      handedness: "right",
      upAxis: unsignedAxis(upIndex),
      forwardAxis: unsignedAxis(forwardIndex),
      metersPerUnit: 1,
    }),
    warnings: Object.freeze([
      "Axes were guessed from bounds extents and may be wrong for flat maps or elongated robots.",
      "Axis signs and metersPerUnit are not observable from bounds and use +axis/1 meter defaults.",
      "Create an explicit owner-approved manifest before production use.",
    ]),
  });
}
