import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack, StatusBadge } from "@lk-design-system/lds-core";
import { DescriptionList } from "@lk-design-system/lds-product";
import { Scene3DFrame } from "@lk-design-system/lds-product";
import {
  GoalMarker,
  OccupancyGridSurface,
  PathRibbon,
  SceneCanvas,
  type OccupancyGridRenderState,
} from "@lk-robotics/lds-3d-r3f";
import { useState } from "react";

import { TechnicalSection, TechnicalStoryLayout } from "./components.js";
import {
  FIXTURE_FRAMES,
  OCCUPANCY_GRID_BOUNDS,
  OCCUPANCY_GRID_CELL_COUNTS,
  OCCUPANCY_GRID_FREE_PATH,
  OCCUPANCY_GRID_GOAL,
  OCCUPANCY_GRID_HOME,
  ROTATED_OCCUPANCY_GRID_SNAPSHOT,
} from "./occupancy-grid-fixture.js";

const meta = {
  title: "LDS 3D/Scenes/Occupancy Grid",
  id: "lds-3d-scenes-occupancy-grid",
  parameters: { controls: { disable: true } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function OccupancyGridSceneExperience() {
  const [renderState, setRenderState] = useState<OccupancyGridRenderState | null>(null);
  const ready = renderState?.kind === "ready";

  return (
    <TechnicalStoryLayout
      description="회전된 점유 래스터와 같은 lk-core 프레임의 경로·목표를 한 장면에 배치해, 지도 원점 변환 이후에도 공간 프리미티브가 동일한 자유 셀에 정렬되는지 검토합니다. 명령 전송과 경로 계획은 제품 책임으로 남습니다."
      eyebrow="LDS 3D / 장면"
      meta="OccupancyGridSurface · PathRibbon · GoalMarker"
      title="점유 맵 공간 정합"
    >
      <TechnicalSection
        description="청록 경로는 세 개의 free 셀 중심을 지나며 마지막 셀의 목표 마커와 만납니다. 점유 셀은 색뿐 아니라 대각 패턴으로 구분됩니다."
        title="지도·경로·목표 통합"
      >
        <Stack gap="var(--space-4)">
          <Scene3DFrame
            appearance="dark"
            badges={
              <StatusBadge tone={ready ? "positive" : "cautionary"}>
                {ready ? "정합 준비됨" : "GPU 검사 중"}
              </StatusBadge>
            }
            hud={`${ROTATED_OCCUPANCY_GRID_SNAPSHOT.cellCount.toString()} cells · free path 3 points`}
            label="점유 맵과 경로 정합 WebGL 뷰포트"
            state="ready"
            status="lk-core · top view"
            style={{ height: "clamp(26rem, 72vw, 38rem)" }}
            title="Free-cell route"
          >
            <SceneCanvas
              ariaLabel="회전된 점유 맵의 자유 셀 위에 경로와 목표를 정합한 실제 WebGL 장면"
              defaultCameraMode="home"
              devicePixelRatio={1}
              environment={{
                sizeMeters: 8,
                minorSpacingMeters: 0.5,
                majorSpacingMeters: 2,
                showAxes: true,
                showFloor: false,
                showGrid: false,
              }}
              focusBounds={OCCUPANCY_GRID_BOUNDS}
              frame={FIXTURE_FRAMES.core}
              frameLoop="demand"
              homePose={OCCUPANCY_GRID_HOME}
              profile="operational-neutral"
              renderQuality="balanced"
              style={{
                height: "100%",
                minHeight: 0,
                borderRadius: 0,
              }}
              topBounds={OCCUPANCY_GRID_BOUNDS}
            >
              <OccupancyGridSurface
                elevationOffsetMeters={0.01}
                maxCells={64}
                onRenderStateChange={(state) => setRenderState(state)}
                snapshot={ROTATED_OCCUPANCY_GRID_SNAPSHOT}
              />
              <PathRibbon
                animated={false}
                elevationMeters={0.05}
                entity={OCCUPANCY_GRID_FREE_PATH}
                variant="planned"
              />
              <GoalMarker animated={false} entity={OCCUPANCY_GRID_GOAL} variant="valid" />
            </SceneCanvas>
          </Scene3DFrame>
          <DescriptionList
            columns={1}
            items={[
              { term: "정규화 프레임", description: FIXTURE_FRAMES.core },
              {
                term: "셀 분포",
                description: `occupied ${OCCUPANCY_GRID_CELL_COUNTS.occupied.toString()} · free ${OCCUPANCY_GRID_CELL_COUNTS.free.toString()} · unknown ${OCCUPANCY_GRID_CELL_COUNTS.unknown.toString()}`,
              },
              { term: "경로", description: "free 셀 중심 3점 · 계획 상태" },
              { term: "목표", description: "마지막 free 셀 · yaw +90°" },
              {
                term: "GPU 상태",
                description: (
                  <StatusBadge tone={ready ? "positive" : "cautionary"}>
                    {renderState?.kind ?? "pending"}
                  </StatusBadge>
                ),
              },
              {
                term: "책임 경계",
                description: "좌표·렌더링만 포함; planning·save·command 제외",
              },
            ]}
          />
        </Stack>
      </TechnicalSection>
    </TechnicalStoryLayout>
  );
}

export const Overview: Story = {
  name: "개요",
  render: () => <OccupancyGridSceneExperience />,
};
