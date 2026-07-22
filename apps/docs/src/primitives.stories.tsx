import type { Meta, StoryObj } from "@storybook/react-vite";
import type { AssetManifestV1 } from "@lk-robotics/lds-3d-assets";
import tronManifestJson from "@lk-robotics/lds-3d-assets/robots/tron/tron.asset-manifest.json";
import tronModelUrl from "@lk-robotics/lds-3d-assets/robots/tron/tron.glb?url";
import {
  Button,
  Code,
  SegmentedControl,
  Select,
  Stack,
  StatusBadge,
} from "@lk-robotics/lds-core";
import { DescriptionList } from "@lk-robotics/lds-product";
import {
  AmrRobot as AmrRobotPrimitive,
  EditVolume as EditVolumePrimitive,
  GltfModel as GltfModelPrimitive,
  GoalMarker as GoalMarkerPrimitive,
  PathRibbon as PathRibbonPrimitive,
  PointCloudLayer as PointCloudLayerPrimitive,
  PointCloudLayers as PointCloudLayersPrimitive,
  SceneCanvas as SceneCanvasPrimitive,
  SectionBox as SectionBoxPrimitive,
  Selectable,
  SpatialStructure as SpatialStructurePrimitive,
  useSceneRuntime,
  type ModelLoadState,
  type RobotVisualStatus,
  type SceneCameraMode,
  type SceneCameraPose,
  type SceneEnvironmentProps,
  type SceneHoverChange,
  type SceneRenderState,
  type SceneSelectionChange,
  type SceneVisualProfile,
} from "@lk-robotics/lds-3d-r3f";
import {
  resolvePointCloudLayerSetRenderState,
  resolvePointCloudRenderState,
  type PointCloudLayerSetRenderState,
  type PointCloudRenderState,
  type PointCloudSnapshot,
} from "@lk-robotics/lds-3d-pointcloud";
import {
  entityId,
  frameId,
  quaternionFromYaw,
  createSpatialTransformChangeSet,
  stepSpatialNodeTransform,
  type Bounds3,
  type EntityId,
  type GoalEntity,
  type PathEntity,
  type RobotEntity,
  type SpatialStructure as SpatialStructureContract,
  type SpatialTransformAxis,
  type SpatialTransformChangeSet,
  type SpatialTransformMode,
  type Vec3,
} from "@lk-robotics/lds-3d-core";
import { useCallback, useState, type ReactNode } from "react";

import { TechnicalSection, TechnicalStoryLayout } from "./components.js";
import {
  POINT_CLOUD_EMPTY,
  POINT_CLOUD_LAYER_SET,
  POINT_CLOUD_LAYER_SET_DEGRADED,
  POINT_CLOUD_MISMATCH,
  POINT_CLOUD_OVER_BUDGET,
  POINT_CLOUD_READY,
  POINT_CLOUD_REPLACEMENT,
  POINT_CLOUD_EDIT_VOLUMES,
  POINT_CLOUD_SECTION_BOUNDS,
  POINT_CLOUD_XYZ_ONLY,
} from "./pointcloud-fixture.js";
import primitiveReviewContract from "./primitive-review-contract.json";
import {
  SPATIAL_STRUCTURE_FIXTURE,
  SPATIAL_STRUCTURE_TARGET_ID,
  getSpatialStructureTransform,
  replaceSpatialStructureTransform,
} from "./spatial-structure-fixture.js";

