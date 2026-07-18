import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack, StatusBadge } from "@lk-robotics/design-system-core";
import {
  createThreeSceneHost,
  type ThreeSceneHost,
} from "@lk-robotics/design-system-3d-three";
import { entityId, frameId, quaternionFromYaw } from "@lk-robotics/design-system-3d-core";
import { useEffect, useRef, useState } from "react";

import { TechnicalSection, TechnicalStoryLayout } from "./components.js";

const meta = {
  title: "LDS 3D/Foundations",
  id: "foundations",
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

function RawThreeHostFixture(): React.ReactNode {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState("Initializing renderer");
  const [selection, setSelection] = useState("No spatial selection");

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
        label: "Dock 03",
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
      setSelection(event.hits[0]?.entityId ?? "No spatial selection");
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
        aria-label="Raw Three scene host technical fixture"
        style={{
          display: "block",
          width: "100%",
          height: "min(32rem, 62vw)",
          minHeight: "22rem",
          borderRadius: "var(--radius-lg)",
        }}
      />
      <Stack direction="row" gap="var(--space-2)" align="center" wrap>
        <StatusBadge tone={rendererStatusTone(status)}>{status}</StatusBadge>
        <StatusBadge tone="signal">{selection}</StatusBadge>
      </Stack>
    </Stack>
  );
}

export const RawThreeSceneHost: Story = {
  name: "Raw Three Scene Host",
  render: () => (
    <TechnicalStoryLayout
      eyebrow="LDS 3D / Foundations"
      title="Imperative Three Scene Host"
      description="A technical WebGL fixture for the renderer-neutral raw Three adapter. Click geometry to exercise core-frame raycasting; the DOM summary reflects the persistent pick result."
      meta="Actual WebGL, no product workflow or custom application chrome"
    >
      <TechnicalSection
        title="Core-to-Three host"
        description="The host owns the fixed basis, camera state, fallback primitives, demand rendering, resize, and resource disposal. This is not a product page or an LDS integration example."
      >
        <RawThreeHostFixture />
      </TechnicalSection>
    </TechnicalStoryLayout>
  ),
};
