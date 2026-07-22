import { useEffect, useMemo, type ReactNode } from "react";
import { CanvasTexture, Color, LinearFilter, Quaternion, SRGBColorSpace, Vector3 } from "three";
import {
  createMarkerLayerSnapshot,
  resolveMarkerLayerRenderState,
  type MarkerColor,
  type MarkerFreshnessPolicy,
  type MarkerLayerRenderState,
  type MarkerLayerSnapshot,
  type MarkerSnapshot,
  type MeshMarkerSnapshot,
} from "@lk-robotics/lds-3d-markers";

import { Selectable, type SelectableRenderState } from "./primitives.js";
import { useSceneRuntime } from "./runtime.js";

export type MarkerMeshRenderer = (marker: MeshMarkerSnapshot) => ReactNode;

export interface MarkerLayerProps {
  readonly snapshot: MarkerLayerSnapshot;
  /** Atomic layer budget. Over-budget layers render no marker geometry. */
  readonly maxMarkers: number;
  readonly freshnessPolicy?: MarkerFreshnessPolicy;
  /** Required to render mesh markers; no placeholder asset is invented when omitted. */
  readonly renderMesh?: MarkerMeshRenderer;
  readonly onRenderStateChange?: (state: MarkerLayerRenderState) => void;
}

function markerColor(
  color: MarkerColor,
  interaction: SelectableRenderState,
  selection: string,
): Color {
  if (interaction.selected || interaction.hovered) return new Color(selection);
  return new Color(color.r, color.g, color.b);
}

function MarkerMaterial({
  color,
  interaction,
}: {
  readonly color: MarkerColor;
  readonly interaction: SelectableRenderState;
}) {
  const { theme } = useSceneRuntime();
  return (
    <meshStandardMaterial
      color={markerColor(color, interaction, theme.materials.selection)}
      emissive={interaction.selected ? theme.materials.selection : "#000000"}
      emissiveIntensity={interaction.selected ? 0.22 : 0}
      opacity={color.a}
      roughness={0.62}
      transparent={color.a < 1}
    />
  );
}

function ArrowGeometry({
  color,
  interaction,
  length,
  shaftDiameter,
  headDiameter,
}: {
  readonly color: MarkerColor;
  readonly interaction: SelectableRenderState;
  readonly length: number;
  readonly shaftDiameter: number;
  readonly headDiameter: number;
}) {
  const headLength = Math.min(length * 0.34, Math.max(headDiameter * 1.6, length * 0.18));
  const shaftLength = Math.max(length - headLength, length * 0.12);
  return (
    <group>
      <mesh position={[shaftLength / 2, 0, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow>
        <cylinderGeometry args={[shaftDiameter / 2, shaftDiameter / 2, shaftLength, 16]} />
        <MarkerMaterial color={color} interaction={interaction} />
      </mesh>
      <mesh
        position={[shaftLength + headLength / 2, 0, 0]}
        rotation={[0, 0, -Math.PI / 2]}
        castShadow
      >
        <coneGeometry args={[headDiameter / 2, headLength, 20]} />
        <MarkerMaterial color={color} interaction={interaction} />
      </mesh>
    </group>
  );
}

function Segment({
  color,
  interaction,
  start,
  end,
  width,
}: {
  readonly color: MarkerColor;
  readonly interaction: SelectableRenderState;
  readonly start: readonly [number, number, number];
  readonly end: readonly [number, number, number];
  readonly width: number;
}) {
  const placement = useMemo(() => {
    const startVector = new Vector3(start[0], start[1], start[2]);
    const endVector = new Vector3(end[0], end[1], end[2]);
    const direction = endVector.clone().sub(startVector);
    const length = direction.length();
    const quaternion = new Quaternion().setFromUnitVectors(
      new Vector3(0, 1, 0),
      direction.normalize(),
    );
    const midpoint = startVector.add(endVector).multiplyScalar(0.5);
    return { length, midpoint, quaternion };
  }, [end, start]);
  if (placement.length <= Number.EPSILON) return null;
  return (
    <mesh position={placement.midpoint} quaternion={placement.quaternion}>
      <cylinderGeometry args={[width / 2, width / 2, placement.length, 10]} />
      <MarkerMaterial color={color} interaction={interaction} />
    </mesh>
  );
}

function TextSprite({ marker }: { readonly marker: Extract<MarkerSnapshot, { kind: "text" }> }) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("Marker text requires a 2D canvas context.");
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = "600 116px system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineJoin = "round";
    context.lineWidth = 20;
    context.strokeStyle = "rgba(255,255,255,0.94)";
    context.fillStyle = `rgba(${Math.round(marker.color.r * 255).toString()},${Math.round(marker.color.g * 255).toString()},${Math.round(marker.color.b * 255).toString()},${marker.color.a.toString()})`;
    context.strokeText(marker.text, canvas.width / 2, canvas.height / 2);
    context.fillText(marker.text, canvas.width / 2, canvas.height / 2);
    const value = new CanvasTexture(canvas);
    value.colorSpace = SRGBColorSpace;
    value.minFilter = LinearFilter;
    value.needsUpdate = true;
    return value;
  }, [marker.color.a, marker.color.b, marker.color.g, marker.color.r, marker.text]);
  useEffect(() => () => texture.dispose(), [texture]);
  const width = Math.max(marker.height * 1.5, marker.height * marker.text.length * 0.62);
  return (
    <sprite scale={[width, marker.height, 1]}>
      <spriteMaterial depthTest map={texture} opacity={marker.color.a} transparent />
    </sprite>
  );
}

