import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Button,
  ConfirmDialog,
  Divider,
  DropdownMenu,
  FormField,
  Icon,
  SegmentedControl,
  StatusBadge,
} from "@lk-design-system/lds-core";
import { DescriptionList, NumberField } from "@lk-design-system/lds-product";
import {
  CanvasEditorCommandBar,
  CanvasEditorShell,
  EditorToolbar,
  Scene3DFrame,
  SelectionInspector,
  ViewerToolbar,
  ViewerToolbarButton,
  ViewportStatusBar,
} from "@lk-design-system/lds-product";
import {
  EditVolume,
  PointCloudLayer,
  PointCloudLayers,
  SceneCanvas,
  TransformGizmo,
  useSceneRuntime,
  type SceneCameraMode,
  type SceneCameraPose,
  type SceneSelectionChange,
} from "@lk-robotics/lds-3d-r3f";
import {
  createPointCloudSnapshot,
  resolvePointCloudLayerSetRenderState,
  type PointCloudLayerSetRenderState,
  type PointCloudSnapshot,
} from "@lk-robotics/lds-3d-pointcloud";
import {
  createSpatialEditBox,
  createSpatialEditSphere,
  entityId,
  quaternionFromYaw,
  spatialNodeTransform,
  type EntityId,
  type SpatialEditVolume,
  type SpatialTransformChangeSet,
  type Vec3,
} from "@lk-robotics/lds-3d-core";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  POINT_CLOUD_FOCUS_BOUNDS,
  POINT_CLOUD_FRAME,
  POINT_CLOUD_LAYER_SET,
  POINT_CLOUD_READY,
} from "./pointcloud-fixture.js";
import { MapEditorPlacementSurface } from "./map-editor-webgl.js";
import { LdsFocusedViewerPage, type VisualCameraMode } from "./visual-alpha-ui.js";

