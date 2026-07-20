import { useCallback, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Quaternion, Vector3 } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Bounds3, Vec3 } from "@lk-robotics/design-system-3d-core";

import { resolveCameraMotionPolicy } from "./camera-motion.js";
import { coreToThreePosition } from "./coordinates.js";
import { usePrefersReducedMotion } from "./motion.js";
import { shouldScheduleDemandFrame } from "./rendering.js";
import type { SceneCameraKeyboardCommand } from "./scene-keyboard.js";
import {
  DEFAULT_HOME_CAMERA_POSE,
  resolveCameraPose,
  type SceneCameraMode,
  type SceneCameraPose,
} from "./state.js";

export interface CameraRigProps {
  readonly mode: SceneCameraMode;
  readonly focusTarget?: Vec3;
  readonly focusBounds?: Bounds3;
  readonly topTarget?: Vec3;
  readonly topBounds?: Bounds3;
  readonly homePose?: SceneCameraPose;
  readonly transitionSpeed?: number;
  readonly enableOrbit?: boolean;
  readonly keyboardCommand?: {
    readonly sequence: number;
    readonly command: Exclude<SceneCameraKeyboardCommand, { readonly kind: "preset" }>;
  };
  readonly onManualControl?: (source: "keyboard" | "user") => void;
  readonly onSettled?: (mode: Exclude<SceneCameraMode, "free">) => void;
}

function asVector3(value: Vec3): Vector3 {
  return new Vector3(value[0], value[1], value[2]);
}

