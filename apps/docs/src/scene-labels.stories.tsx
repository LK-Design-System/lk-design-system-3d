import type { Meta, StoryObj } from "@storybook/react-vite";
import { Code, SegmentedControl, Stack } from "@lk-design-system/lds-core";
import { DescriptionList } from "@lk-design-system/lds-product";
import {
  AmrRobot as AmrRobotPrimitive,
  SceneCanvas as SceneCanvasPrimitive,
  SceneLabelOverlay,
  SceneLabelProjector,
  resolveSceneTheme,
  type SceneLabel,
  type SceneLabelLayout,
} from "@lk-design-system/lds-3d-r3f";
import { entityId, frameId, quaternionFromYaw, type RobotEntity } from "@lk-design-system/lds-3d-core";
import { useMemo, useState, type ReactNode } from "react";

import { TechnicalSection, TechnicalStoryLayout } from "./components.js";
import { useLdsSceneThemeCustomization } from "./lds-scene-theme.js";
import { PrimitiveReviewEvidence, primitiveReviewParameters } from "./primitives.stories.js";

const meta = {
  title: "LDS 3D/Primitives/SceneLabels",
  id: "lds-3d-primitives-scene-labels",
  excludeStories: /.*Experience$/,
  parameters: { controls: { disable: true } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const FRAME = frameId("lk-map");
const ROBOT: RobotEntity = {
  kind: "robot",
  id: entityId("labels/amr-01"),
  pose: { frame: FRAME, position: [0.4, -0.6, 0], orientation: quaternionFromYaw(Math.PI / 6) },
};

const PLACES = [
  { id: "gate", text: "정문", position: [-4.5, -3, 0.2] as const, priority: 60 },
  { id: "hall", text: "재실", position: [-1.2, 2.6, 0.2] as const, priority: 60 },
  { id: "tomb", text: "명릉", position: [3.8, 2.8, 0.2] as const, priority: 60 },
  { id: "yard", text: "Service yard", position: [4.2, -2.4, 0.2] as const, priority: 30 },
  {
    id: "yard-bench",
    text: "벤치",
    position: [4.4, -2.1, 0.2] as const,
    priority: 10,
    maxDistanceMeters: 9,
  },
] as const;

type PlaceId = (typeof PLACES)[number]["id"] | "none";

export function SceneLabelsExperience(): ReactNode {
  const [selected, setSelected] = useState<PlaceId>("none");
  const [layout, setLayout] = useState<SceneLabelLayout>({ placed: [], hidden: [] });
  const customization = useLdsSceneThemeCustomization();
  const theme = useMemo(
    () => resolveSceneTheme("operational-neutral", customization),
    [customization],
  );
  const labels = useMemo<readonly SceneLabel[]>(
    () => [
      { id: "robot", text: "AMR-01", position: [0.4, -0.6, 1.3], priority: 100 },
      ...PLACES.map((place) => ({
        id: place.id,
        text: place.text,
        position: place.position,
        priority: place.priority,
        selected: place.id === selected,
        ...("maxDistanceMeters" in place ? { maxDistanceMeters: place.maxDistanceMeters } : {}),
      })),
    ],
    [selected],
  );
  return (
    <TechnicalStoryLayout
      eyebrow="LDS 3D / 프리미티브"
      title="SceneLabels"
      description="SceneLabelProjector가 매 프레임 기준점을 화면에 투영하고 core layoutScreenLabels 규칙으로 배치합니다. 라벨은 캔버스 안이 아니라 SceneCanvas overlay 슬롯의 DOM으로 그리며, 스타일은 LDS 역할에서 읽은 테마 labels 슬롯을 따릅니다."
      meta="우선순위 · 겹침 · 거리 · 선택"
    >
      <TechnicalSection
        title="우선순위와 겹침 회피"
        description="선택한 장소가 가장 먼저, 그다음 우선순위, 같은 우선순위에서는 가까운 라벨이 자리를 차지합니다. 겹치는 라벨은 숨기고, 벤치처럼 최대 거리가 있는 라벨은 카메라가 멀면 숨깁니다. 기본 라벨은 조작할 수 없는 글자 칩이며, 조작이 필요하면 renderLabel로 LDS 컴포넌트를 씁니다."
      >
        <Stack gap="var(--space-4)">
          <SegmentedControl
            aria-label="선택한 장소"
            options={[
              { value: "none", label: "선택 없음" },
              ...PLACES.map((place) => ({ value: place.id, label: place.text })),
            ]}
            size="sm"
            style={{ alignSelf: "flex-start" }}
            value={selected}
            onChange={(value) => setSelected(value as PlaceId)}
          />
          <SceneCanvasPrimitive
            ariaLabel="지도 라벨 프리미티브"
            devicePixelRatio={1}
            frame={FRAME}
            frameLoop="demand"
            homePose={{ position: [7, -11, 9], target: [0, 0, 0.4], up: [0, 0, 1] }}
            overlay={<SceneLabelOverlay layout={layout} theme={theme} />}
            style={{ height: "min(34rem, 62vw)", minHeight: "22rem" }}
            theme={theme}
          >
            <AmrRobotPrimitive entity={ROBOT} status="moving" />
            <SceneLabelProjector labels={labels} theme={theme} onLayout={setLayout} />
          </SceneCanvasPrimitive>
          <DescriptionList
            columns={2}
            items={[
              {
                term: "표시",
                description: <Code>{layout.placed.map((entry) => entry.label.id).join(", ")}</Code>,
              },
              {
                term: "숨김",
                description: (
                  <Code>
                    {layout.hidden.map((entry) => `${entry.id}(${entry.reason})`).join(", ") ||
                      "없음"}
                  </Code>
                ),
              },
            ]}
          />
          <PrimitiveReviewEvidence storyId="lds-3d-primitives-scene-labels--overview" />
        </Stack>
      </TechnicalSection>
    </TechnicalStoryLayout>
  );
}

export const Overview: Story = {
  name: "개요",
  parameters: primitiveReviewParameters("lds-3d-primitives-scene-labels--overview"),
  render: () => <SceneLabelsExperience />,
};
