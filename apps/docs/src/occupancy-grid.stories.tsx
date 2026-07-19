import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, Stack, StatusBadge } from "@lk-robotics/lds-core";
import { DescriptionList } from "@lk-robotics/lds-product";
import { Scene3DFrame } from "@lk-robotics/lds-robotics-ui";
import {
  OccupancyGridSurface,
  SceneCanvas,
  type OccupancyGridCellPointerDetail,
  type OccupancyGridRenderState,
} from "@lk-robotics/design-system-3d-r3f";
import {
  occupancyCellDataIndex,
  occupancyCellToImagePixel,
  occupancyDataIndexToCell,
  type OccupancyGridCell,
} from "@lk-robotics/design-system-3d-core";
import { useState } from "react";

import { TechnicalSection, TechnicalStoryLayout } from "./components.js";
import {
  FIXTURE_FRAMES,
  OCCUPANCY_GRID_BOUNDS,
  OCCUPANCY_GRID_HOME,
  ROTATED_OCCUPANCY_GRID_FIXTURE,
  ROTATED_OCCUPANCY_GRID_SNAPSHOT,
} from "./occupancy-grid-fixture.js";
import { PrimitiveReviewEvidence, primitiveReviewParameters } from "./primitives.stories.js";

const STORY_ID = "lds-3d-primitives-occupancy-grid-surface--overview";
const MAX_CELLS = 64;

