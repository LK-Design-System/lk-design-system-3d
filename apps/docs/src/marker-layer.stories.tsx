import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack, StatusBadge } from "@lk-robotics/lds-core";
import { DescriptionList } from "@lk-robotics/lds-product";
import { MarkerLayer, SceneCanvas, type SceneCameraPose } from "@lk-robotics/lds-3d-r3f";
import { resolveMarkerLayerRenderState } from "@lk-robotics/lds-3d-markers";

import { TechnicalSection, TechnicalStoryLayout } from "./components.js";
import { PrimitiveReviewEvidence, primitiveReviewParameters } from "./primitives.stories.js";
import {
  TF_MARKER_BOUNDS,
  TF_MARKER_LAYER,
  TF_MARKER_MAP_FRAME,
  TF_MARKER_TIME,
} from "./tf-marker-fixture.js";

const meta = {
  title: "LDS 3D/Primitives/MarkerLayer",
  id: "lds-3d-primitives-marker-layer",
  excludeStories: /.*Experience$/,
  parameters: { controls: { disable: true } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const HOME: SceneCameraPose = {
  position: [7.8, -9.2, 6.4],
  target: [1.1, 0.2, 0.55],
  up: [0, 0, 1],
};

export function MarkerLayerExperience() {
  const state = resolveMarkerLayerRenderState(TF_MARKER_LAYER, TF_MARKER_MAP_FRAME, 64, {
    now: TF_MARKER_TIME,
    staleAfterSeconds: 0.25,
  });
  return (
    <TechnicalStoryLayout
      description="한 프레임과 시각에 묶인 비대화형 공간 주석을 실제 WebGL 형상으로 렌더링합니다. ROS 전송과 TF 조회는 이 프리미티브 밖에 있습니다."
      eyebrow="LDS 3D / 프리미티브"
      meta="실제 WebGL · 프레임 해석 완료"
      title="MarkerLayer"
    >
      <TechnicalSection
        description="화살표, 자세 축, 선, 점, 텍스트, 볼륨은 서로 다른 형상 문법을 유지하며 선택 상태는 외곽 링으로도 구분됩니다."
        title="Marker 형상 계약"
      >
        <Stack gap="var(--space-4)">
          <SceneCanvas
            ariaLabel="MarkerLayer 실제 WebGL 검토 장면"
            devicePixelRatio={1}
            environment={{ sizeMeters: 14, minorSpacingMeters: 0.5, majorSpacingMeters: 2 }}
            focusBounds={TF_MARKER_BOUNDS}
            frame={TF_MARKER_MAP_FRAME}
            frameLoop="demand"
            homePose={HOME}
            profile="operational-neutral"
            renderQuality="balanced"
            style={{ height: "min(34rem, 62vw)", minHeight: "22rem" }}
            topBounds={TF_MARKER_BOUNDS}
          >
            <MarkerLayer
              freshnessPolicy={{ now: TF_MARKER_TIME, staleAfterSeconds: 0.25 }}
              maxMarkers={64}
              snapshot={TF_MARKER_LAYER}
            />
          </SceneCanvas>
          <DescriptionList
            columns={2}
            items={[
              { term: "장면 프레임", description: TF_MARKER_MAP_FRAME },
              { term: "소스 프레임", description: TF_MARKER_LAYER.frame },
              { term: "Marker", description: `${state.markerCount.toString()}개` },
              {
                term: "해석 상태",
                description: <StatusBadge tone={state.kind === "ready" ? "positive" : "cautionary"}>{state.kind}</StatusBadge>,
              },
            ]}
          />
        </Stack>
      </TechnicalSection>
      <PrimitiveReviewEvidence storyId="lds-3d-primitives-marker-layer--overview" />
    </TechnicalStoryLayout>
  );
}

export const Overview: Story = {
  name: "개요",
  parameters: primitiveReviewParameters("lds-3d-primitives-marker-layer--overview"),
  render: () => <MarkerLayerExperience />,
};
