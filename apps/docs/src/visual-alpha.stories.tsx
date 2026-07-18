import { Html } from "@react-three/drei";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { SegmentedControl } from "@lk-robotics/design-system-core/components/selection/SegmentedControl";
import { useMemo, useState, type ReactNode } from "react";
import {
  GoalMarker,
  PathRibbon,
  SceneCanvas,
  VisualAlphaModel,
  usePrefersReducedMotion,
  type SceneCameraPose,
  type SceneHoverChange,
  type SceneRenderState,
  type SceneSelectionChange,
  type SceneVisualProfile,
  type VisualAlphaModelKey,
} from "@lk-robotics/design-system-3d-r3f";
import {
  entityId,
  frameId,
  quaternionFromYaw,
  type Bounds3,
  type EntityId,
  type GoalEntity,
  type PathEntity,
  type Vec3,
} from "@lk-robotics/design-system-3d-core";
import {
  ACTIVE_GOAL_POSITION,
  INVALID_GOAL_POSITION,
  PRIMARY_AMR_ID,
  VISUAL_ALPHA_ENTITIES,
  VISUAL_ALPHA_PATHS,
  selectedDetails,
  type VisualEntityStatus,
} from "./visual-alpha-fixture.js";
import {
  LdsFocusedViewerPage,
  type SelectedAssetDetails,
  type VisualCameraMode,
  type VisualProfile,
  type VisualRuntimeState,
} from "./visual-alpha-ui.js";

