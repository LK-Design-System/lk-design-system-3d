import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack, StatusBadge } from "@lk-robotics/lds-core";
import {
  createThreeSceneHost,
  type ThreeSceneHost,
} from "@lk-robotics/lds-3d-three";
import { entityId, frameId, quaternionFromYaw } from "@lk-robotics/lds-3d-core";
import { useEffect, useRef, useState } from "react";

import { TechnicalSection, TechnicalStoryLayout } from "./components.js";

const meta = {
  title: "LDS 3D/Foundations/Renderer Hosts/ThreeSceneHost",
  id: "lds-3d-foundations-three-scene-host",
  parameters: { controls: { disable: true } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const MAP = frameId("raw-three-map");

function rendererStatusTone(status: string):
  | "positive"
  | "cautionary"
  | "negative"
  | "offline" {
  switch (status) {
    case "ready":
      return "positive";
    case "lost":
    case "error":
      return "negative";
    case "paused":
    case "disposed":
      return "offline";
    default:
      return "cautionary";
  }
}

function rendererStatusLabel(status: string): string {
  switch (status) {
    case "ready":
      return "준비됨";
    case "lost":
      return "컨텍스트 손실";
    case "error":
      return "오류";
    case "paused":
      return "일시 정지";
    case "disposed":
      return "해제됨";
    default:
      return status;
  }
}

function RawThreeHostFixture(): React.ReactNode {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState("렌더러 초기화 중");
  const [selection, setSelection] = useState("공간 선택 없음");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return undefined;

    const host: ThreeSceneHost = createThreeSceneHost({
      canvas,
      frame: MAP,
      renderMode: "demand",
      camera: {
        homeState: {
          frame: MAP,
          position: [8, -10, 7],
          target: [0, 0, 0.4],
          up: [0, 0, 1],
          projection: {
            kind: "perspective",
            verticalFovRadians: Math.PI / 4,
            aspect: 16 / 9,
            nearMeters: 0.05,
            farMeters: 200,
          },
        },
      },
    });
    host.updateEntities([
      {
        kind: "robot",
        id: entityId("raw-amr-01"),
        pose: {
          frame: MAP,
          position: [0, 0, 0.35],
          orientation: quaternionFromYaw(Math.PI / 5),
        },
      },
      {
        kind: "goal",
        id: entityId("raw-goal-01"),
        pose: {
          frame: MAP,
          position: [3.5, 2, 0.1],
          orientation: [0, 0, 0, 1],
        },
        radiusMeters: 0.5,
      },
      {
        kind: "landmark",
        id: entityId("raw-landmark-01"),
        pose: {
          frame: MAP,
          position: [-2.5, 1.5, 0.2],
          orientation: [0, 0, 0, 1],
        },
        label: "도크 03",
      },
      {
        kind: "path",
        id: entityId("raw-path-01"),
        frame: MAP,
        points: [
          [-3, -2, 0.04],
          [-1, -1, 0.04],
          [1, 0, 0.04],
          [3.5, 2, 0.04],
        ],
      },
    ]);

    const resize = (): void => {
      host.resize(
        Math.max(1, canvas.clientWidth),
        Math.max(1, canvas.clientHeight),
        Math.min(window.devicePixelRatio || 1, 2),
      );
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();
    const unsubscribeStatus = host.subscribeStatus((next) => setStatus(next.state));
    const unsubscribeSpatial = host.subscribeSpatialEvent((event) => {
      setSelection(event.hits[0]?.entityId ?? "공간 선택 없음");
    });
    const pick = (event: PointerEvent): void => {
      const bounds = canvas.getBoundingClientRect();
      host.pick({
        viewportPoint: {
          xCssPixels: event.clientX - bounds.left,
          yCssPixels: event.clientY - bounds.top,
        },
        viewport: {
          widthCssPixels: bounds.width,
          heightCssPixels: bounds.height,
          devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        },
      });
    };
    canvas.addEventListener("pointerdown", pick);

    return () => {
      canvas.removeEventListener("pointerdown", pick);
      unsubscribeSpatial();
      unsubscribeStatus();
      resizeObserver.disconnect();
      host.dispose();
    };
  }, []);

  return (
    <Stack gap="var(--space-4)">
      <canvas
        ref={canvasRef}
        aria-label="Raw Three 장면 호스트 기술 예제"
        style={{
          display: "block",
          width: "100%",
          height: "min(32rem, 62vw)",
          minHeight: "22rem",
          borderRadius: "var(--radius-lg)",
        }}
      />
      <Stack direction="row" gap="var(--space-2)" align="center" wrap>
        <StatusBadge tone={rendererStatusTone(status)}>{rendererStatusLabel(status)}</StatusBadge>
        <StatusBadge tone="signal">{selection}</StatusBadge>
      </Stack>
    </Stack>
  );
}

export const Overview: Story = {
  name: "개요",
  render: () => (
    <TechnicalStoryLayout
      eyebrow="LDS 3D / 기반"
      title="명령형 Three 장면 호스트"
      description="렌더러에 독립적인 raw Three 어댑터의 기술 WebGL 예제입니다. 형상을 클릭하면 코어 프레임 레이캐스팅을 확인할 수 있고 DOM 요약에 지속적인 선택 결과가 표시됩니다."
      meta="실제 WebGL · 제품 워크플로와 사용자 정의 앱 크롬 없음"
    >
      <TechnicalSection
        title="코어-Three 호스트"
        description="호스트는 고정 좌표 기준, 카메라 상태, 대체 프리미티브, 요청 기반 렌더링, 크기 조절, 리소스 해제를 소유합니다. 제품 페이지나 LDS 통합 예제가 아닙니다."
      >
        <RawThreeHostFixture />
      </TechnicalSection>
    </TechnicalStoryLayout>
  ),
};
