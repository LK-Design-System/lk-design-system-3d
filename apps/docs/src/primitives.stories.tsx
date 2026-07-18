import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Button,
  Code,
  DescriptionList,
  SegmentedControl,
  Select,
  Stack,
  StatusBadge,
} from "@lk-robotics/design-system-core";
import {
  AmrRobot as AmrRobotPrimitive,
  GltfModel as GltfModelPrimitive,
  GoalMarker as GoalMarkerPrimitive,
  PathRibbon as PathRibbonPrimitive,
  PointCloudLayer as PointCloudLayerPrimitive,
  SceneCanvas as SceneCanvasPrimitive,
  Selectable,
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
} from "@lk-robotics/design-system-3d-r3f";
import {
  resolvePointCloudRenderState,
  type PointCloudRenderState,
  type PointCloudSnapshot,
} from "@lk-robotics/design-system-3d-pointcloud";
import {
  entityId,
  frameId,
  quaternionFromYaw,
  type Bounds3,
  type EntityId,
  type GoalEntity,
  type PathEntity,
  type RobotEntity,
  type Vec3,
} from "@lk-robotics/design-system-3d-core";
import { useCallback, useState, type ReactNode } from "react";

import { TechnicalSection, TechnicalStoryLayout } from "./components.js";
import {
  POINT_CLOUD_EMPTY,
  POINT_CLOUD_MISMATCH,
  POINT_CLOUD_OVER_BUDGET,
  POINT_CLOUD_READY,
  POINT_CLOUD_REPLACEMENT,
  POINT_CLOUD_XYZ_ONLY,
} from "./pointcloud-fixture.js";
import primitiveReviewContract from "./primitive-review-contract.json";