function PoseAxes({ marker }: { readonly marker: Extract<MarkerSnapshot, { kind: "pose" }> }) {
  const muted = marker.color.a;
  const colors = {
    x: { r: 0.85, g: 0.18, b: 0.14, a: muted },
    y: { r: 0.03, g: 0.58, b: 0.34, a: muted },
    z: { r: 0.08, g: 0.4, b: 0.86, a: muted },
  } as const;
  const neutral: SelectableRenderState = { hovered: false, selected: false };
  return (
    <group>
      <ArrowGeometry
        color={colors.x}
        headDiameter={marker.axisRadius * 4}
        interaction={neutral}
        length={marker.axisLength}
        shaftDiameter={marker.axisRadius * 2}
      />
      <group rotation={[0, 0, Math.PI / 2]}>
        <ArrowGeometry
          color={colors.y}
          headDiameter={marker.axisRadius * 4}
          interaction={neutral}
          length={marker.axisLength}
          shaftDiameter={marker.axisRadius * 2}
        />
      </group>
      <group rotation={[0, -Math.PI / 2, 0]}>
        <ArrowGeometry
          color={colors.z}
          headDiameter={marker.axisRadius * 4}
          interaction={neutral}
          length={marker.axisLength}
          shaftDiameter={marker.axisRadius * 2}
        />
      </group>
    </group>
  );
}

function MarkerGeometry({
  marker,
  interaction,
  renderMesh,
}: {
  readonly marker: MarkerSnapshot;
  readonly interaction: SelectableRenderState;
  readonly renderMesh?: MarkerMeshRenderer;
}) {
  switch (marker.kind) {
    case "arrow":
      return (
        <ArrowGeometry
          color={marker.color}
          headDiameter={marker.scale[2]}
          interaction={interaction}
          length={marker.scale[0]}
          shaftDiameter={marker.scale[1]}
        />
      );
    case "pose":
      return <PoseAxes marker={marker} />;
    case "line-strip":
      return (
        <group>
          {marker.points.slice(1).map((end, index) => {
            const start = marker.points[index];
            return start === undefined ? null : (
              <Segment
                color={marker.color}
                end={end}
                interaction={interaction}
                key={`${index.toString()}:${end.join(",")}`}
                start={start}
                width={marker.width}
              />
            );
          })}
        </group>
      );
    case "points":
      return (
        <group>
          {marker.points.map((point, index) => (
            <mesh
              key={`${index.toString()}:${point.join(",")}`}
              position={[point[0], point[1], point[2]]}
            >
              <sphereGeometry args={[marker.size / 2, 12, 8]} />
              <MarkerMaterial color={marker.color} interaction={interaction} />
            </mesh>
          ))}
        </group>
      );
    case "text":
      return <TextSprite marker={marker} />;
    case "volume":
      return (
        <mesh
          scale={[marker.scale[0], marker.scale[1], marker.scale[2]]}
          {...(marker.shape === "cylinder" ? { rotation: [Math.PI / 2, 0, 0] as const } : {})}
          castShadow
          receiveShadow
        >
          {marker.shape === "box" ? <boxGeometry args={[1, 1, 1]} /> : null}
          {marker.shape === "sphere" ? <sphereGeometry args={[0.5, 24, 16]} /> : null}
          {marker.shape === "cylinder" ? <cylinderGeometry args={[0.5, 0.5, 1, 24]} /> : null}
          <MarkerMaterial color={marker.color} interaction={interaction} />
        </mesh>
      );
    case "mesh":
      return renderMesh === undefined ? null : (
        <group scale={[marker.scale[0], marker.scale[1], marker.scale[2]]}>
          {renderMesh(marker)}
        </group>
      );
  }
}

/**
 * Actual WebGL marker geometry for one frame-scoped, immutable snapshot.
 * The component performs no transport, TF lookup, retention policy, or DOM UI.
 */
export function MarkerLayer({
  snapshot,
  maxMarkers,
  freshnessPolicy,
  renderMesh,
  onRenderStateChange,
}: MarkerLayerProps) {
  const runtime = useSceneRuntime();
  const normalized = useMemo(() => createMarkerLayerSnapshot(snapshot), [snapshot]);
  const state = useMemo(
    () => resolveMarkerLayerRenderState(normalized, runtime.frame, maxMarkers, freshnessPolicy),
    [freshnessPolicy, maxMarkers, normalized, runtime.frame],
  );
  useEffect(() => onRenderStateChange?.(state), [onRenderStateChange, state]);
  if (state.kind !== "ready") return null;
  return (
    <group
      name={`lkds3d:marker-layer:${normalized.id}`}
      position={[
        state.sourceToScene.translation[0],
        state.sourceToScene.translation[1],
        state.sourceToScene.translation[2],
      ]}
      quaternion={[
        state.sourceToScene.rotation[0],
        state.sourceToScene.rotation[1],
        state.sourceToScene.rotation[2],
        state.sourceToScene.rotation[3],
      ]}
    >
      {normalized.markers.map((marker) =>
        marker.visible ? (
          <Selectable
            entityId={marker.id}
            key={marker.id}
            position={marker.pose.position}
            quaternion={marker.pose.orientation}
            selectable={marker.selectable}
          >
            {(interaction) => (
              <group>
                <MarkerGeometry
                  interaction={interaction}
                  marker={marker}
                  {...(renderMesh === undefined ? {} : { renderMesh })}
                />
                {interaction.selected ? (
                  <mesh position={[0, 0, 0.018]}>
                    <torusGeometry args={[0.22, 0.022, 10, 40]} />
                    <meshBasicMaterial
                      color={runtime.theme.materials.selection}
                      depthTest={false}
                    />
                  </mesh>
                ) : null}
              </group>
            )}
          </Selectable>
        ) : null,
      )}
    </group>
  );
}
