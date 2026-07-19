import type { Meta, StoryObj } from "@storybook/react-vite";
import { DescriptionList, Stack, StatusBadge } from "@lk-robotics/design-system-core";
import { MarkerLayer, PointCloudLayers, SceneCanvas, type SceneCameraPose } from "@lk-robotics/design-system-3d-r3f";

import { TechnicalSection, TechnicalStoryLayout } from "./components.js";
import {
  TF_MARKER_BOUNDS,
  TF_MARKER_GRAPH,
  TF_MARKER_LAYER,
  TF_MARKER_MAP_FRAME,
  TF_MARKER_POINT_CLOUD_LAYER,
  TF_MARKER_TIME,
} from "./tf-marker-fixture.js";

const meta = {
  title: "LDS 3D/Scenes/TF and Marker",
  id: "lds-3d-scenes-tf-marker",
  parameters: { controls: { disable: true } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const HOME: SceneCameraPose = {
  position: [8.8, -10.8, 7.5],
  target: [1.1, 0.25, 0.6],
  up: [0, 0, 1],
};

function TfMarkerSceneExperience() {
  return (
    <TechnicalStoryLayout
      description="동일한 ROS 시각에서 lidar-front와 base-link를 lk-map으로 해석해 PointCloud와 Marker를 한 장면에 배치합니다. 구독·재시도·토픽 보존 정책은 포함하지 않습니다."
      eyebrow="LDS 3D / 장면"
      meta="TF 2 edges · PointCloud 1 layer · Marker 6"
      title="TF + Marker 정합 장면"
    >
      <TechnicalSection
        description="frame graph가 계산한 두 sourceToScene 변환을 각 renderer-neutral snapshot에 명시적으로 주입합니다."
        title="동일 시각 공간 정합"
      >
        <Stack gap="var(--space-4)">
          <SceneCanvas
            ariaLabel="TF로 정합된 PointCloud와 Marker 실제 WebGL 장면"
            devicePixelRatio={1}
            environment={{ sizeMeters: 16, minorSpacingMeters: 0.5, majorSpacingMeters: 2 }}
            focusBounds={TF_MARKER_BOUNDS}
            frame={TF_MARKER_MAP_FRAME}
            frameLoop="demand"
            homePose={HOME}
            profile="diagnostic-technical"
            renderQuality="balanced"
            style={{ height: "min(40rem, 68vw)", minHeight: "25rem" }}
            topBounds={TF_MARKER_BOUNDS}
          >
            <PointCloudLayers
              layers={[
                {
                  layer: TF_MARKER_POINT_CLOUD_LAYER,
                  colorMode: "height",
                  fallbackColor: "#43d9ff",
                  heightRange: [0, 2],
                  pointSize: 1.8,
                  opacity: 0.76,
                },
              ]}
              maxPoints={10_000}
            />
            <MarkerLayer
              freshnessPolicy={{ now: TF_MARKER_TIME, staleAfterSeconds: 0.25 }}
              maxMarkers={64}
              snapshot={TF_MARKER_LAYER}
            />
          </SceneCanvas>
          <DescriptionList
            columns={2}
            items={[
              { term: "조회 시각", description: `${TF_MARKER_TIME.sec.toString()}.${TF_MARKER_TIME.nsec.toString().padStart(9, "0")} s` },
              { term: "장면 프레임", description: TF_MARKER_MAP_FRAME },
              { term: "TF edge", description: `${TF_MARKER_GRAPH.edges.length.toString()}개` },
              { term: "결과", description: <StatusBadge tone="positive">정합 완료</StatusBadge> },
            ]}
          />
        </Stack>
      </TechnicalSection>
    </TechnicalStoryLayout>
  );
}

export const Overview: Story = {
  name: "개요",
  render: () => <TfMarkerSceneExperience />,
};
