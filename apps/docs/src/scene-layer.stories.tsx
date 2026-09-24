import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, Code, Stack, StatusBadge, Switch } from "@lk-design-system/lds-core";
import { DescriptionList } from "@lk-design-system/lds-product";
import {
  AmrRobot as AmrRobotPrimitive,
  SceneCanvas as SceneCanvasPrimitive,
  SceneLayer,
  useSceneLayerRegistry,
  useSceneRuntime,
  type SceneRenderState,
} from "@lk-design-system/lds-3d-r3f";
import {
  entityId,
  frameId,
  quaternionFromYaw,
  type RobotEntity,
  type SceneLayerSummary,
} from "@lk-design-system/lds-3d-core";
import { use, useMemo, useState, type ReactNode } from "react";

import { TechnicalSection, TechnicalStoryLayout } from "./components.js";
import { PrimitiveReviewEvidence, primitiveReviewParameters } from "./primitives.stories.js";

const meta = {
  title: "LDS 3D/Primitives/SceneLayer",
  id: "lds-3d-primitives-scene-layer",
  excludeStories: /.*Experience$/,
  parameters: { controls: { disable: true } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const FRAME = frameId("lk-map");
const ROBOT: RobotEntity = {
  kind: "robot",
  id: entityId("layers/amr-01"),
  pose: { frame: FRAME, position: [0, 0, 0], orientation: quaternionFromYaw(0) },
};
const LAYER_IDS = ["robot", "structures", "lidar"] as const;

const pending = new Map<number, Promise<void>>();
function delay(key: number, ms: number): Promise<void> {
  const existing = pending.get(key);
  if (existing !== undefined) return existing;
  const created = new Promise<void>((resolve) => setTimeout(resolve, ms));
  pending.set(key, created);
  return created;
}

/** Suspends once per retry, like a streamed building mesh. */
function SlowStructures({ retryKey }: { readonly retryKey: number }): ReactNode {
  use(delay(retryKey, 1200));
  const { theme } = useSceneRuntime();
  return (
    <mesh position={[0, 2.4, 0.6]}>
      <boxGeometry args={[3, 1, 1.2]} />
      <meshStandardMaterial color={theme.materials.assetStructure} />
    </mesh>
  );
}

/** Throws while rendering, like a point cloud whose server did not answer. */
function FailingLidar({ fail }: { readonly fail: boolean }): ReactNode {
  const { theme } = useSceneRuntime();
  if (fail) throw new Error("점군 서버가 응답하지 않습니다");
  return (
    <mesh position={[-2.4, -1.6, 0.05]}>
      <boxGeometry args={[1.6, 1.6, 0.1]} />
      <meshStandardMaterial color={theme.materials.pointCloud ?? theme.materials.intent} />
    </mesh>
  );
}

function summaryToRenderState(summary: SceneLayerSummary): SceneRenderState {
  switch (summary.kind) {
    case "error":
      return { kind: "error", message: summary.message, recoverable: summary.recoverable };
    case "empty":
      return { kind: "empty", title: "켜진 레이어가 없습니다" };
    default:
      return { kind: "ready" };
  }
}

function summaryLabel(summary: SceneLayerSummary): ReactNode {
  switch (summary.kind) {
    case "loading":
      return <StatusBadge tone="cautionary">불러오는 중 · {summary.loading.join(", ")}</StatusBadge>;
    case "ready":
      return summary.degraded.length === 0 ? (
        <StatusBadge tone="positive">준비됨</StatusBadge>
      ) : (
        <StatusBadge tone="cautionary">일부 레이어 실패 · {summary.degraded.join(", ")}</StatusBadge>
      );
    case "error":
      return <StatusBadge tone="negative">장면 오류 · {summary.failed.join(", ")}</StatusBadge>;
    case "empty":
      return <StatusBadge tone="offline">레이어 없음</StatusBadge>;
  }
}

export function SceneLayerExperience(): ReactNode {
  const [lidarFails, setLidarFails] = useState(true);
  const [lidarRequired, setLidarRequired] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [contextLost, setContextLost] = useState(false);
  const required = useMemo(() => (lidarRequired ? ["robot", "lidar"] : ["robot"]), [lidarRequired]);
  const registry = useSceneLayerRegistry(LAYER_IDS, { required });
  return (
    <TechnicalStoryLayout
      eyebrow="LDS 3D / 프리미티브"
      title="SceneLayer"
      description="SceneLayer는 레이어 하나를 격리합니다. 지연되면 loading, 마운트되면 ready, 렌더 중 오류가 나면 error를 보고하고 아무것도 그리지 않아 나머지 장면은 계속 보입니다. useSceneLayerRegistry가 core aggregateSceneLayerStatus로 장면 상태를 합칩니다."
      meta="레이어 상태 · 필수/선택 · 재시도 · 컨텍스트 손실"
    >
      <TechnicalSection
        title="선택 레이어 실패는 장면을 멈추지 않습니다"
        description="점군 레이어가 실패해도 선택 레이어면 장면은 준비됨으로 남고 일부 실패만 알립니다. 필수로 바꾸면 장면 오류가 됩니다. 재시도는 retryKey를 올려 실패한 레이어를 다시 마운트합니다."
      >
        <Stack gap="var(--space-4)">
          <Stack direction="row" gap="var(--space-4)" wrap>
            <Switch checked={lidarFails} label="점군 레이어 실패" onChange={setLidarFails} />
            <Switch checked={lidarRequired} label="점군을 필수 레이어로" onChange={setLidarRequired} />
            <Button size="sm" variant="secondary" onClick={() => {
                registry.retry();
                setRetryKey((key) => key + 1);
              }}>
              실패한 레이어 다시 불러오기
            </Button>
          </Stack>
          <SceneCanvasPrimitive
            ariaLabel="레이어 상태 프리미티브"
            devicePixelRatio={1}
            frame={FRAME}
            frameLoop="demand"
            homePose={{ position: [6, -8, 6], target: [0, 0, 0.4], up: [0, 0, 1] }}
            renderState={summaryToRenderState(registry.summary)}
            showStatusOverlay
            style={{ height: "min(30rem, 56vw)", minHeight: "20rem" }}
            onContextLost={() => setContextLost(true)}
            onContextRestored={() => setContextLost(false)}
          >
            <SceneLayer id="robot" onStatusChange={registry.report}>
              <AmrRobotPrimitive entity={ROBOT} status="moving" />
            </SceneLayer>
            <SceneLayer id="structures" retryKey={retryKey} onStatusChange={registry.report}>
              <SlowStructures retryKey={retryKey} />
            </SceneLayer>
            <SceneLayer id="lidar" retryKey={retryKey} onStatusChange={registry.report}>
              <FailingLidar fail={lidarFails} />
            </SceneLayer>
          </SceneCanvasPrimitive>
          <DescriptionList
            columns={2}
            items={[
              { term: "장면", description: summaryLabel(registry.summary) },
              {
                term: "레이어",
                description: (
                  <Code>
                    {registry.entries.map((entry) => `${entry.id}:${entry.status.kind}`).join(" · ")}
                  </Code>
                ),
              },
              {
                term: "WebGL 컨텍스트",
                description: contextLost ? (
                  <StatusBadge tone="negative">손실 · 복구 대기</StatusBadge>
                ) : (
                  <StatusBadge tone="positive">정상</StatusBadge>
                ),
              },
            ]}
          />
          <PrimitiveReviewEvidence storyId="lds-3d-primitives-scene-layer--overview" />
        </Stack>
      </TechnicalSection>
    </TechnicalStoryLayout>
  );
}

export const Overview: Story = {
  name: "개요",
  parameters: primitiveReviewParameters("lds-3d-primitives-scene-layer--overview"),
  render: () => <SceneLayerExperience />,
};
