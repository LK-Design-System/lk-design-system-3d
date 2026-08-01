import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack, StatusBadge } from "@lk-design-system/lds-core";
import { DescriptionList } from "@lk-design-system/lds-product";
import { MarkerLayer, PointCloudLayers, SceneCanvas, type SceneCameraPose } from "@lk-robotics/lds-3d-r3f";
import {
  appendFrameStreamSamples,
  createFrameStream,
  frameStreamGraph,
  lookupFrameTransform,
  pruneFrameStream,
  type FrameLookupResult,
} from "@lk-robotics/lds-3d-tf";
import {
  clockId,
  entityId,
  layerId,
  pose3,
  quaternionFromYaw,
  rigidTransform3,
  timestamp,
  type RigidTransform3,
  type Timestamp,
} from "@lk-robotics/lds-3d-core";
import { createMarkerLayerSnapshot } from "@lk-robotics/lds-3d-markers";
import { useEffect, useMemo, useState, type ComponentProps } from "react";

import { TechnicalSection, TechnicalStoryLayout } from "./components.js";
import {
  TF_MARKER_BASE_FRAME,
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

const LIVE_CLOCK = clockId("ros-time");
const LIVE_BASE_FRAME = TF_MARKER_BASE_FRAME;
const LIVE_TICK_SECONDS = 0.4;
/** 12초 주기 중 앞 7초만 텔레메트리를 보내고, 뒤 5초는 의도된 드롭아웃이다. */
const LIVE_SEND_WINDOW_SECONDS = 7;
const LIVE_CYCLE_SECONDS = 12;
const LIVE_LOOKUP_OPTIONS = { staleAfterSeconds: 1.2, extrapolationLimitSeconds: 3 };
const LIVE_RETENTION_SECONDS = 20;

function liveTimestamp(seconds: number): Timestamp {
  // 초를 그대로 분해하면 부동소수 누적 탓에 nsec이 1e9로 반올림될 수 있다.
  // 나노초 정수로 먼저 반올림한 뒤 sec/nsec으로 나눈다.
  const totalNanoseconds = Math.round(seconds * 1e9);
  return timestamp(LIVE_CLOCK, Math.floor(totalNanoseconds / 1e9), totalNanoseconds % 1e9);
}

function liveBaseTransform(seconds: number): RigidTransform3 {
  const angle = seconds * 0.35;
  return rigidTransform3(
    LIVE_BASE_FRAME,
    TF_MARKER_MAP_FRAME,
    [1.6 * Math.cos(angle), 1.6 * Math.sin(angle), 0],
    quaternionFromYaw(angle + Math.PI / 2),
  );
}

interface LiveHealth {
  readonly tone: NonNullable<ComponentProps<typeof StatusBadge>["tone"]>;
  readonly label: string;
}

/**
 * FrameLookupResult → LDS 상태 배지 매핑. exact/interpolated는 실시간,
 * held는 hold-last 지연, stale/extrapolation/missing은 각각 두절 단계다.
 */
function liveHealth(result: FrameLookupResult | undefined): LiveHealth {
  if (result === undefined || result.kind === "missing") {
    return { tone: "offline", label: "데이터 없음" };
  }
  switch (result.kind) {
    case "ready":
      return result.mode === "held"
        ? { tone: "cautionary", label: `지연 · hold-last ${result.ageSeconds.toFixed(1)}s` }
        : { tone: "positive", label: "실시간" };
    case "stale":
      return { tone: "negative", label: `두절 · ${result.ageSeconds.toFixed(1)}s 경과` };
    case "extrapolation":
      return { tone: "negative", label: "두절 · 외삽 한계 초과" };
    case "clock-mismatch":
      return { tone: "offline", label: "클록 불일치" };
  }
}

function TfLiveStreamExperience() {
  const [simSeconds, setSimSeconds] = useState(0);
  const [stream, setStream] = useState(() =>
    createFrameStream({ retentionSeconds: LIVE_RETENTION_SECONDS, maxSamplesPerEdge: 64 }),
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setSimSeconds((previousSeconds) => {
        const seconds = previousSeconds + LIVE_TICK_SECONDS;
        setStream((previousStream) => {
          const sending = seconds % LIVE_CYCLE_SECONDS < LIVE_SEND_WINDOW_SECONDS;
          const appended = sending
            ? appendFrameStreamSamples(previousStream, [
                { transform: liveBaseTransform(seconds), timestamp: liveTimestamp(seconds) },
              ])
            : previousStream;
          return pruneFrameStream(appended, liveTimestamp(seconds));
        });
        return seconds;
      });
    }, LIVE_TICK_SECONDS * 1000);
    return () => clearInterval(interval);
  }, []);

  const lookup = useMemo(() => {
    if (stream.samples.length === 0) return undefined;
    return lookupFrameTransform(
      frameStreamGraph(stream),
      LIVE_BASE_FRAME,
      TF_MARKER_MAP_FRAME,
      liveTimestamp(simSeconds),
      LIVE_LOOKUP_OPTIONS,
    );
  }, [simSeconds, stream]);

  const [lastReady, setLastReady] = useState<
    { readonly transform: RigidTransform3; readonly at: Timestamp } | undefined
  >(undefined);
  useEffect(() => {
    if (lookup?.kind === "ready") {
      setLastReady({ transform: lookup.transform, at: lookup.at });
    }
  }, [lookup]);

  const health = liveHealth(lookup);
  const markerLayer = useMemo(() => {
    if (lastReady === undefined) return undefined;
    return createMarkerLayerSnapshot({
      id: layerId("/visualization/live-base"),
      frame: LIVE_BASE_FRAME,
      timestamp: lastReady.at,
      sourceToScene: lastReady.transform,
      markers: [
        {
          kind: "arrow",
          id: entityId("marker/live-heading"),
          namespace: "live",
          pose: pose3(LIVE_BASE_FRAME, [0, 0, 0.3], quaternionFromYaw(0)),
          scale: [1.1, 0.09, 0.22],
          color:
            health.tone === "positive"
              ? { r: 0.07, g: 0.43, b: 0.88, a: 1 }
              : { r: 0.91, g: 0.49, b: 0.08, a: 1 },
        },
        {
          kind: "text",
          id: entityId("marker/live-label"),
          namespace: "live",
          pose: pose3(LIVE_BASE_FRAME, [0, 0, 1.1], quaternionFromYaw(0)),
          text: "LIVE BASE",
          height: 0.3,
          color: { r: 0.08, g: 0.18, b: 0.28, a: 1 },
          selectable: false,
        },
      ],
    });
  }, [health.tone, lastReady]);

  return (
    <TechnicalStoryLayout
      description="FrameStream이 라이브 텔레메트리를 append·prune으로 버퍼링하고, 매 틱 frame graph로 물질화해 조회합니다. 12초 주기 중 5초는 의도된 드롭아웃이라 실시간 → hold-last 지연 → 두절 전이를 배지로 확인할 수 있습니다. 전송·구독·재접속 정책은 제품 소유입니다."
      eyebrow="LDS 3D / 장면"
      meta={`틱 ${LIVE_TICK_SECONDS.toFixed(1)}s · 보존 ${String(LIVE_RETENTION_SECONDS)}s · stale ${LIVE_LOOKUP_OPTIONS.staleAfterSeconds.toFixed(1)}s`}
      title="라이브 TF 스트림과 신선도 배지"
    >
      <TechnicalSection
        description="조회 결과의 mode(exact/interpolated/held)와 kind(stale/extrapolation)가 그대로 LDS 상태 배지 톤으로 매핑됩니다."
        title="텔레메트리 신선도 전이"
      >
        <Stack gap="var(--space-4)">
          <SceneCanvas
            ariaLabel="라이브 TF 스트림 실제 WebGL 장면"
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
            {markerLayer === undefined ? null : (
              <MarkerLayer
                freshnessPolicy={{
                  now: liveTimestamp(simSeconds),
                  staleAfterSeconds: LIVE_LOOKUP_OPTIONS.staleAfterSeconds,
                }}
                maxMarkers={16}
                snapshot={markerLayer}
              />
            )}
          </SceneCanvas>
          <DescriptionList
            columns={2}
            items={[
              { term: "시뮬레이션 시각", description: `${simSeconds.toFixed(1)} s` },
              {
                term: "버퍼 샘플",
                description: `${String(stream.samples.length)}개 · 보존 ${String(LIVE_RETENTION_SECONDS)}s`,
              },
              {
                term: "조회 모드",
                description:
                  lookup === undefined ? "-" : lookup.kind === "ready" ? lookup.mode : lookup.kind,
              },
              {
                term: "신선도",
                description: <StatusBadge tone={health.tone}>{health.label}</StatusBadge>,
              },
            ]}
          />
        </Stack>
      </TechnicalSection>
    </TechnicalStoryLayout>
  );
}

export const LiveStream: Story = {
  name: "시나리오 · 라이브 스트림",
  render: () => <TfLiveStreamExperience />,
};
