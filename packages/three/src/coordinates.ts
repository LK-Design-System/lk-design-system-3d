import type { Quat, Vec3 } from "@lk-robotics/lds-3d-core";

/**
 * LK core is right-handed, +X forward and +Z up. Three.js remains in its
 * conventional +Y-up space with the forward view along -Z. The basis maps:
 *
 * - core +X -> Three -Z
 * - core +Y -> Three -X
 * - core +Z -> Three +Y
 */
export const CORE_TO_THREE_BASIS = Object.freeze([0, -1, 0, 0, 0, 1, -1, 0, 0] as const);

/** Quaternion for the fixed core-to-Three basis, in x/y/z/w order. */
export const CORE_TO_THREE_BASIS_QUATERNION: Quat = Object.freeze([-0.5, 0.5, 0.5, 0.5]);

function cleanSignedZero(value: number): number {
  return value === 0 ? 0 : value;
}

export function coreToThreePosition(value: Vec3): Vec3 {
  return Object.freeze([
    cleanSignedZero(-value[1]),
    cleanSignedZero(value[2]),
    cleanSignedZero(-value[0]),
  ]);
}

export function threeToCorePosition(value: Vec3): Vec3 {
  return Object.freeze([
    cleanSignedZero(-value[2]),
    cleanSignedZero(-value[0]),
    cleanSignedZero(value[1]),
  ]);
}

function multiplyQuaternion(left: Quat, right: Quat): Quat {
  const [lx, ly, lz, lw] = left;
  const [rx, ry, rz, rw] = right;
  return [
    lw * rx + lx * rw + ly * rz - lz * ry,
    lw * ry - lx * rz + ly * rw + lz * rx,
    lw * rz + lx * ry - ly * rx + lz * rw,
    lw * rw - lx * rx - ly * ry - lz * rz,
  ];
}

function normalizeQuaternion(value: Quat): Quat {
  const length = Math.hypot(value[0], value[1], value[2], value[3]);
  if (!Number.isFinite(length) || length <= Number.EPSILON) {
    throw new TypeError("Quaternion must have a finite, non-zero norm.");
  }
  return Object.freeze([
    value[0] / length,
    value[1] / length,
    value[2] / length,
    value[3] / length,
  ]);
}

/**
 * Converts an orientation between world bases. Objects nested under a core root
 * should retain their core quaternion because that parent applies the basis.
 */
export function coreToThreeQuaternion(value: Quat): Quat {
  const basis = CORE_TO_THREE_BASIS_QUATERNION;
  const inverseBasis: Quat = [-basis[0], -basis[1], -basis[2], basis[3]];
  return normalizeQuaternion(multiplyQuaternion(multiplyQuaternion(basis, value), inverseBasis));
}

export function threeToCoreQuaternion(value: Quat): Quat {
  const basis = CORE_TO_THREE_BASIS_QUATERNION;
  const inverseBasis: Quat = [-basis[0], -basis[1], -basis[2], basis[3]];
  return normalizeQuaternion(multiplyQuaternion(multiplyQuaternion(inverseBasis, value), basis));
}
