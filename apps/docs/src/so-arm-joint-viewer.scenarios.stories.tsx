import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, FormField, SegmentedControl, Slider, StatusBadge } from "@lk-robotics/lds-core";
import { DescriptionList } from "@lk-robotics/lds-product";
import {
  ArticulatedGltfModel,
  SceneCanvas,
  TransformGizmo,
  type ModelLoadState,
  type SceneCameraPose,
} from "@lk-robotics/lds-3d-r3f";
import {
  createJointTrajectory,
  parseRobotKinematics,
  sampleJointTrajectory,
  solveJointPositionIk,
  trajectoryEndSeconds,
  trajectoryStartSeconds,
  type JointValues,
  type RobotKinematicsV1,
} from "@lk-robotics/lds-3d-assets";
import {
  advancePlayback,
  bounds3,
  createPlaybackState,
  entityId,
  frameId,
  seekPlayback,
  setPlaybackPlaying,
  setPlaybackRate,
  spatialNodeTransform,
} from "@lk-robotics/lds-3d-core";
import { useCallback, useEffect, useMemo, useState } from "react";

import { LdsFocusedViewerPage, type VisualCameraMode } from "./visual-alpha-ui.js";

const meta = {
  title: "LDS 3D/LDS Integration/SO-ARM Joint Viewer",
  id: "lds-3d-lds-integration-so-arm-joint-viewer",
  excludeStories: /.*Experience$/,
  parameters: {
    canvasShell: "flush",
    controls: { disable: true },
    layout: "fullscreen",
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const SO_ARM_MODEL_URL = "/robots/so-arm/so-arm.glb";
const SO_ARM_KINEMATICS_URL = "/robots/so-arm/so-arm.kinematics.json";
const SO_ARM_ENTITY_ID = entityId("robot/so-arm-01");
const ARM_FRAME = frameId("lk-world");
const ARM_BOUNDS = bounds3(ARM_FRAME, [-0.45, -0.45, 0], [0.45, 0.45, 0.5]);
const ARM_HOME_POSE: SceneCameraPose = {
  position: [0.85, -0.85, 0.62],
  target: [0, 0, 0.2],
  up: [0, 0, 1],
};

/**
 * 데모 자세: 실제 SO-ARM 텔레오퍼레이션에서 흔한 "집기 준비" 포즈.
 * 값은 라디안이며 kinematics manifest의 한계 안에 있다.
 */
const DEMO_POSE: JointValues = Object.freeze({
  shoulder_pan: 0.5,
  shoulder_lift: 0.62,
  elbow_flex: -1.05,
  wrist_flex: 0.55,
  gripper_jaw: 0.6,
});

const JOINT_LABELS: Readonly<Record<string, string>> = Object.freeze({
  shoulder_pan: "숄더 팬",
  shoulder_lift: "숄더 리프트",
  elbow_flex: "엘보",
  wrist_flex: "리스트 플렉스",
  wrist_roll: "리스트 롤",
  gripper_jaw: "그리퍼",
});

function degreesLabel(radians: number): string {
  return `${((radians * 180) / Math.PI).toFixed(1)}°`;
}

interface KinematicsResource {
  readonly kind: "loading" | "error" | "ready";
  readonly kinematics?: RobotKinematicsV1;
}

function useSoArmKinematics(reloadKey: number): KinematicsResource {
  const [resource, setResource] = useState<KinematicsResource>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setResource({ kind: "loading" });
    fetch(SO_ARM_KINEMATICS_URL)
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
        return (await response.json()) as unknown;
      })
      .then((payload) => {
        if (cancelled) return;
        const parsed = parseRobotKinematics(payload);
        if (parsed.ok) setResource({ kind: "ready", kinematics: parsed.value });
        else setResource({ kind: "error" });
      })
      .catch(() => {
        if (!cancelled) setResource({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return resource;
}

interface JointSliderPanelProps {
  readonly kinematics: RobotKinematicsV1;
  readonly jointValues: JointValues;
  readonly onJointChange: (jointId: string, value: number) => void;
  readonly onApplyPose: (pose: JointValues) => void;
}

function JointSliderPanel({
  kinematics,
  jointValues,
  onJointChange,
  onApplyPose,
}: JointSliderPanelProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
        gap: "var(--space-4)",
        alignItems: "end",
        width: "100%",
      }}
    >
      {kinematics.joints.map((joint) => {
        const value = jointValues[joint.jointId] ?? 0;
        return (
          <FormField
            key={joint.jointId}
            htmlFor={`so-arm-${joint.jointId}`}
            label={`${JOINT_LABELS[joint.jointId] ?? joint.jointId} · ${degreesLabel(value)}`}
            helper={`${degreesLabel(joint.limits.lower)} ~ ${degreesLabel(joint.limits.upper)}`}
          >
            <Slider
              id={`so-arm-${joint.jointId}`}
              aria-label={`${JOINT_LABELS[joint.jointId] ?? joint.jointId} 관절 값(라디안)`}
              min={joint.limits.lower}
              max={joint.limits.upper}
              step={0.01}
              value={value}
              onChange={(next) => onJointChange(joint.jointId, next)}
            />
          </FormField>
        );
      })}
      <div style={{ display: "flex", gap: "var(--space-2)" }}>
        <Button size="sm" variant="secondary" onClick={() => onApplyPose({})}>
          기본 자세
        </Button>
        <Button size="sm" variant="secondary" onClick={() => onApplyPose(DEMO_POSE)}>
          데모 자세
        </Button>
      </div>
    </div>
  );
}

export function SoArmJointViewerExperience() {
  const [cameraMode, setCameraMode] = useState<VisualCameraMode>("home");
  const [jointValues, setJointValues] = useState<JointValues>({});
  const [modelState, setModelState] = useState<ModelLoadState>("loading");
  const [retryKey, setRetryKey] = useState(0);
  const resource = useSoArmKinematics(retryKey);

  const onJointChange = useCallback((jointId: string, value: number) => {
    setJointValues((previous) => ({ ...previous, [jointId]: value }));
  }, []);
  const onRetry = useCallback(() => {
    setModelState("loading");
    setRetryKey((previous) => previous + 1);
  }, []);

  // 모델 자체의 로딩·오류는 장면 안 SceneStateMarker가 담당하므로, 페이지
  // 수준 상태는 kinematics manifest 확보 여부와 모델의 최종 오류만 반영한다.
  const runtimeState =
    resource.kind === "error" || modelState === "error"
      ? ("error" as const)
      : resource.kind === "loading"
        ? ("loading" as const)
        : ("ready" as const);
  const activeJointCount = Object.keys(jointValues).length;

  return (
    <LdsFocusedViewerPage
      cameraMode={cameraMode}
      description="검증된 robot kinematics manifest가 ArticulatedGltfModel의 링크 노드를 어떻게 움직이는지 검토합니다. 뷰어는 정규화된 관절 값(라디안)만 받으며, 모터 틱 변환·전송·명령·워크플로는 제품 소유입니다."
      eyebrow="LDS 3D / LDS Integration"
      onCameraModeChange={setCameraMode}
      onRetry={onRetry}
      pageTitle="SO-ARM 관절 뷰어"
      profile="diagnostic"
      runtimeState={runtimeState}
      sceneTitle="SO-ARM 데스크톱 매니퓰레이터"
      selected={{
        id: "robot/so-arm-01",
        name: "SO-ARM 01",
        kind: "매니퓰레이터",
        status: runtimeState === "error" ? "error" : "live",
        pose: [0, 0, 0],
        source: "robots/so-arm",
        frame: "lk-world",
        task:
          activeJointCount === 0
            ? "기본 자세 유지"
            : `${String(activeJointCount)}개 관절 조정됨`,
      }}
      storyMeta={
        <>
          <span>관절 6개 · revolute</span>
          <span aria-hidden="true">-</span>
          <span>kinematics manifest v1</span>
        </>
      }
      sceneDetails={
        <DescriptionList
          columns={2}
          items={[
            { term: "자산", description: "robots/so-arm" },
            { term: "베이스 링크", description: "base · lk-world" },
            { term: "관절 값 단위", description: "라디안 (한계 자동 클램프)" },
            { term: "키네마틱스", description: "so-arm.kinematics.json · schema v1" },
          ]}
        />
      }
      reviewControls={
        resource.kind === "ready" && resource.kinematics !== undefined ? (
          <JointSliderPanel
            jointValues={jointValues}
            kinematics={resource.kinematics}
            onApplyPose={setJointValues}
            onJointChange={onJointChange}
          />
        ) : (
          <span>kinematics manifest 로딩 중…</span>
        )
      }
    >
      <SceneCanvas
        ariaLabel="SO-ARM 관절 뷰어 WebGL 장면"
        cameraMode={cameraMode}
        devicePixelRatio={1}
        environment={{
          sizeMeters: 2,
          minorSpacingMeters: 0.1,
          majorSpacingMeters: 0.5,
          shadowMapSize: 1024,
        }}
        focusBounds={ARM_BOUNDS}
        frame={ARM_FRAME}
        frameLoop="demand"
        homePose={ARM_HOME_POSE}
        profile="diagnostic-technical"
        renderQuality="balanced"
        renderState={{ kind: "ready" }}
        style={{ height: "100%", minHeight: 480, borderRadius: 0 }}
        topBounds={ARM_BOUNDS}
      >
        {resource.kind === "ready" && resource.kinematics !== undefined ? (
          <ArticulatedGltfModel
            entityId={SO_ARM_ENTITY_ID}
            jointValues={jointValues}
            kinematics={resource.kinematics}
            onLoadStateChange={setModelState}
            retryKey={retryKey}
            sourceConvention="core"
            url={SO_ARM_MODEL_URL}
          />
        ) : null}
      </SceneCanvas>
    </LdsFocusedViewerPage>
  );
}

export const LdsIntegration: Story = {
  name: "개요",
  render: () => <SoArmJointViewerExperience />,
};

/**
 * 기록된 8초 pick-and-place 에피소드. 모든 샘플이 동일한 관절 집합을
 * 선언해야 하는 JointTrajectory 계약을 그대로 따르며, 값은 라디안이다.
 */
const SO_ARM_EPISODE = createJointTrajectory([
  { timeSeconds: 0, values: { shoulder_pan: 0, shoulder_lift: 0, elbow_flex: 0, wrist_flex: 0, wrist_roll: 0, gripper_jaw: 0.9 } },
  { timeSeconds: 1, values: { shoulder_pan: 0, shoulder_lift: 0.75, elbow_flex: -1.2, wrist_flex: 0.5, wrist_roll: 0, gripper_jaw: 0.9 } },
  { timeSeconds: 1.8, values: { shoulder_pan: 0, shoulder_lift: 0.75, elbow_flex: -1.2, wrist_flex: 0.5, wrist_roll: 0, gripper_jaw: 0.15 } },
  { timeSeconds: 2.6, values: { shoulder_pan: 0, shoulder_lift: 0.2, elbow_flex: -0.5, wrist_flex: 0.3, wrist_roll: 0, gripper_jaw: 0.15 } },
  { timeSeconds: 4, values: { shoulder_pan: -1.1, shoulder_lift: 0.2, elbow_flex: -0.5, wrist_flex: 0.3, wrist_roll: 0.6, gripper_jaw: 0.15 } },
  { timeSeconds: 5, values: { shoulder_pan: -1.1, shoulder_lift: 0.7, elbow_flex: -1.1, wrist_flex: 0.5, wrist_roll: 0.6, gripper_jaw: 0.15 } },
  { timeSeconds: 5.8, values: { shoulder_pan: -1.1, shoulder_lift: 0.7, elbow_flex: -1.1, wrist_flex: 0.5, wrist_roll: 0.6, gripper_jaw: 0.95 } },
  { timeSeconds: 6.6, values: { shoulder_pan: -1.1, shoulder_lift: 0.1, elbow_flex: -0.3, wrist_flex: 0.1, wrist_roll: 0.3, gripper_jaw: 0.95 } },
  { timeSeconds: 8, values: { shoulder_pan: 0, shoulder_lift: 0, elbow_flex: 0, wrist_flex: 0, wrist_roll: 0, gripper_jaw: 0.9 } },
]);

const EPISODE_RANGE = {
  startSeconds: trajectoryStartSeconds(SO_ARM_EPISODE),
  endSeconds: trajectoryEndSeconds(SO_ARM_EPISODE),
};
const PLAYBACK_RATE_OPTIONS = [
  { value: "0.5", label: "0.5×" },
  { value: "1", label: "1×" },
  { value: "2", label: "2×" },
];

function timecodeLabel(seconds: number): string {
  return `${seconds.toFixed(1)}s`;
}

export function SoArmTrajectoryReplayExperience() {
  const [cameraMode, setCameraMode] = useState<VisualCameraMode>("home");
  const [modelState, setModelState] = useState<ModelLoadState>("loading");
  const [retryKey, setRetryKey] = useState(0);
  const [playback, setPlayback] = useState(() =>
    createPlaybackState(EPISODE_RANGE, { playing: true }),
  );
  const resource = useSoArmKinematics(retryKey);

  useEffect(() => {
    if (!playback.playing) return undefined;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number): void => {
      const wallDeltaSeconds = Math.max(0, (now - last) / 1000);
      last = now;
      setPlayback((previous) => advancePlayback(previous, wallDeltaSeconds));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playback.playing]);

  const jointValues = useMemo(
    () => sampleJointTrajectory(SO_ARM_EPISODE, playback.currentSeconds),
    [playback.currentSeconds],
  );
  const onRetry = useCallback(() => {
    setModelState("loading");
    setRetryKey((previous) => previous + 1);
  }, []);

  const runtimeState =
    resource.kind === "error" || modelState === "error"
      ? ("error" as const)
      : resource.kind === "loading"
        ? ("loading" as const)
        : ("ready" as const);

  return (
    <LdsFocusedViewerPage
      cameraMode={cameraMode}
      description="PlaybackClock과 JointTrajectory 계약으로 기록된 관절 에피소드를 재생합니다. 타임라인은 wall-clock 델타를 주입받는 순수 상태 기계이며, 각 시점의 보간된 관절 값이 ArticulatedGltfModel로 흘러갑니다."
      eyebrow="LDS 3D / LDS Integration"
      onCameraModeChange={setCameraMode}
      onRetry={onRetry}
      pageTitle="SO-ARM 관절 뷰어"
      profile="diagnostic"
      runtimeState={runtimeState}
      sceneTitle="SO-ARM 궤적 재생"
      selected={{
        id: "robot/so-arm-01",
        name: "SO-ARM 01",
        kind: "매니퓰레이터",
        status: runtimeState === "error" ? "error" : "live",
        pose: [0, 0, 0],
        source: "robots/so-arm",
        frame: "lk-world",
        task: playback.playing
          ? `에피소드 재생 중 · ${timecodeLabel(playback.currentSeconds)}`
          : `일시정지 · ${timecodeLabel(playback.currentSeconds)}`,
      }}
      storyMeta={
        <>
          <span>에피소드 {timecodeLabel(EPISODE_RANGE.endSeconds)}</span>
          <span aria-hidden="true">-</span>
          <span>샘플 {String(SO_ARM_EPISODE.samples.length)}개 · 선형 보간</span>
        </>
      }
      sceneDetails={
        <DescriptionList
          columns={2}
          items={[
            { term: "자산", description: "robots/so-arm" },
            { term: "재생 계약", description: "PlaybackClock · loop" },
            { term: "궤적 계약", description: "JointTrajectory · 선형 보간" },
            { term: "현재 시각", description: timecodeLabel(playback.currentSeconds) },
          ]}
        />
      }
      reviewControls={
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--space-4)",
            alignItems: "end",
            width: "100%",
          }}
        >
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setPlayback((previous) => setPlaybackPlaying(previous, !previous.playing))}
          >
            {playback.playing ? "일시정지" : "재생"}
          </Button>
          <SegmentedControl
            aria-label="재생 배속"
            options={PLAYBACK_RATE_OPTIONS}
            size="sm"
            value={String(playback.rate)}
            onChange={(value) =>
              setPlayback((previous) => setPlaybackRate(previous, Number(value)))
            }
          />
          <div style={{ flex: "1 1 260px" }}>
            <FormField
              htmlFor="so-arm-timeline"
              label={`타임라인 · ${timecodeLabel(playback.currentSeconds)} / ${timecodeLabel(EPISODE_RANGE.endSeconds)}`}
            >
              <Slider
                id="so-arm-timeline"
                aria-label="에피소드 타임라인(초)"
                min={EPISODE_RANGE.startSeconds}
                max={EPISODE_RANGE.endSeconds}
                step={0.05}
                value={playback.currentSeconds}
                onChange={(seconds) =>
                  setPlayback((previous) => seekPlayback(previous, seconds))
                }
              />
            </FormField>
          </div>
        </div>
      }
    >
      <SceneCanvas
        ariaLabel="SO-ARM 궤적 재생 WebGL 장면"
        cameraMode={cameraMode}
        devicePixelRatio={1}
        environment={{
          sizeMeters: 2,
          minorSpacingMeters: 0.1,
          majorSpacingMeters: 0.5,
          shadowMapSize: 1024,
        }}
        focusBounds={ARM_BOUNDS}
        frame={ARM_FRAME}
        frameLoop="demand"
        homePose={ARM_HOME_POSE}
        profile="diagnostic-technical"
        renderQuality="balanced"
        renderState={{ kind: "ready" }}
        style={{ height: "100%", minHeight: 480, borderRadius: 0 }}
        topBounds={ARM_BOUNDS}
      >
        {resource.kind === "ready" && resource.kinematics !== undefined ? (
          <ArticulatedGltfModel
            entityId={SO_ARM_ENTITY_ID}
            jointValues={jointValues}
            kinematics={resource.kinematics}
            onLoadStateChange={setModelState}
            retryKey={retryKey}
            sourceConvention="core"
            url={SO_ARM_MODEL_URL}
          />
        ) : null}
      </SceneCanvas>
    </LdsFocusedViewerPage>
  );
}

