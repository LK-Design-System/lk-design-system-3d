import { Html } from "@react-three/drei";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Card,
  ContentBadge,
  FormField,
  Stack,
  StatusBadge,
  StatusIndicator,
} from "@lk-design-system/lds-core";
import { Legend } from "@lk-design-system/lds-product";
import { SegmentedControl } from "@lk-design-system/lds-core/components/selection/SegmentedControl";
import { useEffect, useMemo, useState, type ComponentProps, type ReactNode } from "react";
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
} from "@lk-robotics/lds-3d-r3f";
import {
  entityId,
  frameId,
  quaternionFromYaw,
  type Bounds3,
  type EntityId,
  type GoalEntity,
  type PathEntity,
  type Vec3,
} from "@lk-robotics/lds-3d-core";
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
  title: "LDS 3D/Scenes/AMR Operations",
  id: "visual-alpha",
  excludeStories: /.*Experience$/,
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
  { value: "actual", label: "실제" },
  { value: "executing", label: "실행 중" },
  { value: "planned", label: "계획" },
  { value: "blocked", label: "차단됨" },
];

const GOAL_OPTIONS = [
  { value: "valid", label: "유효" },
  { value: "preview", label: "미리보기" },
  { value: "invalid", label: "유효하지 않음" },
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
      }
    : {
        live: "#007A66",
        stale: "#9A5B00",
        warning: "#9A5B00",
        error: "#B42318",
        idle: "#60717E",
        selected: "#005FCC",
      };
}

function visualEntityStatusLabel(status: VisualEntityStatus): string {
  switch (status) {
    case "live":
      return "실시간";
    case "stale":
      return "오래됨";
    case "warning":
      return "주의";
    case "error":
      return "오류";
    case "idle":
      return "대기";
  }
}

interface WorldLabelProps {
  readonly title: string;
  readonly meta: string;
  readonly position: Vec3;
  readonly status: VisualEntityStatus;
  readonly statusLabel?: string;
  readonly statusTone?: NonNullable<ComponentProps<typeof StatusBadge>["tone"]>;
}

function worldLabelTone(
  status: VisualEntityStatus,
): NonNullable<ComponentProps<typeof StatusBadge>["tone"]> {
  switch (status) {
    case "live":
      return "online";
    case "stale":
      return "cautionary";
    case "warning":
      return "warning";
    case "error":
      return "negative";
    case "idle":
      return "offline";
  }
}

function WorldLabel({
  title,
  meta: detail,
  position,
  status,
  statusLabel,
  statusTone,
}: WorldLabelProps): ReactNode {
  return (
    <Html center position={position} style={{ pointerEvents: "none" }} zIndexRange={[5, 0]}>
      <Stack
        align="center"
        aria-hidden="true"
        as="span"
        data-visual-world-label-title={title}
        direction="row"
        gap="var(--space-1)"
        style={{ minWidth: "max-content", transform: "translateY(-50%)", whiteSpace: "nowrap" }}
      >
        <ContentBadge color="neutral" size="xsmall">
          {title}
        </ContentBadge>
        {status === "live" ? (
          <StatusIndicator tone={statusTone ?? "positive"}>
            {statusLabel ?? `${visualEntityStatusLabel(status)} · ${detail}`}
          </StatusIndicator>
        ) : (
          <StatusBadge tone={statusTone ?? worldLabelTone(status)}>
            {statusLabel ?? `${visualEntityStatusLabel(status)} · ${detail}`}
          </StatusBadge>
        )}
      </Stack>
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
          meta={entityId}
          position={[0, 0, labelHeight]}
          status={status}
        />
      ) : null}
    </group>
  );
}

const ROUTE_LABELS = Object.freeze([
  {
    id: ROUTES.actual.id,
    title: "실제",
    meta: "완료됨",
    position: [-5.9, -1.2, 0.42] as Vec3,
    status: "idle" as const,
    statusLabel: "완료됨",
    statusTone: "positive" as const,
  },
  {
    id: ROUTES.executing.id,
    title: "실행 중",
    meta: "AMR 01",
    position: [-0.7, -0.45, 0.5] as Vec3,
    status: "live" as const,
  },
  {
    id: ROUTES.planned.id,
    title: "계획",
    meta: "도크 03까지",
    position: [4.4, 1.05, 0.48] as Vec3,
    status: "warning" as const,
  },
  {
    id: ROUTES.blocked.id,
    title: "차단됨",
    meta: "장애물",
    position: [4.55, -2.78, 0.52] as Vec3,
    status: "error" as const,
  },
]);

function RouteLabels({ selected }: { readonly selected: EntityId | null }): ReactNode {
  const label = ROUTE_LABELS.find((candidate) => candidate.id === selected);
  return label === undefined ? null : <WorldLabel {...label} />;
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
      {persistentRouteLabels ? <RouteLabels selected={selected} /> : null}
    </>
  );
}

