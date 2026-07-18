import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame, useThree, type ThreeElements } from "@react-three/fiber";
import { CatmullRomCurve3, DoubleSide, Vector3, type Group } from "three";
import type {
  EntityId,
  GoalEntity,
  PathEntity,
  RobotEntity,
  Vec3,
} from "@lk-robotics/design-system-3d-core";

import { CoreSpace } from "./CoreSpace.js";
import { usePrefersReducedMotion } from "./motion.js";
import { resolvePathInteractionVisualState } from "./path-interaction.js";
import { DEFAULT_SCENE_SHADOW_MAP_SIZE, shouldScheduleDemandFrame } from "./rendering.js";
import { useEntityInteraction, useSceneRuntime } from "./runtime.js";
import type { SceneRenderState } from "./state.js";

function useDemandFrameInvalidation(): (active: boolean) => void {
  const frameloop = useThree((state) => state.frameloop);
  const invalidate = useThree((state) => state.invalidate);
  return useCallback(
    (active: boolean): void => {
      if (shouldScheduleDemandFrame(frameloop, active)) invalidate();
    },
    [frameloop, invalidate],
  );
}

export interface SelectableRenderState {
  readonly hovered: boolean;
  readonly selected: boolean;
}

export interface SelectableProps
  extends Omit<
    ThreeElements["group"],
    "children" | "onClick" | "onPointerOut" | "onPointerOver" | "position" | "quaternion" | "scale"
  > {
  readonly entityId: EntityId;
  readonly selectable?: boolean;
  readonly position?: Vec3;
  readonly quaternion?: readonly [number, number, number, number];
  readonly scale?: number | Vec3;
  readonly children: ReactNode | ((state: SelectableRenderState) => ReactNode);
}

/** Adds consistent hover and single-selection behavior to any R3F subtree. */
export function Selectable({
  entityId,
  selectable = true,
  position,
  quaternion,
  scale,
  children,
  ...groupProps
}: SelectableProps) {
  const interaction = useEntityInteraction(entityId, { selectable });
  const content =
    typeof children === "function"
      ? children({ hovered: interaction.hovered, selected: interaction.selected })
      : children;
  return (
    <group
      {...groupProps}
      name={`lkds3d:entity:${entityId}`}
      userData={{ entityId }}
      {...(position === undefined
        ? {}
        : { position: [position[0], position[1], position[2]] as [number, number, number] })}
      {...(quaternion === undefined
        ? {}
        : {
            quaternion: [quaternion[0], quaternion[1], quaternion[2], quaternion[3]] as [
              number,
              number,
              number,
              number,
            ],
          })}
      {...(scale === undefined
        ? {}
        : {
            scale:
              typeof scale === "number"
                ? scale
                : ([scale[0], scale[1], scale[2]] as [number, number, number]),
          })}
      onClick={interaction.onClick}
      onPointerOut={interaction.onPointerOut}
      onPointerOver={interaction.onPointerOver}
    >
      {content}
    </group>
  );
}

export interface GroundPlaneProps {
  readonly sizeMeters?: number;
  readonly elevationMeters?: number;
}

export function GroundPlane({ sizeMeters = 48, elevationMeters = -0.012 }: GroundPlaneProps) {
  const { theme } = useSceneRuntime();
  return (
    <mesh position={[0, 0, elevationMeters]} receiveShadow>
      <planeGeometry args={[sizeMeters, sizeMeters]} />
      <meshStandardMaterial
        color={theme.materials.ground}
        metalness={0.02}
        roughness={0.91}
        side={DoubleSide}
      />
    </mesh>
  );
}

export interface GroundGridProps {
  readonly sizeMeters?: number;
  readonly minorSpacingMeters?: number;
  readonly majorSpacingMeters?: number;
}

export function GroundGrid({
  sizeMeters = 48,
  minorSpacingMeters = 0.5,
  majorSpacingMeters = 2,
}: GroundGridProps) {
  const { theme } = useSceneRuntime();
  const minorDivisions = Math.max(1, Math.round(sizeMeters / minorSpacingMeters));
  const majorDivisions = Math.max(1, Math.round(sizeMeters / majorSpacingMeters));
  return (
    <>
      {theme.diagnostic.showMinorGrid ? (
        <gridHelper
          args={[sizeMeters, minorDivisions, theme.scene["grid.minor"], theme.scene["grid.minor"]]}
          position={[0, 0, 0.002]}
          rotation={[Math.PI / 2, 0, 0]}
        />
      ) : null}
      {theme.diagnostic.showMajorGrid ? (
        <gridHelper
          args={[sizeMeters, majorDivisions, theme.scene["grid.major"], theme.scene["grid.major"]]}
          position={[0, 0, 0.004]}
          rotation={[Math.PI / 2, 0, 0]}
        />
      ) : null}
    </>
  );
}

