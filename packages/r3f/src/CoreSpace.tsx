import type { ReactNode } from "react";
import type { ThreeElements } from "@react-three/fiber";

import { CORE_TO_THREE_BASIS_QUATERNION } from "./coordinates.js";

export interface CoreSpaceProps
  extends Omit<ThreeElements["group"], "children" | "quaternion" | "rotation"> {
  readonly children?: ReactNode;
}

/**
 * Applies the LK-core to Three.js basis exactly once. Every descendant uses
 * core coordinates directly: +X forward, +Y left, +Z up, in meters.
 */
export function CoreSpace({ children, ...groupProps }: CoreSpaceProps) {
  return (
    <group
      {...groupProps}
      quaternion={[
        CORE_TO_THREE_BASIS_QUATERNION[0],
        CORE_TO_THREE_BASIS_QUATERNION[1],
        CORE_TO_THREE_BASIS_QUATERNION[2],
        CORE_TO_THREE_BASIS_QUATERNION[3],
      ]}
    >
      {children}
    </group>
  );
}
