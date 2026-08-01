import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@lk-design-system/lds-core";
import { DescriptionList } from "@lk-design-system/lds-product";
import { SceneCanvas, VoxelLayer, type SceneCameraPose } from "@lk-robotics/lds-3d-r3f";
import { bounds3, frameId } from "@lk-robotics/lds-3d-core";

import { TechnicalSection, TechnicalStoryLayout } from "./components.js";
import { primitiveReviewParameters } from "./primitives.stories.js";

const meta = {
  title: "LDS 3D/Primitives/VoxelLayer",
  id: "lds-3d-primitives-voxel-layer",
  parameters: { controls: { disable: true } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const FRAME = frameId("lk-map");
const BOUNDS = bounds3(FRAME, [-2.5, -2.5, 0], [2.5, 2.5, 1.8]);
const HOME: SceneCameraPose = {
  position: [3.8, -4.4, 3.2],
  target: [0, 0, 0.5],
  up: [0, 0, 1],
};

function rampCenters(resolution: number): Float32Array {
  const centers: number[] = [];
  for (let column = 0; column < 14; column += 1) {
    const height = 1 + Math.round(Math.abs(Math.sin(column * 0.9)) * 6);
    for (let level = 0; level < height; level += 1) {
      centers.push(
        -1.3 + column * resolution * 1.4,
        Math.sin(column * 1.7) * 0.9,
        resolution / 2 + level * resolution,
      );
    }
  }
  return new Float32Array(centers);
}

const RAMP_SNAPSHOT = { frame: FRAME, resolutionMeters: 0.16, centers: rampCenters(0.16) };
const SPARSE_SNAPSHOT = {
  frame: FRAME,
  resolutionMeters: 0.24,
  centers: new Float32Array([1.6, 1.4, 0.12, 1.6, 1.4, 0.36, -1.8, 1.5, 0.12]),
};

function VoxelLayerExperience() {
  const rampCount = RAMP_SNAPSHOT.centers.length / 3;
  return (
    <TechnicalStoryLayout
      description="인스턴스드 3D 점유 복셀입니다. 복셀화·프레이밍·예산은 호출자 소유이고, 레이어는 검증된 중심점 목록만 정확히 렌더합니다. 예산 초과 스냅샷은 조용히 잘리는 대신 계약 오류로 거부됩니다."
      eyebrow="LDS 3D / Primitives"
      meta={`복셀 ${String(rampCount + 3)}개 · 실제 WebGL`}
      title="VoxelLayer"
    >
      <TechnicalSection
        description="해상도가 다른 두 스냅샷(0.16m 램프, 0.24m 희소 마커)을 같은 장면에서 검토합니다. 중심점은 레이어 프레임 기준이며 배치는 position/orientation으로 주입합니다."
        title="해상도·밀도 변형"
      >
        <Stack gap="var(--space-4)">
          <SceneCanvas
            ariaLabel="VoxelLayer 변형 실제 WebGL 장면"
            devicePixelRatio={1}
            environment={{ sizeMeters: 8, minorSpacingMeters: 0.5, majorSpacingMeters: 2 }}
            focusBounds={BOUNDS}
            frame={FRAME}
            frameLoop="demand"
            homePose={HOME}
            profile="diagnostic-technical"
            renderQuality="balanced"
            style={{ height: "min(36rem, 64vw)", minHeight: "22rem" }}
            topBounds={BOUNDS}
          >
            <VoxelLayer maxVoxels={256} snapshot={RAMP_SNAPSHOT} />
            <VoxelLayer color="#7c5cff" maxVoxels={8} opacity={1} snapshot={SPARSE_SNAPSHOT} />
          </SceneCanvas>
          <DescriptionList
            columns={2}
            items={[
              { term: "렌더링", description: "InstancedMesh · 스냅샷당 드로우 1회" },
              { term: "예산", description: `${String(rampCount)}/256 · 3/8 (명시적 maxVoxels)` },
              { term: "검증", description: "유한 xyz 3중항 · 해상도 > 0 · 예산 초과 거부" },
              { term: "복셀화", description: "미포함 — 점유 판정과 다운샘플은 호출자 소유" },
            ]}
          />
        </Stack>
      </TechnicalSection>
    </TechnicalStoryLayout>
  );
}

export const Overview: Story = {
  name: "개요",
  parameters: primitiveReviewParameters("lds-3d-primitives-voxel-layer--overview"),
  render: () => <VoxelLayerExperience />,
};