export interface SceneEnvironmentProps extends GroundGridProps {
  readonly showFloor?: boolean;
  readonly showGrid?: boolean;
  readonly showAxes?: boolean;
  /**
   * Primary directional-light shadow-map resolution in texels. Defaults to
   * the balanced 1024px budget. Use 2048 only with an explicit high-quality
   * host profile or when a scene has evidence that it needs the extra detail.
   */
  readonly shadowMapSize?: number;
}

/** Scene background, physically lit floor, grid and optional diagnostic axes. */
export function SceneEnvironment({
  sizeMeters = 48,
  minorSpacingMeters,
  majorSpacingMeters,
  showFloor = true,
  showGrid = true,
  showAxes,
  shadowMapSize = DEFAULT_SCENE_SHADOW_MAP_SIZE,
}: SceneEnvironmentProps) {
  const { theme } = useSceneRuntime();
  return (
    <>
      <color attach="background" args={[theme.scene["scene.background"]]} />
      <fog
        attach="fog"
        args={[
          theme.scene["scene.background"],
          theme.environment.fogNearMeters,
          theme.environment.fogFarMeters,
        ]}
      />
      <ambientLight intensity={theme.environment.ambientIntensity} />
      <CoreSpace>
        <directionalLight
          castShadow
          color="#FFFFFF"
          intensity={theme.environment.keyIntensity}
          position={[7, -9, 14]}
          shadow-bias={-0.00015}
          shadow-mapSize-height={shadowMapSize}
          shadow-mapSize-width={shadowMapSize}
        />
        <directionalLight
          color={theme.materials.live}
          intensity={theme.environment.fillIntensity}
          position={[-8, 5, 7]}
        />
        {showFloor ? <GroundPlane sizeMeters={sizeMeters} /> : null}
        {showGrid ? (
          <GroundGrid
            sizeMeters={sizeMeters}
            {...(minorSpacingMeters === undefined ? {} : { minorSpacingMeters })}
            {...(majorSpacingMeters === undefined ? {} : { majorSpacingMeters })}
          />
        ) : null}
        {(showAxes ?? theme.diagnostic.showAxes) ? (
          <axesHelper args={[2]} position={[0, 0, 0.012]} />
        ) : null}
      </CoreSpace>
    </>
  );
}

export type RobotVisualStatus = "idle" | "live" | "warning" | "error";

export interface AmrRobotProps {
  readonly entity: RobotEntity;
  readonly status?: RobotVisualStatus;
  readonly model?: ReactNode;
  readonly label?: string;
}

function Wheel({ position, color }: { readonly position: Vec3; readonly color: string }) {
  return (
    <mesh castShadow position={[position[0], position[1], position[2]]} receiveShadow>
      <cylinderGeometry args={[0.14, 0.14, 0.1, 24]} />
      <meshStandardMaterial color={color} metalness={0.28} roughness={0.58} />
    </mesh>
  );
}

export function AmrRobot({ entity, status = "live", model, label }: AmrRobotProps) {
  const { theme } = useSceneRuntime();
  const statusColor =
    status === "error"
      ? theme.materials.error
      : status === "warning"
        ? theme.materials.warning
        : status === "idle"
          ? theme.materials.assetStructure
          : theme.materials.live;

  return (
    <Selectable
      entityId={entity.id}
      position={entity.pose.position}
      quaternion={entity.pose.orientation}
    >
      {({ hovered, selected }) => (
        <>
          {model ?? (
            <group name={label ?? "AMR"}>
              <mesh castShadow position={[0, 0, 0.31]} receiveShadow>
                <boxGeometry args={[1.15, 0.76, 0.32]} />
                <meshStandardMaterial
                  color={hovered ? theme.materials.live : theme.materials.assetBody}
                  metalness={0.14}
                  roughness={0.52}
                />
              </mesh>
              <mesh castShadow position={[0.08, 0, 0.535]} receiveShadow>
                <boxGeometry args={[0.62, 0.52, 0.14]} />
                <meshStandardMaterial
                  color={theme.materials.assetStructure}
                  metalness={0.32}
                  roughness={0.44}
                />
              </mesh>
              <mesh castShadow position={[0.47, 0, 0.52]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.12, 0.12, 0.16, 32]} />
                <meshStandardMaterial
                  color={statusColor}
                  emissive={statusColor}
                  emissiveIntensity={0.45}
                />
              </mesh>
              <mesh position={[0.585, 0, 0.32]}>
                <boxGeometry args={[0.018, 0.5, 0.12]} />
                <meshStandardMaterial
                  color={statusColor}
                  emissive={statusColor}
                  emissiveIntensity={0.25}
                />
              </mesh>
              <Wheel position={[-0.34, -0.43, 0.16]} color={theme.materials.assetStructure} />
              <Wheel position={[0.34, -0.43, 0.16]} color={theme.materials.assetStructure} />
              <Wheel position={[-0.34, 0.43, 0.16]} color={theme.materials.assetStructure} />
              <Wheel position={[0.34, 0.43, 0.16]} color={theme.materials.assetStructure} />
            </group>
          )}
          {hovered || selected ? (
            <group position={[0, 0, 0.018]}>
              <mesh>
                <torusGeometry args={[0.73, selected ? 0.026 : 0.016, 8, 72]} />
                <meshBasicMaterial
                  color={selected ? theme.materials.selection : theme.materials.live}
                  depthWrite={false}
                  transparent
                  opacity={0.95}
                />
              </mesh>
              {selected ? (
                <mesh>
                  <torusGeometry args={[0.82, 0.011, 6, 72]} />
                  <meshBasicMaterial
                    color={theme.materials.selection}
                    depthWrite={false}
                    transparent
                    opacity={0.72}
                  />
                </mesh>
              ) : null}
            </group>
          ) : null}
        </>
      )}
    </Selectable>
  );
}