function SceneLegend({ profile }: { readonly profile: SceneVisualProfile }): ReactNode {
  return (
    <div className="visual-scene-legend">
      <Card
        aria-label="AMR 창고 장면 범례"
        dark={profile === "diagnostic-technical"}
        description="18 × 12 m · LK 코어 +Z 위쪽"
        elevation="sm"
        padding="var(--space-3)"
        title={
          profile === "diagnostic-technical" ? (
            <span style={{ color: "var(--component-card-fg-dark)" }}>AMR 창고</span>
          ) : (
            "AMR 창고"
          )
        }
      >
        <Stack as="section" gap="var(--space-2)">
          <Legend
            aria-label="장면 상태 범례"
            direction="vertical"
            items={[
              {
                id: "executing",
                label: "실행 중",
                color: "var(--color-semantic-status-positive)",
                shape: "line",
              },
              {
                id: "goal",
                label: "목표 / 의도",
                color: "var(--color-semantic-primary-normal)",
                shape: "dot",
              },
              {
                id: "blocked",
                label: "차단 / 오류",
                color: "var(--color-semantic-status-negative)",
                dashed: true,
                shape: "line",
              },
            ]}
            size="sm"
          />
        </Stack>
      </Card>
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

export function VisualDirectionExperience({
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
      pageTitle="AMR 운영"
      profile={profile}
      runtimeState="ready"
      sceneTitle="창고 / LK-MAP"
      {...(details === undefined ? {} : { selected: details })}
    >
      <SceneCanvas
        ariaLabel="AMR 창고 인터랙티브 WebGL 장면"
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
  { assetKey: "rack", id: entityId("catalog/rack"), label: "랙", position: [0, 2.2, 0] },
  { assetKey: "chargingStation", id: entityId("catalog/charging-station"), label: "충전 스테이션", position: [3.5, 2.2, 0] },
  { assetKey: "pallet", id: entityId("catalog/pallet"), label: "팔레트", position: [-3.5, -2.0, 0] },
  { assetKey: "cargoBin", id: entityId("catalog/cargo-bin"), label: "화물 상자", position: [0, -2.0, 0] },
  { assetKey: "safetyCone", id: entityId("catalog/safety-cone"), label: "안전 콘", position: [3.5, -2.0, 0] },
]);

function catalogDetails(id: EntityId | null): SelectedAssetDetails | undefined {
  const item = CATALOG_PLACEMENTS.find((candidate) => candidate.id === id);
  return item === undefined
    ? undefined
    : {
        id: item.id,
        name: item.label,
        kind: "LDS3D GLB",
        status: "live",
        pose: item.position,
        source: `/visual-alpha/${item.assetKey}`,
        frame: "lk-map",
        timestamp: "결정론적 빌드",
      };
}

export function AssetCatalogExperience(): ReactNode {
  const [cameraMode, setCameraMode] = useState<VisualCameraMode>("home");
  const [selected, setSelected] = useState<EntityId | null>(CATALOG_PLACEMENTS[0]?.id ?? null);
  const [hovered, setHovered] = useState<EntityId | null>(null);
  const details = catalogDetails(selected);
  const focusedModel = CATALOG_PLACEMENTS.find((item) => item.id === selected);
  const focusBounds =
    focusedModel === undefined
      ? modelFocusBounds("amr", [0, 0, 0])
      : modelFocusBounds(focusedModel.assetKey, focusedModel.position);
  return (
    <LdsFocusedViewerPage
      cameraMode={cameraMode}
      description="결정론적으로 구성한 LDS3D 자산 6종을 하나의 공간 카탈로그에서 검토합니다."
      onCameraModeChange={setCameraMode}
      onClearSelection={() => setSelected(null)}
      pageTitle="산업 자산 카탈로그"
      profile="operational"
      runtimeState="ready"
      sceneTitle="자산 검토 그리드 / LK-MAP"
      {...(details === undefined ? {} : { selected: details })}
    >
      <SceneCanvas
        ariaLabel="LDS3D GLB 자산 6종 인터랙티브 장면"
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
            {selected === item.id || hovered === item.id ? (
              <WorldLabel
                meta={`실제 ${item.assetKey} GLB`}
                position={[item.position[0], item.position[1], item.assetKey === "rack" ? 2.85 : 1.35]}
                status="live"
                title={item.label}
              />
            ) : null}
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
      return { kind: "loading", label: "GLB 카탈로그 로딩 중", progress: 0.58 };
    case "retrying":
      return { kind: "loading", label: "렌더러 재시도 중", progress: 0.32 };
    case "empty":
      return { kind: "empty", title: "공간 객체 없음", description: "렌더러 준비됨" };
    case "error":
      return {
        kind: "error",
        title: "자산 로딩 실패",
        message: "렌더러 복구 동작을 확인하기 위한 오류 상태입니다.",
        recoverable: true,
      };
  }
}

export function RendererStateExperience(): ReactNode {
  const [runtimeState, setRuntimeState] = useState<VisualRuntimeState>("loading");
  const [cameraMode, setCameraMode] = useState<VisualCameraMode>("home");
  const details = selectedDetails(PRIMARY_AMR_ID);
  useEffect(() => {
    if (runtimeState !== "retrying") return undefined;
    const recoveryTimer = window.setTimeout(() => setRuntimeState("ready"), 700);
    return () => window.clearTimeout(recoveryTimer);
  }, [runtimeState]);
  const selected = runtimeState === "empty" ? undefined : details;
  return (
    <LdsFocusedViewerPage
      cameraMode={cameraMode}
      description="페이지 셸을 유지한 채 렌더러의 로딩·빈 상태·오류·재시도·복구 상태를 확인합니다."
      eyebrow="LDS 3D / 상태"
      onCameraModeChange={setCameraMode}
      onRetry={() => setRuntimeState("retrying")}
      pageTitle="렌더러 수명주기와 복구"
      profile="operational"
      reviewControls={(
        <SegmentedControl
          aria-label="렌더러 상태"
          options={[
            { value: "ready", label: "준비됨" },
            { value: "loading", label: "로딩" },
            { value: "empty", label: "빈 상태" },
            { value: "error", label: "오류" },
          ]}
          size="sm"
          value={runtimeState}
          onChange={(value) => setRuntimeState(value as VisualRuntimeState)}
        />
      )}
      runtimeState={runtimeState}
      sceneTitle="창고 / LK-MAP"
      {...(selected === undefined ? {} : { selected })}
    >
      <SceneCanvas
        ariaLabel="렌더러 수명주기 상태 인터랙티브 장면"
        cameraMode={cameraMode}
        devicePixelRatio={STORY_DEVICE_PIXEL_RATIO}
        frame={MAP_FRAME}
        environment={{ sizeMeters: 22, shadowMapSize: STORY_SHADOW_MAP_SIZE }}
        frameLoop="demand"
        homePose={HOME_CAMERA}
        profile="operational-neutral"
        renderState={renderStateFor(runtimeState)}
        selectedEntityId={runtimeState === "empty" ? null : PRIMARY_AMR_ID}
        style={{ height: "100%", minHeight: 480, borderRadius: 0 }}
        topBounds={FLOOR_BOUNDS}
      >
        {runtimeState === "empty" ? null : (
          <WarehouseContents
            animateAmbientMotion={false}
            hovered={null}
            profile="operational-neutral"
            selected={PRIMARY_AMR_ID}
            persistentRouteLabels={false}
          />
        )}
      </SceneCanvas>
    </LdsFocusedViewerPage>
  );
}

export function GoalPathStateExperience(): ReactNode {
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
          name: "도크 03 목표 미리보기",
          status: "warning" as const,
          task: "운영자 미리보기 · 미확정",
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
      description="하나의 선택 가능한 창고 장면에서 목표 의도와 경로 실행 상태를 비교합니다."
      eyebrow="LDS 3D / 상태"
      onCameraModeChange={setCameraMode}
      onClearSelection={() => setSelected(null)}
      pageTitle="목표와 경로 상태 체계"
      profile="operational"
      reviewControls={(
        <Stack
          align="end"
          aria-label="상태 예제 제어"
          as="section"
          direction="row"
          gap="var(--space-3)"
          wrap
        >
          <FormField label="경로">
            <SegmentedControl
              aria-label="경로 상태"
              options={ROUTE_OPTIONS}
              size="sm"
              value={pathVariant}
              onChange={(value) => {
                const next = value as RouteVariant;
                setPathVariant(next);
                setSelected(ROUTES[next].id);
              }}
            />
          </FormField>
          <FormField label="목표">
            <SegmentedControl
              aria-label="목표 상태"
              options={GOAL_OPTIONS}
              size="sm"
              value={goalVariant}
              onChange={(value) => {
                const next = value as GoalVariant;
                setGoalVariant(next);
                setSelected(next === "invalid" ? INVALID_GOAL.id : ACTIVE_GOAL.id);
              }}
            />
          </FormField>
        </Stack>
      )}
      runtimeState="ready"
      sceneTitle="창고 / LK-MAP"
      {...(details === undefined ? {} : { selected: details })}
    >
      <SceneCanvas
        ariaLabel="목표와 경로 상태 인터랙티브 장면"
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
  name: "개요",
  render: () => <VisualDirectionExperience profile="operational" />,
};

export const DiagnosticTechnical: Story = {
  name: "변형·상태 · 진단 중심",
  render: () => <VisualDirectionExperience profile="diagnostic" />,
};
