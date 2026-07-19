import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame, useThree, type ThreeElements } from "@react-three/fiber";
import {
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  DoubleSide,
  Float32BufferAttribute,
  Shape,
  Vector3,
  type Group,
} from "three";
import type {
  Bounds3,
  EntityId,
  GoalEntity,
  PathEntity,
  RobotEntity,
  Vec3,
} from "@lk-robotics/design-system-3d-core";
import {
  FrameMismatchError,
  assertValidBounds3,
  assertValidSpatialEditVolume,
  type SpatialEditVolume as SpatialEditVolumeContract,
} from "@lk-robotics/design-system-3d-core";

import { CoreSpace } from "./CoreSpace.js";
import { resolveGoalMarkerVisualState } from "./goal-marker.js";
import { usePrefersReducedMotion } from "./motion.js";
import {
  resolvePathInteractionVisualState,
  type PathInteractionVisualState,
} from "./path-interaction.js";
import {
  createPathRibbonIntervals,
  resolvePathExecutionCursorMetrics,
  resolvePathExecutionProgress,
  resolvePathRibbonVisualState,
  type PathRibbonInterval,
  type PathRibbonVariant,
} from "./path-ribbon.js";
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

export interface SectionBoxProps {
  readonly bounds: Bounds3;
  readonly fillOpacity?: number;
  readonly showFill?: boolean;
}

/** Passive scene-frame XYZ section evidence. Material clipping is an explicit point-layer option. */
export function SectionBox({ bounds, fillOpacity = 0.06, showFill = true }: SectionBoxProps) {
  const { frame, theme } = useSceneRuntime();
  assertValidBounds3(bounds);
  if (bounds.frame !== frame) {
    throw new FrameMismatchError(frame, bounds.frame, "SectionBox.bounds");
  }
  if (!Number.isFinite(fillOpacity) || fillOpacity < 0 || fillOpacity > 1) {
    throw new RangeError("SectionBox fillOpacity must be a finite number in [0, 1].");
  }
  const size: Vec3 = [
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2],
  ];
  const center: Vec3 = [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
  return (
    <group name="lkds3d:section-box" position={[center[0], center[1], center[2]]}>
      {showFill ? (
        <mesh renderOrder={1}>
          <boxGeometry args={[size[0], size[1], size[2]]} />
          <meshBasicMaterial
            color={theme.materials.selection}
            depthWrite={false}
            side={DoubleSide}
            transparent
            opacity={fillOpacity}
          />
        </mesh>
      ) : null}
      <mesh renderOrder={2}>
        <boxGeometry args={[size[0], size[1], size[2]]} />
        <meshBasicMaterial
          color={theme.materials.selection}
          depthWrite={false}
          transparent
          opacity={0.82}
          wireframe
        />
      </mesh>
      <mesh position={[0, 0, -size[2] / 2]} renderOrder={2}>
        <planeGeometry args={[size[0], size[1]]} />
        <meshBasicMaterial
          color={theme.materials.live}
          depthWrite={false}
          side={DoubleSide}
          transparent
          opacity={0.16}
        />
      </mesh>
      <mesh position={[0, 0, size[2] / 2]} renderOrder={2}>
        <planeGeometry args={[size[0], size[1]]} />
        <meshBasicMaterial
          color={theme.materials.warning}
          depthWrite={false}
          side={DoubleSide}
          transparent
          opacity={0.16}
        />
      </mesh>
    </group>
  );
}

export interface EditVolumeProps {
  readonly volume: SpatialEditVolumeContract;
  readonly selectable?: boolean;
}

function SphereEditOutline({
  radius,
  color,
  opacity,
  scale = 1,
}: {
  readonly radius: number;
  readonly color: string;
  readonly opacity: number;
  readonly scale?: number;
}) {
  const tubeRadius = Math.min(0.022, Math.max(0.008, radius * 0.014));
  return (
    <mesh scale={scale} renderOrder={3}>
      <torusGeometry args={[radius, tubeRadius, 8, 64]} />
      <meshBasicMaterial color={color} depthWrite={false} opacity={opacity} transparent />
    </mesh>
  );
}