const meta = {
  title: "LDS 3D/Scenes/Visual Alpha",
  id: "visual-alpha",
  parameters: {
    canvasShell: "flush",
    controls: { disable: true },
    layout: "fullscreen",
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const MODEL_BASE_PATH = "/visual-alpha";
const MAP_FRAME = frameId("lk-map");
const FLOOR_BOUNDS: Bounds3 = {
  frame: MAP_FRAME,
  min: [-9, -6, 0],
  max: [9, 6, 2.8],
};
const HOME_CAMERA: SceneCameraPose = {
  position: [11.5, -14.5, 10.5],
  target: [0, 0, 0.65],
  up: [0, 0, 1],
};

/*
 * Storybook is a visual-review surface, not a product performance baseline.
 * Keep its renderer inside the review budget while product callers retain
 * SceneCanvas' compatibility defaults and choose their own quality tier.
 */
const STORY_DEVICE_PIXEL_RATIO = 1;
const STORY_SHADOW_MAP_SIZE = 1024;

const MODEL_LOCAL_BOUNDS: Readonly<
  Record<VisualAlphaModelKey, { readonly min: Vec3; readonly max: Vec3 }>
> = Object.freeze({
  amr: { min: [-0.6, -0.415, 0], max: [0.613, 0.415, 0.687] },
  rack: { min: [-0.523, -1.22, 0], max: [0.52, 1.22, 2.438] },
  pallet: { min: [-0.6, -0.42, 0], max: [0.6, 0.42, 0.22] },
  cargoBin: { min: [-0.47, -0.37, 0], max: [0.47, 0.37, 0.7] },
  chargingStation: { min: [-0.36, -0.41, 0], max: [0.514, 0.41, 1.36] },
  safetyCone: { min: [-0.25, -0.25, 0], max: [0.25, 0.25, 0.785] },
});

function modelFocusBounds(assetKey: VisualAlphaModelKey, position: Vec3): Bounds3 {
  const local = MODEL_LOCAL_BOUNDS[assetKey];
  const padding = assetKey === "rack" ? 0.55 : 0.35;
  return {
    frame: MAP_FRAME,
    min: [
      position[0] + local.min[0] - padding,
      position[1] + local.min[1] - padding,
      Math.max(0, position[2] + local.min[2] - padding * 0.25),
    ],
    max: [
      position[0] + local.max[0] + padding,
      position[1] + local.max[1] + padding,
      position[2] + local.max[2] + padding,
    ],
  };
}

function pathEntity(id: string, points: readonly Vec3[], widthMeters: number): PathEntity {
  return Object.freeze({
    kind: "path",
    id: entityId(id),
    frame: MAP_FRAME,
    points,
    widthMeters,
  });
}

const ROUTES = Object.freeze({
  actual: pathEntity("path/amr-01/actual", VISUAL_ALPHA_PATHS.actual, 0.22),
  executing: pathEntity("path/amr-01/executing", VISUAL_ALPHA_PATHS.executing, 0.24),
  planned: pathEntity("path/amr-01/planned", VISUAL_ALPHA_PATHS.planned, 0.18),
  blocked: pathEntity("path/amr-03/blocked", VISUAL_ALPHA_PATHS.blocked, 0.22),
});

type RouteVariant = keyof typeof ROUTES;
type GoalVariant = "valid" | "preview" | "invalid";

const ROUTE_OPTIONS = [
  { value: "actual", label: "Actual" },
  { value: "executing", label: "Executing" },
  { value: "planned", label: "Planned" },
  { value: "blocked", label: "Blocked" },
];

const GOAL_OPTIONS = [
  { value: "valid", label: "Valid" },
  { value: "preview", label: "Preview" },
  { value: "invalid", label: "Invalid" },
];

const ACTIVE_GOAL: GoalEntity = Object.freeze({
  kind: "goal",
  id: entityId("goal/dock-03"),
  pose: Object.freeze({
    frame: MAP_FRAME,
    position: ACTIVE_GOAL_POSITION,
    orientation: quaternionFromYaw(Math.PI),
  }),
  radiusMeters: 0.52,
});

const INVALID_GOAL: GoalEntity = Object.freeze({
  kind: "goal",
  id: entityId("goal/invalid-preview"),
  pose: Object.freeze({
    frame: MAP_FRAME,
    position: INVALID_GOAL_POSITION,
    orientation: quaternionFromYaw(0),
  }),
  radiusMeters: 0.42,
});

function pointsFocusBounds(points: readonly Vec3[], padding = 0.7): Bounds3 {
  const x = points.map((point) => point[0]);
  const y = points.map((point) => point[1]);
  const z = points.map((point) => point[2]);
  return {
    frame: MAP_FRAME,
    min: [Math.min(...x) - padding, Math.min(...y) - padding, Math.max(0, Math.min(...z) - 0.1)],
    max: [Math.max(...x) + padding, Math.max(...y) + padding, Math.max(...z) + 0.9],
  };
}

function selectionFocusBounds(selected: EntityId | null): Bounds3 {
  const entity = VISUAL_ALPHA_ENTITIES.find((candidate) => candidate.id === selected);
  if (entity !== undefined) return modelFocusBounds(entity.assetKey, entity.position);

  const route = Object.values(ROUTES).find((candidate) => candidate.id === selected);
  if (route !== undefined) return pointsFocusBounds(route.points);
  if (selected === INVALID_GOAL.id) return pointsFocusBounds([INVALID_GOAL_POSITION], 0.8);
  return pointsFocusBounds([ACTIVE_GOAL_POSITION], 0.8);
}

interface StatusPalette {
  readonly live: string;
  readonly stale: string;
  readonly warning: string;
  readonly error: string;
  readonly idle: string;
  readonly selected: string;
  readonly labelBackground: string;
  readonly labelText: string;
}

function statusPalette(profile: SceneVisualProfile): StatusPalette {
  return profile === "diagnostic-technical"
    ? {
        live: "#4DE3C1",
        stale: "#FFC857",
        warning: "#FFC857",
        error: "#FF6B78",
        idle: "#526B78",
        selected: "#43D9FF",
        labelBackground: "rgba(7, 16, 24, 0.92)",
        labelText: "#E9F5FF",
      }
    : {
        live: "#007A66",
        stale: "#9A5B00",
        warning: "#9A5B00",
        error: "#B42318",
        idle: "#60717E",
        selected: "#005FCC",
        labelBackground: "rgba(255, 255, 255, 0.94)",
        labelText: "#16202A",
      };
}

interface WorldLabelProps {
  readonly title: string;
  readonly meta: string;
  readonly position: Vec3;
  readonly tone: string;
  readonly profile: SceneVisualProfile;
}

function WorldLabel({ title, meta: detail, position, tone, profile }: WorldLabelProps): ReactNode {
  const palette = statusPalette(profile);
  return (
    <Html center position={position} style={{ pointerEvents: "none" }} zIndexRange={[5, 0]}>
      <div
        className={`visual-world-label${profile === "diagnostic-technical" ? " is-diagnostic" : ""}`}
        style={{
          borderColor: tone,
          color: palette.labelText,
          background: palette.labelBackground,
        }}
      >
        <span style={{ background: tone }} aria-hidden="true" />
        <div><strong>{title}</strong><small>{detail}</small></div>
      </div>
    </Html>
  );
}

interface EntityMarkerProps {
  readonly entityId: EntityId;
  readonly name: string;
  readonly position: Vec3;
  readonly status: VisualEntityStatus;
  readonly profile: SceneVisualProfile;
  readonly selected: boolean;
  readonly hovered: boolean;
  readonly labelHeight: number;
}

function EntityMarker({
  entityId,
  name,
  position,
  status,
  profile,
  selected,
  hovered,
  labelHeight,
}: EntityMarkerProps): ReactNode {
  const palette = statusPalette(profile);
  const tone = selected ? palette.selected : palette[status];
  const showStatusRing = selected || hovered || status === "stale" || status === "error";
  const showLabel = selected || hovered || status === "error";
  return (
    <group position={position}>
      {showStatusRing ? (
        <group position={[0, 0, 0.026]}>
          <mesh>
            <torusGeometry args={[0.72, selected ? 0.032 : 0.021, 8, status === "stale" ? 12 : 64]} />
            <meshBasicMaterial color={tone} depthWrite={false} transparent opacity={0.94} />
          </mesh>
          {selected ? (
            <mesh>
              <torusGeometry args={[0.82, 0.012, 6, 64]} />
              <meshBasicMaterial color={palette.selected} depthWrite={false} transparent opacity={0.68} />
            </mesh>
          ) : null}
          {status === "error" ? (
            <group position={[0, 0, 0.015]}>
              <mesh rotation={[0, 0, Math.PI / 4]}>
                <boxGeometry args={[1.05, 0.055, 0.025]} />
                <meshBasicMaterial color={palette.error} />
              </mesh>
              <mesh rotation={[0, 0, -Math.PI / 4]}>
                <boxGeometry args={[1.05, 0.055, 0.025]} />
                <meshBasicMaterial color={palette.error} />
              </mesh>
            </group>
          ) : null}
        </group>
      ) : null}
      {showLabel ? (
        <WorldLabel
          title={name}
          meta={`${status.toUpperCase()} · ${entityId}`}
          position={[0, 0, labelHeight]}
          profile={profile}
          tone={tone}
        />
      ) : null}
    </group>
  );
}

function RouteLabels({ profile }: { readonly profile: SceneVisualProfile }): ReactNode {
  const palette = statusPalette(profile);
  return (
    <>
      <WorldLabel title="ACTUAL" meta="completed" position={[-5.9, -1.2, 0.42]} profile={profile} tone={palette.idle} />
      <WorldLabel title="EXECUTING" meta="AMR 01" position={[-0.7, -0.45, 0.5]} profile={profile} tone={palette.live} />
      <WorldLabel title="PLANNED" meta="to Dock 03" position={[4.4, 1.05, 0.48]} profile={profile} tone={palette.selected} />
      <WorldLabel title="BLOCKED" meta="obstacle" position={[4.55, -2.78, 0.52]} profile={profile} tone={palette.error} />
    </>
  );
}

interface WarehouseContentsProps {
  readonly profile: SceneVisualProfile;
  readonly selected: EntityId | null;
  readonly hovered: EntityId | null;
  /** Static review stories can expose state language without a permanent render loop. */
  readonly animateAmbientMotion?: boolean;
  readonly persistentRouteLabels?: boolean;
  readonly goalVariant?: GoalVariant;
  readonly includeSecondaryGoal?: boolean;
}

function WarehouseContents({
  profile,
  selected,
  hovered,
  animateAmbientMotion = true,
  persistentRouteLabels = true,
  goalVariant = "valid",
  includeSecondaryGoal = true,
}: WarehouseContentsProps): ReactNode {
  const reducedMotion = usePrefersReducedMotion();
  const primaryGoal = goalVariant === "invalid" ? INVALID_GOAL : ACTIVE_GOAL;
  return (
    <>
      <PathRibbon animated={animateAmbientMotion} entity={ROUTES.actual} selectable variant="actual" />
      <PathRibbon animated={animateAmbientMotion} entity={ROUTES.executing} selectable variant="executing" />
      <PathRibbon animated={animateAmbientMotion} entity={ROUTES.planned} selectable variant="planned" />
      <PathRibbon animated={animateAmbientMotion} entity={ROUTES.blocked} selectable variant="blocked" />
      <GoalMarker
        animated={animateAmbientMotion && !reducedMotion && goalVariant !== "invalid"}
        entity={primaryGoal}
        variant={goalVariant}
      />
      {includeSecondaryGoal && goalVariant !== "invalid" ? (
        <GoalMarker animated={false} entity={INVALID_GOAL} variant="invalid" />
      ) : null}
      {VISUAL_ALPHA_ENTITIES.map((entity) => (
        <VisualAlphaModel
          key={entity.id}
          assetKey={entity.assetKey}
          entityId={entity.id}
          modelBasePath={MODEL_BASE_PATH}
          orientation={entity.orientation}
          position={entity.position}
          sourceConvention="core"
        />
      ))}
      {VISUAL_ALPHA_ENTITIES.map((entity) => (
        <EntityMarker
          key={`marker:${entity.id}`}
          entityId={entity.id}
          hovered={hovered === entity.id}
          labelHeight={entity.assetKey === "rack" ? 2.85 : entity.assetKey === "chargingStation" ? 1.75 : 1.18}
          name={entity.name}
          position={entity.position}
          profile={profile}
          selected={selected === entity.id}
          status={entity.status}
        />
      ))}
      {persistentRouteLabels ? <RouteLabels profile={profile} /> : null}
    </>
  );
}

function SceneLegend({ profile }: { readonly profile: SceneVisualProfile }): ReactNode {
  return (
    <div className={`visual-scene-legend is-${profile}`}>
      <strong>AMR WAREHOUSE</strong>
      <div><span className="is-live" />Executing</div>
      <div><span className="is-goal" />Goal / intent</div>
      <div><span className="is-error" />Blocked / error</div>
      <small>18 × 12 m · LK core +Z up</small>
    </div>
  );
}

function toSceneProfile(profile: VisualProfile): SceneVisualProfile {
  return profile === "diagnostic" ? "diagnostic-technical" : "operational-neutral";
}

interface VisualDirectionExperienceProps {
  readonly profile: VisualProfile;
  readonly initialCameraMode?: VisualCameraMode;
}

function VisualDirectionExperience({
  profile,
  initialCameraMode = "home",
}: VisualDirectionExperienceProps): ReactNode {
  const sceneProfile = toSceneProfile(profile);
  const [cameraMode, setCameraMode] = useState<VisualCameraMode>(initialCameraMode);
  const [selected, setSelected] = useState<EntityId | null>(PRIMARY_AMR_ID);
  const [hovered, setHovered] = useState<EntityId | null>(null);
  const focusBounds = useMemo(() => selectionFocusBounds(selected), [selected]);
  const details = selected === null ? undefined : selectedDetails(selected);

  return (
    <LdsFocusedViewerPage
      cameraMode={cameraMode}
      onCameraModeChange={setCameraMode}
      onClearSelection={() => setSelected(null)}
      pageTitle="AMR Operations"
      profile={profile}
      runtimeState="ready"
      sceneTitle="Warehouse / LK-MAP"
      {...(details === undefined ? {} : { selected: details })}
    >
      <SceneCanvas
        ariaLabel="AMR warehouse interactive WebGL scene"
        cameraMode={cameraMode}
        devicePixelRatio={STORY_DEVICE_PIXEL_RATIO}
        frame={MAP_FRAME}
        environment={{
          sizeMeters: 22,
          minorSpacingMeters: 0.5,
          majorSpacingMeters: 2,
          shadowMapSize: STORY_SHADOW_MAP_SIZE,
        }}
        frameLoop="demand"
        focusBounds={focusBounds}
        homePose={HOME_CAMERA}
        hoveredEntityId={hovered}
        onHoverChange={(change: SceneHoverChange) => setHovered(change.entityId)}
        onSelectionChange={(change: SceneSelectionChange) => setSelected(change.entityId)}
        profile={sceneProfile}
        renderState={{ kind: "ready" }}
        selectedEntityId={selected}
        style={{ height: "100%", minHeight: 480, borderRadius: 0 }}
        topBounds={FLOOR_BOUNDS}
        overlay={<SceneLegend profile={sceneProfile} />}
      >
        <WarehouseContents
          animateAmbientMotion={false}
          hovered={hovered}
          profile={sceneProfile}
          selected={selected}
        />
      </SceneCanvas>
    </LdsFocusedViewerPage>
  );
}

interface CatalogPlacement {
  readonly assetKey: VisualAlphaModelKey;
  readonly id: EntityId;
  readonly label: string;
  readonly position: Vec3;
}

const CATALOG_PLACEMENTS: readonly CatalogPlacement[] = Object.freeze([
  { assetKey: "amr", id: entityId("catalog/amr"), label: "AMR", position: [-3.5, 2.2, 0] },
  { assetKey: "rack", id: entityId("catalog/rack"), label: "Rack", position: [0, 2.2, 0] },
  { assetKey: "chargingStation", id: entityId("catalog/charging-station"), label: "Charging station", position: [3.5, 2.2, 0] },
  { assetKey: "pallet", id: entityId("catalog/pallet"), label: "Pallet", position: [-3.5, -2.0, 0] },
  { assetKey: "cargoBin", id: entityId("catalog/cargo-bin"), label: "Cargo bin", position: [0, -2.0, 0] },
  { assetKey: "safetyCone", id: entityId("catalog/safety-cone"), label: "Safety cone", position: [3.5, -2.0, 0] },
]);

function catalogDetails(id: EntityId | null): SelectedAssetDetails | undefined {
  const item = CATALOG_PLACEMENTS.find((candidate) => candidate.id === id);
  return item === undefined
    ? undefined
    : {
        id: item.id,
        name: item.label,
        kind: "Visual Alpha GLB",
        status: "live",
        pose: item.position,
        source: `/visual-alpha/${item.assetKey}`,
        frame: "lk-map",
        timestamp: "deterministic build",
      };
}

function AssetCatalogExperience(): ReactNode {
  const [cameraMode, setCameraMode] = useState<VisualCameraMode>("home");
  const [selected, setSelected] = useState<EntityId | null>(CATALOG_PLACEMENTS[0]?.id ?? null);
  const [hovered, setHovered] = useState<EntityId | null>(null);
  const details = catalogDetails(selected);
  const focusedModel = CATALOG_PLACEMENTS.find((item) => item.id === selected);
  const focusBounds =
    focusedModel === undefined
      ? modelFocusBounds("amr", [0, 0, 0])
      : modelFocusBounds(focusedModel.assetKey, focusedModel.position);
  const palette = statusPalette("operational-neutral");
  return (
    <LdsFocusedViewerPage
      cameraMode={cameraMode}
      description="Review the six deterministic Visual Alpha assets in one spatial catalog."
      onCameraModeChange={setCameraMode}
      onClearSelection={() => setSelected(null)}
      pageTitle="Industrial Asset Catalog"
      profile="operational"
      runtimeState="ready"
      sceneTitle="Asset review grid / LK-MAP"
      {...(details === undefined ? {} : { selected: details })}
    >
      <SceneCanvas
        ariaLabel="Six interactive Visual Alpha GLB assets"
        cameraMode={cameraMode}
        devicePixelRatio={STORY_DEVICE_PIXEL_RATIO}
        frame={MAP_FRAME}
        environment={{
          sizeMeters: 14,
          minorSpacingMeters: 0.5,
          majorSpacingMeters: 2,
          shadowMapSize: STORY_SHADOW_MAP_SIZE,
        }}
        frameLoop="demand"
        focusBounds={focusBounds}
        homePose={{ position: [8.5, -11, 8], target: [0, 0, 0.65], up: [0, 0, 1] }}
        hoveredEntityId={hovered}
        onHoverChange={(change: SceneHoverChange) => setHovered(change.entityId)}
        onSelectionChange={(change: SceneSelectionChange) => setSelected(change.entityId)}
        profile="operational-neutral"
        selectedEntityId={selected}
        style={{ height: "100%", minHeight: 480, borderRadius: 0 }}
        topBounds={{ frame: MAP_FRAME, min: [-6, -4.5, 0], max: [6, 4.5, 3] }}
      >
        {CATALOG_PLACEMENTS.map((item) => (
          <group key={item.id}>
            <VisualAlphaModel
              assetKey={item.assetKey}
              entityId={item.id}
              modelBasePath={MODEL_BASE_PATH}
              position={item.position}
              sourceConvention="core"
            />
            <WorldLabel
              meta={`actual ${item.assetKey} GLB`}
              position={[item.position[0], item.position[1], item.assetKey === "rack" ? 2.85 : 1.35]}
              profile="operational-neutral"
              title={item.label}
              tone={selected === item.id ? palette.selected : hovered === item.id ? palette.live : palette.idle}
            />
          </group>
        ))}
      </SceneCanvas>
    </LdsFocusedViewerPage>
  );
}

function renderStateFor(state: VisualRuntimeState): SceneRenderState {
  switch (state) {
    case "ready":
      return { kind: "ready" };
    case "loading":
      return { kind: "loading", label: "Loading GLB catalog", progress: 0.58 };
    case "empty":
      return { kind: "empty", title: "No spatial entities", description: "Renderer ready" };
    case "error":
      return {
        kind: "error",
        title: "Asset load failed",
        message: "Deliberate Visual Alpha recovery state",
        recoverable: true,
      };
  }
}

function RendererStateExperience(): ReactNode {
  const [runtimeState, setRuntimeState] = useState<VisualRuntimeState>("loading");
  const [cameraMode, setCameraMode] = useState<VisualCameraMode>("home");
  const details = selectedDetails(PRIMARY_AMR_ID);
  return (
    <LdsFocusedViewerPage
      cameraMode={cameraMode}
      description="Exercise renderer loading, empty, error, retry, and recovered states without replacing the page shell."
      onCameraModeChange={setCameraMode}
      onRetry={() => setRuntimeState("ready")}
      pageTitle="Renderer Lifecycle & Recovery"
      profile="operational"
      reviewControls={(
        <SegmentedControl
          aria-label="Renderer state"
          options={[
            { value: "ready", label: "Ready" },
            { value: "loading", label: "Loading" },
            { value: "empty", label: "Empty" },
            { value: "error", label: "Error" },
          ]}
          size="sm"
          value={runtimeState}
          onChange={(value) => setRuntimeState(value as VisualRuntimeState)}
        />
      )}
      runtimeState={runtimeState}
      sceneTitle="Warehouse / LK-MAP"
      {...(details === undefined ? {} : { selected: details })}
    >
      <SceneCanvas
        ariaLabel="Interactive renderer lifecycle states"
        cameraMode={cameraMode}
        devicePixelRatio={STORY_DEVICE_PIXEL_RATIO}
        frame={MAP_FRAME}
        environment={{ sizeMeters: 22, shadowMapSize: STORY_SHADOW_MAP_SIZE }}
        frameLoop="demand"
        homePose={HOME_CAMERA}
        profile="operational-neutral"
        renderState={renderStateFor(runtimeState)}
        selectedEntityId={PRIMARY_AMR_ID}
        style={{ height: "100%", minHeight: 480, borderRadius: 0 }}
        topBounds={FLOOR_BOUNDS}
      >
        <WarehouseContents
          animateAmbientMotion={false}
          hovered={null}
          profile="operational-neutral"
          selected={PRIMARY_AMR_ID}
          persistentRouteLabels={false}
        />
      </SceneCanvas>
    </LdsFocusedViewerPage>
  );
}

function GoalPathStateExperience(): ReactNode {
  const [cameraMode, setCameraMode] = useState<VisualCameraMode>("top");
  const [pathVariant, setPathVariant] = useState<RouteVariant>("executing");
  const [goalVariant, setGoalVariant] = useState<GoalVariant>("valid");
  const [selected, setSelected] = useState<EntityId | null>(ROUTES.executing.id);
  const [hovered, setHovered] = useState<EntityId | null>(null);
  const focusBounds = useMemo(() => selectionFocusBounds(selected), [selected]);
  const selectedBase = selected === null ? undefined : selectedDetails(selected);
  const details =
    selected === ACTIVE_GOAL.id && selectedBase !== undefined && goalVariant === "preview"
      ? {
          ...selectedBase,
          name: "Dock 03 goal preview",
          status: "warning" as const,
          task: "Operator preview · not committed",
        }
      : selectedBase;

  const handleSelection = (change: SceneSelectionChange): void => {
    setSelected(change.entityId);
    const route = Object.entries(ROUTES).find(([, entity]) => entity.id === change.entityId);
    if (route !== undefined) setPathVariant(route[0] as RouteVariant);
    if (change.entityId === INVALID_GOAL.id) setGoalVariant("invalid");
  };

  return (
    <LdsFocusedViewerPage
      cameraMode={cameraMode}
      description="Compare goal intent and path execution states in the same selectable warehouse scene."
      onCameraModeChange={setCameraMode}
      onClearSelection={() => setSelected(null)}
      pageTitle="Goal & Path State Language"
      profile="operational"
      reviewControls={(
        <div className="visual-state-controls">
          <span>Path</span>
          <SegmentedControl
            aria-label="Path state"
            options={ROUTE_OPTIONS}
            size="sm"
            value={pathVariant}
            onChange={(value) => {
              const next = value as RouteVariant;
              setPathVariant(next);
              setSelected(ROUTES[next].id);
            }}
          />
          <span>Goal</span>
          <SegmentedControl
            aria-label="Goal state"
            options={GOAL_OPTIONS}
            size="sm"
            value={goalVariant}
            onChange={(value) => {
              const next = value as GoalVariant;
              setGoalVariant(next);
              setSelected(next === "invalid" ? INVALID_GOAL.id : ACTIVE_GOAL.id);
            }}
          />
        </div>
      )}
      runtimeState="ready"
      sceneTitle="Warehouse / LK-MAP"
      {...(details === undefined ? {} : { selected: details })}
    >
      <SceneCanvas
        ariaLabel="Interactive goal and path state language"
        cameraMode={cameraMode}
        devicePixelRatio={STORY_DEVICE_PIXEL_RATIO}
        frame={MAP_FRAME}
        environment={{
          sizeMeters: 22,
          minorSpacingMeters: 0.5,
          majorSpacingMeters: 2,
          shadowMapSize: STORY_SHADOW_MAP_SIZE,
        }}
        frameLoop="demand"
        focusBounds={focusBounds}
        homePose={HOME_CAMERA}
        hoveredEntityId={hovered}
        onHoverChange={(change: SceneHoverChange) => setHovered(change.entityId)}
        onSelectionChange={handleSelection}
        profile="operational-neutral"
        renderState={{ kind: "ready" }}
        selectedEntityId={selected}
        style={{ height: "100%", minHeight: 480, borderRadius: 0 }}
        topBounds={FLOOR_BOUNDS}
        overlay={<SceneLegend profile="operational-neutral" />}
      >
        <WarehouseContents
          goalVariant={goalVariant}
          hovered={hovered}
          includeSecondaryGoal={false}
          profile="operational-neutral"
          selected={selected}
        />
      </SceneCanvas>
    </LdsFocusedViewerPage>
  );
}

export const OperationalNeutral: Story = {
  name: "Direction A · Operational Neutral",
  render: () => <VisualDirectionExperience profile="operational" />,
};

export const DiagnosticTechnical: Story = {
  name: "Direction B · Diagnostic Technical",
  render: () => <VisualDirectionExperience profile="diagnostic" />,
};

export const AssetCatalog: Story = {
  name: "Actual GLB Asset Catalog",
  render: () => <AssetCatalogExperience />,
};

export const GoalAndPathStates: Story = {
  name: "Goal & Path State Language",
  render: () => <GoalPathStateExperience />,
};

export const LoadingErrorEmpty: Story = {
  name: "Loading, Error & Empty",
  render: () => <RendererStateExperience />,
};

export const ActualLdsComposition: Story = {
  name: "Actual LDS Composition",
  render: () => <VisualDirectionExperience profile="operational" />,
};