export interface GoalMarkerProps {
  readonly entity: GoalEntity;
  readonly animated?: boolean;
  readonly variant?: "valid" | "preview" | "invalid";
}

export function GoalMarker({ entity, animated = true, variant = "valid" }: GoalMarkerProps) {
  const { theme } = useSceneRuntime();
  const reducedMotion = usePrefersReducedMotion();
  const requestDemandFrame = useDemandFrameInvalidation();
  const pulse = useRef<Group | null>(null);
  const radius = entity.radiusMeters ?? 0.48;
  useFrame(({ clock }) => {
    if (!animated || reducedMotion || pulse.current === null) return;
    const scale = 1 + Math.sin(clock.elapsedTime * 3.2) * 0.08;
    pulse.current.scale.setScalar(scale);
    requestDemandFrame(true);
  });
  useEffect(() => {
    if ((!animated || reducedMotion) && pulse.current !== null) {
      pulse.current.scale.setScalar(1);
    }
  }, [animated, reducedMotion]);
  const goalColor =
    variant === "invalid"
      ? theme.materials.error
      : variant === "preview"
        ? theme.materials.warning
        : theme.materials.intent;
  return (
    <Selectable
      entityId={entity.id}
      position={entity.pose.position}
      quaternion={entity.pose.orientation}
    >
      {({ hovered, selected }) => (
        <group ref={pulse}>
          <mesh position={[0, 0, 0.025]}>
            <torusGeometry args={[radius, selected ? 0.05 : 0.035, 10, 72]} />
            <meshStandardMaterial
              color={selected ? theme.materials.selection : goalColor}
              emissive={goalColor}
              emissiveIntensity={hovered ? 0.72 : 0.38}
              transparent
              opacity={variant === "preview" ? 0.58 : 0.94}
              wireframe={variant === "preview"}
            />
          </mesh>
          <mesh position={[0, 0, 0.2]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.13, 0.38, 20]} />
            <meshStandardMaterial color={goalColor} emissive={goalColor} emissiveIntensity={0.3} />
          </mesh>
          {variant === "invalid" ? (
            <group position={[0, 0, 0.07]}>
              <mesh rotation={[0, 0, Math.PI / 4]}>
                <boxGeometry args={[radius * 1.15, 0.07, 0.055]} />
                <meshBasicMaterial color={theme.materials.error} />
              </mesh>
              <mesh rotation={[0, 0, -Math.PI / 4]}>
                <boxGeometry args={[radius * 1.15, 0.07, 0.055]} />
                <meshBasicMaterial color={theme.materials.error} />
              </mesh>
            </group>
          ) : null}
        </group>
      )}
    </Selectable>
  );
}

export interface PathRibbonProps {
  readonly entity: PathEntity;
  readonly elevationMeters?: number;
  readonly variant?: "actual" | "planned" | "executing" | "blocked";
  /** Keeps an executing beacon at its deterministic midpoint when false. Defaults to true. */
  readonly animated?: boolean;
  /** Enables click-to-select. Defaults to false for backward compatibility. */
  readonly selectable?: boolean;
}