const meta = {
  title: "LDS 3D/Primitives",
  id: "lds-3d-primitives",
  parameters: { controls: { disable: true } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;
type PrimitiveReviewStoryId = keyof typeof primitiveReviewContract.stories;

const PRIMITIVE_REVIEW_STAGE_LABELS = {
  overview: "Overview",
  usage: "Usage",
  "variants-states": "Variants / states",
  interaction: "Interaction",
  "accessibility-motion": "Accessibility / motion",
  responsive: "Responsive",
  scenario: "Scenario",
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

type ReviewCameraMode = Exclude<SceneCameraMode, "free">;

interface PrimitiveCanvasProps {
  readonly ariaLabel: string;
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
      focusBounds={PRIMITIVE_BOUNDS}
      frame={PRIMITIVE_FRAME}
      frameLoop="demand"
      homePose={homePose ?? PRIMITIVE_HOME}
      profile={profile}
      renderQuality="balanced"
      style={PRIMITIVE_CANVAS_STYLE}
      topBounds={PRIMITIVE_BOUNDS}
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

function reviewParameters(storyId: PrimitiveReviewStoryId) {
  const review = primitiveReviewContract.stories[storyId];
  return {
    lds3dReview: {
      ...review,
      requiredStages: primitiveReviewContract.requiredStages,
    },
  };
}

function PrimitiveReviewEvidence({ storyId }: { readonly storyId: PrimitiveReviewStoryId }): ReactNode {
  const review = primitiveReviewContract.stories[storyId];
  const stages = review.stages as Readonly<Record<PrimitiveReviewStage, string>>;
  return (
    <DescriptionList
      columns={1}
      items={[
        {
          term: "Renderer evidence",
          description: "Actual WebGL through SceneCanvas; DOM content is a complementary review summary.",
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
  return entityId ?? "No persistent selection";
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

function SceneCanvasExperience(): ReactNode {
  const [cameraMode, setCameraMode] = useState<ReviewCameraMode>("home");
  return (
    <TechnicalStoryLayout
      eyebrow="LDS 3D / Primitives"
      title="SceneCanvas & CameraRig"
      description="The headless host owns real WebGL, the one-time core-to-Three basis, CameraRig, SceneEnvironment, picking, and lifecycle. Consumer UI remains outside this package."
      meta="Overview · usage · camera interaction"
    >
      <TechnicalSection
        title="One scene host, one environment"
        description="Use camera modes through the host API. SceneCanvas creates exactly one SceneEnvironment; configure its floor, grid, axes, and shadow budget with the environment prop instead of mounting duplicate world surfaces."
      >
        <Stack gap="var(--space-4)">
          <SegmentedControl
            aria-label="Primitive camera mode"
            options={[
              { value: "home", label: "Home" },
              { value: "top", label: "Top" },
              { value: "focus", label: "Focus" },
            ]}
            size="sm"
            value={cameraMode}
            onChange={(value) => setCameraMode(value as ReviewCameraMode)}
          />
          <PrimitiveCanvas
            ariaLabel="SceneCanvas and CameraRig primitive demonstration"
            cameraMode={cameraMode}
            environment={{ showAxes: true }}
          >
            <AmrRobotPrimitive entity={PRIMARY_ROBOT} status="live" />
            <GoalMarkerPrimitive animated={false} entity={PRIMARY_GOAL} variant="valid" />
          </PrimitiveCanvas>
          <DescriptionList
            columns={2}
            items={[
              { term: "Space", description: "Right-handed, +Z up, meters" },
              { term: "Camera", description: <Code>{cameraMode}</Code> },
              { term: "Quality profile", description: <Code>balanced</Code> },
              { term: "Frame loop", description: <Code>demand</Code> },
              { term: "Review DPR override", description: <Code>1</Code> },
              { term: "Shadow map", description: <Code>1024px</Code> },
            ]}
          />
          <PrimitiveReviewEvidence storyId="lds-3d-primitives--scene-canvas" />
        </Stack>
      </TechnicalSection>
    </TechnicalStoryLayout>
  );
}

function SelectableExperience(): ReactNode {
  const [selected, setSelected] = useState<EntityId | null>(null);
  const [hovered, setHovered] = useState<EntityId | null>(null);
  return (
    <TechnicalStoryLayout
      eyebrow="LDS 3D / Primitives"
      title="Selectable"
      description="Selectable adds hover and single persistent selection to a spatial subtree. It emits identifiers and pointer detail; it never executes a product command."
      meta="Interaction · accessible DOM summary"
    >
      <TechnicalSection
        title="Hover is transient; selection is persistent"
        description="Point at a block to exercise hover and click it to select. The summary below the actual WebGL canvas is the accessible record of the selected entity."
      >
        <Stack gap="var(--space-4)">
          <PrimitiveCanvas
            ariaLabel="Selectable primitive interaction demonstration"
            hoveredEntityId={hovered}
            selectedEntityId={selected}
            onHoverChange={(change) => setHovered(change.entityId)}
            onSelectionChange={(change) => setSelected(change.entityId)}
          >
            <SelectionProbe
              entityId={entityId("primitive/selectable-a")}
              label="Selectable A"
              position={[-2.25, 0, 0.35]}
            />
            <SelectionProbe
              entityId={entityId("primitive/selectable-b")}
              label="Selectable B"
              position={[0, 0, 0.35]}
            />
            <SelectionProbe
              entityId={entityId("primitive/selectable-c")}
              label="Selectable C"
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
              Clear selection
            </Button>
          </Stack>
          <DescriptionList
            columns={2}
            items={[
              { term: "Hovered", description: <Code>{hovered ?? "none"}</Code> },
              { term: "Selected", description: <Code>{selected ?? "none"}</Code> },
            ]}
          />
          <PrimitiveReviewEvidence storyId="lds-3d-primitives--selection" />
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
      pose: { frame: PRIMITIVE_FRAME, position: [3.6, 1.5, 0], orientation: quaternionFromYaw(Math.PI) },
    },
    status: "error",
  },
];

function AmrRobotExperience(): ReactNode {
  const [selected, setSelected] = useState<EntityId | null>(ROBOT_VARIANTS[1]?.entity.id ?? null);
  return (
    <TechnicalStoryLayout
      eyebrow="LDS 3D / Primitives"
      title="AmrRobot"
      description="AmrRobot is the semantic fallback AMR visual. It owns selectable geometry and status cues, while a product can supply an actual model through its model slot."
      meta="Variants · selection"
    >
      <TechnicalSection
        title="Robot status variants"
        description="Idle, live, warning, and error remain distinct through geometry and emissive material changes. Click an AMR to review its persistent selection treatment."
      >
        <Stack gap="var(--space-4)">
          <PrimitiveCanvas
            ariaLabel="AMR robot primitive variants"
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
              { term: "Variants", description: "idle · live · warning · error" },
              { term: "Selected", description: <Code>{selectedCopy(selected)}</Code> },
            ]}
          />
          <PrimitiveReviewEvidence storyId="lds-3d-primitives--amr-robot" />
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
      pose: { frame: PRIMITIVE_FRAME, position: [-3.2, 0.65, 0], orientation: quaternionFromYaw(0) },
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
      pose: { frame: PRIMITIVE_FRAME, position: [3.2, 0.65, 0], orientation: quaternionFromYaw(Math.PI) },
      radiusMeters: 0.55,
    },
  },
];

function GoalMarkerExperience(): ReactNode {
  const [selected, setSelected] = useState<EntityId | null>(GOAL_VARIANTS[0]?.entity.id ?? null);
  return (
    <TechnicalStoryLayout
      eyebrow="LDS 3D / Primitives"
      title="GoalMarker"
      description="GoalMarker communicates valid intent, non-committed preview, and invalid placement in spatial geometry. Motion is optional and always respects reduced motion."
      meta="Variants · reduced-motion-safe static review"
    >
      <TechnicalSection
        title="Goal intent grammar"
        description="These review variants intentionally disable ambient pulse so state language is inspectable without a permanent render loop. Click a marker to inspect its selection state."
      >
        <Stack gap="var(--space-4)">
          <PrimitiveCanvas
            ariaLabel="Goal marker primitive variants"
            selectedEntityId={selected}
            onSelectionChange={(change) => setSelected(change.entityId)}
          >
            {GOAL_VARIANTS.map(({ entity, variant }) => (
              <GoalMarkerPrimitive key={entity.id} animated={false} entity={entity} variant={variant} />
            ))}
          </PrimitiveCanvas>
          <DescriptionList
            columns={2}
            items={[
              { term: "Variants", description: "valid · preview · invalid" },
              { term: "Selected", description: <Code>{selectedCopy(selected)}</Code> },
            ]}
          />
          <PrimitiveReviewEvidence storyId="lds-3d-primitives--goal-marker" />
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

function PathRibbonExperience(): ReactNode {
  const [selected, setSelected] = useState<EntityId | null>(PATH_VARIANTS[1]?.entity.id ?? null);
  return (
    <TechnicalStoryLayout
      eyebrow="LDS 3D / Primitives"
      title="PathRibbon"
      description="PathRibbon expresses a framed route through geometry, line treatment, beacon, and blocked marks. Selection stays opt-in because routes are often passive context."
      meta="Variants · opt-in interaction"
    >
      <TechnicalSection
        title="Path state variants"
        description="All four variants are static here; the executing beacon remains at a deterministic midpoint. Click a ribbon to verify the opt-in selection state."
      >
        <Stack gap="var(--space-4)">
          <PrimitiveCanvas
            ariaLabel="Path ribbon primitive variants"
            selectedEntityId={selected}
            onSelectionChange={(change) => setSelected(change.entityId)}
          >
            {PATH_VARIANTS.map(({ entity, variant }) => (
              <PathRibbonPrimitive key={entity.id} animated={false} entity={entity} selectable variant={variant} />
            ))}
          </PrimitiveCanvas>
          <DescriptionList
            columns={2}
            items={[
              { term: "Variants", description: "actual · executing · planned · blocked" },
              { term: "Selected", description: <Code>{selectedCopy(selected)}</Code> },
            ]}
          />
          <PrimitiveReviewEvidence storyId="lds-3d-primitives--path-ribbon" />
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
      return { kind: "loading", label: "Loading spatial fixture", progress: 0.58 };
    case "empty":
      return {
        kind: "empty",
        title: "No spatial entities",
        description: "The renderer and its scene frame remain available.",
      };
    case "error":
      return {
        kind: "error",
        title: "Asset load failed",
        message: "Deliberate primitive recovery state",
        recoverable: true,
      };
  }
}

function RuntimeStatesExperience(): ReactNode {
  const [state, setState] = useState<ReviewRuntimeState>("loading");
  return (
    <TechnicalStoryLayout
      eyebrow="LDS 3D / Primitives"
      title="SceneStateMarker"
      description="SceneCanvas renders SceneStateMarker for non-ready renderer states. The optional status overlay complements the real WebGL marker with a DOM-readable summary."
      meta="States · recovery boundary"
    >
      <TechnicalSection
        title="Renderer lifecycle states"
        description="The host remains stable while loading, empty, or error content changes. A product owns its retry policy; this technical story uses an LDS action only to reset the review state."
      >
        <Stack gap="var(--space-4)">
          <SegmentedControl
            aria-label="Primitive renderer state"
            options={[
              { value: "ready", label: "Ready" },
              { value: "loading", label: "Loading" },
              { value: "empty", label: "Empty" },
              { value: "error", label: "Error" },
            ]}
            size="sm"
            value={state}
            onChange={(value) => setState(value as ReviewRuntimeState)}
          />
          <PrimitiveCanvas
            ariaLabel="Scene state marker primitive variants"
            renderState={toRenderState(state)}
            showStatusOverlay
          >
            <AmrRobotPrimitive entity={PRIMARY_ROBOT} status="live" />
          </PrimitiveCanvas>
          <Stack direction="row" gap="var(--space-3)" align="center" wrap>
            <StatusBadge
              tone={state === "error" ? "negative" : state === "ready" ? "positive" : "cautionary"}
            >
              {state.toUpperCase()}
            </StatusBadge>
            <Button
              disabled={state === "ready"}
              size="sm"
              variant="secondary"
              onClick={() => setState("ready")}
            >
              Reset to ready
            </Button>
          </Stack>
          <PrimitiveReviewEvidence storyId="lds-3d-primitives--runtime-states" />
        </Stack>
      </TechnicalSection>
    </TechnicalStoryLayout>
  );
}

function GltfModelExperience(): ReactNode {
  const [loadState, setLoadState] = useState<ModelLoadState>("loading");
  const [selected, setSelected] = useState<EntityId | null>(null);
  const reportLoadState = useCallback((state: ModelLoadState) => setLoadState(state), []);
  return (
    <TechnicalStoryLayout
      eyebrow="LDS 3D / Primitives"
      title="GltfModel"
      description="GltfModel loads a real GLB, normalizes its documented source convention, clones only placement ownership, and forwards spatial selection through the shared interaction contract."
      meta="Actual GLB · loading lifecycle"
    >
      <TechnicalSection
        title="Manifest-aware spatial asset placement"
        description="This is the actual AMR GLB from the Visual Alpha asset catalog, rendered directly through GltfModel rather than through the Visual Alpha assembly helper. Click it to select."
      >
        <Stack gap="var(--space-4)">
          <PrimitiveCanvas
            ariaLabel="GltfModel primitive with actual AMR GLB"
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
                term: "Load state",
                description: (
                  <StatusBadge tone={loadState === "ready" ? "positive" : "cautionary"}>
                    {loadState}
                  </StatusBadge>
                ),
              },
              { term: "Source convention", description: <Code>core</Code> },
              { term: "Format", description: <Code>glTF 2.0 / GLB</Code> },
              { term: "Selected", description: <Code>{selectedCopy(selected)}</Code> },
            ]}
          />
          <PrimitiveReviewEvidence storyId="lds-3d-primitives--gltf-model" />
        </Stack>
      </TechnicalSection>
    </TechnicalStoryLayout>
  );
}

type PointCloudReviewVariant =
  | "ready"
  | "replacement"
  | "xyz-only"
  | "empty"
  | "budget"
  | "frame-mismatch";

const POINT_CLOUD_REVIEW_OPTIONS = [
  { value: "ready", label: "Ready 5K" },
  { value: "replacement", label: "Replace 5K" },
  { value: "xyz-only", label: "XYZ fallback" },
  { value: "empty", label: "Empty" },
  { value: "budget", label: "Budget cap" },
  { value: "frame-mismatch", label: "Wrong frame" },
];

function pointCloudVariant(variant: PointCloudReviewVariant): {
  readonly snapshot: PointCloudSnapshot;
  readonly maxPoints: number;
} {
  switch (variant) {
    case "replacement":
      return { snapshot: POINT_CLOUD_REPLACEMENT, maxPoints: 50_000 };
    case "xyz-only":
      return { snapshot: POINT_CLOUD_XYZ_ONLY, maxPoints: 50_000 };
    case "empty":
      return { snapshot: POINT_CLOUD_EMPTY, maxPoints: 50_000 };
    case "budget":
      return { snapshot: POINT_CLOUD_OVER_BUDGET, maxPoints: 10_000 };
    case "frame-mismatch":
      return { snapshot: POINT_CLOUD_MISMATCH, maxPoints: 50_000 };
    case "ready":
      return { snapshot: POINT_CLOUD_READY, maxPoints: 50_000 };
  }
}

function pointCloudTone(
  state: PointCloudRenderState,
): "positive" | "cautionary" | "negative" | "offline" {
  switch (state.kind) {
    case "ready":
      return "positive";
    case "empty":
      return "offline";
    case "budget-exceeded":
      return "cautionary";
    case "frame-mismatch":
      return "negative";
  }
}

function PointCloudLayerExperience(): ReactNode {
  const [variant, setVariant] = useState<PointCloudReviewVariant>("ready");
  const active = pointCloudVariant(variant);
  const [renderState, setRenderState] = useState<PointCloudRenderState>(() =>
    resolvePointCloudRenderState(POINT_CLOUD_READY, PRIMITIVE_FRAME, 50_000),
  );
  const frameCopy =
    renderState.kind === "frame-mismatch"
      ? `${renderState.actualFrame} != ${renderState.expectedFrame}`
      : active.snapshot.frame;

  return (
    <TechnicalStoryLayout
      eyebrow="LDS 3D / Primitives"
      title="PointCloudLayer"
      description="PointCloudLayer turns one validated core-frame snapshot into actual WebGL point geometry. It owns adapter-created geometry and material only; ROS transport, TF, parsing, sampling, picking, and viewer UI stay outside this atom."
      meta="P1 Foundation 0 / actual WebGL point geometry"
    >
      <TechnicalSection
        title="Frame-safe snapshot replacement"
        description="Use the LDS Select only to switch review fixtures. The layer never mutates source buffers, transforms a frame, or silently drops points: non-renderable inputs leave the WebGL host intact and report a caller-owned state."
      >
        <Stack gap="var(--space-4)">
          <Select
            aria-label="Point cloud primitive state"
            options={POINT_CLOUD_REVIEW_OPTIONS}
            size="sm"
            value={variant}
            onChange={(value) => setVariant(value as PointCloudReviewVariant)}
          />
          <PrimitiveCanvas ariaLabel="PointCloudLayer actual WebGL primitive">
            <PointCloudLayerPrimitive
              fallbackColor="#3c9dff"
              maxPoints={active.maxPoints}
              pointSize={1.75}
              snapshot={active.snapshot}
              onRenderStateChange={setRenderState}
            />
          </PrimitiveCanvas>
          <DescriptionList
            columns={2}
            items={[
              {
                term: "Render state",
                description: (
                  <StatusBadge tone={pointCloudTone(renderState)}>
                    {renderState.kind.toUpperCase()}
                  </StatusBadge>
                ),
              },
              { term: "Frame", description: <Code>{frameCopy}</Code> },
              {
                term: "Requested / accepted",
                description: (
                  <Code>
                    {renderState.requestedPointCount.toLocaleString()} / {renderState.acceptedPointCount.toLocaleString()}
                  </Code>
                ),
              },
              { term: "Budget", description: <Code>{active.maxPoints.toLocaleString()}</Code> },
              { term: "CPU buffer owner", description: <Code>caller-retained</Code> },
              { term: "Color contract", description: <Code>linear RGB or fallback color</Code> },
            ]}
          />
          <PrimitiveReviewEvidence storyId="lds-3d-primitives--point-cloud-layer" />
        </Stack>
      </TechnicalSection>
    </TechnicalStoryLayout>
  );
}

export const SceneCanvas: Story = {
  name: "SceneCanvas & CameraRig",
  parameters: reviewParameters("lds-3d-primitives--scene-canvas"),
  render: () => <SceneCanvasExperience />,
};

export const Selection: Story = {
  name: "Selectable",
  parameters: reviewParameters("lds-3d-primitives--selection"),
  render: () => <SelectableExperience />,
};

export const AmrRobot: Story = {
  name: "AmrRobot",
  parameters: reviewParameters("lds-3d-primitives--amr-robot"),
  render: () => <AmrRobotExperience />,
};

export const GoalMarker: Story = {
  name: "GoalMarker",
  parameters: reviewParameters("lds-3d-primitives--goal-marker"),
  render: () => <GoalMarkerExperience />,
};

export const PathRibbon: Story = {
  name: "PathRibbon",
  parameters: reviewParameters("lds-3d-primitives--path-ribbon"),
  render: () => <PathRibbonExperience />,
};

export const RuntimeStates: Story = {
  name: "SceneStateMarker",
  parameters: reviewParameters("lds-3d-primitives--runtime-states"),
  render: () => <RuntimeStatesExperience />,
};

export const GltfModel: Story = {
  name: "GltfModel",
  parameters: reviewParameters("lds-3d-primitives--gltf-model"),
  render: () => <GltfModelExperience />,
};

export const PointCloudLayer: Story = {
  name: "PointCloudLayer",
  parameters: reviewParameters("lds-3d-primitives--point-cloud-layer"),
  render: () => <PointCloudLayerExperience />,
};
