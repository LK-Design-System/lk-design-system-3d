import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatusBadge } from "@lk-robotics/lds-core";
import { DescriptionList } from "@lk-robotics/lds-product";
import {
  PointCloudLayer,
  SceneCanvas,
  type SceneCameraPose,
} from "@lk-robotics/design-system-3d-r3f";
import {
  resolvePointCloudRenderState,
  type PointCloudRenderState,
} from "@lk-robotics/design-system-3d-pointcloud";
import { useCallback, useState, type ReactNode } from "react";

import {
  POINT_CLOUD_FOCUS_BOUNDS,
  POINT_CLOUD_FRAME,
  POINT_CLOUD_READY,
} from "./pointcloud-fixture.js";
import { LdsFocusedViewerPage, type VisualCameraMode } from "./visual-alpha-ui.js";

const meta = {
  title: "LDS 3D/Scenes/PointCloud Foundation",
  id: "lds-3d-scenes-point-cloud-foundation",
  parameters: {
    canvasShell: "flush",
    controls: { disable: true },
    layout: "fullscreen",
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const POINT_CLOUD_HOME: SceneCameraPose = {
  position: [9.5, -11, 8.5],
  target: [0, 0, 0.85],
  up: [0, 0, 1],
};

function pointCloudTone(
  state: PointCloudRenderState,
): "positive" | "cautionary" | "negative" | "offline" {
  switch (state.kind) {
    case "ready":
      return "positive";
    case "empty":
      return "offline";
    case "budget-exceeded":
      return "cautionary";
    case "frame-mismatch":
      return "negative";
  }
}

function PointCloudFoundationExperience(): ReactNode {
  const [cameraMode, setCameraMode] = useState<VisualCameraMode>("home");
  const [renderState, setRenderState] = useState<PointCloudRenderState>(() =>
    resolvePointCloudRenderState(POINT_CLOUD_READY, POINT_CLOUD_FRAME, 50_000),
  );
  const reportRenderState = useCallback((state: PointCloudRenderState) => {
    setRenderState(state);
  }, []);

  return (
    <LdsFocusedViewerPage
      cameraMode={cameraMode}
      description="LDS composition evidence for the PointCloudLayer atom. The viewer receives a frame-safe, caller-owned static snapshot; product transport, TF, commands, and workflows are intentionally absent."
      onCameraModeChange={setCameraMode}
      pageTitle="PointCloud Foundation"
      profile="diagnostic"
      sceneTitle="Point-cloud snapshot / LK-MAP"
      storyMeta={
        <>
          <span>P1 Foundation 0</span>
          <span aria-hidden="true">-</span>
          <span>{POINT_CLOUD_READY.pointCount.toLocaleString()} RGB points</span>
        </>
      }
      reviewControls={
        <DescriptionList
          columns={1}
          items={[
            { term: "Snapshot frame", description: POINT_CLOUD_FRAME },
            { term: "Budget", description: "50,000 points" },
            {
              term: "Layer eligibility",
              description: (
                <StatusBadge tone={pointCloudTone(renderState)}>{renderState.kind}</StatusBadge>
              ),
            },
          ]}
        />
      }
    >
      <SceneCanvas
        ariaLabel="PointCloud Foundation actual WebGL scene"
        cameraMode={cameraMode}
        devicePixelRatio={1}
        environment={{
          sizeMeters: 18,
          minorSpacingMeters: 0.5,
          majorSpacingMeters: 2,
          shadowMapSize: 1024,
        }}
        focusBounds={POINT_CLOUD_FOCUS_BOUNDS}
        frame={POINT_CLOUD_FRAME}
        frameLoop="demand"
        homePose={POINT_CLOUD_HOME}
        profile="diagnostic-technical"
        renderQuality="balanced"
        renderState={{ kind: "ready" }}
        style={{ height: "100%", minHeight: 480, borderRadius: 0 }}
        topBounds={POINT_CLOUD_FOCUS_BOUNDS}
      >
        <PointCloudLayer
          fallbackColor="#6cb6ff"
          maxPoints={50_000}
          pointSize={1.75}
          snapshot={POINT_CLOUD_READY}
          onRenderStateChange={reportRenderState}
        />
      </SceneCanvas>
    </LdsFocusedViewerPage>
  );
}

export const LdsIntegration: Story = {
  name: "LDS Scene3DFrame integration",
  render: () => <PointCloudFoundationExperience />,
};