function ExecutingPathBeacon({
  animated,
  curve,
  color,
}: {
  readonly animated: boolean;
  readonly curve: CatmullRomCurve3;
  readonly color: string;
}) {
  const marker = useRef<Group | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const requestDemandFrame = useDemandFrameInvalidation();
  useFrame(({ clock }) => {
    if (marker.current === null) return;
    const active = animated && !reducedMotion;
    const progress = active ? (clock.elapsedTime * 0.16) % 1 : 0.55;
    const point = curve.getPointAt(progress);
    marker.current.position.copy(point);
    requestDemandFrame(active);
  });
  return (
    <group ref={marker}>
      <mesh>
        <sphereGeometry args={[0.12, 18, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.9} />
      </mesh>
      <pointLight color={color} distance={1.6} intensity={1.4} />
    </group>
  );
}

export function PathRibbon({
  entity,
  elevationMeters = 0.035,
  variant = "planned",
  animated = true,
  selectable = false,
}: PathRibbonProps) {
  const { theme } = useSceneRuntime();
  const curve = useMemo(() => {
    if (entity.points.length < 2) return null;
    return new CatmullRomCurve3(
      entity.points.map((point) => new Vector3(point[0], point[1], point[2] + elevationMeters)),
      false,
      "centripetal",
    );
  }, [elevationMeters, entity.points]);
  if (curve === null) return null;
  const width = entity.widthMeters ?? 0.16;
  const color =
    variant === "blocked"
      ? theme.materials.error
      : variant === "executing"
        ? theme.materials.selection
        : variant === "actual"
          ? theme.materials.live
          : theme.materials.intent;
  return (
    <Selectable entityId={entity.id} selectable={selectable}>
      {({ hovered, selected }) => {
        const interaction = resolvePathInteractionVisualState(
          selected,
          hovered,
          variant === "executing",
        );
        const interactionColor = interaction.useSelectionColor ? theme.materials.selection : color;
        const planned = variant === "planned";
        return (
          <>
            <mesh receiveShadow>
              <tubeGeometry
                args={[
                  curve,
                  Math.max(24, entity.points.length * 18),
                  (width / 2) * interaction.radiusScale,
                  10,
                  false,
                ]}
              />
              <meshStandardMaterial
                color={interactionColor}
                emissive={interactionColor}
                emissiveIntensity={interaction.emissiveIntensity}
                metalness={0.02}
                opacity={planned && !selected ? 0.72 : 1}
                roughness={0.68}
                transparent={planned && !selected}
                wireframe={planned && !interaction.forceSolid}
              />
            </mesh>
            {variant === "executing" ? (
              <ExecutingPathBeacon animated={animated} color={interactionColor} curve={curve} />
            ) : null}
            {variant === "blocked"
              ? [0.42, 0.58].map((progress) => {
                  const point = curve.getPointAt(progress);
                  return (
                    <group key={progress} position={point}>
                      <mesh rotation={[0, 0, Math.PI / 4]}>
                        <boxGeometry args={[0.38, 0.065, 0.085]} />
                        <meshBasicMaterial color={theme.materials.error} />
                      </mesh>
                      <mesh rotation={[0, 0, -Math.PI / 4]}>
                        <boxGeometry args={[0.38, 0.065, 0.085]} />
                        <meshBasicMaterial color={theme.materials.error} />
                      </mesh>
                    </group>
                  );
                })
              : null}
          </>
        );
      }}
    </Selectable>
  );
}

export interface SceneStateMarkerProps {
  readonly state: Exclude<SceneRenderState, { readonly kind: "ready" }>;
}

export function SceneStateMarker({ state }: SceneStateMarkerProps) {
  const { theme } = useSceneRuntime();
  const reducedMotion = usePrefersReducedMotion();
  const requestDemandFrame = useDemandFrameInvalidation();
  const marker = useRef<Group | null>(null);
  useFrame(({ clock }, delta) => {
    if (marker.current === null) return;
    if (state.kind === "loading" && !reducedMotion) {
      marker.current.rotation.z += delta * 1.8;
      marker.current.position.z = 0.55 + Math.sin(clock.elapsedTime * 2.5) * 0.05;
      requestDemandFrame(true);
    }
  });
  useEffect(() => {
    if (reducedMotion && marker.current !== null) {
      marker.current.rotation.z = 0;
      marker.current.position.z = 0.55;
    }
  }, [reducedMotion]);
  const color = state.kind === "error" ? theme.materials.error : theme.materials.live;
  return (
    <group ref={marker} position={[0, 0, 0.55]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.46, 0.045, 10, state.kind === "empty" ? 6 : 64, Math.PI * 1.62]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.45} />
      </mesh>
      {state.kind === "error" ? (
        <mesh position={[0, 0, 0.02]}>
          <octahedronGeometry args={[0.19]} />
          <meshStandardMaterial
            color={theme.materials.error}
            emissive={theme.materials.error}
            emissiveIntensity={0.5}
          />
        </mesh>
      ) : null}
    </group>
  );
}
