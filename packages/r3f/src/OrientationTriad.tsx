import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  type Camera,
  Color,
  DataTexture,
  LinearFilter,
  Quaternion,
  RGBAFormat,
  SRGBColorSpace,
  type Group,
  Vector3,
} from "three";

import { CORE_TO_THREE_BASIS_QUATERNION } from "./coordinates.js";

const AXIS_LENGTH = 34;
const AXIS_COLORS = Object.freeze({ x: "#ef4444", y: "#22c55e", z: "#3b82f6" });
const CAMERA_OFFSET = new Vector3();
const GLYPHS = Object.freeze({
  X: ["10001", "01010", "00100", "00100", "01010", "10001", "10001"],
  Y: ["10001", "01010", "00100", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00010", "00100", "01000", "10000", "10000", "11111"],
});

function createLabelTexture(label: keyof typeof GLYPHS, colorValue: string): DataTexture {
  const width = 7;
  const height = 9;
  const data = new Uint8Array(width * height * 4);
  const color = new Color(colorValue);
  const [red, green, blue] = [color.r, color.g, color.b].map((value) => Math.round(value * 255));
  for (let row = 0; row < 7; row += 1) {
    const pixels = GLYPHS[label][row];
    if (pixels === undefined) continue;
    for (let column = 0; column < 5; column += 1) {
      if (pixels[column] !== "1") continue;
      const offset = ((row + 1) * width + column + 1) * 4;
      data[offset] = red ?? 255;
      data[offset + 1] = green ?? 255;
      data[offset + 2] = blue ?? 255;
      data[offset + 3] = 255;
    }
  }
  const texture = new DataTexture(data, width, height, RGBAFormat);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export function updateOrientationTriadTransform(
  group: Group,
  camera: Camera,
  size: Readonly<{ width: number; height: number }>,
  basis: Quaternion,
): void {
  const distance = 2;
  const perspectiveFov = "fov" in camera && typeof camera.fov === "number" ? camera.fov : null;
  const verticalWorld =
    perspectiveFov === null ? 2 : 2 * Math.tan(((perspectiveFov * Math.PI) / 180) * 0.5) * distance;
  const worldPerPixel = verticalWorld / Math.max(size.height, 1);

  CAMERA_OFFSET.set(
    (size.width / 2 - 58) * worldPerPixel,
    (-size.height / 2 + 58) * worldPerPixel,
    -distance,
  );
  group.position.copy(camera.localToWorld(CAMERA_OFFSET));
  group.scale.setScalar(worldPerPixel);
  group.quaternion.copy(basis);
}

interface AxisProps {
  readonly color: string;
  readonly label: keyof typeof GLYPHS;
  readonly rotation?: readonly [number, number, number];
}

function Axis({ color, label, rotation }: AxisProps) {
  const texture = useMemo(() => createLabelTexture(label, color), [color, label]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <group {...(rotation === undefined ? {} : { rotation })}>
      <mesh position={[0, AXIS_LENGTH / 2, 0]} renderOrder={1000}>
        <cylinderGeometry args={[1.5, 1.5, AXIS_LENGTH, 8]} />
        <meshBasicMaterial color={color} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, AXIS_LENGTH + 3, 0]} renderOrder={1000}>
        <coneGeometry args={[4, 8, 10]} />
        <meshBasicMaterial color={color} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <sprite position={[0, AXIS_LENGTH + 13, 0]} scale={[12, 16, 1]} renderOrder={1001}>
        <spriteMaterial
          map={texture}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
          transparent
        />
      </sprite>
    </group>
  );
}

/** A camera-fixed viewport aid whose axes remain aligned to the LK core Z-up frame. */
export function OrientationTriad() {
  const groupRef = useRef<Group>(null);
  const { camera, size } = useThree();
  const basis = useMemo(() => new Quaternion(...CORE_TO_THREE_BASIS_QUATERNION), []);

  useFrame(() => {
    const group = groupRef.current;
    if (group === null) return;
    updateOrientationTriadTransform(group, camera, size, basis);
  });

  return (
    <group ref={groupRef} name="lk-core-orientation-triad">
      <Axis color={AXIS_COLORS.x} label="X" rotation={[0, 0, -Math.PI / 2]} />
      <Axis color={AXIS_COLORS.y} label="Y" rotation={[0, 0, 0]} />
      <Axis color={AXIS_COLORS.z} label="Z" rotation={[Math.PI / 2, 0, 0]} />
    </group>
  );
}
