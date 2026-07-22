import type { Axis, FramedPoint3, Quat, Vec3 } from "@lk-robotics/lds-3d-core";

import type { AssetManifestV1, FileCoordinate } from "./manifest.js";

const AXIS_EPSILON = 1e-6;

/** The coordinate convention mandated by glTF 2.0. */
export const GLTF_Y_UP_COORDINATE = Object.freeze({
  handedness: "right",
  upAxis: "+Y",
  forwardAxis: "+Z",
  metersPerUnit: 1,
} as const satisfies FileCoordinate);

export function axisToVector(axis: Axis): Vec3 {
  switch (axis) {
    case "+X":
      return [1, 0, 0];
    case "-X":
      return [-1, 0, 0];
    case "+Y":
      return [0, 1, 0];
    case "-Y":
      return [0, -1, 0];
    case "+Z":
      return [0, 0, 1];
    case "-Z":
      return [0, 0, -1];
  }
}

export function axesAreOrthogonal(left: Axis, right: Axis): boolean {
  return left[1] !== right[1];
}

function cross(left: Vec3, right: Vec3): Vec3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function normalizeQuaternion(value: Quat): Quat {
  const norm = Math.hypot(value[0], value[1], value[2], value[3]);
  if (!Number.isFinite(norm) || norm <= Number.EPSILON) {
    throw new TypeError("Quaternion must have a finite, non-zero norm.");
  }

  let result: Quat = [value[0] / norm, value[1] / norm, value[2] / norm, value[3] / norm];

  // q and -q encode the same rotation. A canonical positive-w result makes
  // generated manifests and snapshots deterministic.
  if (result[3] < 0) {
    result = [-result[0], -result[1], -result[2], -result[3]];
  }
  return result;
}

function rowMajorRotationMatrixToQuaternion(
  r00: number,
  r01: number,
  r02: number,
  r10: number,
  r11: number,
  r12: number,
  r20: number,
  r21: number,
  r22: number,
): Quat {
  const trace = r00 + r11 + r22;
  let value: Quat;

  if (trace > 0) {
    const scale = Math.sqrt(trace + 1) * 2;
    value = [(r21 - r12) / scale, (r02 - r20) / scale, (r10 - r01) / scale, scale / 4];
  } else if (r00 > r11 && r00 > r22) {
    const scale = Math.sqrt(1 + r00 - r11 - r22) * 2;
    value = [scale / 4, (r01 + r10) / scale, (r02 + r20) / scale, (r21 - r12) / scale];
  } else if (r11 > r22) {
    const scale = Math.sqrt(1 + r11 - r00 - r22) * 2;
    value = [(r01 + r10) / scale, scale / 4, (r12 + r21) / scale, (r02 - r20) / scale];
  } else {
    const scale = Math.sqrt(1 + r22 - r00 - r11) * 2;
    value = [(r02 + r20) / scale, (r12 + r21) / scale, scale / 4, (r10 - r01) / scale];
  }

  return normalizeQuaternion(value);
}

/**
 * Computes the unique proper rotation that maps a declared right-handed file
 * basis to LK core (`+X` forward, `+Z` up).
 *
 * This is deterministic conversion of explicit metadata, not axis inference.
 * For the glTF convention (`+Y` up, `+Z` forward), it returns
 * `[0.5, 0.5, 0.5, 0.5]` (x, y, z, w).
 */
export function createFileToCoreRotation(upAxis: Axis, forwardAxis: Axis): Quat {
  if (!axesAreOrthogonal(upAxis, forwardAxis)) {
    throw new TypeError("upAxis and forwardAxis must use different base axes.");
  }

  const up = axisToVector(upAxis);
  const forward = axisToVector(forwardAxis);
  const left = cross(up, forward);

  // Source basis columns are [forward, left, up]. The target basis is the
  // identity [core +X, core +Y, core +Z], hence R = transpose(source basis).
  return rowMajorRotationMatrixToQuaternion(
    forward[0],
    forward[1],
    forward[2],
    left[0],
    left[1],
    left[2],
    up[0],
    up[1],
    up[2],
  );
}

export function rotateVectorByQuaternion(rotation: Quat, value: Vec3): Vec3 {
  const [qx, qy, qz, qw] = rotation;
  const [vx, vy, vz] = value;

  // q * v * conjugate(q), expanded without allocations.
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return [
    vx + qw * tx + (qy * tz - qz * ty),
    vy + qw * ty + (qz * tx - qx * tz),
    vz + qw * tz + (qx * ty - qy * tx),
  ];
}

export function rotationMatchesCoordinate(
  rotation: Quat,
  coordinate: Pick<FileCoordinate, "upAxis" | "forwardAxis">,
  tolerance = AXIS_EPSILON,
): boolean {
  const rotatedUp = rotateVectorByQuaternion(rotation, axisToVector(coordinate.upAxis));
  const rotatedForward = rotateVectorByQuaternion(rotation, axisToVector(coordinate.forwardAxis));
  return (
    vectorsAlmostEqual(rotatedUp, [0, 0, 1], tolerance) &&
    vectorsAlmostEqual(rotatedForward, [1, 0, 0], tolerance)
  );
}

function vectorsAlmostEqual(left: Vec3, right: Vec3, tolerance: number): boolean {
  return (
    Math.abs(left[0] - right[0]) <= tolerance &&
    Math.abs(left[1] - right[1]) <= tolerance &&
    Math.abs(left[2] - right[2]) <= tolerance
  );
}

/**
 * Applies the normative asset conversion order: unit scale, declared basis
 * rotation, then meter-valued translation into the core frame.
 */
export function normalizeAssetPointToCore(
  manifest: AssetManifestV1,
  rawFilePosition: Vec3,
): FramedPoint3 {
  if (!rawFilePosition.every(Number.isFinite)) {
    throw new TypeError("rawFilePosition must contain only finite numbers.");
  }

  const meters: Vec3 = [
    rawFilePosition[0] * manifest.fileCoordinate.metersPerUnit,
    rawFilePosition[1] * manifest.fileCoordinate.metersPerUnit,
    rawFilePosition[2] * manifest.fileCoordinate.metersPerUnit,
  ];
  const rotated = rotateVectorByQuaternion(manifest.fileToCoreTransform.rotation, meters);
  const translation = manifest.fileToCoreTransform.translation;
  return {
    frame: manifest.coreFrame,
    value: [rotated[0] + translation[0], rotated[1] + translation[1], rotated[2] + translation[2]],
  };
}