export function CameraRig({
  mode,
  focusTarget,
  focusBounds,
  topTarget,
  topBounds,
  homePose = DEFAULT_HOME_CAMERA_POSE,
  transitionSpeed = 6,
  enableOrbit = true,
  keyboardCommand,
  onManualControl,
  onSettled,
}: CameraRigProps) {
  const { camera, frameloop, get, gl, invalidate, set } = useThree();
  const prefersReducedMotion = usePrefersReducedMotion();
  const controlsRef = useRef<OrbitControls | null>(null);
  const processedKeyboardSequence = useRef<number | undefined>(undefined);
  const transitionActive = useRef(mode !== "free");
  const requestDemandFrame = useCallback(
    (active: boolean): void => {
      if (shouldScheduleDemandFrame(frameloop, active)) invalidate();
    },
    [frameloop, invalidate],
  );
  const motionPolicy = useMemo(
    () => resolveCameraMotionPolicy(prefersReducedMotion, transitionSpeed),
    [prefersReducedMotion, transitionSpeed],
  );

  const desired = useMemo(() => {
    const options = {
      home: homePose,
      ...(focusTarget === undefined ? {} : { focusTarget }),
      ...(focusBounds === undefined ? {} : { focusBounds }),
      ...(topTarget === undefined ? {} : { topTarget }),
      ...(topBounds === undefined ? {} : { topBounds }),
    };
    return resolveCameraPose(mode, options);
  }, [focusBounds, focusTarget, homePose, mode, topBounds, topTarget]);
  const desiredPosition = useMemo(
    () => asVector3(coreToThreePosition(desired.position)),
    [desired.position],
  );
  const desiredTarget = useMemo(
    () => asVector3(coreToThreePosition(desired.target)),
    [desired.target],
  );
  const desiredUp = useMemo(() => asVector3(coreToThreePosition(desired.up)), [desired.up]);

  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = enableOrbit;
    controls.enableRotate = enableOrbit;
    controls.enableZoom = enableOrbit;
    controls.screenSpacePanning = false;
    controls.minDistance = 1.2;
    controls.maxDistance = 80;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.target.copy(asVector3(coreToThreePosition(homePose.target)));
    const handleStart = (): void => {
      transitionActive.current = false;
      onManualControl?.("user");
      requestDemandFrame(true);
    };
    const handleChange = (): void => requestDemandFrame(true);
    controls.addEventListener("start", handleStart);
    controls.addEventListener("change", handleChange);
    const previousControls = get().controls;
    set({ controls });
    controlsRef.current = controls;
    return () => {
      controls.removeEventListener("start", handleStart);
      controls.removeEventListener("change", handleChange);
      if (get().controls === controls) set({ controls: previousControls });
      controls.dispose();
      controlsRef.current = null;
    };
  }, [
    camera,
    enableOrbit,
    get,
    gl.domElement,
    homePose.target,
    onManualControl,
    requestDemandFrame,
    set,
  ]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (
      controls === null ||
      keyboardCommand === undefined ||
      keyboardCommand.sequence === processedKeyboardSequence.current
    ) {
      return;
    }
    processedKeyboardSequence.current = keyboardCommand.sequence;
    if (!enableOrbit) return;
    const { command } = keyboardCommand;
    const target = controls.target;
    const offset = camera.position.clone().sub(target);
    const distance = offset.length();
    const up = camera.up.clone().normalize();
    const forward = target.clone().sub(camera.position).normalize();
    const right = new Vector3().crossVectors(forward, up).normalize();

    transitionActive.current = false;
    onManualControl?.("keyboard");
    if (command.kind === "orbit") {
      const orbitStep = Math.PI / 18;
      if (command.horizontal !== 0) {
        offset.applyQuaternion(
          new Quaternion().setFromAxisAngle(up, -command.horizontal * orbitStep),
        );
      }
      if (command.vertical !== 0) {
        offset.applyQuaternion(
          new Quaternion().setFromAxisAngle(right, command.vertical * orbitStep),
        );
      }
      camera.position.copy(target).add(offset);
    } else if (command.kind === "pan") {
      const screenUp = new Vector3().crossVectors(right, forward).normalize();
      const translation = right
        .multiplyScalar(command.horizontal * distance * 0.08)
        .add(screenUp.multiplyScalar(command.vertical * distance * 0.08));
      camera.position.add(translation);
      target.add(translation);
    } else {
      const desiredDistance = Math.min(
        controls.maxDistance,
        Math.max(controls.minDistance, distance * (command.direction === "in" ? 0.84 : 1.19)),
      );
      camera.position.copy(target).add(offset.setLength(desiredDistance));
    }
    controls.update();
    requestDemandFrame(true);
  }, [camera, enableOrbit, keyboardCommand, onManualControl, requestDemandFrame]);

  useEffect(() => {
    if (mode === "free") {
      transitionActive.current = false;
      requestDemandFrame(true);
      return;
    }
    camera.up.copy(desiredUp);
    if (motionPolicy.kind === "instant") {
      camera.position.copy(desiredPosition);
      const controls = controlsRef.current;
      if (controls !== null) {
        controls.target.copy(desiredTarget);
        controls.update();
      }
      transitionActive.current = false;
      onSettled?.(mode);
      requestDemandFrame(true);
      return;
    }
    transitionActive.current = true;
    requestDemandFrame(true);
  }, [
    camera,
    desiredPosition,
    desiredTarget,
    desiredUp,
    mode,
    motionPolicy,
    onSettled,
    requestDemandFrame,
  ]);

  useFrame((_state, delta) => {
    const controls = controlsRef.current;
    if (controls === null) return;
    if (!controls.enabled) {
      requestDemandFrame(transitionActive.current);
      return;
    }

    if (transitionActive.current && mode !== "free") {
      const speed = motionPolicy.kind === "animated" ? motionPolicy.speed : transitionSpeed;
      const alpha = 1 - Math.exp(-speed * delta);
      camera.position.lerp(desiredPosition, alpha);
      controls.target.lerp(desiredTarget, alpha);
      camera.up.lerp(desiredUp, alpha).normalize();
      if (
        camera.position.distanceToSquared(desiredPosition) < 0.0001 &&
        controls.target.distanceToSquared(desiredTarget) < 0.0001
      ) {
        camera.position.copy(desiredPosition);
        controls.target.copy(desiredTarget);
        camera.up.copy(desiredUp);
        transitionActive.current = false;
        onSettled?.(mode);
      }
    }
    controls.update();
    requestDemandFrame(transitionActive.current);
  });

  return null;
}