const meta = {
  title: "LDS 3D/LDS Integration/Focused Point Cloud Viewer",
  id: "lds-3d-scenes-point-cloud-foundation",
  excludeStories: /.*Experience$/,
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

type SpatialEditingMode = "select" | "delete";
type SpatialDeleteTool = "sphere" | "box" | "move" | "resize";
type SpatialEditingMobileRegion = "canvas" | "panel";

const DELETE_VOLUME_ID = entityId("edit/delete-draft");
const DELETE_VOLUME_RADIUS_METERS = 0.72;
const DELETE_VOLUME_BOX_SIZE_METERS: Vec3 = [1.2, 1.2, 1.4];
const MINIMUM_EDIT_VOLUME_SIZE_METERS = 0.1;
const SPATIAL_EDITING_REGION_OPTIONS = [
  { value: "canvas", label: "장면" },
  { value: "panel", label: "속성" },
];

function roundMeters(value: number): number {
  return Number(value.toFixed(3));
}

function pointComponent(buffer: Float32Array, index: number): number {
  const value = buffer[index];
  if (value === undefined)
    throw new RangeError(`PointCloud component ${index.toString()} is missing.`);
  return value;
}

function rotateByInverseQuaternion(
  value: Vec3,
  quaternion: readonly [number, number, number, number],
): Vec3 {
  const [x, y, z, w] = [-quaternion[0], -quaternion[1], -quaternion[2], quaternion[3]];
  const [vx, vy, vz] = value;
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return [
    vx + w * tx + (y * tz - z * ty),
    vy + w * ty + (z * tx - x * tz),
    vz + w * tz + (x * ty - y * tx),
  ];
}

function pointIsInsideEditVolume(point: Vec3, volume: SpatialEditVolume): boolean {
  const delta: Vec3 = [
    point[0] - volume.pose.position[0],
    point[1] - volume.pose.position[1],
    point[2] - volume.pose.position[2],
  ];
  if (volume.kind === "sphere") {
    return delta[0] ** 2 + delta[1] ** 2 + delta[2] ** 2 <= volume.radiusMeters ** 2;
  }
  const local = rotateByInverseQuaternion(delta, volume.pose.orientation);
  return volume.sizeMeters.every(
    (size, axis) => Math.abs(local[axis] ?? Number.POSITIVE_INFINITY) <= size / 2,
  );
}

interface DeletePointCloudPartition {
  readonly affected: PointCloudSnapshot;
  readonly retained: PointCloudSnapshot;
}

function editVolumeRevisionKey(volume: SpatialEditVolume): string {
  return [
    volume.kind,
    volume.operation,
    ...volume.pose.position.map((value) => value.toFixed(3)),
    ...volume.pose.orientation.map((value) => value.toFixed(4)),
    ...(volume.kind === "sphere"
      ? [volume.radiusMeters.toFixed(3)]
      : volume.sizeMeters.map((value) => value.toFixed(3))),
  ].join(":");
}

function createPartitionSnapshot(
  snapshot: PointCloudSnapshot,
  offsets: readonly number[],
  revision: string,
): PointCloudSnapshot {
  const positions = new Float32Array(offsets.length * 3);
  offsets.forEach((sourceOffset, pointIndex) => {
    const targetOffset = pointIndex * 3;
    for (let component = 0; component < 3; component += 1) {
      positions[targetOffset + component] = pointComponent(
        snapshot.positions,
        sourceOffset + component,
      );
    }
  });

  return createPointCloudSnapshot({
    frame: snapshot.frame,
    positions,
    revision: `${String(snapshot.revision)}:${revision}`,
    ...(snapshot.timestamp === undefined ? {} : { timestamp: snapshot.timestamp }),
  });
}

function partitionDeletePreview(
  snapshot: PointCloudSnapshot,
  volume: SpatialEditVolume,
): DeletePointCloudPartition {
  const affectedOffsets: number[] = [];
  const retainedOffsets: number[] = [];

  for (let offset = 0; offset < snapshot.positions.length; offset += 3) {
    const point: Vec3 = [
      pointComponent(snapshot.positions, offset),
      pointComponent(snapshot.positions, offset + 1),
      pointComponent(snapshot.positions, offset + 2),
    ];
    (pointIsInsideEditVolume(point, volume) ? affectedOffsets : retainedOffsets).push(offset);
  }

  const revisionKey = editVolumeRevisionKey(volume);
  return Object.freeze({
    affected: createPartitionSnapshot(
      snapshot,
      affectedOffsets,
      `delete-preview:affected:${revisionKey}`,
    ),
    retained: createPartitionSnapshot(
      snapshot,
      retainedOffsets,
      `delete-preview:retained:${revisionKey}`,
    ),
  });
}

function DeletePointCloudPreview({
  applied,
  partition,
}: {
  readonly applied: boolean;
  readonly partition: DeletePointCloudPartition;
}) {
  const { theme } = useSceneRuntime();
  return (
    <>
      <PointCloudLayer
        colorMode={applied ? "height" : "uniform"}
        fallbackColor={applied ? "#6cb6ff" : theme.materials.assetStructure}
        maxPoints={50_000}
        opacity={applied ? 1 : 0.34}
        pointSize={applied ? 1.75 : 1.35}
        snapshot={partition.retained}
        {...(applied ? { heightRange: [0, 1.6] as const } : {})}
      />
      {applied ? null : (
        <PointCloudLayer
          colorMode="uniform"
          fallbackColor={theme.materials.error}
          maxPoints={50_000}
          opacity={0.98}
          pointSize={2.8}
          snapshot={partition.affected}
        />
      )}
    </>
  );
}

function editVolumeTransform(volume: SpatialEditVolume) {
  const scale: Vec3 =
    volume.kind === "sphere"
      ? [volume.radiusMeters, volume.radiusMeters, volume.radiusMeters]
      : volume.sizeMeters;
  // This is a scene-local adapter for the shared gesture primitive: the volume pose is already
  // expressed in its core frame, so both transform spaces resolve to that same frame here.
  return spatialNodeTransform(
    volume.pose.frame,
    volume.pose.frame,
    volume.pose.position,
    volume.pose.orientation,
    scale,
  );
}

function transformEditVolume(
  volume: SpatialEditVolume,
  changeSet: SpatialTransformChangeSet,
): SpatialEditVolume {
  const change = changeSet.changes.find(({ entityId: changedId }) => changedId === volume.id);
  if (change === undefined) return volume;
  const position: Vec3 = [
    roundMeters(change.after.translation[0]),
    roundMeters(change.after.translation[1]),
    roundMeters(change.after.translation[2]),
  ];
  if (volume.kind === "sphere") {
    const axisIndex = changeSet.axis === "x" ? 0 : changeSet.axis === "y" ? 1 : 2;
    return createSpatialEditSphere({
      id: volume.id,
      operation: volume.operation,
      pose: {
        frame: volume.pose.frame,
        position,
        orientation: volume.pose.orientation,
      },
      // A sphere always preserves a single radius, even though any axis handle may initiate it.
      radiusMeters: Math.max(
        MINIMUM_EDIT_VOLUME_SIZE_METERS,
        roundMeters(change.after.scale[axisIndex]),
      ),
    });
  }
  return createSpatialEditBox({
    id: volume.id,
    operation: volume.operation,
    pose: {
      frame: volume.pose.frame,
      position,
      orientation: volume.pose.orientation,
    },
    sizeMeters: [
      Math.max(MINIMUM_EDIT_VOLUME_SIZE_METERS, roundMeters(change.after.scale[0])),
      Math.max(MINIMUM_EDIT_VOLUME_SIZE_METERS, roundMeters(change.after.scale[1])),
      Math.max(MINIMUM_EDIT_VOLUME_SIZE_METERS, roundMeters(change.after.scale[2])),
    ],
  });
}

function EditVolumeTransformGizmo({
  volume,
  mode,
  onChange,
}: {
  readonly volume: SpatialEditVolume;
  readonly mode: "translate" | "scale" | null;
  readonly onChange: (volume: SpatialEditVolume) => void;
}) {
  if (mode === null) return <EditVolume volume={volume} />;
  const maxSize = volume.kind === "sphere" ? volume.radiusMeters * 2 : Math.max(...volume.sizeMeters);
  return (
    <>
      <EditVolume volume={volume} />
      <TransformGizmo
        entityId={volume.id}
        transform={editVolumeTransform(volume)}
        mode={mode}
        space={mode === "translate" ? "target" : "local"}
        snap={{ translationMeters: 0.05, scaleStep: 0.05 }}
        sizeMeters={Math.max(0.9, maxSize * 0.9)}
        onTransformChange={(changeSet) => onChange(transformEditVolume(volume, changeSet))}
      />
    </>
  );
}

const POINT_CLOUD_SCENE_LAYERS = POINT_CLOUD_LAYER_SET.layers.map((layer, index) => ({
  layer,
  colorMode: "height" as const,
  fallbackColor: index === 0 ? "#6cb6ff" : "#ffba6b",
  heightRange: [0, 1.6] as const,
  pointSize: index === 0 ? 1.75 : 2.1,
  opacity: index === 0 ? 0.9 : 1,
}));

function pointCloudTone(
  state: PointCloudLayerSetRenderState,
): "positive" | "cautionary" | "negative" | "offline" {
  switch (state.kind) {
    case "ready":
      return "positive";
    case "empty":
      return "offline";
    case "degraded":
      return "cautionary";
    case "budget-exceeded":
      return "cautionary";
  }
}

function pointCloudStateLabel(state: PointCloudLayerSetRenderState): string {
  switch (state.kind) {
    case "ready":
      return "준비됨";
    case "empty":
      return "빈 상태";
    case "degraded":
      return "성능 저하";
    case "budget-exceeded":
      return "예산 초과";
  }
}

export function FocusedPointCloudViewerExperience(): ReactNode {
  const [cameraMode, setCameraMode] = useState<VisualCameraMode>("home");
  const [renderState, setRenderState] = useState<PointCloudLayerSetRenderState>(() =>
    resolvePointCloudLayerSetRenderState(POINT_CLOUD_LAYER_SET, POINT_CLOUD_FRAME, 50_000),
  );
  const reportRenderState = useCallback((state: PointCloudLayerSetRenderState) => {
    setRenderState(state);
  }, []);

  return (
    <LdsFocusedViewerPage
      cameraMode={cameraMode}
      description="PointCloudLayers의 LDS 조합을 검토합니다. 뷰어는 호출자가 소유한 스냅샷과 이미 계산된 소스-장면 변환만 받으며, 제품 전송·TF 그래프 계산·명령·워크플로는 포함하지 않습니다."
      onCameraModeChange={setCameraMode}
      pageTitle="포인트 클라우드 검사"
      profile="diagnostic"
      sceneTitle="포인트 클라우드 레이어 / LK-MAP"
      storyMeta={
        <>
          <span>다중 프레임 검토</span>
          <span aria-hidden="true">-</span>
          <span>{renderState.requestedPointCount.toLocaleString()}개 점 · 레이어 2개</span>
        </>
      }
      sceneDetails={
        <DescriptionList
          columns={2}
          items={[
            { term: "장면 프레임", description: POINT_CLOUD_FRAME },
            { term: "소스 프레임", description: "lk-map · lidar-front" },
            { term: "레이어 예산", description: "점 50,000개 · 원자적 적용" },
            { term: "색상 매핑", description: "장면 Z / 0.0-1.6 m" },
            {
              term: "레이어 적합성",
              description: (
                <StatusBadge tone={pointCloudTone(renderState)}>
                  {pointCloudStateLabel(renderState)}
                </StatusBadge>
              ),
            },
          ]}
        />
      }
    >
      <SceneCanvas
        ariaLabel="포인트 클라우드 검사 WebGL 장면"
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
        <PointCloudLayers
          layers={POINT_CLOUD_SCENE_LAYERS}
          maxPoints={50_000}
          onRenderStateChange={reportRenderState}
        />
      </SceneCanvas>
    </LdsFocusedViewerPage>
  );
}

export function SpatialEditingExperience(): ReactNode {
  const [cameraMode, setCameraMode] = useState<SceneCameraMode>("home");
  const [editingMode, setEditingMode] = useState<SpatialEditingMode>("select");
  const [deleteTool, setDeleteTool] = useState<SpatialDeleteTool | null>(null);
  const [mobileRegion, setMobileRegion] = useState<SpatialEditingMobileRegion>("canvas");
  const [selectedId, setSelectedId] = useState<EntityId | null>(null);
  const [draftVolume, setDraftVolume] = useState<SpatialEditVolume | null>(null);
  const [appliedVolume, setAppliedVolume] = useState<SpatialEditVolume | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteMenuOpen, setDeleteMenuOpen] = useState(false);

  const previewVolume = draftVolume ?? appliedVolume;
  const deletePartition = useMemo(
    () =>
      previewVolume === null ? null : partitionDeletePreview(POINT_CLOUD_READY, previewVolume),
    [previewVolume],
  );
  const affectedPointCount = deletePartition?.affected.pointCount ?? 0;
  const affectedPointPercent =
    POINT_CLOUD_READY.pointCount === 0
      ? 0
      : (affectedPointCount / POINT_CLOUD_READY.pointCount) * 100;
  const renderedSnapshot =
    appliedVolume === null || deletePartition === null
      ? POINT_CLOUD_READY
      : deletePartition.retained;
  const selectedVolume = draftVolume !== null && selectedId === draftVolume.id ? draftVolume : null;
  const isPlacementTool =
    editingMode === "delete" && (deleteTool === "sphere" || deleteTool === "box");
  const transformMode =
    editingMode !== "delete" || selectedVolume === null
      ? null
      : deleteTool === "move"
        ? "translate"
        : deleteTool === "resize"
          ? "scale"
          : null;

  const cancelDraft = useCallback((): void => {
    setConfirmOpen(false);
    setDraftVolume(null);
    setSelectedId(null);
    setEditingMode("select");
    setDeleteTool(null);
    setDeleteMenuOpen(false);
    setMobileRegion("canvas");
  }, []);

  useEffect(() => {
    if (draftVolume === null || confirmOpen) return undefined;
    const cancelOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") cancelDraft();
    };
    window.addEventListener("keydown", cancelOnEscape);
    return () => window.removeEventListener("keydown", cancelOnEscape);
  }, [cancelDraft, confirmOpen, draftVolume]);

  const changeEditingMode = (value: string): void => {
    const nextMode = value as SpatialEditingMode;
    if (nextMode === editingMode) {
      if (nextMode === "delete") setDeleteMenuOpen(true);
      return;
    }
    if (appliedVolume !== null && nextMode === "delete") return;
    setEditingMode(nextMode);
    if (nextMode === "delete") {
      setDeleteTool(draftVolume === null ? null : "move");
      setDeleteMenuOpen(true);
      if (draftVolume !== null) setSelectedId(draftVolume.id);
    } else {
      setDeleteMenuOpen(false);
    }
    setMobileRegion("canvas");
  };

  const changeDeleteTool = (value: string): void => {
    const nextTool = value as SpatialDeleteTool;
    if (editingMode !== "delete" || nextTool === deleteTool || appliedVolume !== null) return;
    if ((nextTool === "move" || nextTool === "resize") && draftVolume === null) return;
    if ((nextTool === "sphere" || nextTool === "box") && draftVolume !== null) {
      return;
    }
    setDeleteTool(nextTool);
    setDeleteMenuOpen(false);
    if (nextTool === "sphere" || nextTool === "box") {
      const volume =
        nextTool === "sphere"
          ? createSpatialEditSphere({
              id: DELETE_VOLUME_ID,
              operation: "delete",
              pose: {
                frame: POINT_CLOUD_FRAME,
                position: [0, 0, DELETE_VOLUME_RADIUS_METERS],
                orientation: quaternionFromYaw(0),
              },
              radiusMeters: DELETE_VOLUME_RADIUS_METERS,
            })
          : createSpatialEditBox({
              id: DELETE_VOLUME_ID,
              operation: "delete",
              pose: {
                frame: POINT_CLOUD_FRAME,
                position: [0, 0, DELETE_VOLUME_BOX_SIZE_METERS[2] / 2],
                orientation: quaternionFromYaw(0),
              },
              sizeMeters: DELETE_VOLUME_BOX_SIZE_METERS,
            });
      setDraftVolume(volume);
      setSelectedId(volume.id);
    } else {
      setSelectedId(draftVolume?.id ?? null);
    }
    setMobileRegion("canvas");
  };

  const handleSceneSelection = (change: SceneSelectionChange): void => {
    setSelectedId(change.entityId === draftVolume?.id ? change.entityId : null);
  };

  const placeDeleteVolume = useCallback(
    (pointInCore: Vec3): void => {
      if (!isPlacementTool || appliedVolume !== null) {
        return;
      }
      const [rawX, rawY] = pointInCore;
      const x = roundMeters(rawX);
      const y = roundMeters(rawY);
      const volume =
        draftVolume?.kind === "sphere" || (draftVolume === null && deleteTool === "sphere")
          ? createSpatialEditSphere({
              id: DELETE_VOLUME_ID,
              operation: "delete",
              pose: {
                frame: POINT_CLOUD_FRAME,
                position: [
                  x,
                  y,
                  draftVolume?.pose.position[2] ?? DELETE_VOLUME_RADIUS_METERS,
                ],
                orientation: draftVolume?.pose.orientation ?? quaternionFromYaw(0),
              },
              radiusMeters:
                draftVolume?.kind === "sphere"
                  ? draftVolume.radiusMeters
                  : DELETE_VOLUME_RADIUS_METERS,
            })
          : createSpatialEditBox({
              id: DELETE_VOLUME_ID,
              operation: "delete",
              pose: {
                frame: POINT_CLOUD_FRAME,
                position: [
                  x,
                  y,
                  draftVolume?.pose.position[2] ?? DELETE_VOLUME_BOX_SIZE_METERS[2] / 2,
                ],
                orientation: draftVolume?.pose.orientation ?? quaternionFromYaw(0),
              },
              sizeMeters:
                draftVolume?.kind === "box"
                  ? draftVolume.sizeMeters
                  : DELETE_VOLUME_BOX_SIZE_METERS,
            });
      setDraftVolume(volume);
      setSelectedId(volume.id);
      setDeleteTool("move");
      setMobileRegion("canvas");
    },
    [appliedVolume, deleteTool, draftVolume, isPlacementTool],
  );

  const updateDraftPosition = (axis: 0 | 1 | 2, value: number): void => {
    setDraftVolume((current) => {
      if (current === null || !Number.isFinite(value)) return current;
      const position: Vec3 = current.pose.position.map((component, index) =>
        index === axis ? roundMeters(value) : component,
      ) as unknown as Vec3;
      return current.kind === "sphere"
        ? createSpatialEditSphere({
            id: current.id,
            operation: current.operation,
            pose: { ...current.pose, position },
            radiusMeters: current.radiusMeters,
          })
        : createSpatialEditBox({
            id: current.id,
            operation: current.operation,
            pose: { ...current.pose, position },
            sizeMeters: current.sizeMeters,
          });
    });
  };

  const updateDraftSize = (axis: 0 | 1 | 2, value: number): void => {
    setDraftVolume((current) => {
      if (current === null || !Number.isFinite(value)) return current;
      const safeValue = Math.max(MINIMUM_EDIT_VOLUME_SIZE_METERS, roundMeters(value));
      if (current.kind === "sphere") {
        return createSpatialEditSphere({
          id: current.id,
          operation: current.operation,
          pose: current.pose,
          radiusMeters: safeValue,
        });
      }
      const sizeMeters: Vec3 = current.sizeMeters.map((component, index) =>
        index === axis ? safeValue : component,
      ) as unknown as Vec3;
      return createSpatialEditBox({
        id: current.id,
        operation: current.operation,
        pose: current.pose,
        sizeMeters,
      });
    });
  };

  const confirmDelete = (): void => {
    if (draftVolume === null) return;
    setAppliedVolume(draftVolume);
    setDraftVolume(null);
    setSelectedId(null);
    setConfirmOpen(false);
    setEditingMode("select");
    setDeleteTool(null);
    setDeleteMenuOpen(false);
    setMobileRegion("canvas");
  };

  const undoDelete = (): void => {
    setAppliedVolume(null);
    setSelectedId(null);
    setEditingMode("select");
    setDeleteTool(null);
    setDeleteMenuOpen(false);
    setMobileRegion("canvas");
  };

  const statusMessage =
    appliedVolume !== null
      ? `${affectedPointCount.toLocaleString()}개 점 삭제 미리보기 적용 · 원본 보존`
      : draftVolume !== null
        ? selectedVolume === null
          ? "삭제 범위를 선택해 이동하거나 크기를 조절하세요. Escape는 배치를 취소합니다."
          : deleteTool === "move"
            ? "축 화살표를 드래그하거나 속성 패널에서 중심 좌표를 입력하세요."
            : deleteTool === "resize"
              ? "축 핸들을 드래그하거나 속성 패널에서 크기를 입력하세요."
              : "삭제 범위 선택됨 · 이동, 크기 조절, 실행 또는 취소를 선택하세요."
        : isPlacementTool
          ? `장면을 클릭해 ${deleteTool === "sphere" ? "구" : "축 정렬 상자"} 삭제 범위를 배치하세요.`
        : editingMode === "delete"
            ? "삭제 도구를 선택한 뒤 장면에 범위를 배치하세요."
            : "영역 삭제 모드를 선택하면 세부 도구가 열립니다.";

  const deleteToolLabel =
    deleteTool === "sphere"
      ? "구"
      : deleteTool === "box"
        ? "축 정렬 상자"
        : deleteTool === "move"
          ? "이동"
          : deleteTool === "resize"
            ? "크기 조절"
            : "도구 선택";
  const toolLabel = editingMode === "select" ? "선택" : `영역 삭제 · ${deleteToolLabel}`;

  return (
    <>
      <main aria-label="PCD 공간 편집기" style={{ height: "100vh", minHeight: 480 }}>
        <CanvasEditorShell
          title="warehouse-scan.pcd"
          description={`lk-map · 원본 ${POINT_CLOUD_READY.pointCount.toLocaleString()}개 점 · 로컬 미리보기`}
          toolbar={
            <CanvasEditorCommandBar
              canRedo={false}
              canUndo={appliedVolume !== null}
              onUndo={undoDelete}
            />
          }
          responsiveNavigation={
            <SegmentedControl
              aria-label="PCD 편집기 영역"
              options={SPATIAL_EDITING_REGION_OPTIONS}
              value={mobileRegion}
              onChange={(value) => setMobileRegion(value as SpatialEditingMobileRegion)}
            />
          }
          mobileActiveRegion={mobileRegion}
          tools={
            <>
              <EditorToolbar
                label="PCD 작업 모드"
                value={editingMode}
                onChange={changeEditingMode}
                items={[
                  {
                    value: "select",
                    label: "선택",
                    icon: <Icon name="crosshair" size={16} aria-hidden="true" />,
                  },
                  {
                    value: "delete",
                    label: "영역 삭제",
                    icon: <Icon name="trash" size={16} aria-hidden="true" />,
                    disabled: appliedVolume !== null,
                    disabledReason: "실행 취소로 원본을 복원한 뒤 새 삭제 영역을 지정하세요.",
                  },
                ]}
              />
              {editingMode === "delete" ? (
                <>
                  <Divider inset={4} />
                  <DropdownMenu
                    align="left"
                    open={deleteMenuOpen}
                    onOpenChange={setDeleteMenuOpen}
                    variant="radio"
                    width={264}
                    trigger={
                      <Button
                        aria-label={`삭제 도구: ${deleteToolLabel}`}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        <Icon
                          name={
                            deleteTool === "sphere"
                              ? "circle"
                              : deleteTool === "box"
                                ? "square"
                              : deleteTool === "move"
                                ? "change"
                                : deleteTool === "resize"
                                  ? "maximize"
                                  : "trash"
                          }
                          size={16}
                          aria-hidden="true"
                        />
                        {`삭제 도구 · ${deleteToolLabel}`}
                        <Icon name="chevron-down" size={14} aria-hidden="true" />
                      </Button>
                    }
                    items={[
                      {
                        label: "구 범위 배치",
                        description: "구 형태의 삭제 범위를 장면에 배치",
                        icon: <Icon name="circle" size={16} aria-hidden="true" />,
                        checked: deleteTool === "sphere",
                        disabled: draftVolume !== null || appliedVolume !== null,
                        onClick: () => changeDeleteTool("sphere"),
                      },
                      {
                        label: "축 정렬 상자 범위 배치",
                        description: "lk-map 축에 맞춘 상자 삭제 범위를 장면에 배치",
                        icon: <Icon name="square" size={16} aria-hidden="true" />,
                        checked: deleteTool === "box",
                        disabled: draftVolume !== null || appliedVolume !== null,
                        onClick: () => changeDeleteTool("box"),
                      },
                      { divider: true },
                      {
                        label: "삭제 영역 이동",
                        description: "선택한 범위의 중심 위치 조절",
                        icon: <Icon name="change" size={16} aria-hidden="true" />,
                        checked: deleteTool === "move",
                        disabled: draftVolume === null,
                        onClick: () => changeDeleteTool("move"),
                      },
                      {
                        label: "삭제 영역 크기 조절",
                        description: "선택한 범위의 반경 또는 각 축 크기 조절",
                        icon: <Icon name="maximize" size={16} aria-hidden="true" />,
                        checked: deleteTool === "resize",
                        disabled: draftVolume === null,
                        onClick: () => changeDeleteTool("resize"),
                      },
                    ]}
                  />
                </>
              ) : null}
            </>
          }
          toolsLabel="PCD 편집 도구"
          panel={
            <SelectionInspector
              title="선택한 삭제 영역"
              emptyLabel={
                appliedVolume !== null
                  ? "삭제 미리보기가 적용되었습니다. 상단 실행 취소로 원본을 복원할 수 있습니다."
                  : draftVolume !== null
                    ? "장면에서 삭제 영역을 선택해 이동하거나 크기를 조절하세요."
                    : isPlacementTool
                      ? "장면을 클릭해 삭제 영역을 배치하세요."
                      : "구 또는 축 정렬 상자 삭제 도구를 선택하세요."
              }
              item={
                selectedVolume === null
                  ? null
                  : {
                      label: "삭제 영역 1",
                      kind:
                        selectedVolume.kind === "sphere"
                          ? "구 삭제 범위"
                          : "축 정렬 상자 삭제 범위",
                      status: "실행 전",
                      statusTone: "negative",
                    }
              }
              sections={
                selectedVolume === null
                  ? []
                  : [
                      {
                        title: "삭제 범위",
                        fields: [
                          {
                            label: "형태",
                            value: selectedVolume.kind === "sphere" ? "구" : "축 정렬 상자",
                          },
                          {
                            label: "예상 삭제",
                            value: affectedPointCount,
                            unit: "개 점",
                            tone: affectedPointCount === 0 ? "cautionary" : "negative",
                          },
                          {
                            label: "전체 비율",
                            value: `${affectedPointPercent.toFixed(1)}%`,
                            tone: affectedPointCount === 0 ? "cautionary" : "negative",
                          },
                        ],
                      },
                      {
                        title: "중심 위치",
                        children: (
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                              gap: "var(--space-2)",
                            }}
                          >
                            {(["X", "Y", "Z"] as const).map((axisLabel, axis) => (
                              <FormField key={axisLabel} label={`${axisLabel} (m)`}>
                                <NumberField
                                  aria-label={`삭제 영역 중심 ${axisLabel}`}
                                  size="sm"
                                  step={0.05}
                                  value={selectedVolume.pose.position[axis] ?? 0}
                                  onChange={(value) =>
                                    updateDraftPosition(axis as 0 | 1 | 2, value)
                                  }
                                  style={{ width: "100%" }}
                                />
                              </FormField>
                            ))}
                          </div>
                        ),
                      },
                      {
                        title: "크기",
                        children:
                          selectedVolume.kind === "sphere" ? (
                            <FormField label="반경 (m)">
                              <NumberField
                                aria-label="삭제 구 반경"
                                min={MINIMUM_EDIT_VOLUME_SIZE_METERS}
                                size="sm"
                                step={0.05}
                                value={selectedVolume.radiusMeters}
                                onChange={(value) => updateDraftSize(0, value)}
                                style={{ width: "100%" }}
                              />
                            </FormField>
                          ) : (
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                                gap: "var(--space-2)",
                              }}
                            >
                              {(["가로", "세로", "높이"] as const).map((label, axis) => (
                                <FormField key={label} label={`${label} (m)`}>
                                  <NumberField
                                    aria-label={`삭제 축 정렬 상자 ${label}`}
                                    min={MINIMUM_EDIT_VOLUME_SIZE_METERS}
                                    size="sm"
                                    step={0.05}
                                    value={selectedVolume.sizeMeters[axis] ?? 0}
                                    onChange={(value) => updateDraftSize(axis as 0 | 1 | 2, value)}
                                    style={{ width: "100%" }}
                                  />
                                </FormField>
                              ))}
                            </div>
                          ),
                      },
                      {
                        title: "원본",
                        fields: [
                          { label: "프레임", value: selectedVolume.pose.frame },
                          { label: "처리", value: "파생 미리보기 · 원본 보존" },
                        ],
                      },
                    ]
              }
              actions={
                selectedVolume === null ? undefined : (
                  <>
                    <Button size="sm" type="button" variant="ghost" onClick={cancelDraft}>
                      배치 취소
                    </Button>
                    <Button
                      size="sm"
                      type="button"
                      variant="danger"
                      disabled={affectedPointCount === 0}
                      onClick={() => setConfirmOpen(true)}
                      style={{ marginInlineStart: "auto" }}
                    >
                      선택 영역 삭제
                    </Button>
                  </>
                )
              }
              {...(selectedVolume === null
                ? {}
                : {
                    onClearSelection: () => {
                      setSelectedId(null);
                    },
                  })}
            />
          }
          status={
            <ViewportStatusBar
              items={[
                {
                  label: "도구",
                  value: toolLabel,
                  priority: "high",
                  tone: editingMode === "select" ? "signal" : "cautionary",
                  toneLabel: editingMode === "select" ? "기본" : "활성",
                },
                { label: "프레임", value: POINT_CLOUD_FRAME, mono: true },
                {
                  label: "표시 점",
                  value: renderedSnapshot.pointCount,
                  priority: "low",
                },
                {
                  label: "선택",
                  value: selectedVolume === null ? "없음" : "삭제 영역 1",
                  priority: "low",
                },
              ]}
              message={statusMessage}
              messageTone={
                appliedVolume !== null
                  ? "positive"
                  : editingMode !== "select"
                    ? "cautionary"
                    : "default"
              }
            />
          }
          panelWidth={304}
          resizablePanels
        >
          <Scene3DFrame
            appearance="dark"
            label="MapConvert3D PCD 공간 편집 뷰포트"
            title="PCD 삭제 범위 미리보기"
            badges={
              <StatusBadge
                className="lds3d-viewer-status-badge"
                tone={
                  appliedVolume !== null
                    ? "positive"
                    : draftVolume !== null
                      ? "negative"
                      : isPlacementTool
                        ? "cautionary"
                        : "signal"
                }
              >
                {appliedVolume !== null
                  ? "미리보기 적용"
                    : draftVolume !== null
                      ? `${draftVolume.kind === "sphere" ? "구" : "축 정렬 상자"} 삭제 범위 초안`
                    : isPlacementTool
                      ? `${deleteTool === "sphere" ? "구" : "축 정렬 상자"} 영역 지정`
                      : "선택 모드"}
              </StatusBadge>
            }
            hud={
              draftVolume !== null
                ? `${draftVolume.kind === "sphere" ? "구" : "축 정렬 상자"} · ${affectedPointCount.toLocaleString()}개 점 포함`
                : isPlacementTool
                  ? "장면을 클릭해 배치"
                  : `${renderedSnapshot.pointCount.toLocaleString()}개 점`
            }
            state="ready"
            status={`${cameraMode === "home" ? "기본" : cameraMode === "top" ? "상단" : cameraMode === "focus" ? "초점" : "자유"} 시점 · ${transformMode === "scale" ? "Local" : "Target"} 공간 · 원본 보존`}
            variant="embedded"
            style={{ height: "100%" }}
            toolbar={
              <ViewerToolbar appearance="surface" label="PCD 카메라 프리셋">
                <ViewerToolbarButton
                  kind="toggle"
                  label="기본 시점"
                  pressed={cameraMode === "home"}
                  onClick={() => setCameraMode("home")}
                >
                  <Icon name="home" size={16} aria-hidden="true" />
                </ViewerToolbarButton>
                <ViewerToolbarButton
                  kind="toggle"
                  label="상단 시점"
                  pressed={cameraMode === "top"}
                  onClick={() => setCameraMode("top")}
                >
                  <Icon name="map" size={16} aria-hidden="true" />
                </ViewerToolbarButton>
              </ViewerToolbar>
            }
          >
            <SceneCanvas
              ariaLabel="영역 삭제 도구로 삭제 범위를 배치할 수 있는 MapConvert3D PCD WebGL 장면"
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
              onCameraModeChange={setCameraMode}
              onSelectionChange={handleSceneSelection}
              profile="diagnostic-technical"
              renderQuality="balanced"
              renderState={{ kind: "ready" }}
              selectedEntityId={selectedId}
              style={{
                height: "100%",
                minHeight: 420,
                borderRadius: 0,
                cursor:
                  isPlacementTool && appliedVolume === null
                    ? "crosshair"
                    : "default",
              }}
              topBounds={POINT_CLOUD_FOCUS_BOUNDS}
            >
              {deletePartition === null ? (
                <PointCloudLayer
                  colorMode="height"
                  fallbackColor="#6cb6ff"
                  heightRange={[0, 1.6]}
                  maxPoints={50_000}
                  pointSize={1.75}
                  snapshot={POINT_CLOUD_READY}
                />
              ) : (
                <DeletePointCloudPreview
                  applied={appliedVolume !== null}
                  partition={deletePartition}
                />
              )}
              <MapEditorPlacementSurface
                elevationMeters={0}
                enabled={isPlacementTool && appliedVolume === null}
                extentMeters={[18, 18]}
                snapMeters={0.05}
                onPlace={placeDeleteVolume}
              />
              {draftVolume === null ? null : (
                <EditVolumeTransformGizmo
                  volume={draftVolume}
                  mode={transformMode}
                  onChange={(volume) => {
                    setDraftVolume(volume);
                    setSelectedId(volume.id);
                  }}
                />
              )}
            </SceneCanvas>
          </Scene3DFrame>
        </CanvasEditorShell>
      </main>
      <ConfirmDialog
        open={confirmOpen}
        tone="danger"
        title="선택 영역을 삭제할까요?"
        confirmLabel="영역 삭제"
        cancelLabel="취소"
        confirmDisabled={affectedPointCount === 0}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmOpen(false)}
      >
        {draftVolume?.kind === "box" ? "축 정렬 상자" : "구"} 안의 {affectedPointCount.toLocaleString()}개
        점을 Storybook 미리보기에서 제외합니다. 원본 PCD 스냅샷은 변경하지 않습니다.
      </ConfirmDialog>
    </>
  );
}

export const LdsIntegration: Story = {
  name: "개요",
  render: () => <FocusedPointCloudViewerExperience />,
};