const meta = {
  title: "LDS 3D/Primitives/OccupancyGridSurface",
  id: "lds-3d-primitives-occupancy-grid-surface",
  excludeStories: /.*Experience$/,
  parameters: { controls: { disable: true } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function renderStateLabel(state: OccupancyGridRenderState | null): string {
  if (state === null) return "GPU 검사 대기";
  switch (state.kind) {
    case "ready":
      return `${state.acceptedCellCount.toString()}셀 렌더링`;
    case "frame-mismatch":
      return "프레임 불일치";
    case "budget-exceeded":
      return "셀 예산 초과";
    case "texture-dimension-exceeded":
      return "텍스처 크기 초과";
  }
}

function renderStateTone(
  state: OccupancyGridRenderState | null,
): "positive" | "cautionary" | "negative" {
  if (state === null) return "cautionary";
  return state.kind === "ready"
    ? "positive"
    : state.kind === "frame-mismatch"
      ? "negative"
      : "cautionary";
}

function cellLabel(cell: OccupancyGridCell | null): string {
  if (cell === null) return "없음";
  const snapshot = ROTATED_OCCUPANCY_GRID_SNAPSHOT;
  const dataIndex = occupancyCellDataIndex(snapshot.geometry, cell);
  const imagePixel = occupancyCellToImagePixel(snapshot.geometry, cell);
  const state = snapshot.cellStates[dataIndex];
  const stateLabel = state === 0 ? "unknown" : state === 1 ? "free" : "occupied";
  return `cell (${cell.column.toString()}, ${cell.row.toString()}) · image row ${imagePixel.rowFromTop.toString()} · ${stateLabel}`;
}

function cellDetailLabel(detail: OccupancyGridCellPointerDetail | null): string {
  return cellLabel(detail?.cell ?? null);
}

export function OccupancyGridSurfaceExperience() {
  const [renderState, setRenderState] = useState<OccupancyGridRenderState | null>(null);
  const [hoveredCell, setHoveredCell] = useState<OccupancyGridCellPointerDetail | null>(null);
  const [selectedCell, setSelectedCell] = useState<OccupancyGridCell | null>(null);
  const geometry = ROTATED_OCCUPANCY_GRID_SNAPSHOT.geometry;
  const selectNextCell = (): void => {
    setSelectedCell((current) => {
      const currentIndex =
        current === null
          ? -1
          : occupancyCellDataIndex(ROTATED_OCCUPANCY_GRID_SNAPSHOT.geometry, current);
      return occupancyDataIndexToCell(
        ROTATED_OCCUPANCY_GRID_SNAPSHOT.geometry,
        (currentIndex + 1) % ROTATED_OCCUPANCY_GRID_SNAPSHOT.cellCount,
      );
    });
  };

  return (
    <TechnicalStoryLayout
      description="ROS 행 우선 셀 배열을 하단-좌측 그리드 좌표로 정규화하고, 원점의 이동과 +90° 회전을 보존한 단일 WebGL 래스터입니다. 파일 파싱·저장·제품 편집 도구는 이 프리미티브의 책임이 아닙니다."
      eyebrow="LDS 3D / 프리미티브"
      meta="실제 WebGL · 12셀 · 회전 원점"
      title="OccupancyGridSurface"
    >
      <TechnicalSection
        description="비대칭 4×3 fixture는 이미지 상단 행과 그리드 하단 행의 차이, ROS row-major 순서, 원점 yaw 누락을 드러냅니다. 셀을 가리키거나 선택하면 동일한 코어 피킹 결과가 DOM 요약과 WebGL 외곽선에 반영됩니다."
        title="점유 좌표 및 GPU 계약"
      >
        <Stack gap="var(--space-4)">
          <Scene3DFrame
            appearance="dark"
            badges={
              <StatusBadge tone={renderStateTone(renderState)}>
                {renderStateLabel(renderState)}
              </StatusBadge>
            }
            hud={`${geometry.widthCells.toString()} × ${geometry.heightCells.toString()} · ${geometry.resolutionMeters.toString()} m/cell`}
            label="회전된 점유 그리드 WebGL 뷰포트"
            state="ready"
            status="lk-core · origin yaw +90°"
            style={{ height: "clamp(24rem, 68vw, 34rem)" }}
            title="rotated-occupancy-grid"
          >
            <SceneCanvas
              ariaLabel="+90도 회전 원점과 이미지 Y 반전을 확인하는 실제 WebGL 점유 그리드"
              defaultCameraMode="home"
              devicePixelRatio={1}
              enableOrbit
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
              profile="diagnostic-technical"
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
                maxCells={MAX_CELLS}
                onCellHoverChange={setHoveredCell}
                onCellPick={(detail) => setSelectedCell(detail.cell)}
                onRenderStateChange={(state) => setRenderState(state)}
                selectedCell={selectedCell}
                snapshot={ROTATED_OCCUPANCY_GRID_SNAPSHOT}
              />
            </SceneCanvas>
          </Scene3DFrame>
          <Stack direction="row" gap="var(--space-2)" wrap>
            <Button size="sm" variant="secondary" onClick={selectNextCell}>
              다음 셀 선택
            </Button>
            <Button
              disabled={selectedCell === null}
              size="sm"
              variant="ghost"
              onClick={() => setSelectedCell(null)}
            >
              선택 해제
            </Button>
          </Stack>
          <span aria-live="polite" className="lds3d-visually-hidden">
            {`선택 셀: ${cellLabel(selectedCell)}`}
          </span>
          <DescriptionList
            columns={1}
            items={[
              {
                term: "프레임",
                description: `${geometry.gridToFrame.sourceFrame} → ${geometry.gridToFrame.targetFrame}`,
              },
              { term: "원점", description: "[10, 20, 0] · yaw +90°" },
              {
                term: "이미지 Y",
                description: `top row 0 → cell row ${ROTATED_OCCUPANCY_GRID_FIXTURE.probes[0]?.expectedCell.row.toString() ?? "—"}`,
              },
              {
                term: "GPU 예산",
                description: `${ROTATED_OCCUPANCY_GRID_SNAPSHOT.cellCount.toString()} / ${MAX_CELLS.toString()} cells`,
              },
              {
                term: "렌더 상태",
                description: (
                  <StatusBadge tone={renderStateTone(renderState)}>
                    {renderStateLabel(renderState)}
                  </StatusBadge>
                ),
              },
              { term: "호버 셀", description: cellDetailLabel(hoveredCell) },
              { term: "선택 셀", description: cellLabel(selectedCell) },
              {
                term: "접근성 보완",
                description: "이름 있는 canvas와 동일 좌표·선택·예산의 DOM 요약",
              },
            ]}
          />
        </Stack>
      </TechnicalSection>
      <PrimitiveReviewEvidence storyId={STORY_ID} />
    </TechnicalStoryLayout>
  );
}

export const Overview: Story = {
  name: "개요",
  parameters: primitiveReviewParameters("lds-3d-primitives-occupancy-grid-surface--overview"),
  render: () => <OccupancyGridSurfaceExperience />,
};
