/**
 * Compatibility re-export. The Three adapter is the single owner of the LK
 * core-to-Three basis; this public subpath remains stable for R3F consumers.
 */
export {
  CORE_TO_THREE_BASIS,
  CORE_TO_THREE_BASIS_QUATERNION,
  coreToThreePosition,
  coreToThreeQuaternion,
  threeToCorePosition,
  threeToCoreQuaternion,
} from "@lk-robotics/lds-3d-three/coordinates";