function BoxEditOutline({
  size,
  color,
  opacity,
  scale = 1,
}: {
  readonly size: Vec3;
  readonly color: string;
  readonly opacity: number;
  readonly scale?: number;
}) {
  const geometry = useMemo(
    () => new BoxGeometry(size[0], size[1], size[2]),
    [size[0], size[1], size[2]],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments scale={scale} renderOrder={3}>
      <edgesGeometry args={[geometry]} />
      <lineBasicMaterial color={color} depthWrite={false} opacity={opacity} transparent />
    </lineSegments>
  );
}

function EditVolumeOutline({
  volume,
  color,
  opacity,
  scale,
}: {
  readonly volume: SpatialEditVolumeContract;
  readonly color: string;
  readonly opacity: number;
  readonly scale?: number;
}) {
  return volume.kind === "sphere" ? (
    <SphereEditOutline
      radius={volume.radiusMeters}
      color={color}
      opacity={opacity}
      {...(scale === undefined ? {} : { scale })}
    />
  ) : (
    <BoxEditOutline
      size={volume.sizeMeters}
      color={color}
      opacity={opacity}
      {...(scale === undefined ? {} : { scale })}
    />
  );
}

/** Selectable WebGL evidence for a caller-owned delete/restore volume intent. */
export function EditVolume({ volume, selectable = true }: EditVolumeProps) {
  const { frame, theme } = useSceneRuntime();
  assertValidSpatialEditVolume(volume);
  if (volume.pose.frame !== frame) {
    throw new FrameMismatchError(frame, volume.pose.frame, "EditVolume.volume.pose");
  }
  const operationColor =
    volume.operation === "delete" ? theme.materials.error : theme.materials.live;
  return (
    <Selectable
      entityId={volume.id}
      position={volume.pose.position}
      quaternion={volume.pose.orientation}
      selectable={selectable}
    >
      {({ hovered, selected }) => (
        <group name={`lkds3d:edit-volume:${volume.operation}:${volume.kind}`}>
          <mesh renderOrder={2}>
            {volume.kind === "sphere" ? (
              <sphereGeometry args={[volume.radiusMeters, 28, 18]} />
            ) : (
              <boxGeometry
                args={[volume.sizeMeters[0], volume.sizeMeters[1], volume.sizeMeters[2]]}
              />
            )}
            <meshBasicMaterial
              color={operationColor}
              depthWrite={false}
              transparent
              opacity={selected ? 0.2 : hovered ? 0.15 : 0.1}
            />
          </mesh>
          <EditVolumeOutline
            volume={volume}
            color={selected ? theme.materials.selection : operationColor}
            opacity={selected ? 0.96 : hovered ? 0.8 : 0.58}
          />
        </group>
      )}
    </Selectable>
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

const GOAL_RING_SEGMENT_ROTATIONS = [
  Math.PI / 12,
  (Math.PI * 7) / 12,
  (Math.PI * 13) / 12,
  (Math.PI * 19) / 12,
] as const;

function GoalRadiusRing({
  color,
  opacity,
  pattern,
  radius,
  tube,
}: {
  readonly color: string;
  readonly opacity: number;
  readonly pattern: "solid" | "segmented";
  readonly radius: number;
  readonly tube: number;
}) {
  if (pattern === "segmented") {
    return (
      <group name="lkds3d:goal-radius-ring:segmented">
        {GOAL_RING_SEGMENT_ROTATIONS.map((rotation) => (
          <mesh key={rotation} position={[0, 0, 0.03]} rotation={[0, 0, rotation]}>
            <torusGeometry args={[radius, tube, 10, 24, Math.PI / 3]} />
            <meshBasicMaterial color={color} depthWrite={false} transparent opacity={opacity} />
          </mesh>
        ))}
      </group>
    );
  }

  return (
    <mesh name="lkds3d:goal-radius-ring:solid" position={[0, 0, 0.03]}>
      <torusGeometry args={[radius, tube, 10, 72]} />
      <meshBasicMaterial color={color} depthWrite={false} transparent opacity={opacity} />
    </mesh>
  );
}

function GoalDirectionArrow({
  color,
  opacity,
  radius,
}: {
  readonly color: string;
  readonly opacity: number;
  readonly radius: number;
}) {
  const shape = useMemo(() => {
    const nextShape = new Shape();
    const headHalfWidth = Math.max(0.145, radius * 0.28);
    const tip = radius * 1.5;
    const shaftHalfWidth = Math.max(0.065, radius * 0.13);
    const shaftStart = radius * 0.78;
    const shaftEnd = radius * 1.18;
    nextShape.moveTo(shaftStart, -shaftHalfWidth);
    nextShape.lineTo(shaftEnd, -shaftHalfWidth);
    nextShape.lineTo(shaftEnd, -headHalfWidth);
    nextShape.lineTo(tip, 0);
    nextShape.lineTo(shaftEnd, headHalfWidth);
    nextShape.lineTo(shaftEnd, shaftHalfWidth);
    nextShape.lineTo(shaftStart, shaftHalfWidth);
    nextShape.closePath();
    return nextShape;
  }, [radius]);

  return (
    <mesh name="lkds3d:goal-direction:arrow" position={[0, 0, 0.075]} renderOrder={3}>
      <shapeGeometry args={[shape]} />
      <meshBasicMaterial
        color={color}
        depthWrite={false}
        side={DoubleSide}
        transparent
        opacity={opacity}
      />
    </mesh>
  );
}

function InvalidGoalGlyph({ color, radius }: { readonly color: string; readonly radius: number }) {
  const length = radius * 1.4;
  const width = Math.max(0.09, radius * 0.17);
  return (
    <group name="lkds3d:goal-validity:invalid" position={[0, 0, 0.08]}>
      <mesh renderOrder={4} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[length, width, 0.045]} />
        <meshBasicMaterial color={color} depthWrite={false} />
      </mesh>
      <mesh renderOrder={4} rotation={[0, 0, -Math.PI / 4]}>
        <boxGeometry args={[length, width, 0.045]} />
        <meshBasicMaterial color={color} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function GoalMarker({ entity, animated = true, variant = "valid" }: GoalMarkerProps) {
  const { theme } = useSceneRuntime();
  const reducedMotion = usePrefersReducedMotion();
  const requestDemandFrame = useDemandFrameInvalidation();
  const pulse = useRef<Group | null>(null);
  const radius = entity.radiusMeters ?? 0.48;
  useFrame(({ clock }) => {
    if (!animated || reducedMotion || variant === "invalid" || pulse.current === null) return;
    const scale = 1 + Math.sin(clock.elapsedTime * 3.2) * 0.08;
    pulse.current.scale.setScalar(scale);
    requestDemandFrame(true);
  });
  useEffect(() => {
    if ((!animated || reducedMotion || variant === "invalid") && pulse.current !== null) {
      pulse.current.scale.setScalar(1);
    }
  }, [animated, reducedMotion, variant]);
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
      {({ hovered, selected }) => {
        const visualState = resolveGoalMarkerVisualState({
          animated,
          hovered,
          reducedMotion,
          selected,
          variant,
        });
        const statusOpacity = variant === "preview" ? 0.64 : 0.96;
        const ringTube = Math.max(0.035, radius * 0.075);
        return (
          <group name={`lkds3d:goal-marker:${variant}`}>
            {visualState.showPulse ? (
              <group ref={pulse}>
                <mesh position={[0, 0, 0.018]}>
                  <torusGeometry args={[radius + 0.1, Math.max(0.012, radius * 0.025), 8, 64]} />
                  <meshBasicMaterial
                    color={goalColor}
                    depthWrite={false}
                    transparent
                    opacity={0.24}
                  />
                </mesh>
              </group>
            ) : null}
            <GoalRadiusRing
              color={goalColor}
              opacity={statusOpacity}
              pattern={visualState.ringPattern}
              radius={radius}
              tube={ringTube}
            />
            <GoalDirectionArrow color={goalColor} opacity={statusOpacity} radius={radius} />
            {visualState.showInvalidGlyph ? (
              <InvalidGoalGlyph color={theme.materials.error} radius={radius} />
            ) : null}
            {visualState.showHoverOutline || visualState.showSelectionOutline ? (
              <mesh
                name={
                  visualState.showSelectionOutline
                    ? "lkds3d:goal-interaction:selected"
                    : "lkds3d:goal-interaction:hovered"
                }
                position={[0, 0, 0.02]}
              >
                <torusGeometry
                  args={[radius + (visualState.showSelectionOutline ? 0.29 : 0.27), 0.016, 8, 72]}
                />
                <meshBasicMaterial
                  color={theme.materials.selection}
                  depthWrite={false}
                  transparent
                  opacity={visualState.showSelectionOutline ? 0.82 : 0.56}
                />
              </mesh>
            ) : null}
          </group>
        );
      }}
    </Selectable>
  );
}

export interface PathRibbonProps {
  readonly entity: PathEntity;
  readonly elevationMeters?: number;
  readonly variant?: PathRibbonVariant;
  /** Keeps the executing path cursor at its deterministic midpoint when false. Defaults to true. */
  readonly animated?: boolean;
  /** Enables click-to-select. Defaults to false for backward compatibility. */
  readonly selectable?: boolean;
}

function createPathRibbonSurfaceGeometry(
  curve: CatmullRomCurve3,
  width: number,
  interval: PathRibbonInterval,
  totalSegments: number,
): BufferGeometry {
  const segmentCount = Math.max(2, Math.ceil(totalSegments * (interval.end - interval.start)));
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const up = new Vector3(0, 0, 1);

  for (let index = 0; index <= segmentCount; index += 1) {
    const progress = index / segmentCount;
    const t = interval.start + (interval.end - interval.start) * progress;
    const point = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const lateral = new Vector3().crossVectors(up, tangent);
    if (lateral.lengthSq() < 1e-8) lateral.set(1, 0, 0);
    lateral.normalize();
    const normal = new Vector3().crossVectors(tangent, lateral).normalize();
    const left = point.clone().addScaledVector(lateral, width / 2);
    const right = point.clone().addScaledVector(lateral, -width / 2);

    positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
    normals.push(normal.x, normal.y, normal.z, normal.x, normal.y, normal.z);
    uvs.push(t, 0, t, 1);

    if (index < segmentCount) {
      const leftIndex = index * 2;
      const rightIndex = leftIndex + 1;
      const nextLeftIndex = leftIndex + 2;
      const nextRightIndex = leftIndex + 3;
      indices.push(leftIndex, rightIndex, nextLeftIndex, rightIndex, nextRightIndex, nextLeftIndex);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function BlockedPathBarrier({
  color,
  curve,
  progress,
  width,
}: {
  readonly color: string;
  readonly curve: CatmullRomCurve3;
  readonly progress: number;
  readonly width: number;
}) {
  const point = curve.getPointAt(progress);
  const tangent = curve.getTangentAt(progress).normalize();
  const yaw = Math.atan2(tangent.y, tangent.x) + Math.PI / 2;
  const span = Math.max(0.44, width * 2.25);
  const thickness = Math.max(0.07, width * 0.32);
  const height = Math.max(0.065, width * 0.34);
  return (
    <group
      name="lkds3d:path-blocked-barrier"
      position={[point.x, point.y, point.z + height / 2 + 0.018]}
      rotation={[0, 0, yaw]}
    >
      <mesh castShadow renderOrder={4}>
        <boxGeometry args={[span, thickness, height]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.08} />
      </mesh>
    </group>
  );
}

function ExecutingPathCursor({
  animated,
  color,
  curve,
  width,
}: {
  readonly animated: boolean;
  readonly color: string;
  readonly curve: CatmullRomCurve3;
  readonly width: number;
}) {
  const cursor = useRef<Group | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const requestDemandFrame = useDemandFrameInvalidation();
  const metrics = useMemo(() => resolvePathExecutionCursorMetrics(width), [width]);
  const arrowShape = useMemo(() => {
    const shape = new Shape();
    const tail = -metrics.arrowLength / 2;
    const tip = metrics.arrowLength / 2;
    const headStart = 0;
    const shaftHalfWidth = metrics.arrowWidth * 0.2;
    const headHalfWidth = metrics.arrowWidth / 2;
    shape.moveTo(tail, -shaftHalfWidth);
    shape.lineTo(headStart, -shaftHalfWidth);
    shape.lineTo(headStart, -headHalfWidth);
    shape.lineTo(tip, 0);
    shape.lineTo(headStart, headHalfWidth);
    shape.lineTo(headStart, shaftHalfWidth);
    shape.lineTo(tail, shaftHalfWidth);
    shape.closePath();
    return shape;
  }, [metrics]);
  useFrame(({ clock }) => {
    if (cursor.current === null) return;
    const active = animated && !reducedMotion;
    const progress = resolvePathExecutionProgress(clock.elapsedTime, active);
    const point = curve.getPointAt(progress);
    const tangent = curve.getTangentAt(progress).normalize();
    cursor.current.position.set(point.x, point.y, point.z);
    cursor.current.rotation.set(0, 0, Math.atan2(tangent.y, tangent.x));
    requestDemandFrame(active);
  });
  return (
    <group ref={cursor} name="lkds3d:path-execution-cursor">
      <mesh
        castShadow
        name="lkds3d:path-execution-cursor:arrow"
        position={[0, 0, metrics.baseElevation]}
        renderOrder={5}
      >
        <extrudeGeometry
          args={[
            arrowShape,
            {
              bevelEnabled: true,
              bevelSegments: 1,
              bevelSize: Math.min(metrics.arrowHeight * 0.18, metrics.arrowWidth * 0.04),
              bevelThickness: Math.min(metrics.arrowHeight * 0.16, metrics.arrowWidth * 0.035),
              curveSegments: 1,
              depth: metrics.arrowHeight,
              steps: 1,
            },
          ]}
        />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.08}
          metalness={0.06}
          roughness={0.42}
        />
      </mesh>
    </group>
  );
}

function PathRibbonVisual({
  animated,
  curve,
  interaction,
  segmentCount,
  statusColor,
  variant,
  width,
}: {
  readonly animated: boolean;
  readonly curve: CatmullRomCurve3;
  readonly interaction: PathInteractionVisualState;
  readonly segmentCount: number;
  readonly statusColor: string;
  readonly variant: PathRibbonVariant;
  readonly width: number;
}) {
  const { theme } = useSceneRuntime();
  const visualState = resolvePathRibbonVisualState(variant);
  const intervals = useMemo(
    () => createPathRibbonIntervals(curve.getLength(), width, visualState.surfacePattern),
    [curve, visualState.surfacePattern, width],
  );
  const surfaceGeometries = useMemo(
    () =>
      intervals.map((interval) =>
        createPathRibbonSurfaceGeometry(curve, width, interval, segmentCount),
      ),
    [curve, intervals, segmentCount, width],
  );
  const outlineGeometry = useMemo(
    () =>
      interaction.showInteractionOutline
        ? createPathRibbonSurfaceGeometry(
            curve,
            width * interaction.outlineScale,
            { start: 0, end: 1 },
            segmentCount,
          )
        : null,
    [curve, interaction.outlineScale, interaction.showInteractionOutline, segmentCount, width],
  );
  useEffect(
    () => () => {
      surfaceGeometries.forEach((geometry) => geometry.dispose());
    },
    [surfaceGeometries],
  );
  useEffect(() => () => outlineGeometry?.dispose(), [outlineGeometry]);

  return (
    <group name={`lkds3d:path-ribbon:${variant}`}>
      {outlineGeometry === null ? null : (
        <mesh geometry={outlineGeometry} position={[0, 0, -0.006]} renderOrder={1}>
          <meshBasicMaterial
            color={theme.materials.selection}
            depthWrite={false}
            opacity={interaction.outlineOpacity}
            side={DoubleSide}
            transparent
          />
        </mesh>
      )}
      {surfaceGeometries.map((geometry, index) => (
        <mesh key={index} geometry={geometry} receiveShadow renderOrder={2}>
          <meshStandardMaterial
            color={statusColor}
            emissive={statusColor}
            emissiveIntensity={interaction.emissiveIntensity}
            metalness={0.01}
            opacity={visualState.surfacePattern === "segmented" ? 0.82 : 1}
            roughness={0.76}
            side={DoubleSide}
            transparent={visualState.surfacePattern === "segmented"}
          />
        </mesh>
      ))}
      {visualState.showExecutionCursor ? (
        <ExecutingPathCursor
          animated={animated}
          color={theme.materials.assetBody}
          curve={curve}
          width={width}
        />
      ) : null}
      {visualState.showBlockedBarriers
        ? [0.43, 0.57].map((progress) => (
            <BlockedPathBarrier
              key={progress}
              color={theme.materials.text}
              curve={curve}
              progress={progress}
              width={width}
            />
          ))
        : null}
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
  const statusColor =
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
        return (
          <PathRibbonVisual
            animated={animated}
            curve={curve}
            interaction={interaction}
            segmentCount={Math.max(24, entity.points.length * 18)}
            statusColor={statusColor}
            variant={variant}
            width={width}
          />
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
