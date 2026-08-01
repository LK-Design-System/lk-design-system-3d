import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@lk-design-system/lds-core";
import { DescriptionList } from "@lk-design-system/lds-product";
import { CameraFrustum, SceneCanvas, type SceneCameraPose } from "@lk-robotics/lds-3d-r3f";
import { bounds3, entityId, frameId, quaternionFromYaw } from "@lk-robotics/lds-3d-core";

import { TechnicalSection, TechnicalStoryLayout } from "./components.js";
import { primitiveReviewParameters } from "./primitives.stories.js";

const meta = {
  title: "LDS 3D/Primitives/CameraFrustum",
  id: "lds-3d-primitives-camera-frustum",
  parameters: { controls: { disable: true } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const FRAME = frameId("lk-map");
const BOUNDS = bounds3(FRAME, [-3, -3, 0], [3, 3, 2]);
const HOME: SceneCameraPose = {
  position: [4.6, -5.2, 3.8],
  target: [0.6, 0, 0.6],
  up: [0, 0, 1],
};

function CameraFrustumExperience() {
  return (
    <TechnicalStoryLayout
      description="검증된 내재 파라미터(fovY·aspect·near·far)에서 파생된 와이어프레임 프러스텀입니다. 광축은 로컬 +X이고, 이미지 콘텐츠는 가져오지 않습니다 — 텍스처 전송은 제품 소유입니다."
      eyebrow="LDS 3D / Primitives"
      meta="변형 3종 · 실제 WebGL"
      title="CameraFrustum"
    >
      <TechnicalSection
        description="넓은 전방 카메라, 좁은 망원, far 평면 채움을 끈 깊이 센서를 같은 장면에서 비교합니다. 잘못된 내재 파라미터는 마운트 전에 계약 오류로 거부됩니다."
        title="내재 파라미터 변형"
      >
        <Stack gap="var(--space-4)">
          <SceneCanvas
            ariaLabel="CameraFrustum 변형 실제 WebGL 장면"
            devicePixelRatio={1}
            environment={{ sizeMeters: 10, minorSpacingMeters: 0.5, majorSpacingMeters: 2 }}
            focusBounds={BOUNDS}
            frame={FRAME}
            frameLoop="demand"
            homePose={HOME}
            profile="diagnostic-technical"
            renderQuality="balanced"
            style={{ height: "min(36rem, 64vw)", minHeight: "22rem" }}
            topBounds={BOUNDS}
          >
            <CameraFrustum
              aspect={16 / 9}
              entityId={entityId("sensor/wide")}
              farMeters={2.6}
              fovYRadians={1.2}
              nearMeters={0.2}
              position={[0, 0, 0.7]}
            />
            <CameraFrustum
              aspect={16 / 9}
              color="#7c5cff"
              entityId={entityId("sensor/tele")}
              farMeters={3}
              fovYRadians={0.4}
              nearMeters={0.4}
              orientation={quaternionFromYaw(0.9)}
              position={[-0.4, -0.9, 0.9]}
            />
            <CameraFrustum
              aspect={1}
              color="#f0b429"
              entityId={entityId("sensor/depth")}
              farMeters={1.4}
              fovYRadians={1.4}
              nearMeters={0.1}
              orientation={quaternionFromYaw(-2.2)}
              position={[0.8, 0.9, 0.5]}
              showFarPlane={false}
            />
          </SceneCanvas>
          <DescriptionList
            columns={2}
            items={[
              { term: "광축 규약", description: "로컬 +X 전방 · +Z 상단 (REP-103)" },
              { term: "검증", description: "fovY ∈ (0, π) · aspect > 0 · near < far" },
              { term: "far 평면", description: "선택적 반투명 채움 (showFarPlane)" },
              { term: "이미지 플레인", description: "미포함 — 텍스처 전송은 제품 소유" },
            ]}
          />
        </Stack>
      </TechnicalSection>
    </TechnicalStoryLayout>
  );
}

export const Overview: Story = {
  name: "개요",
  parameters: primitiveReviewParameters("lds-3d-primitives-camera-frustum--overview"),
  render: () => <CameraFrustumExperience />,
};