export const TrajectoryReplay: Story = {
  name: "시나리오 · 궤적 재생",
  render: () => <SoArmTrajectoryReplayExperience />,
};

const IK_EFFECTOR_LINK = frameId("gripper");
const IK_TOLERANCE_METERS = 0.002;
/** 그리퍼 링크 원점의 rest 높이: 0.06+0.03+0.11+0.10+0.045. */
const IK_REST_TARGET: readonly [number, number, number] = [0, 0, 0.345];
const IK_PRESETS: readonly {
  readonly label: string;
  readonly target: readonly [number, number, number];
}[] = [
  { label: "기본 자세", target: IK_REST_TARGET },
  { label: "정면 집기", target: [0.2, 0, 0.15] },
  { label: "좌측 선반", target: [0.06, 0.2, 0.22] },
];
const IK_AXIS_CONTROLS = [
  { axis: 0, label: "목표 X", min: -0.3, max: 0.3 },
  { axis: 1, label: "목표 Y", min: -0.3, max: 0.3 },
  { axis: 2, label: "목표 Z", min: 0, max: 0.45 },
] as const;

function millimetersLabel(meters: number): string {
  return `${(meters * 1000).toFixed(1)}mm`;
}

export function SoArmInverseKinematicsExperience() {
  const [cameraMode, setCameraMode] = useState<VisualCameraMode>("home");
  const [modelState, setModelState] = useState<ModelLoadState>("loading");
  const [retryKey, setRetryKey] = useState(0);
  const [target, setTarget] = useState<readonly [number, number, number]>(IK_REST_TARGET);
  const resource = useSoArmKinematics(retryKey);

  const solution = useMemo(() => {
    if (resource.kind !== "ready" || resource.kinematics === undefined) return undefined;
    return solveJointPositionIk(resource.kinematics, {
      effectorLink: IK_EFFECTOR_LINK,
      targetPosition: target,
      toleranceMeters: IK_TOLERANCE_METERS,
    });
  }, [resource, target]);

  const onRetry = useCallback(() => {
    setModelState("loading");
    setRetryKey((previous) => previous + 1);
  }, []);

  const runtimeState =
    resource.kind === "error" || modelState === "error"
      ? ("error" as const)
      : resource.kind === "loading"
        ? ("loading" as const)
        : ("ready" as const);
  const converged = solution?.kind === "converged";

  return (
    <LdsFocusedViewerPage
      cameraMode={cameraMode}
      description="목표 좌표를 solveJointPositionIk에 넣어 관절 한계를 존중하는 CCD 역기구학 해를 구하고, 그 관절 값이 그대로 ArticulatedGltfModel을 움직입니다. 미수렴은 예외가 아니라 잔차와 함께 보고되는 결과이며, 실기 명령 송신은 제품 소유입니다."
      eyebrow="LDS 3D / LDS Integration"
      onCameraModeChange={setCameraMode}
      onRetry={onRetry}
      pageTitle="SO-ARM 관절 뷰어"
      profile="diagnostic"
      runtimeState={runtimeState}
      sceneTitle="SO-ARM 역기구학"
      selected={{
        id: "robot/so-arm-01",
        name: "SO-ARM 01",
        kind: "매니퓰레이터",
        status: runtimeState === "error" ? "error" : converged ? "live" : "warning",
        pose: [target[0], target[1], target[2]],
        source: "robots/so-arm",
        frame: "base (링크-로컬)",
        task:
          solution === undefined
            ? "kinematics 로딩 중"
            : converged
              ? `목표 수렴 · 잔차 ${millimetersLabel(solution.residualMeters)}`
              : `미수렴 · 잔차 ${millimetersLabel(solution.residualMeters)}`,
      }}
      storyMeta={
        <>
          <span>CCD · 한계 클램프</span>
          <span aria-hidden="true">-</span>
          <span>허용 오차 {millimetersLabel(IK_TOLERANCE_METERS)}</span>
        </>
      }
      sceneDetails={
        <DescriptionList
          columns={2}
          items={[
            { term: "이펙터 링크", description: "gripper" },
            {
              term: "목표 좌표",
              description: `${target[0].toFixed(3)} · ${target[1].toFixed(3)} · ${target[2].toFixed(3)} m`,
            },
            {
              term: "반복 횟수",
              description: solution === undefined ? "-" : String(solution.iterations),
            },
            {
              term: "수렴 상태",
              description:
                solution === undefined ? (
                  "-"
                ) : (
                  <StatusBadge tone={converged ? "positive" : "cautionary"}>
                    {converged
                      ? `수렴 · ${millimetersLabel(solution.residualMeters)}`
                      : `미수렴 · ${millimetersLabel(solution.residualMeters)}`}
                  </StatusBadge>
                ),
            },
          ]}
        />
      }
      reviewControls={
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--space-4)",
            alignItems: "end",
            width: "100%",
          }}
        >
          {IK_AXIS_CONTROLS.map((control) => (
            <div key={control.axis} style={{ flex: "1 1 170px" }}>
              <FormField
                htmlFor={`so-arm-ik-${control.label}`}
                label={`${control.label} · ${(target[control.axis] * 1000).toFixed(0)}mm`}
              >
                <Slider
                  id={`so-arm-ik-${control.label}`}
                  aria-label={`${control.label}(미터)`}
                  min={control.min}
                  max={control.max}
                  step={0.005}
                  value={target[control.axis]}
                  onChange={(value) =>
                    setTarget((previous) => {
                      const next: [number, number, number] = [...previous] as [
                        number,
                        number,
                        number,
                      ];
                      next[control.axis] = value;
                      return next;
                    })
                  }
                />
              </FormField>
            </div>
          ))}
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            {IK_PRESETS.map((preset) => (
              <Button
                key={preset.label}
                size="sm"
                variant="secondary"
                onClick={() => setTarget(preset.target)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </div>
      }
    >
      <SceneCanvas
        ariaLabel="SO-ARM 역기구학 WebGL 장면"
        cameraMode={cameraMode}
        devicePixelRatio={1}
        environment={{
          sizeMeters: 2,
          minorSpacingMeters: 0.1,
          majorSpacingMeters: 0.5,
          shadowMapSize: 1024,
        }}
        focusBounds={ARM_BOUNDS}
        frame={ARM_FRAME}
        frameLoop="demand"
        homePose={ARM_HOME_POSE}
        profile="diagnostic-technical"
        renderQuality="balanced"
        renderState={{ kind: "ready" }}
        style={{ height: "100%", minHeight: 480, borderRadius: 0 }}
        topBounds={ARM_BOUNDS}
      >
        {resource.kind === "ready" && resource.kinematics !== undefined ? (
          <>
            <ArticulatedGltfModel
              entityId={SO_ARM_ENTITY_ID}
              jointValues={solution?.values ?? {}}
              kinematics={resource.kinematics}
              onLoadStateChange={setModelState}
              retryKey={retryKey}
              sourceConvention="core"
              url={SO_ARM_MODEL_URL}
            />
            <TransformGizmo
              entityId={entityId("target/so-arm-ik")}
              mode="translate"
              sizeMeters={0.12}
              transform={spatialNodeTransform(ARM_FRAME, ARM_FRAME, [
                target[0],
                target[1],
                target[2],
              ])}
              onTransformChange={(changeSet) => {
                const after = changeSet.changes[0]?.after;
                if (after !== undefined) {
                  setTarget([after.translation[0], after.translation[1], after.translation[2]]);
                }
              }}
            />
          </>
        ) : null}
      </SceneCanvas>
    </LdsFocusedViewerPage>
  );
}

export const InverseKinematics: Story = {
  name: "시나리오 · 역기구학",
  render: () => <SoArmInverseKinematicsExperience />,
};
