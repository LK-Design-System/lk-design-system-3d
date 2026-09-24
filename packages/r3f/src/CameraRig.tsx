import { useCallback, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Quaternion, Raycaster, Vector3, type Object3D } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  FOLLOW_CAMERA_TRANSITION_MS,
  cameraTransitionProgress,
  easeInOutQuintic,
  type Bounds3,
  type CameraConstraints,
  type GroundHeightSampler,
  type Vec3,
} from "@lk-design-system/lds-3d-core";

import { resolveCameraMotionPolicy } from "./camera-motion.js";
import {
  CAMERA_OBSTACLE_USER_DATA_KEY,
  clipThreeCameraBoom,
  constrainThreeCameraPlacement,
} from "./camera-rig-constraints.js";
import { coreToThreePosition } from "./coordinates.js";
import { usePrefersReducedMotion } from "./motion.js";
import { shouldScheduleDemandFrame } from "./rendering.js";
import type { SceneCameraKeyboardCommand } from "./scene-keyboard.js";
import {
  DEFAULT_HOME_CAMERA_POSE,
  resolveCameraPose,
  type SceneCameraMode,
  type SceneCameraPose,
  type SceneFollowSubject,
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
  /** The pose `follow` mode tracks. Without it, `follow` holds the home view. */
  readonly followSubject?: SceneFollowSubject;
  /** Entry transition into `follow`. Reduced motion always jumps. Default 800 ms. */
  readonly followTransitionMs?: number;
  /**
   * In `follow`, keep the eye in front of objects whose `userData.lds3dCameraObstacle`
   * (or an ancestor's) is true, so the camera does not pass through walls.
   */
  readonly followObstacles?: boolean;
  /** Where the eye and target may go. Applied after every camera update. */
  readonly constraints?: CameraConstraints;
  /** Ground height in core coordinates, for the constraints' clearance rules. */
  readonly groundHeightAt?: GroundHeightSampler;
}

interface FollowTransitionStart {
  readonly position: Vector3;
  readonly target: Vector3;
  readonly up: Vector3;
  readonly startedAt: number;
}

function toVec3(value: Vector3): Vec3 {
  return [value.x, value.y, value.z];
}

function isCameraObstacle(object: Object3D): boolean {
  for (let current: Object3D | null = object; current !== null; current = current.parent) {
    if (current.userData[CAMERA_OBSTACLE_USER_DATA_KEY] === true) return true;
  }
  return false;
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
  followSubject,
  followTransitionMs = FOLLOW_CAMERA_TRANSITION_MS,
  followObstacles = false,
  constraints,
  groundHeightAt,
}: CameraRigProps) {
  const { camera, frameloop, get, gl, invalidate, scene, set, size } = useThree();
  const followStart = useRef<FollowTransitionStart | null>(null);
  const raycaster = useMemo(() => new Raycaster(), []);
  // Fit bounds to the canvas actually on screen (core camera solver).
  const viewportAspect = size.height > 0 ? size.width / size.height : 0;
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
      ...(viewportAspect > 0 && Number.isFinite(viewportAspect) ? { viewportAspect } : {}),
      ...(followSubject === undefined ? {} : { followSubject }),
    };
    return resolveCameraPose(mode, options);
  }, [
    focusBounds,
    focusTarget,
    followSubject,
    homePose,
    mode,
    topBounds,
    topTarget,
    viewportAspect,
  ]);
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
    controls.minDistance = constraints?.minDistanceMeters ?? 1.2;
    controls.maxDistance = constraints?.maxDistanceMeters ?? 80;
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
    constraints?.maxDistanceMeters,
    constraints?.minDistanceMeters,
    onManualControl,
    requestDemandFrame,
    set,
  ]);

  useEffect(() => {
    if (mode !== "follow") {
      followStart.current = null;
      return;
    }
    const controls = controlsRef.current;
    followStart.current = {
      position: camera.position.clone(),
      target: controls === null ? camera.position.clone() : controls.target.clone(),
      up: camera.up.clone(),
      startedAt: performance.now(),
    };
    transitionActive.current = true;
    requestDemandFrame(true);
  }, [camera, mode, requestDemandFrame]);

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
    if (mode === "follow") {
      // The follow effect owns the entry transition; later subject updates only need a frame.
      requestDemandFrame(true);
      return;
    }
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

    if (mode === "follow") {
      const start = followStart.current;
      if (start === null) {
        camera.position.copy(desiredPosition);
        controls.target.copy(desiredTarget);
        camera.up.copy(desiredUp);
      } else {
        const progress = cameraTransitionProgress(
          performance.now() - start.startedAt,
          followTransitionMs,
          prefersReducedMotion,
        );
        const eased = easeInOutQuintic(progress);
        camera.position.lerpVectors(start.position, desiredPosition, eased);
        controls.target.lerpVectors(start.target, desiredTarget, eased);
        camera.up.lerpVectors(start.up, desiredUp, eased).normalize();
        if (progress >= 1) {
          followStart.current = null;
          transitionActive.current = false;
          onSettled?.("follow");
        }
      }
      if (followObstacles) {
        const eye = camera.position;
        const direction = eye.clone().sub(controls.target);
        const length = direction.length();
        if (length > 0) {
          raycaster.set(controls.target, direction.normalize());
          raycaster.far = length;
          const hit = raycaster
            .intersectObjects(scene.children, true)
            .find((intersection) => isCameraObstacle(intersection.object));
          const clipped = clipThreeCameraBoom(
            { position: toVec3(eye), target: toVec3(controls.target) },
            hit?.distance,
          );
          if (clipped.changed) camera.position.set(...clipped.position);
        }
      }
    } else if (transitionActive.current && mode !== "free") {
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
    if (constraints !== undefined) {
      const constrained = constrainThreeCameraPlacement(
        { position: toVec3(camera.position), target: toVec3(controls.target) },
        constraints,
        groundHeightAt,
      );
      if (constrained.changed) {
        camera.position.set(...constrained.position);
        controls.target.set(...constrained.target);
      }
    }
    requestDemandFrame(transitionActive.current || followStart.current !== null);
  });

  return null;
}