const meta = {
  title: "LDS 3D/Primitives/SceneCanvas and CameraRig",
  id: "lds-3d-primitives",
  excludeStories: /.*Experience$|primitiveReviewParameters|PrimitiveReviewEvidence/,
  parameters: { controls: { disable: true } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;
type PrimitiveReviewStoryId = keyof typeof primitiveReviewContract.stories;

const PRIMITIVE_REVIEW_STAGE_LABELS = {
  overview: "개요",
  usage: "사용법",
  "variants-states": "변형 / 상태",
  interaction: "상호작용",
  "accessibility-motion": "접근성 / 모션",
  responsive: "반응형",
  scenario: "시나리오",
} as const;

type PrimitiveReviewStage = keyof typeof PRIMITIVE_REVIEW_STAGE_LABELS;
const PRIMITIVE_REVIEW_STAGES = Object.keys(
  PRIMITIVE_REVIEW_STAGE_LABELS,
) as PrimitiveReviewStage[];

const PRIMITIVE_FRAME = frameId("lk-map");
const PRIMITIVE_HOME: SceneCameraPose = {
  position: [9.5, -11, 8.25],
  target: [0, 0, 0.55],
  up: [0, 0, 1],
};
const GLTF_HOME: SceneCameraPose = {
  position: [3.6, -5, 3.1],
  target: [0, 0, 0.42],
  up: [0, 0, 1],
};
const PRIMITIVE_BOUNDS: Bounds3 = {
  frame: PRIMITIVE_FRAME,
  min: [-6.5, -4.5, 0],
  max: [6.5, 4.5, 3],
};
const PRIMITIVE_CANVAS_STYLE = {
  height: "min(34rem, 62vw)",
  minHeight: "22rem",
};
const PRIMITIVE_ENVIRONMENT: SceneEnvironmentProps = {
  sizeMeters: 16,
  minorSpacingMeters: 0.5,
  majorSpacingMeters: 2,
  shadowMapSize: 1024,
};

const PRIMARY_ROBOT: RobotEntity = {
  kind: "robot",
  id: entityId("primitive/amr-01"),
  pose: {
    frame: PRIMITIVE_FRAME,
    position: [-1.8, -0.7, 0],
    orientation: quaternionFromYaw(Math.PI / 7),
  },
};
const PRIMARY_GOAL: GoalEntity = {
  kind: "goal",
  id: entityId("primitive/goal-dock-03"),
  pose: {
    frame: PRIMITIVE_FRAME,
    position: [2.35, 1.55, 0],
    orientation: quaternionFromYaw(Math.PI),
  },
  radiusMeters: 0.55,
};

type ReviewCameraMode = SceneCameraMode;

interface PrimitiveCanvasProps {
  readonly ariaLabel: string;
  readonly bounds?: Bounds3;
  readonly children?: ReactNode;
  readonly cameraMode?: ReviewCameraMode;
  readonly environment?: SceneEnvironmentProps;
  readonly hoveredEntityId?: EntityId | null;
  readonly homePose?: SceneCameraPose;
  readonly onCameraModeChange?: (mode: SceneCameraMode) => void;
  readonly onHoverChange?: (change: SceneHoverChange) => void;
  readonly onSelectionChange?: (change: SceneSelectionChange) => void;
  readonly profile?: SceneVisualProfile;
  readonly renderState?: SceneRenderState;
  readonly selectedEntityId?: EntityId | null;
  readonly showStatusOverlay?: boolean;
}

/** Story-only host: it preserves the renderer's real WebGL boundary and supplies a stable review budget. */
function PrimitiveCanvas({
  ariaLabel,
  bounds,
  children,
  cameraMode,
  environment,
  hoveredEntityId,
  homePose,
  onCameraModeChange,
  onHoverChange,
  onSelectionChange,
  profile = "operational-neutral",
  renderState,
  selectedEntityId,
  showStatusOverlay = false,
}: PrimitiveCanvasProps): ReactNode {
  return (
    <SceneCanvasPrimitive
      ariaLabel={ariaLabel}
      devicePixelRatio={1}
      environment={{ ...PRIMITIVE_ENVIRONMENT, ...environment }}
      focusBounds={bounds ?? PRIMITIVE_BOUNDS}
      frame={PRIMITIVE_FRAME}
      frameLoop="demand"
      homePose={homePose ?? PRIMITIVE_HOME}
      profile={profile}
      renderQuality="balanced"
      style={PRIMITIVE_CANVAS_STYLE}
      topBounds={bounds ?? PRIMITIVE_BOUNDS}
      {...(cameraMode === undefined ? {} : { cameraMode })}
      {...(hoveredEntityId === undefined ? {} : { hoveredEntityId })}
      {...(onCameraModeChange === undefined ? {} : { onCameraModeChange })}
      {...(onHoverChange === undefined ? {} : { onHoverChange })}
      {...(onSelectionChange === undefined ? {} : { onSelectionChange })}
      {...(renderState === undefined ? {} : { renderState })}
      {...(selectedEntityId === undefined ? {} : { selectedEntityId })}
      showStatusOverlay={showStatusOverlay}
    >
      {children}
    </SceneCanvasPrimitive>
  );
}

export function primitiveReviewParameters(storyId: PrimitiveReviewStoryId) {
  const review = primitiveReviewContract.stories[storyId];
  return {
    lds3dReview: {
      ...review,
      requiredStages: primitiveReviewContract.requiredStages,
    },
  };
}

export function PrimitiveReviewEvidence({
  storyId,
}: {
  readonly storyId: PrimitiveReviewStoryId;
}): ReactNode {
  const review = primitiveReviewContract.stories[storyId];
  const stages = review.stages as Readonly<Record<PrimitiveReviewStage, string>>;
  return (
    <DescriptionList
      columns={1}
      items={[
        {
          term: "렌더러 근거",
          description: "SceneCanvas를 통한 실제 WebGL이며 DOM 콘텐츠는 보완적인 검토 요약입니다.",
        },
        ...PRIMITIVE_REVIEW_STAGES.map((stage) => ({
          term: PRIMITIVE_REVIEW_STAGE_LABELS[stage],
          description: stages[stage],
        })),
      ]}
    />
  );
}

function selectedCopy(entityId: EntityId | null): string {
  return entityId ?? "지속 선택 없음";
}

function runtimeStateLabel(state: ReviewRuntimeState): string {
  switch (state) {
    case "ready":
      return "준비됨";
    case "loading":
      return "로딩";
    case "empty":
      return "빈 상태";
    case "error":
      return "오류";
  }
}

function modelLoadStateLabel(state: ModelLoadState): string {
  switch (state) {
    case "loading":
      return "로딩";
    case "ready":
      return "준비됨";
    case "error":
      return "오류";
  }
}

function interactionTone(entityId: EntityId | null): "positive" | "offline" {
  return entityId === null ? "offline" : "positive";
}

interface SelectionProbeProps {
  readonly entityId: EntityId;
  readonly label: string;
  readonly position: Vec3;
}

/** A deliberately plain mesh proves that Selectable supplies behavior, not a second visual language. */
function SelectionProbe({ entityId, label, position }: SelectionProbeProps): ReactNode {
  const { theme } = useSceneRuntime();
  return (
    <Selectable entityId={entityId} position={position}>
      {({ hovered, selected }) => {
        const color = selected
          ? theme.materials.selection
          : hovered
            ? theme.materials.live
            : theme.materials.assetBody;
        return (
          <group name={label}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[1.15, 1.15, 0.56]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={selected ? 0.34 : hovered ? 0.16 : 0}
                metalness={0.18}
                roughness={0.58}
              />
            </mesh>
            {selected ? (
              <mesh position={[0, 0, 0.34]}>
                <torusGeometry args={[0.82, 0.028, 8, 48]} />
                <meshBasicMaterial color={theme.materials.selection} />
              </mesh>
            ) : null}
          </group>
        );
      }}
    </Selectable>
  );
}

export function SceneCanvasExperience(): ReactNode {
  const [cameraMode, setCameraMode] = useState<ReviewCameraMode>("home");
  return (
    <TechnicalStoryLayout
      eyebrow="LDS 3D / 프리미티브"
      title="SceneCanvas & CameraRig"
      description="헤드리스 호스트는 실제 WebGL, 일회성 코어-Three 좌표 변환, CameraRig, SceneEnvironment, 피킹, 수명주기를 소유합니다. 소비자 UI는 이 패키지 밖에 둡니다."
      meta="개요 · 사용법 · 카메라 상호작용"
    >
      <TechnicalSection
        title="하나의 장면 호스트와 하나의 환경"
        description="호스트 API로 카메라 모드를 사용합니다. SceneCanvas는 SceneEnvironment를 정확히 하나만 만들며, 중복된 월드 표면을 마운트하지 않고 environment prop으로 바닥, 그리드, 축, 그림자 예산을 설정합니다."
      >
        <Stack gap="var(--space-4)">
          <SegmentedControl
            aria-label="프리미티브 카메라 모드"
            options={[
              { value: "home", label: "기본" },
              { value: "top", label: "상단" },
              { value: "focus", label: "초점" },
              { value: "free", label: "자유" },
            ]}
            size="sm"
            value={cameraMode}
            onChange={(value) => setCameraMode(value as ReviewCameraMode)}
          />
          <PrimitiveCanvas
            ariaLabel="SceneCanvas와 CameraRig 프리미티브 데모"
            cameraMode={cameraMode}
            environment={{ showAxes: true }}
            onCameraModeChange={setCameraMode}
          >
            <AmrRobotPrimitive entity={PRIMARY_ROBOT} status="live" />
            <GoalMarkerPrimitive animated={false} entity={PRIMARY_GOAL} variant="valid" />
          </PrimitiveCanvas>
          <DescriptionList
            columns={2}
            items={[
              { term: "공간", description: "오른손 좌표계 · +Z 위쪽 · 미터" },
              { term: "카메라", description: <Code>{cameraMode}</Code> },
              { term: "품질 프로필", description: <Code>balanced</Code> },
              { term: "프레임 루프", description: <Code>demand</Code> },
              { term: "검토 DPR 재정의", description: <Code>1</Code> },
              { term: "그림자 맵", description: <Code>1024px</Code> },
            ]}
          />
          <PrimitiveReviewEvidence storyId="lds-3d-primitives--scene-canvas" />
        </Stack>
      </TechnicalSection>
    </TechnicalStoryLayout>
  );
}

export function SelectableExperience(): ReactNode {
  const [selected, setSelected] = useState<EntityId | null>(null);
  const [hovered, setHovered] = useState<EntityId | null>(null);
  return (
    <TechnicalStoryLayout
      eyebrow="LDS 3D / 프리미티브"
      title="Selectable"
      description="Selectable은 공간 하위 트리에 호버와 하나의 지속 선택을 추가합니다. 식별자와 포인터 세부 정보를 내보내지만 제품 명령은 실행하지 않습니다."
      meta="상호작용 · 접근 가능한 DOM 요약"
    >
      <TechnicalSection
        title="호버는 일시적이고 선택은 지속적입니다"
        description="블록을 가리켜 호버를 확인하고 클릭해 선택하세요. 실제 WebGL 캔버스 아래 요약은 선택 객체의 접근 가능한 기록입니다."
      >
        <Stack gap="var(--space-4)">
          <PrimitiveCanvas
            ariaLabel="Selectable 프리미티브 상호작용 데모"
            hoveredEntityId={hovered}
            selectedEntityId={selected}
            onHoverChange={(change) => setHovered(change.entityId)}
            onSelectionChange={(change) => setSelected(change.entityId)}
          >
            <SelectionProbe
              entityId={entityId("primitive/selectable-a")}
              label="선택 객체 A"
              position={[-2.25, 0, 0.35]}
            />
            <SelectionProbe
              entityId={entityId("primitive/selectable-b")}
              label="선택 객체 B"
              position={[0, 0, 0.35]}
            />
            <SelectionProbe
              entityId={entityId("primitive/selectable-c")}
              label="선택 객체 C"
              position={[2.25, 0, 0.35]}
            />
          </PrimitiveCanvas>
          <Stack direction="row" gap="var(--space-3)" align="center" wrap>
            <StatusBadge tone={interactionTone(selected)}>{selectedCopy(selected)}</StatusBadge>
            <Button
              disabled={selected === null}
              size="sm"
              variant="secondary"
              onClick={() => setSelected(null)}
            >
              선택 해제
            </Button>
          </Stack>
          <DescriptionList
            columns={2}
            items={[
              { term: "호버", description: <Code>{hovered ?? "없음"}</Code> },
              { term: "선택", description: <Code>{selected ?? "없음"}</Code> },
            ]}
          />
          <PrimitiveReviewEvidence storyId="lds-3d-primitives-selectable--overview" />
        </Stack>
      </TechnicalSection>
    </TechnicalStoryLayout>
  );
}

interface RobotVariant {
  readonly entity: RobotEntity;
  readonly status: RobotVisualStatus;
}

const ROBOT_VARIANTS: readonly RobotVariant[] = [
  {
    entity: {
      kind: "robot",
      id: entityId("primitive/amr-idle"),
      pose: { frame: PRIMITIVE_FRAME, position: [-3.6, 1.5, 0], orientation: quaternionFromYaw(0) },
    },
    status: "idle",
  },
  {
    entity: {
      kind: "robot",
      id: entityId("primitive/amr-live"),
      pose: {
        frame: PRIMITIVE_FRAME,
        position: [-1.2, 1.5, 0],
        orientation: quaternionFromYaw(Math.PI / 8),
      },
    },
    status: "live",
  },
  {
    entity: {
      kind: "robot",
      id: entityId("primitive/amr-warning"),
      pose: {
        frame: PRIMITIVE_FRAME,
        position: [1.2, 1.5, 0],
        orientation: quaternionFromYaw(-Math.PI / 8),
      },
    },
    status: "warning",
  },
  {
    entity: {
      kind: "robot",
      id: entityId("primitive/amr-error"),
      pose: {
        frame: PRIMITIVE_FRAME,
        position: [3.6, 1.5, 0],
        orientation: quaternionFromYaw(Math.PI),
      },
    },
    status: "error",
  },
];

const TRON_ROBOT: RobotEntity = {
  kind: "robot",
  id: entityId("primitive/amr-tron"),
  pose: {
    frame: PRIMITIVE_FRAME,
    position: [0, 0, 0],
    orientation: quaternionFromYaw(0),
  },
};

const TRON_MODEL_URL = tronModelUrl;
const TRON_MANIFEST = tronManifestJson as unknown as AssetManifestV1;
const TRON_HOME: SceneCameraPose = {
  position: [1.8, -2.6, 1.65],
  target: [0, 0, 0.45],
  up: [0, 0, 1],
};
const TRON_REVIEW_BOUNDS: Bounds3 = {
  frame: PRIMITIVE_FRAME,
  min: TRON_MANIFEST.boundsInCoreMeters.min,
  max: TRON_MANIFEST.boundsInCoreMeters.max,
};

export function AmrRobotExperience(): ReactNode {
  const [selected, setSelected] = useState<EntityId | null>(ROBOT_VARIANTS[1]?.entity.id ?? null);
  const [tronLoadState, setTronLoadState] = useState<ModelLoadState>("loading");
  return (
    <TechnicalStoryLayout
      eyebrow="LDS 3D / 프리미티브"
      title="AmrRobot"
      description="AmrRobot은 의미를 갖는 대체 AMR 시각 요소입니다. 선택 가능한 형상과 상태 단서를 소유하며 제품은 model 슬롯으로 실제 모델을 제공할 수 있습니다."
      meta="변형 · 선택"
    >
      <TechnicalSection
        title="로봇 상태 변형"
        description="대기, 실시간, 주의, 오류 상태는 형상과 발광 재질 변화로 구분됩니다. AMR을 클릭해 지속 선택 표현을 확인하세요."
      >
        <Stack gap="var(--space-4)">
          <PrimitiveCanvas
            ariaLabel="AMR 로봇 프리미티브 변형"
            selectedEntityId={selected}
            onSelectionChange={(change) => setSelected(change.entityId)}
          >
            {ROBOT_VARIANTS.map(({ entity, status }) => (
              <AmrRobotPrimitive key={entity.id} entity={entity} status={status} />
            ))}
          </PrimitiveCanvas>
          <DescriptionList
            columns={2}
            items={[
              { term: "변형", description: "대기 · 실시간 · 주의 · 오류" },
              { term: "선택", description: <Code>{selectedCopy(selected)}</Code> },
            ]}
          />
          <PrimitiveReviewEvidence storyId="lds-3d-primitives-amr-robot--overview" />
        </Stack>
      </TechnicalSection>
      <TechnicalSection
        title="실제 Tron GLB 모델 슬롯"
        description="제작자가 사용을 승인한 Tron GLB를 검증된 manifest와 함께 model 슬롯에 주입합니다. AmrRobot이 선택과 로봇 의미를 소유하고, GltfModel은 파일 좌표를 LK 코어 좌표로 정규화한 실제 WebGL 형상만 제공합니다."
      >
        <Stack gap="var(--space-4)">
          <PrimitiveCanvas
            ariaLabel="실제 Tron GLB를 사용하는 AMR 로봇 프리미티브"
            bounds={TRON_REVIEW_BOUNDS}
            environment={{ sizeMeters: 6, minorSpacingMeters: 0.25, majorSpacingMeters: 1 }}
            homePose={TRON_HOME}
            selectedEntityId={selected}
            onSelectionChange={(change) => setSelected(change.entityId)}
          >
            <AmrRobotPrimitive
              entity={TRON_ROBOT}
              label="Tron"
              model={
                <GltfModelPrimitive
                  entityId={TRON_ROBOT.id}
                  manifest={TRON_MANIFEST}
                  onLoadStateChange={setTronLoadState}
                  url={TRON_MODEL_URL}
                />
              }
              status="live"
            />
          </PrimitiveCanvas>
          <DescriptionList
            columns={2}
            items={[
              { term: "자산", description: <Code>robots/tron</Code> },
              {
                term: "로딩 상태",
                description: (
                  <StatusBadge tone={tronLoadState === "ready" ? "positive" : "cautionary"}>
                    {modelLoadStateLabel(tronLoadState)}
                  </StatusBadge>
                ),
              },
              { term: "파일 좌표", description: <Code>오른손 · +Y 위쪽 · +X 전방</Code> },
              { term: "코어 좌표", description: <Code>오른손 · +Z 위쪽 · +X 전방</Code> },
              { term: "런타임 크기", description: <Code>6.58 MiB</Code> },
              { term: "삼각형", description: <Code>209,495</Code> },
              { term: "선택", description: <Code>{selectedCopy(selected)}</Code> },
            ]}
          />
        </Stack>
      </TechnicalSection>
    </TechnicalStoryLayout>
  );
}

interface GoalVariant {
  readonly entity: GoalEntity;
  readonly variant: "valid" | "preview" | "invalid";
}

const GOAL_VARIANTS: readonly GoalVariant[] = [
  {
    variant: "valid",
    entity: {
      kind: "goal",
      id: entityId("primitive/goal-valid"),
      pose: {
        frame: PRIMITIVE_FRAME,
        position: [-3.2, 0.65, 0],
        orientation: quaternionFromYaw(0),
      },
      radiusMeters: 0.55,
    },
  },
  {
    variant: "preview",
    entity: {
      kind: "goal",
      id: entityId("primitive/goal-preview"),
      pose: {
        frame: PRIMITIVE_FRAME,
        position: [0, 0.65, 0],
        orientation: quaternionFromYaw(Math.PI / 2),
      },
      radiusMeters: 0.55,
    },
  },
  {
    variant: "invalid",
    entity: {
      kind: "goal",
      id: entityId("primitive/goal-invalid"),
      pose: {
        frame: PRIMITIVE_FRAME,
        position: [3.2, 0.65, 0],
        orientation: quaternionFromYaw(Math.PI),
      },
      radiusMeters: 0.55,
    },
  },
];

export function GoalMarkerExperience(): ReactNode {
  const [selected, setSelected] = useState<EntityId | null>(GOAL_VARIANTS[0]?.entity.id ?? null);
  return (
    <TechnicalStoryLayout
      eyebrow="LDS 3D / 프리미티브"
      title="GoalMarker"
      description="GoalMarker는 유효한 의도, 미확정 미리보기, 유효하지 않은 배치를 공간 형상으로 전달합니다. 모션은 선택 사항이며 항상 모션 감소 설정을 따릅니다."
      meta="변형 · 모션 감소에 안전한 정적 검토"
    >
      <TechnicalSection
        title="목표 의도 표현 체계"
        description="지속 렌더 루프 없이 상태 표현을 검토할 수 있도록 주변 펄스를 의도적으로 끕니다. 마커를 클릭해 선택 상태를 확인하세요."
      >
        <Stack gap="var(--space-4)">
          <PrimitiveCanvas
            ariaLabel="목표 마커 프리미티브 변형"
            selectedEntityId={selected}
            onSelectionChange={(change) => setSelected(change.entityId)}
          >
            {GOAL_VARIANTS.map(({ entity, variant }) => (
              <GoalMarkerPrimitive
                key={entity.id}
                animated={false}
                entity={entity}
                variant={variant}
              />
            ))}
          </PrimitiveCanvas>
          <DescriptionList
            columns={2}
            items={[
              { term: "변형", description: "유효 · 미리보기 · 유효하지 않음" },
              { term: "선택", description: <Code>{selectedCopy(selected)}</Code> },
            ]}
          />
          <PrimitiveReviewEvidence storyId="lds-3d-primitives-goal-marker--overview" />
        </Stack>
      </TechnicalSection>
    </TechnicalStoryLayout>
  );
}

interface PathVariant {
  readonly entity: PathEntity;
  readonly variant: "actual" | "planned" | "executing" | "blocked";
}

const PATH_VARIANTS: readonly PathVariant[] = [
  {
    variant: "actual",
    entity: {
      kind: "path",
      id: entityId("primitive/path-actual"),
      frame: PRIMITIVE_FRAME,
      points: [
        [-4.7, -2.7, 0],
        [-3.2, -1.55, 0],
        [-1.8, -2.2, 0],
      ],
      widthMeters: 0.2,
    },
  },
  {
    variant: "executing",
    entity: {
      kind: "path",
      id: entityId("primitive/path-executing"),
      frame: PRIMITIVE_FRAME,
      points: [
        [-1.6, -2.2, 0],
        [0, -0.9, 0],
        [1.35, -2.05, 0],
      ],
      widthMeters: 0.23,
    },
  },
  {
    variant: "planned",
    entity: {
      kind: "path",
      id: entityId("primitive/path-planned"),
      frame: PRIMITIVE_FRAME,
      points: [
        [1.55, -2.05, 0],
        [2.8, -0.95, 0],
        [4.7, -1.55, 0],
      ],
      widthMeters: 0.18,
    },
  },
  {
    variant: "blocked",
    entity: {
      kind: "path",
      id: entityId("primitive/path-blocked"),
      frame: PRIMITIVE_FRAME,
      points: [
        [-1.1, 1.8, 0],
        [0.25, 2.7, 0],
        [2.6, 2.05, 0],
      ],
      widthMeters: 0.22,
    },
  },
];

export function PathRibbonExperience(): ReactNode {
  const [selected, setSelected] = useState<EntityId | null>(PATH_VARIANTS[1]?.entity.id ?? null);
  return (
    <TechnicalStoryLayout
      eyebrow="LDS 3D / 프리미티브"
      title="PathRibbon"
      description="PathRibbon은 프레임이 지정된 경로를 형상, 선 표현, 3D 진행 화살표, 차단 표시로 나타냅니다. 경로는 수동적인 맥락인 경우가 많아 선택은 명시적으로 활성화합니다."
      meta="변형 · 선택적 상호작용"
    >
      <TechnicalSection
        title="경로 상태 변형"
        description="네 가지 변형을 모두 정적으로 표시하며 실행 3D 화살표는 결정론적인 중간 지점에 유지합니다. 리본을 클릭해 선택 상태를 확인하세요."
      >
        <Stack gap="var(--space-4)">
          <PrimitiveCanvas
            ariaLabel="경로 리본 프리미티브 변형"
            selectedEntityId={selected}
            onSelectionChange={(change) => setSelected(change.entityId)}
          >
            {PATH_VARIANTS.map(({ entity, variant }) => (
              <PathRibbonPrimitive
                key={entity.id}
                animated={false}
                entity={entity}
                selectable
                variant={variant}
              />
            ))}
          </PrimitiveCanvas>
          <DescriptionList
            columns={2}
            items={[
              { term: "변형", description: "실제 · 실행 중 · 계획 · 차단됨" },
              { term: "선택", description: <Code>{selectedCopy(selected)}</Code> },
            ]}
          />
          <PrimitiveReviewEvidence storyId="lds-3d-primitives-path-ribbon--overview" />
        </Stack>
      </TechnicalSection>
    </TechnicalStoryLayout>
  );
}

type ReviewRuntimeState = "ready" | "loading" | "empty" | "error";

function toRenderState(state: ReviewRuntimeState): SceneRenderState {
  switch (state) {
    case "ready":
      return { kind: "ready" };
    case "loading":
      return { kind: "loading", label: "공간 예제 로딩 중", progress: 0.58 };
    case "empty":
      return {
        kind: "empty",
        title: "공간 객체 없음",
        description: "렌더러와 장면 프레임은 계속 사용할 수 있습니다.",
      };
    case "error":
      return {
        kind: "error",
        title: "자산 로딩 실패",
        message: "프리미티브 복구 동작을 확인하기 위한 오류 상태입니다.",
        recoverable: true,
      };
  }
}

export function RuntimeStatesExperience(): ReactNode {
  const [state, setState] = useState<ReviewRuntimeState>("loading");
  return (
    <TechnicalStoryLayout
      eyebrow="LDS 3D / 프리미티브"
      title="SceneStateMarker"
      description="SceneCanvas는 렌더러가 준비되지 않은 상태에 SceneStateMarker를 렌더링합니다. 선택적 상태 오버레이가 실제 WebGL 마커를 DOM에서 읽을 수 있는 요약으로 보완합니다."
      meta="상태 · 복구 경계"
    >
      <TechnicalSection
        title="렌더러 수명주기 상태"
        description="로딩, 빈 상태, 오류 콘텐츠가 바뀌어도 호스트는 안정적으로 유지됩니다. 재시도 정책은 제품이 소유하며 이 기술 Story는 검토 상태를 초기화하는 데만 LDS 액션을 사용합니다."
      >
        <Stack gap="var(--space-4)">
          <SegmentedControl
            aria-label="프리미티브 렌더러 상태"
            options={[
              { value: "ready", label: "준비됨" },
              { value: "loading", label: "로딩" },
              { value: "empty", label: "빈 상태" },
              { value: "error", label: "오류" },
            ]}
            size="sm"
            value={state}
            onChange={(value) => setState(value as ReviewRuntimeState)}
          />
          <PrimitiveCanvas
            ariaLabel="장면 상태 마커 프리미티브 변형"
            renderState={toRenderState(state)}
            showStatusOverlay
          >
            <AmrRobotPrimitive entity={PRIMARY_ROBOT} status="live" />
          </PrimitiveCanvas>
          <Stack direction="row" gap="var(--space-3)" align="center" wrap>
            <StatusBadge
              tone={state === "error" ? "negative" : state === "ready" ? "positive" : "cautionary"}
            >
              {runtimeStateLabel(state)}
            </StatusBadge>
            <Button
              disabled={state === "ready"}
              size="sm"
              variant="secondary"
              onClick={() => setState("ready")}
            >
              준비 상태로 초기화
            </Button>
          </Stack>
          <PrimitiveReviewEvidence storyId="lds-3d-primitives-scene-state-marker--overview" />
        </Stack>
      </TechnicalSection>
    </TechnicalStoryLayout>
  );
}

export function GltfModelExperience(): ReactNode {
  const [loadState, setLoadState] = useState<ModelLoadState>("loading");
  const [selected, setSelected] = useState<EntityId | null>(null);
  const reportLoadState = useCallback((state: ModelLoadState) => setLoadState(state), []);
  return (
    <TechnicalStoryLayout
      eyebrow="LDS 3D / 프리미티브"
      title="GltfModel"
      description="GltfModel은 실제 GLB를 로딩하고 문서화된 소스 규약을 정규화하며 배치 소유권만 복제합니다. 공간 선택은 공통 상호작용 계약으로 전달합니다."
      meta="실제 GLB · 로딩 수명주기"
    >
      <TechnicalSection
        title="Manifest를 인지하는 공간 자산 배치"
        description="LDS3D 자산 카탈로그의 실제 AMR GLB를 시나리오 조립 헬퍼가 아닌 GltfModel로 직접 렌더링합니다. 클릭해 선택하세요."
      >
        <Stack gap="var(--space-4)">
          <PrimitiveCanvas
            ariaLabel="실제 AMR GLB를 사용하는 GltfModel 프리미티브"
            homePose={GLTF_HOME}
            selectedEntityId={selected}
            onSelectionChange={(change) => setSelected(change.entityId)}
          >
            <GltfModelPrimitive
              entityId={entityId("primitive/gltf-amr")}
              onLoadStateChange={reportLoadState}
              position={[0, 0, 0]}
              sourceConvention="core"
              url="/visual-alpha/amr.glb"
            />
          </PrimitiveCanvas>
          <DescriptionList
            columns={2}
            items={[
              {
                term: "로딩 상태",
                description: (
                  <StatusBadge tone={loadState === "ready" ? "positive" : "cautionary"}>
                    {modelLoadStateLabel(loadState)}
                  </StatusBadge>
                ),
              },
              { term: "소스 규약", description: <Code>core</Code> },
              { term: "형식", description: <Code>glTF 2.0 / GLB</Code> },
              { term: "선택", description: <Code>{selectedCopy(selected)}</Code> },
            ]}
          />
          <PrimitiveReviewEvidence storyId="lds-3d-primitives-gltf-model--overview" />
        </Stack>
      </TechnicalSection>
    </TechnicalStoryLayout>
  );
}

type PointCloudReviewVariant =
  | "ready"
  | "replacement"
  | "xyz-only"
  | "height"
  | "empty"
  | "budget"
  | "frame-mismatch"
  | "multi-frame"
  | "unresolved-frame";

const POINT_CLOUD_REVIEW_OPTIONS = [
  { value: "ready", label: "준비됨 5K" },
  { value: "replacement", label: "교체 5K" },
  { value: "xyz-only", label: "XYZ 대체 색상" },
  { value: "height", label: "높이 색상" },
  { value: "empty", label: "빈 상태" },
  { value: "budget", label: "예산 제한" },
  { value: "frame-mismatch", label: "잘못된 프레임" },
  { value: "multi-frame", label: "소스 프레임 2개" },
  { value: "unresolved-frame", label: "변환 없음" },
];

const POINT_CLOUD_MULTI_FRAME_LAYERS = POINT_CLOUD_LAYER_SET.layers.map((layer, index) => ({
  layer,
  fallbackColor: index === 0 ? "#3c9dff" : "#ffba6b",
  pointSize: index === 0 ? 1.75 : 2.1,
  opacity: index === 0 ? 0.9 : 1,
}));
const POINT_CLOUD_UNRESOLVED_LAYERS = POINT_CLOUD_LAYER_SET_DEGRADED.layers.map((layer, index) => ({
  layer,
  fallbackColor: index === 0 ? "#3c9dff" : "#ffba6b",
  pointSize: index === 0 ? 1.75 : 2.1,
  opacity: index === 0 ? 0.9 : 1,
}));
const POINT_CLOUD_HEIGHT_RANGE = [0, 1.6] as const;

function pointCloudVariant(variant: PointCloudReviewVariant): {
  readonly snapshot: PointCloudSnapshot;
  readonly maxPoints: number;
} | null {
  switch (variant) {
    case "replacement":
      return { snapshot: POINT_CLOUD_REPLACEMENT, maxPoints: 50_000 };
    case "xyz-only":
      return { snapshot: POINT_CLOUD_XYZ_ONLY, maxPoints: 50_000 };
    case "height":
      return { snapshot: POINT_CLOUD_READY, maxPoints: 50_000 };
    case "empty":
      return { snapshot: POINT_CLOUD_EMPTY, maxPoints: 50_000 };
    case "budget":
      return { snapshot: POINT_CLOUD_OVER_BUDGET, maxPoints: 10_000 };
    case "frame-mismatch":
      return { snapshot: POINT_CLOUD_MISMATCH, maxPoints: 50_000 };
    case "multi-frame":
    case "unresolved-frame":
      return null;
    case "ready":
      return { snapshot: POINT_CLOUD_READY, maxPoints: 50_000 };
  }
}

function pointCloudTone(
  state: PointCloudRenderState | PointCloudLayerSetRenderState,
): "positive" | "cautionary" | "negative" | "offline" {
  switch (state.kind) {
    case "ready":
      return "positive";
    case "empty":
      return "offline";
    case "budget-exceeded":
      return "cautionary";
    case "degraded":
      return "cautionary";
    case "frame-mismatch":
      return "negative";
  }
}

function pointCloudStateLabel(
  state: PointCloudRenderState | PointCloudLayerSetRenderState,
): string {
  switch (state.kind) {
    case "ready":
      return "준비됨";
    case "empty":
      return "빈 상태";
    case "budget-exceeded":
      return "예산 초과";
    case "degraded":
      return "성능 저하";
    case "frame-mismatch":
      return "프레임 불일치";
  }
}

export function PointCloudLayerExperience(): ReactNode {
  const [variant, setVariant] = useState<PointCloudReviewVariant>("ready");
  const active = pointCloudVariant(variant);
  const [renderState, setRenderState] = useState<PointCloudRenderState>(() =>
    resolvePointCloudRenderState(POINT_CLOUD_READY, PRIMITIVE_FRAME, 50_000),
  );
  const [layerSetRenderState, setLayerSetRenderState] = useState<PointCloudLayerSetRenderState>(
    () => resolvePointCloudLayerSetRenderState(POINT_CLOUD_LAYER_SET, PRIMITIVE_FRAME, 50_000),
  );
  const activeLayers =
    variant === "unresolved-frame" ? POINT_CLOUD_UNRESOLVED_LAYERS : POINT_CLOUD_MULTI_FRAME_LAYERS;
  const summaryState = active === null ? layerSetRenderState : renderState;
  const frameCopy =
    active === null
      ? variant === "unresolved-frame"
        ? "lidar-front → 변환되지 않음"
        : "lidar-front → lk-map"
      : renderState.kind === "frame-mismatch"
        ? `${renderState.actualFrame} != ${renderState.expectedFrame}`
        : active.snapshot.frame;
  const maxPoints = active?.maxPoints ?? 50_000;

  return (
    <TechnicalStoryLayout
      eyebrow="LDS 3D / 프리미티브"
      title="PointCloudLayer & PointCloudLayers"
      description="PointCloudLayer는 검증된 스냅샷 하나를 렌더링하고 PointCloudLayers는 호출자가 계산한 여러 소스 프레임을 하나의 원자적 점 예산 아래 조합합니다. 두 프리미티브는 어댑터가 만든 형상과 재질만 소유하며 ROS 전송, TF 계산, 파싱, 샘플링, 피킹, 뷰어 UI는 포함하지 않습니다."
      meta="P1 레이어 집합 기반 / 실제 WebGL 점 형상"
    >
      <TechnicalSection
        title="프레임에 안전한 스냅샷과 레이어 집합 교체"
        description="LDS Select는 검토 예제를 전환하는 데만 사용합니다. 렌더러는 소스 버퍼를 변경하거나 프레임 그래프를 계산하거나 점을 조용히 버리지 않습니다. 전달된 소스-장면 변환은 Three 객체에 적용하며 렌더링할 수 없는 입력에서도 WebGL 호스트를 유지하고 호출자 소유 상태를 보고합니다."
      >
        <Stack gap="var(--space-4)">
          <Select
            aria-label="포인트 클라우드 프리미티브 상태"
            options={POINT_CLOUD_REVIEW_OPTIONS}
            size="sm"
            value={variant}
            onChange={(value) => setVariant(value as PointCloudReviewVariant)}
          />
          <PrimitiveCanvas ariaLabel="PointCloudLayer 실제 WebGL 프리미티브">
            {active === null ? (
              <PointCloudLayersPrimitive
                layers={activeLayers}
                maxPoints={maxPoints}
                onRenderStateChange={setLayerSetRenderState}
              />
            ) : (
              <PointCloudLayerPrimitive
                fallbackColor="#3c9dff"
                maxPoints={active.maxPoints}
                pointSize={1.75}
                snapshot={active.snapshot}
                onRenderStateChange={setRenderState}
                {...(variant === "height"
                  ? { colorMode: "height" as const, heightRange: POINT_CLOUD_HEIGHT_RANGE }
                  : {})}
              />
            )}
          </PrimitiveCanvas>
          <DescriptionList
            columns={2}
            items={[
              {
                term: "렌더 상태",
                description: (
                  <StatusBadge tone={pointCloudTone(summaryState)}>
                    {pointCloudStateLabel(summaryState)}
                  </StatusBadge>
                ),
              },
              { term: "프레임", description: <Code>{frameCopy}</Code> },
              {
                term: "요청 / 승인",
                description: (
                  <Code>
                    {summaryState.requestedPointCount.toLocaleString()} /{" "}
                    {summaryState.acceptedPointCount.toLocaleString()}
                  </Code>
                ),
              },
              { term: "예산", description: <Code>{maxPoints.toLocaleString()}</Code> },
              { term: "CPU 버퍼 소유자", description: <Code>호출자 유지</Code> },
              {
                term: "색상 계약",
                description: <Code>소스 RGB / 단색 / 장면 Z 높이</Code>,
              },
            ]}
          />
          <PrimitiveReviewEvidence storyId="lds-3d-primitives-point-cloud-layer--overview" />
        </Stack>
      </TechnicalSection>
    </TechnicalStoryLayout>
  );
}

export function SpatialEditingExperience(): ReactNode {
  const [selected, setSelected] = useState<EntityId | null>(
    POINT_CLOUD_EDIT_VOLUMES[0]?.id ?? null,
  );
  return (
    <TechnicalStoryLayout
      eyebrow="LDS 3D / 프리미티브"
      title="SectionBox & EditVolume"
      description="SectionBox는 하나의 장면 프레임 XYZ 범위를 검토 가능하게 합니다. EditVolume은 호출자가 소유한 구·상자 삭제 또는 복원 의도를 지속 선택과 함께 렌더링합니다. 두 프리미티브 모두 점 스냅샷을 변경하거나 제품 액션을 확정하지 않습니다."
      meta="MapConvert3D 공백 / 실제 WebGL 클리핑과 의도"
    >
      <TechnicalSection
        title="선언적 구역과 편집 의도"
        description="점 재질은 명시적인 구역 경계만 GPU에 유지하고 소스 Float32Array는 호출자가 계속 소유합니다. 볼륨을 클릭해 선택 윤곽을 확인하세요. 구는 세 개의 대원, 상자는 실제 모서리만 표시하며 삭제의 빼기와 복원의 더하기 표식이 색조를 보완합니다."
      >
        <Stack gap="var(--space-4)">
          <PrimitiveCanvas
            ariaLabel="SectionBox와 EditVolume 실제 WebGL 프리미티브"
            selectedEntityId={selected}
            onSelectionChange={(change) => setSelected(change.entityId)}
          >
            <PointCloudLayerPrimitive
              clipBounds={POINT_CLOUD_SECTION_BOUNDS}
              colorMode="height"
              fallbackColor="#3c9dff"
              heightRange={POINT_CLOUD_HEIGHT_RANGE}
              maxPoints={50_000}
              pointSize={1.75}
              snapshot={POINT_CLOUD_READY}
            />
            <SectionBoxPrimitive bounds={POINT_CLOUD_SECTION_BOUNDS} />
            {POINT_CLOUD_EDIT_VOLUMES.map((volume) => (
              <EditVolumePrimitive key={volume.id} volume={volume} />
            ))}
          </PrimitiveCanvas>
          <Stack direction="row" gap="var(--space-3)" align="center" wrap>
            <StatusBadge tone={selected === null ? "offline" : "signal"}>
              {selectedCopy(selected)}
            </StatusBadge>
            <Button
              disabled={selected === null}
              size="sm"
              variant="secondary"
              onClick={() => setSelected(null)}
            >
              선택 해제
            </Button>
          </Stack>
          <DescriptionList
            columns={2}
            items={[
              {
                term: "구역 프레임",
                description: <Code>{POINT_CLOUD_SECTION_BOUNDS.frame}</Code>,
              },
              { term: "유지 경계", description: <Code>XYZ 교차 영역</Code> },
              { term: "의도 볼륨", description: <Code>구 삭제 / 상자 복원</Code> },
              { term: "점 변경", description: <Code>없음</Code> },
              { term: "확정 소유자", description: <Code>제품 워크플로</Code> },
              { term: "선택", description: <Code>{selectedCopy(selected)}</Code> },
            ]}
          />
          <PrimitiveReviewEvidence storyId="lds-3d-primitives-spatial-editing--overview" />
        </Stack>
      </TechnicalSection>
    </TechnicalStoryLayout>
  );
}

const SPATIAL_STRUCTURE_BOUNDS: Bounds3 = {
  frame: PRIMITIVE_FRAME,
  min: [-5, -4, -0.3],
  max: [5, 4, 6],
};

const SPATIAL_STRUCTURE_HOME: SceneCameraPose = {
  position: [10.5, -13, 9.5],
  target: [0, 0, 2.2],
  up: [0, 0, 1],
};

const TRANSFORM_MODE_OPTIONS = [
  { value: "translate", label: "이동" },
  { value: "rotate", label: "회전" },
  { value: "scale", label: "크기 조절" },
];

const TRANSFORM_AXIS_OPTIONS = [
  { value: "x", label: "X축" },
  { value: "y", label: "Y축" },
  { value: "z", label: "Z축" },
];

export function SpatialStructureExperience(): ReactNode {
  const [structure, setStructure] = useState<SpatialStructureContract>(SPATIAL_STRUCTURE_FIXTURE);
  const [selected, setSelected] = useState<EntityId | null>(SPATIAL_STRUCTURE_TARGET_ID);
  const [mode, setMode] = useState<SpatialTransformMode>("translate");
  const [axis, setAxis] = useState<SpatialTransformAxis>("x");
  const [lastChange, setLastChange] = useState<SpatialTransformChangeSet | null>(null);
  const activeId =
    selected !== null && structure.nodes.some((node) => node.id === selected)
      ? selected
      : SPATIAL_STRUCTURE_TARGET_ID;
  const activeTransform = getSpatialStructureTransform(structure, activeId);
  const space = mode === "scale" ? "local" : "target";
  const applyChange = useCallback((changeSet: SpatialTransformChangeSet) => {
    const change = changeSet.changes[0];
    if (change === undefined) return;
    setStructure((current) =>
      replaceSpatialStructureTransform(current, change.entityId, change.after),
    );
    if (changeSet.phase === "commit") setLastChange(changeSet);
  }, []);
  const applyDomStep = (direction: -1 | 1): void => {
    const after = stepSpatialNodeTransform(activeTransform, {
      mode,
      axis,
      space,
      direction,
    });
    applyChange(
      createSpatialTransformChangeSet({
        mode,
        axis,
        space,
        phase: "commit",
        changes: [{ entityId: activeId, before: activeTransform, after }],
      }),
    );
  };

  return (
    <TechnicalStoryLayout
      eyebrow="LDS 3D / 프리미티브"
      title="SpatialStructure & TransformGizmo"
      description="SpatialStructure는 순환이 없는 부지·건물·층 트리를 프레임 기반 로컬 TRS, 층 높이, 프리미티브 재질 슬롯, 제어된 선택과 함께 렌더링합니다. TransformGizmo의 이동 화살표는 시작 스냅샷 기준 preview와 단일 commit·cancel 변경 의도만 내보내며 제품 이력, 검증, 저장, 충돌 정책은 렌더러 밖에 둡니다."
      meta="건물 / SiteAuthoring 기반 · 실제 WebGL"
    >
      <TechnicalSection
        title="프레임 기반 계층, 재질, 공통 변환 변경 집합"
        description="공간 말단 노드를 선택한 뒤 이동 화살표를 드래그하세요. pointer capture 손실, 취소, Escape에는 시작 위치로 복구됩니다. 회전·크기 조절은 동일한 코어 계약을 사용하는 아래 LDS 단계 액션으로 검토하며, 같은 드래그 보장이 마련되기 전까지 WebGL 핸들을 노출하지 않습니다."
      >
        <Stack gap="var(--space-4)">
          <Stack direction="row" gap="var(--space-3)" align="center" wrap>
            <SegmentedControl
              aria-label="공간 변환 모드"
              options={TRANSFORM_MODE_OPTIONS}
              value={mode}
              onChange={(value) => setMode(value as SpatialTransformMode)}
            />
            <Select
              aria-label="수치 변환 축"
              options={TRANSFORM_AXIS_OPTIONS}
              size="sm"
              value={axis}
              onChange={(value) => setAxis(value as SpatialTransformAxis)}
            />
            <Button size="sm" variant="secondary" onClick={() => applyDomStep(-1)}>
              단계 -
            </Button>
            <Button size="sm" variant="secondary" onClick={() => applyDomStep(1)}>
              단계 +
            </Button>
          </Stack>
          <PrimitiveCanvas
            ariaLabel="SpatialStructure와 TransformGizmo 실제 WebGL 프리미티브"
            bounds={SPATIAL_STRUCTURE_BOUNDS}
            homePose={SPATIAL_STRUCTURE_HOME}
            selectedEntityId={selected}
            onSelectionChange={(change) => setSelected(change.entityId)}
          >
            <SpatialStructurePrimitive
              structure={structure}
              activeTransform={{
                entityId: activeId,
                mode,
                space,
                onTransformChange: applyChange,
              }}
            />
          </PrimitiveCanvas>
          <DescriptionList
            columns={2}
            items={[
              {
                term: "계층",
                description: <Code>부지 / 건물 / 2개 층 / 말단 노드 8개</Code>,
              },
              { term: "장면 프레임", description: <Code>{structure.frame}</Code> },
              { term: "선택", description: <Code>{activeId}</Code> },
              { term: "모드 / 공간", description: <Code>{`${mode} / ${space}`}</Code> },
              {
                term: "변환 소스",
                description: <Code>기즈모 또는 LDS DOM → 같은 변경 집합</Code>,
              },
              {
                term: "최근 변경",
                description: (
                  <StatusBadge tone={lastChange === null ? "offline" : "positive"}>
                    {lastChange === null
                      ? "없음"
                      : `${lastChange.mode === "translate" ? "이동" : lastChange.mode === "rotate" ? "회전" : "크기 조절"} ${lastChange.axis.toUpperCase()}축 / 확정`}
                  </StatusBadge>
                ),
              },
            ]}
          />
          <PrimitiveReviewEvidence storyId="lds-3d-primitives-spatial-authoring--overview" />
        </Stack>
      </TechnicalSection>
    </TechnicalStoryLayout>
  );
}

export const SceneCanvas: Story = {
  name: "개요",
  parameters: primitiveReviewParameters("lds-3d-primitives--scene-canvas"),
  render: () => <SceneCanvasExperience />,
};
