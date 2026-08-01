import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack, StatusBadge } from "@lk-design-system/lds-core";
import { DescriptionList } from "@lk-design-system/lds-product";
import {
  CameraFrustum,
  PointCloudLayers,
  SceneCanvas,
  VoxelLayer,
  type SceneCameraPose,
} from "@lk-robotics/lds-3d-r3f";
import {
  createPointCloudLayerSnapshot,
  createPointCloudSnapshot,
  createSegmentationColors,
  DEFAULT_SEGMENTATION_PALETTE,
} from "@lk-robotics/lds-3d-pointcloud";
import {
  bounds3,
  entityId,
  frameId,
  identityTransform,
  layerId,
  quaternionFromYaw,
} from "@lk-robotics/lds-3d-core";

import { TechnicalSection, TechnicalStoryLayout } from "./components.js";

const meta = {
  title: "LDS 3D/Scenes/Sensor Overlays",
  id: "lds-3d-scenes-sensor-overlays",
  parameters: { controls: { disable: true } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const SENSOR_FRAME = frameId("lk-map");
const SENSOR_BOUNDS = bounds3(SENSOR_FRAME, [-4, -4, 0], [4, 4, 2.4]);
const HOME: SceneCameraPose = {
  position: [6.4, -7.2, 5.2],
  target: [0.4, 0.2, 0.6],
  up: [0, 0, 1],
};

/** Deterministic segmented sweep: label = 반경 밴드, 검사 가능한 순수 데이터. */
function createSegmentedCloud() {
  const pointCount = 4_000;
  const positions = new Float32Array(pointCount * 3);
  const labels = new Uint8Array(pointCount);
  for (let index = 0; index < pointCount; index += 1) {
    const angle = index * 2.399963229728653;
    const radius = 0.9 + (index % 31) * 0.075;
    positions[index * 3] = Math.cos(angle) * radius;
    positions[index * 3 + 1] = Math.sin(angle) * radius;
    positions[index * 3 + 2] = (index % 23) * 0.045;
    labels[index] = radius < 1.6 ? 0 : radius < 2.4 ? 1 : radius < 2.9 ? 3 : 7;
  }
  return createPointCloudSnapshot({
    frame: SENSOR_FRAME,
    positions,
    colors: createSegmentationColors(labels),
    revision: "sensor-overlays-segmented",
  });
}

const SEGMENTED_LAYER = createPointCloudLayerSnapshot({
  id: layerId("/perception/segmentation"),
  snapshot: createSegmentedCloud(),
  sourceToScene: identityTransform(SENSOR_FRAME),
});

/** Deterministic voxel blob: 장애물 기둥 두 개와 낮은 벽. */
function createVoxelCenters(): Float32Array {
  const centers: number[] = [];
  const resolution = 0.15;
  for (let level = 0; level < 8; level += 1) {
    for (let ring = 0; ring < 3; ring += 1) {
      centers.push(1.8 + ring * resolution, 1.1, resolution / 2 + level * resolution);
      centers.push(-1.4, -1.6 + ring * resolution, resolution / 2 + level * resolution);
    }
  }
  for (let along = 0; along < 12; along += 1) {
    for (let level = 0; level < 3; level += 1) {
      centers.push(-2.4 + along * resolution, 2.2, resolution / 2 + level * resolution);
    }
  }
  return new Float32Array(centers);
}

const VOXEL_SNAPSHOT = {
  frame: SENSOR_FRAME,
  resolutionMeters: 0.15,
  centers: createVoxelCenters(),
};

function SensorOverlaysExperience() {
  const voxelCount = VOXEL_SNAPSHOT.centers.length / 3;
  return (
    <TechnicalStoryLayout
      description="세그멘테이션 포인트 클라우드, 3D 복셀 점유, 카메라 프러스텀을 한 장면에 정합합니다. 모든 입력은 호출자가 이미 변환·검증한 스냅샷이며 구독·재시도·보존 정책은 포함하지 않습니다."
      eyebrow="LDS 3D / 장면"
      meta={`분할 점 4,000개 · 복셀 ${String(voxelCount)}개 · 프러스텀 2개`}
      title="센서 오버레이 정합 장면"
    >
      <TechnicalSection
        description="세그멘테이션은 렌더링 모드가 아니라 데이터 변환입니다: 클래스 라벨이 팔레트 색으로 바뀌어 기존 colors 채널로 흐르고, 복셀·프러스텀은 명시적 예산과 검증된 내재 파라미터만 받습니다."
        title="다중 센서 계약 조합"
      >
        <Stack gap="var(--space-4)">
          <SceneCanvas
            ariaLabel="센서 오버레이 실제 WebGL 장면"
            devicePixelRatio={1}
            environment={{ sizeMeters: 12, minorSpacingMeters: 0.5, majorSpacingMeters: 2 }}
            focusBounds={SENSOR_BOUNDS}
            frame={SENSOR_FRAME}
            frameLoop="demand"
            homePose={HOME}
            profile="diagnostic-technical"
            renderQuality="balanced"
            style={{ height: "min(40rem, 68vw)", minHeight: "25rem" }}
            topBounds={SENSOR_BOUNDS}
          >
            <PointCloudLayers
              layers={[
                {
                  layer: SEGMENTED_LAYER,
                  colorMode: "source",
                  fallbackColor: "#8c9296",
                  pointSize: 1.9,
                  opacity: 0.9,
                },
              ]}
              maxPoints={10_000}
            />
            <VoxelLayer maxVoxels={128} snapshot={VOXEL_SNAPSHOT} opacity={0.82} />
            <CameraFrustum
              aspect={16 / 9}
              entityId={entityId("sensor/front-camera")}
              farMeters={3.2}
              fovYRadians={1.0}
              nearMeters={0.25}
              orientation={quaternionFromYaw(0.35)}
              position={[0.3, -0.2, 0.8]}
            />
            <CameraFrustum
              aspect={1}
              color="#f0b429"
              entityId={entityId("sensor/dock-depth")}
              farMeters={1.6}
              fovYRadians={1.35}
              nearMeters={0.1}
              orientation={quaternionFromYaw(Math.PI - 0.4)}
              position={[-0.6, 0.7, 0.55]}
              showFarPlane={false}
            />
          </SceneCanvas>
          <DescriptionList
            columns={2}
            items={[
              {
                term: "세그멘테이션",
                description: `클래스 4종 · 팔레트 ${String(DEFAULT_SEGMENTATION_PALETTE.length)}색 순환`,
              },
              { term: "복셀 예산", description: `${String(voxelCount)} / 128` },
              { term: "프러스텀", description: "전방 카메라 16:9 · 도킹 깊이 1:1" },
              {
                term: "정합",
                description: <StatusBadge tone="positive">단일 프레임 · lk-map</StatusBadge>,
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
  render: () => <SensorOverlaysExperience />,
};
