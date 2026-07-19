import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Button,
  CanvasEditorCommandBar,
  CanvasEditorShell,
  ConfirmDialog,
  Divider,
  EditorToolbar,
  FloorSelector,
  Icon,
  Input,
  NumberField,
  Scene3DFrame,
  SegmentedControl,
  Select,
  SelectionInspector,
  Stack,
  StatusBadge,
  Tree,
  ViewerToolbar,
  ViewerToolbarButton,
  ViewportStatusBar,
} from "@lk-robotics/design-system-core";
import {
  GoalMarker,
  SceneCanvas,
  SpatialStructure,
  type SceneCameraMode,
  type SceneCameraPose,
} from "@lk-robotics/design-system-3d-r3f";
import {
  appendSpatialPointDraftPoint,
  beginSpatialGoalPoseDrag,
  beginSpatialPointDraft,
  cancelSpatialPointDraft,
  createSpatialStructure,
  entityId,
  finishSpatialGoalPoseDrag,
  finishSpatialPointDraft,
  pose3,
  previewSpatialGoalPoseHeading,
  previewSpatialPointDraftCursor,
  quaternionFromYaw,
  removeLastSpatialPointDraftPoint,
  spatialNodeTransform,
  type Bounds3,
  type EntityId,
  type SpatialAuthoringIssue,
  type SpatialGoalPoseDragSession,
  type SpatialGoalPoseHeadingPreview,
  type SpatialPointDraftSession,
  type SpatialStructureNode,
  type SpatialTransformAxis,
  type SpatialTransformChangeSet,
  type SpatialTransformMode,
  type SpatialTransformSnap,
  type Vec3,
} from "@lk-robotics/design-system-3d-core";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";

import {
  addMapArea,
  addMapGoal,
  addMapObject,
  addMapRoute,
  createMapEditorDocument,
  deleteMapEntity,
  duplicateMapEntity,
  freezeMapEditorDocument,
  renameMapEntity,
  replaceMapEntityTransform,
  serializeMapEditorDocument,
  stepMapEntityTransform,
  updateMapAreaPoints,
  updateMapGoalPose,
  updateMapRoutePoints,
  type MapAreaCategory,
  type MapEditorDocument,
  type MapObjectKind,
  type MapRouteTraversal,
} from "./map-editor-model.js";
import {
  mapObjectFootprintCenterOffset,
  mapObjectFootprintSize,
  validateMapObjectPlacement,
  type MapObjectPlacementValidity,
} from "./map-editor-placement.js";
import {
  isMapEditorAreaCloseCandidate,
  MapEditorArea,
  MapEditorAreaDraft,
  MapEditorAuthoringSurface,
  MapEditorGoalDraft,
  MapEditorPlacementGhost,
  MapEditorRoute,
  MapEditorRouteDraft,
  MapEditorSnapCue,
  renderMapEditorAsset,
  type MapEditorHeadingGesture,
  type MapEditorSnapResult,
} from "./map-editor-webgl.js";
import { SPATIAL_STRUCTURE_FIXTURE } from "./spatial-structure-fixture.js";

const meta = {
  title: "LDS 3D/LDS Integration/Spatial Editor",
  id: "lds-3d-scenes-spatial-authoring-foundation",
  parameters: {
    canvasShell: "flush",
    controls: { disable: true },
    layout: "fullscreen",
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

type AuthoringDomain = "structure" | "navigation" | "areas";
type MobileRegion = "canvas" | "layers" | "panel";
type MapEditorTool =
  | "select"
  | SpatialTransformMode
  | "place-box"
  | "place-column"
  | "place-asset"
  | "place-goal"
  | "draw-route"
  | "draw-area";

interface MapHistory {
  readonly past: readonly MapEditorDocument[];
  readonly present: MapEditorDocument;
  readonly future: readonly MapEditorDocument[];
}

interface MapTreeNode {
  readonly id: string;
  readonly label: ReactNode;
  readonly icon?: ReactNode;
  readonly children?: MapTreeNode[];
}

interface GoalDraftState {
  readonly session: SpatialGoalPoseDragSession;
  readonly preview: SpatialGoalPoseHeadingPreview;
}

type InspectorSections = NonNullable<
  ComponentProps<typeof SelectionInspector>["sections"]
>;
type SnapPresetName = "fine" | "normal" | "coarse";

const HISTORY_LIMIT = 50;
const GROUND_LEVEL_ID = entityId("site/building/ground");
const UPPER_LEVEL_ID = entityId("site/building/upper");
const FLOOR_OPTIONS = [
  { value: UPPER_LEVEL_ID, label: "2F" },
  { value: GROUND_LEVEL_ID, label: "1F" },
];

const INITIAL_LABELS: Readonly<Record<string, string>> = {
  site: "LK Robotics 캠퍼스",
  "site/building": "운영동",
  "site/building/ground": "1F · 지상층",
  "site/floor/ground": "1F 바닥",
  "site/wall/ground-north": "1F 북쪽 벽",
  "site/wall/ground-west": "1F 서쪽 벽",
  "site/object/work-cell": "작업 셀",
  "site/object/safety-column": "안전 기둥",
  "site/building/upper": "2F · 상층",
  "site/floor/upper": "2F 바닥",
  "site/wall/upper-north": "2F 북쪽 벽",
  "site/wall/upper-east": "2F 동쪽 벽",
};

function createInitialDocument(): MapEditorDocument {
  let document = createMapEditorDocument(SPATIAL_STRUCTURE_FIXTURE, {
    documentId: entityId("map/operations-building"),
    name: "운영동 3D 맵",
    labels: INITIAL_LABELS,
  });
  document = addMapRoute(
    document,
    GROUND_LEVEL_ID,
    [
      [-3, 1.8, 0],
      [-1.8, 1.8, 0],
      [-1.2, 0.8, 0],
      [-0.5, 0.8, 0],
    ],
    { traversal: "bidirectional" },
  ).document;
  document = addMapArea(
    document,
    GROUND_LEVEL_ID,
    [
      [-3, -2.45, 0],
      [-1.75, -2.45, 0],
      [-1.75, -1.25, 0],
      [-3, -1.25, 0],
    ],
    { category: "keepout" },
  ).document;
  return addMapGoal(
    document,
    GROUND_LEVEL_ID,
    pose3(document.frame, [-0.5, 0.8, 0], quaternionFromYaw(Math.PI / 2)),
  ).document;
}

const INITIAL_DOCUMENT = createInitialDocument();
const AUTHORING_BOUNDS: Bounds3 = {
  frame: SPATIAL_STRUCTURE_FIXTURE.frame,
  min: [-5, -4, -0.3],
  max: [5, 4, 6],
};

function validateObjectPlacement(
  document: MapEditorDocument,
  levelId: EntityId,
  kind: MapObjectKind,
  point: Vec3,
): MapObjectPlacementValidity {
  return validateMapObjectPlacement(document, levelId, kind, point, {
    authoringBounds: AUTHORING_BOUNDS,
  });
}

const AUTHORING_HOME: SceneCameraPose = {
  position: [10.5, -13, 9.5],
  target: [0, 0, 2.2],
  up: [0, 0, 1],
};

const DOMAIN_OPTIONS = [
  { value: "structure", label: "구조·자산" },
  { value: "navigation", label: "경로·목표" },
  { value: "areas", label: "구역" },
];

const REGION_OPTIONS = [
  { value: "canvas", label: "장면" },
  { value: "layers", label: "계층" },
  { value: "panel", label: "속성" },
];

const AXIS_OPTIONS = [
  { value: "x", label: "X" },
  { value: "y", label: "Y" },
  { value: "z", label: "Z" },
];

const ROUTE_TRAVERSAL_OPTIONS = [
  { value: "bidirectional", label: "양방향" },
  { value: "forward", label: "정방향" },
  { value: "reverse", label: "역방향" },
];

const AREA_CATEGORY_OPTIONS = [
  { value: "generic", label: "일반" },
  { value: "keepout", label: "진입 금지" },
  { value: "slow", label: "감속" },
  { value: "work", label: "작업" },
];

const NORMAL_SNAP: SpatialTransformSnap = {
  translationMeters: 0.25,
  rotationRadians: Math.PI / 12,
  scaleStep: 0.1,
};

const SNAP_PRESETS: Readonly<Record<SnapPresetName, SpatialTransformSnap>> = {
  fine: { translationMeters: 0.1, rotationRadians: Math.PI / 36, scaleStep: 0.05 },
  normal: NORMAL_SNAP,
  coarse: { translationMeters: 0.5, rotationRadians: Math.PI / 6, scaleStep: 0.25 },
};

const SNAP_OPTIONS = [
  { value: "fine", label: "정밀 · 0.10 m / 5°" },
  { value: "normal", label: "표준 · 0.25 m / 15°" },
  { value: "coarse", label: "거침 · 0.50 m / 30°" },
];

const BASE_TOOLS = [
  {
    value: "select",
    label: "선택",
    shortcut: "Q",
    ariaKeyShortcuts: "Q",
    icon: <Icon name="crosshair" size={16} aria-hidden="true" />,
  },
  {
    value: "translate",
    label: "이동",
    shortcut: "W",
    ariaKeyShortcuts: "W",
    icon: <Icon name="change" size={16} aria-hidden="true" />,
  },
  {
    value: "rotate",
    label: "회전",
    shortcut: "E",
    ariaKeyShortcuts: "E",
    icon: <Icon name="refresh" size={16} aria-hidden="true" />,
  },
  {
    value: "scale",
    label: "크기 조절",
    shortcut: "R",
    ariaKeyShortcuts: "R",
    icon: <Icon name="maximize" size={16} aria-hidden="true" />,
  },
] as const;

const DOMAIN_AUTHORING_TOOLS = {
  structure: [
    {
      value: "place-box",
      label: "박스 배치",
      icon: <Icon name="square-plus" size={16} aria-hidden="true" />,
    },
    {
      value: "place-column",
      label: "기둥 배치",
      icon: <Icon name="column" size={16} aria-hidden="true" />,
    },
    {
      value: "place-asset",
      label: "TRON GLB 배치",
      icon: <Icon name="robot" size={16} aria-hidden="true" />,
    },
  ],
  navigation: [
    {
      value: "place-goal",
      label: "목표 자세",
      icon: <Icon name="waypoint" size={16} aria-hidden="true" />,
    },
    {
      value: "draw-route",
      label: "경로 그리기",
      icon: <Icon name="route" size={16} aria-hidden="true" />,
    },
  ],
  areas: [
    {
      value: "draw-area",
      label: "구역 그리기",
      icon: <Icon name="zone" size={16} aria-hidden="true" />,
    },
  ],
} as const;

function isTransformMode(value: MapEditorTool): value is SpatialTransformMode {
  return value === "translate" || value === "rotate" || value === "scale";
}

function isAuthoringTool(value: MapEditorTool): boolean {
  return value.startsWith("place-") || value.startsWith("draw-");
}

function pointDraftKind(
  tool: MapEditorTool,
): SpatialPointDraftSession["kind"] | null {
  if (tool === "draw-route") return "polyline";
  if (tool === "draw-area") return "polygon";
  return null;
}

function objectKindForTool(tool: MapEditorTool): MapObjectKind | null {
  if (tool === "place-box") return "box";
  if (tool === "place-column") return "column";
  if (tool === "place-asset") return "asset";
  return null;
}

function toolLabel(tool: MapEditorTool): string {
  if (tool === "select") return "선택";
  if (tool === "translate") return "이동";
  if (tool === "rotate") return "회전";
  if (tool === "scale") return "크기 조절";
  if (tool === "place-box") return "박스 배치";
  if (tool === "place-column") return "기둥 배치";
  if (tool === "place-asset") return "TRON GLB 배치";
  if (tool === "place-goal") return "목표 자세";
  if (tool === "draw-route") return "경로 그리기";
  return "구역 그리기";
}

function axisLabel(index: number): string {
  return (["X", "Y", "Z"] as const)[index] ?? "?";
}

function floorLabel(levelId: EntityId): string {
  return levelId === GROUND_LEVEL_ID ? "1F" : "2F";
}

function structureNodeIcon(node: SpatialStructureNode): ReactNode {
  if (node.kind === "site") return <Icon name="map" size={16} aria-hidden="true" />;
  if (node.kind === "building") {
    return <Icon name="company" size={16} aria-hidden="true" />;
  }
  if (node.kind === "level") {
    return <Icon name="layers" size={16} aria-hidden="true" />;
  }
  if (node.kind === "asset") return <Icon name="robot" size={16} aria-hidden="true" />;
  if (node.role === "wall") return <Icon name="column" size={16} aria-hidden="true" />;
  if (node.role === "floor") return <Icon name="square" size={16} aria-hidden="true" />;
  return <Icon name="component" size={16} aria-hidden="true" />;
}

function selectedTreeLabel(label: string, selected: boolean): string {
  return selected ? `${label} · 선택됨` : label;
}

function levelChildren(
  document: MapEditorDocument,
  levelId: EntityId,
  selectedId: EntityId | null,
): MapTreeNode[] {
  return [
    ...document.routes
      .filter((route) => route.levelId === levelId)
      .map((route) => ({
        id: route.id,
        label: selectedTreeLabel(
          document.labels[route.id] ?? route.id,
          selectedId === route.id,
        ),
        icon: <Icon name="route" size={16} aria-hidden="true" />,
      })),
    ...document.areas
      .filter((area) => area.levelId === levelId)
      .map((area) => ({
        id: area.id,
        label: selectedTreeLabel(
          document.labels[area.id] ?? area.id,
          selectedId === area.id,
        ),
        icon: <Icon name="zone" size={16} aria-hidden="true" />,
      })),
    ...document.goals
      .filter((goal) => goal.levelId === levelId)
      .map((goal) => ({
        id: goal.id,
        label: selectedTreeLabel(
          document.labels[goal.id] ?? goal.id,
          selectedId === goal.id,
        ),
        icon: <Icon name="waypoint" size={16} aria-hidden="true" />,
      })),
  ];
}

function mapTree(
  document: MapEditorDocument,
  selectedId: EntityId | null,
): MapTreeNode[] {
  const childrenByParent = new Map<EntityId, SpatialStructureNode[]>();
  const roots: SpatialStructureNode[] = [];
  document.structure.nodes.forEach((node) => {
    if (node.parentId === undefined) roots.push(node);
    else {
      childrenByParent.set(node.parentId, [
        ...(childrenByParent.get(node.parentId) ?? []),
        node,
      ]);
    }
  });
  const toTreeNode = (node: SpatialStructureNode): MapTreeNode => {
    const structuralChildren = childrenByParent.get(node.id) ?? [];
    const authoredChildren =
      node.kind === "level" ? levelChildren(document, node.id, selectedId) : [];
    const children = [
      ...structuralChildren.map(toTreeNode),
      ...authoredChildren,
    ];
    return {
      id: node.id,
      label: selectedTreeLabel(
        document.labels[node.id] ?? node.id,
        selectedId === node.id,
      ),
      icon: structureNodeIcon(node),
      ...(children.length === 0 ? {} : { children }),
    };
  };
  return roots.map(toTreeNode);
}

function structureNodeLevelId(
  document: MapEditorDocument,
  nodeId: EntityId,
): EntityId | null {
  let current = document.structure.nodes.find((node) => node.id === nodeId);
  while (current !== undefined) {
    if (current.kind === "level") return current.id;
    if (current.parentId === undefined) return null;
    current = document.structure.nodes.find((node) => node.id === current?.parentId);
  }
  return null;
}

function entityLevelId(
  document: MapEditorDocument,
  id: EntityId,
): EntityId | null {
  return (
    document.routes.find((route) => route.id === id)?.levelId ??
    document.areas.find((area) => area.id === id)?.levelId ??
    document.goals.find((goal) => goal.id === id)?.levelId ??
    structureNodeLevelId(document, id)
  );
}

function hasEntity(document: MapEditorDocument, id: EntityId): boolean {
  return (
    document.structure.nodes.some((node) => node.id === id) ||
    document.routes.some((route) => route.id === id) ||
    document.areas.some((area) => area.id === id) ||
    document.goals.some((goal) => goal.id === id)
  );
}

function selectedKindLabel(
  node: SpatialStructureNode | undefined,
  hasGoal: boolean,
  hasRoute: boolean,
  hasArea: boolean,
): string {
  if (hasGoal) return "목표 자세";
  if (hasRoute) return "경로";
  if (hasArea) return "구역";
  if (node?.kind === "asset") return "GLB 자산";
  if (node?.kind === "primitive") {
    if (node.role === "floor") return "바닥";
    if (node.role === "wall") return "벽";
    return "프리미티브";
  }
  if (node?.kind === "level") return "층";
  if (node?.kind === "building") return "건물";
  return "부지";
}

function historyAfterCommit(
  history: MapHistory,
  next: MapEditorDocument,
): MapHistory {
  if (
    serializeMapEditorDocument(history.present) ===
    serializeMapEditorDocument(next)
  ) {
    return history;
  }
  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present: next,
    future: [],
  };
}

function editableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.matches("input, textarea, select") || target.isContentEditable)
  );
}

function yawRadiansFromQuaternion(
  quaternion: readonly [number, number, number, number],
): number {
  const [x, y, z, w] = quaternion;
  return Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
}

function areaColor(category: MapAreaCategory): string {
  if (category === "keepout") return "#ef6a78";
  if (category === "slow") return "#f4b942";
  if (category === "work") return "#47b8a5";
  return "#5da9e9";
}

function authoringIssueLabel(issue: SpatialAuthoringIssue | undefined): string {
  if (issue === undefined) return "초안을 완료할 수 없습니다.";
  if (issue.code === "TOO_FEW_POINTS") return "완료하려면 점이 더 필요합니다.";
  if (issue.code === "ZERO_XY_AREA") return "구역은 실제 면적을 가져야 합니다.";
  if (issue.code === "NON_PLANAR_POLYGON") {
    return "모든 꼭짓점은 같은 높이에 있어야 합니다.";
  }
  if (issue.code === "SELF_INTERSECTING_POLYGON") {
    return "구역 경계는 서로 교차할 수 없습니다.";
  }
  if (issue.code === "CONSECUTIVE_DUPLICATE_POINT") {
    return "같은 점을 연속으로 추가할 수 없습니다.";
  }
  if (issue.code === "POINT_TOO_CLOSE") return "이전 점과 너무 가깝습니다.";
  if (issue.code === "GOAL_HEADING_TOO_SHORT") {
    return "방향을 표시할 만큼 더 길게 드래그하세요.";
  }
  return "유효한 좌표가 필요합니다.";
}

function boundsAroundPoints(
  frame: Bounds3["frame"],
  points: readonly Vec3[],
  margin = 0.65,
): Bounds3 | undefined {
  if (points.length === 0) return undefined;
  return {
    frame,
    min: [
      Math.min(...points.map((point) => point[0])) - margin,
      Math.min(...points.map((point) => point[1])) - margin,
      Math.min(...points.map((point) => point[2])) - margin,
    ],
    max: [
      Math.max(...points.map((point) => point[0])) + margin,
      Math.max(...points.map((point) => point[1])) + margin,
      Math.max(...points.map((point) => point[2])) + margin,
    ],
  };
}

function selectedBounds(
  document: MapEditorDocument,
  selectedId: EntityId | null,
): Bounds3 | undefined {
  if (selectedId === null) return undefined;
  const route = document.routes.find((candidate) => candidate.id === selectedId);
  if (route !== undefined) return boundsAroundPoints(document.frame, route.points);
  const area = document.areas.find((candidate) => candidate.id === selectedId);
  if (area !== undefined) return boundsAroundPoints(document.frame, area.points);
  const goal = document.goals.find((candidate) => candidate.id === selectedId);
  if (goal !== undefined) {
    return boundsAroundPoints(document.frame, [goal.pose.position], 0.8);
  }
  const node = document.structure.nodes.find((candidate) => candidate.id === selectedId);
  if (node === undefined || node.kind === "site" || node.kind === "building") {
    return undefined;
  }
  const levelId = structureNodeLevelId(document, node.id);
  const level = document.structure.nodes.find((candidate) => candidate.id === levelId);
  const elevation = level?.kind === "level" ? level.elevationMeters : 0;
  return boundsAroundPoints(
    document.frame,
    [
      [
        node.transform.translation[0],
        node.transform.translation[1],
        node.transform.translation[2] + elevation,
      ],
    ],
    1,
  );
}

function SpatialMapEditor(): ReactNode {
  const editorRef = useRef<HTMLElement>(null);
  const [history, setHistory] = useState<MapHistory>({
    past: [],
    present: INITIAL_DOCUMENT,
    future: [],
  });
  const [selectedId, setSelectedId] = useState<EntityId | null>(null);
  const [activeFloorId, setActiveFloorId] =
    useState<EntityId>(GROUND_LEVEL_ID);
  const [domain, setDomain] = useState<AuthoringDomain>("structure");
  const [tool, setTool] = useState<MapEditorTool>("select");
  const [mode, setMode] = useState<SpatialTransformMode>("translate");
  const [axis, setAxis] = useState<SpatialTransformAxis>("x");
  const [snapPreset, setSnapPreset] = useState<SnapPresetName>("normal");
  const [cameraMode, setCameraMode] = useState<SceneCameraMode>("home");
  const [mobileRegion, setMobileRegion] = useState<MobileRegion>("canvas");
  const [lastAction, setLastAction] = useState("맵 문서 준비됨");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [pointDraft, setPointDraft] =
    useState<SpatialPointDraftSession | null>(null);
  const [goalDraft, setGoalDraft] = useState<GoalDraftState | null>(null);
  const [hoverSnap, setHoverSnap] = useState<MapEditorSnapResult | null>(null);
  const [draftIssues, setDraftIssues] = useState<
    readonly SpatialAuthoringIssue[]
  >([]);
  const [authoringGestureActive, setAuthoringGestureActive] = useState(false);
  const [draftInput, setDraftInput] = useState<Vec3>([0, 0, 0]);
  const [draftHeadingDegrees, setDraftHeadingDegrees] = useState(0);

  const document = history.present;
  const snap = SNAP_PRESETS[snapPreset];
  const selectedNode = document.structure.nodes.find(
    (node) => node.id === selectedId,
  );
  const selectedGoal = document.goals.find((goal) => goal.id === selectedId);
  const selectedRoute = document.routes.find((route) => route.id === selectedId);
  const selectedArea = document.areas.find((area) => area.id === selectedId);
  const selectedEntityLevel =
    selectedId === null ? null : entityLevelId(document, selectedId);
  const transformable =
    selectedNode?.kind === "primitive" || selectedNode?.kind === "asset"
      ? selectedNode
      : undefined;
  const selectedLeaf =
    transformable !== undefined ||
    selectedGoal !== undefined ||
    selectedRoute !== undefined ||
    selectedArea !== undefined;
  const activeLevel = document.structure.nodes.find(
    (node) => node.id === activeFloorId,
  );
  const activeElevation =
    activeLevel?.kind === "level" ? activeLevel.elevationMeters : 0;
  const authoring = isAuthoringTool(tool);
  const objectKind = objectKindForTool(tool);
  const focusBounds = useMemo(
    () => selectedBounds(document, selectedId),
    [document, selectedId],
  );

  const visibleStructure = useMemo(
    () =>
      createSpatialStructure(
        document.frame,
        document.structure.nodes.map((node) =>
          node.kind === "level"
            ? { ...node, visible: node.id === activeFloorId }
            : node,
        ),
      ),
    [activeFloorId, document.frame, document.structure.nodes],
  );
  const visibleGoals = useMemo(
    () => document.goals.filter((goal) => goal.levelId === activeFloorId),
    [activeFloorId, document.goals],
  );
  const visibleRoutes = useMemo(
    () => document.routes.filter((route) => route.levelId === activeFloorId),
    [activeFloorId, document.routes],
  );
  const visibleAreas = useMemo(
    () => document.areas.filter((area) => area.levelId === activeFloorId),
    [activeFloorId, document.areas],
  );
  const visibleObjectCount = useMemo(
    () =>
      document.structure.nodes.filter(
        (node) =>
          (node.kind === "primitive" || node.kind === "asset") &&
          structureNodeLevelId(document, node.id) === activeFloorId,
      ).length,
    [activeFloorId, document],
  );
  const hoverPlacementValidity = useMemo(
    () =>
      objectKind === null || hoverSnap === null
        ? null
        : validateObjectPlacement(
            document,
            activeFloorId,
            objectKind,
            hoverSnap.snapped,
          ),
    [activeFloorId, document, hoverSnap, objectKind],
  );
  const keyboardPlacementValidity = useMemo(
    () =>
      objectKind === null
        ? null
        : validateObjectPlacement(document, activeFloorId, objectKind, [
            draftInput[0],
            draftInput[1],
            activeElevation,
          ]),
    [activeElevation, activeFloorId, document, draftInput, objectKind],
  );
  const snapTargets = useMemo(
    () => [
      ...visibleRoutes.flatMap((route) => route.points),
      ...visibleAreas.flatMap((area) => area.points),
      ...visibleGoals.map((goal) => goal.pose.position),
    ],
    [visibleAreas, visibleGoals, visibleRoutes],
  );
  const treeNodes = useMemo(
    () => mapTree(document, selectedId),
    [document, selectedId],
  );
  const tools = useMemo(
    () =>
      domain === "structure"
        ? [...BASE_TOOLS, ...DOMAIN_AUTHORING_TOOLS.structure]
        : [BASE_TOOLS[0], ...DOMAIN_AUTHORING_TOOLS[domain]],
    [domain],
  );

  const createEmptyPointDraft = useCallback(
    (nextTool: MapEditorTool): SpatialPointDraftSession | null => {
      const kind = pointDraftKind(nextTool);
      if (kind === null) return null;
      return beginSpatialPointDraft({
        kind,
        frame: document.frame,
        minPointDistanceMeters: Math.max(0.05, snap.translationMeters / 2),
      });
    },
    [document.frame, snap.translationMeters],
  );

  const clearTransientDraft = useCallback((): void => {
    setPointDraft(null);
    setGoalDraft(null);
    setHoverSnap(null);
    setDraftIssues([]);
    setAuthoringGestureActive(false);
  }, []);

  const chooseTool = useCallback(
    (nextTool: MapEditorTool): void => {
      setTool(nextTool);
      if (isTransformMode(nextTool)) setMode(nextTool);
      setPointDraft(createEmptyPointDraft(nextTool));
      setGoalDraft(null);
      setHoverSnap(null);
      setDraftIssues([]);
      setAuthoringGestureActive(false);
      if (isAuthoringTool(nextTool)) {
        setSelectedId(null);
        setMobileRegion("canvas");
      }
      setLastAction(
        isAuthoringTool(nextTool)
          ? `${toolLabel(nextTool)} · ${floorLabel(activeFloorId)}에서 저작`
          : `${toolLabel(nextTool)} 도구 활성`,
      );
    },
    [activeFloorId, createEmptyPointDraft],
  );

  const commitDocument = useCallback(
    (next: MapEditorDocument, message: string): void => {
      setHistory((current) => historyAfterCommit(current, next));
      setLastAction(message);
    },
    [],
  );

  const undo = useCallback((): void => {
    setHistory((current) => {
      const previous = current.past.at(-1);
      if (previous === undefined) return current;
      return {
        past: current.past.slice(0, -1),
        present: previous,
        future: [current.present, ...current.future].slice(0, HISTORY_LIMIT),
      };
    });
    setLastAction("실행 취소");
  }, []);

  const redo = useCallback((): void => {
    setHistory((current) => {
      const next = current.future[0];
      if (next === undefined) return current;
      return {
        past: [...current.past, current.present].slice(-HISTORY_LIMIT),
        present: next,
        future: current.future.slice(1),
      };
    });
    setLastAction("다시 실행");
  }, []);

  const resetPointDraft = useCallback(
    (message = "초안 취소됨 · 도구는 계속 활성"): void => {
      if (pointDraft !== null) cancelSpatialPointDraft(pointDraft);
      setPointDraft(createEmptyPointDraft(tool));
      setHoverSnap(null);
      setDraftIssues([]);
      setAuthoringGestureActive(false);
      setLastAction(message);
    },
    [createEmptyPointDraft, pointDraft, tool],
  );

  const finishPointDraft = useCallback((): void => {
    if (pointDraft === null) return;
    const result = finishSpatialPointDraft(pointDraft);
    if (result.status === "invalid") {
      setDraftIssues(result.issues);
      setLastAction(authoringIssueLabel(result.issues[0]));
      return;
    }
    try {
      const added =
        result.kind === "polyline"
          ? addMapRoute(document, activeFloorId, result.points)
          : addMapArea(document, activeFloorId, result.points, {
              category: "generic",
            });
      const label = added.document.labels[added.createdId] ?? added.createdId;
      commitDocument(added.document, `${label} 완료 · 한 번의 실행 취소 단위`);
      setSelectedId(added.createdId);
      setTool("select");
      setPointDraft(null);
      setHoverSnap(null);
      setDraftIssues([]);
      setAuthoringGestureActive(false);
    } catch (error) {
      setLastAction(
        `완료 불가 · ${error instanceof Error ? error.message : "도형 검증 실패"}`,
      );
    }
  }, [
    activeFloorId,
    commitDocument,
    document,
    pointDraft,
  ]);

  const commitAuthoringPoint = useCallback(
    (pointInCore: Vec3): void => {
      if (objectKind !== null) {
        const validity = validateObjectPlacement(
          document,
          activeFloorId,
          objectKind,
          pointInCore,
        );
        if (!validity.valid) {
          setLastAction(validity.message);
          return;
        }
        const result = addMapObject(
          document,
          objectKind,
          activeFloorId,
          pointInCore,
        );
        const label = result.document.labels[result.createdId] ?? result.createdId;
        commitDocument(result.document, `${label} 배치됨`);
        setSelectedId(result.createdId);
        setTool("select");
        setHoverSnap(null);
        setAuthoringGestureActive(false);
        return;
      }
      if (pointDraft === null) return;
      if (
        pointDraft.kind === "polygon" &&
        isMapEditorAreaCloseCandidate(
          pointDraft.committedPoints,
          pointInCore,
          snap.translationMeters * 1.5,
        )
      ) {
        finishPointDraft();
        return;
      }
      const update = appendSpatialPointDraftPoint(pointDraft, pointInCore);
      setPointDraft(update.session);
      setDraftIssues(update.issues);
      if (update.issues.length === 0) {
        setLastAction(
          `${update.session.committedPoints.length.toString()}번째 점 추가 · Enter로 완료`,
        );
      } else {
        setLastAction(authoringIssueLabel(update.issues[0]));
      }
    },
    [
      activeFloorId,
      commitDocument,
      document,
      finishPointDraft,
      objectKind,
      pointDraft,
      snap.translationMeters,
    ],
  );

  const handleAuthoringHover = useCallback(
    (result: MapEditorSnapResult | null): void => {
      setHoverSnap(result);
      if (pointDraft === null) return;
      if (result === null) {
        setPointDraft(
          beginSpatialPointDraft({
            kind: pointDraft.kind,
            frame: pointDraft.frame,
            committedPoints: pointDraft.committedPoints,
            minPointDistanceMeters: pointDraft.minPointDistanceMeters,
          }),
        );
        setDraftIssues([]);
        return;
      }
      const update = previewSpatialPointDraftCursor(
        pointDraft,
        result.snapped,
      );
      setPointDraft(update.session);
      setDraftIssues(update.issues);
    },
    [pointDraft],
  );

  const beginGoalGesture = useCallback(
    (gesture: MapEditorHeadingGesture): GoalDraftState => {
      const session = beginSpatialGoalPoseDrag({
        frame: document.frame,
        origin: gesture.origin,
        minHeadingDistanceMeters: Math.max(0.15, snap.translationMeters / 2),
      });
      return {
        session,
        preview: previewSpatialGoalPoseHeading(session, gesture.current),
      };
    },
    [document.frame, snap.translationMeters],
  );

  const handleGoalStart = useCallback(
    (gesture: MapEditorHeadingGesture): void => {
      const next = beginGoalGesture(gesture);
      setGoalDraft(next);
      setDraftIssues(next.preview.issues);
      setLastAction("목표 위치 고정 · 드래그해 방향 지정");
    },
    [beginGoalGesture],
  );

  const handleGoalPreview = useCallback(
    (gesture: MapEditorHeadingGesture): void => {
      const next = beginGoalGesture(gesture);
      setGoalDraft(next);
      setDraftIssues(next.preview.issues);
    },
    [beginGoalGesture],
  );

  const handleGoalCommit = useCallback(
    (gesture: MapEditorHeadingGesture): void => {
      const next = beginGoalGesture(gesture);
      const result = finishSpatialGoalPoseDrag(next.session, next.preview);
      if (result.status === "invalid") {
        setGoalDraft(next);
        setDraftIssues(result.issues);
        setLastAction(authoringIssueLabel(result.issues[0]));
        return;
      }
      const added = addMapGoal(
        document,
        activeFloorId,
        result.pose,
      );
      const label = added.document.labels[added.createdId] ?? added.createdId;
      commitDocument(added.document, `${label} 위치와 방향 확정`);
      setSelectedId(added.createdId);
      setTool("select");
      setGoalDraft(null);
      setHoverSnap(null);
      setDraftIssues([]);
      setAuthoringGestureActive(false);
    },
    [activeFloorId, beginGoalGesture, commitDocument, document],
  );

  const addKeyboardPoint = useCallback((): void => {
    commitAuthoringPoint([
      draftInput[0],
      draftInput[1],
      activeElevation,
    ]);
  }, [activeElevation, commitAuthoringPoint, draftInput]);

  const addKeyboardGoal = useCallback((): void => {
    if (tool !== "place-goal") return;
    const pose = pose3(
      document.frame,
      [draftInput[0], draftInput[1], activeElevation],
      quaternionFromYaw((draftHeadingDegrees * Math.PI) / 180),
    );
    const added = addMapGoal(document, activeFloorId, pose);
    const label = added.document.labels[added.createdId] ?? added.createdId;
    commitDocument(added.document, `${label} 좌표 입력으로 추가됨`);
    setSelectedId(added.createdId);
    setTool("select");
    setGoalDraft(null);
    setHoverSnap(null);
    setDraftIssues([]);
    setAuthoringGestureActive(false);
  }, [
    activeElevation,
    activeFloorId,
    commitDocument,
    document,
    draftHeadingDegrees,
    draftInput,
    tool,
  ]);

  const removeLastDraftPoint = useCallback((): void => {
    if (pointDraft === null || pointDraft.committedPoints.length === 0) return;
    const update = removeLastSpatialPointDraftPoint(pointDraft);
    setPointDraft(update.session);
    setDraftIssues(update.issues);
    setLastAction("마지막 점 제거됨");
  }, [pointDraft]);

  const applyTransformChange = useCallback(
    (changeSet: SpatialTransformChangeSet): void => {
      setHistory((current) => {
        let before = current.present;
        let after = current.present;
        for (const change of changeSet.changes) {
          before = replaceMapEntityTransform(
            before,
            change.entityId,
            change.before,
          );
          after = replaceMapEntityTransform(after, change.entityId, change.after);
        }
        if (changeSet.phase === "preview") return { ...current, present: after };
        if (changeSet.phase === "cancel") return { ...current, present: before };
        return historyAfterCommit({ ...current, present: before }, after);
      });
      if (changeSet.phase !== "preview") {
        setLastAction(
          changeSet.phase === "cancel"
            ? "직접 조작 취소 · 시작 상태 복원"
            : `${changeSet.axis.toUpperCase()}축 ${toolLabel(changeSet.mode)} 확정`,
        );
      }
    },
    [],
  );

  const stepSelection = useCallback(
    (direction: -1 | 1): void => {
      if (selectedId === null || transformable === undefined) return;
      const next = stepMapEntityTransform(document, selectedId, {
        mode,
        axis,
        space: mode === "scale" ? "local" : "target",
        direction,
        snap,
      });
      commitDocument(
        next,
        `${axis.toUpperCase()}축 ${toolLabel(mode)} ${direction > 0 ? "+" : "−"}`,
      );
    },
    [axis, commitDocument, document, mode, selectedId, snap, transformable],
  );

  const duplicateSelection = useCallback((): void => {
    if (selectedId === null || !selectedLeaf) return;
    const result = duplicateMapEntity(document, selectedId);
    const label = result.document.labels[result.createdId] ?? result.createdId;
    commitDocument(result.document, `${label} 복제됨`);
    setSelectedId(result.createdId);
  }, [commitDocument, document, selectedId, selectedLeaf]);

  const confirmDelete = useCallback((): void => {
    if (selectedId === null || !selectedLeaf) return;
    const label = document.labels[selectedId] ?? selectedId;
    commitDocument(deleteMapEntity(document, selectedId), `${label} 삭제됨`);
    setSelectedId(null);
    setDeleteOpen(false);
  }, [commitDocument, document, selectedId, selectedLeaf]);

  const commitName = useCallback((): void => {
    if (selectedId === null || nameDraft.trim().length === 0) return;
    if (nameDraft.trim() === (document.labels[selectedId] ?? "")) return;
    commitDocument(
      renameMapEntity(document, selectedId, nameDraft),
      "객체 이름 변경됨",
    );
  }, [commitDocument, document, nameDraft, selectedId]);

  const updateTransformVector = useCallback(
    (field: "translation" | "scale", index: number, value: number): void => {
      if (transformable === undefined) return;
      const nextVector = [...transformable.transform[field]] as [
        number,
        number,
        number,
      ];
      nextVector[index] = value;
      if (field === "scale" && value <= 0) return;
      const nextTransform = spatialNodeTransform(
        transformable.transform.sourceFrame,
        transformable.transform.targetFrame,
        field === "translation"
          ? nextVector
          : transformable.transform.translation,
        transformable.transform.rotation,
        field === "scale" ? nextVector : transformable.transform.scale,
      );
      commitDocument(
        replaceMapEntityTransform(document, transformable.id, nextTransform),
        `${field === "translation" ? "위치" : "크기"} 값 변경됨`,
      );
    },
    [commitDocument, document, transformable],
  );

  const updateGoalPosition = useCallback(
    (index: number, value: number): void => {
      if (selectedGoal === undefined) return;
      const position = [...selectedGoal.pose.position] as [number, number, number];
      position[index] = value;
      commitDocument(
        updateMapGoalPose(
          document,
          selectedGoal.id,
          pose3(document.frame, position, selectedGoal.pose.orientation),
        ),
        "목표 위치 변경됨",
      );
    },
    [commitDocument, document, selectedGoal],
  );

  const updateGoalYaw = useCallback(
    (degrees: number): void => {
      if (selectedGoal === undefined) return;
      commitDocument(
        updateMapGoalPose(
          document,
          selectedGoal.id,
          pose3(
            document.frame,
            selectedGoal.pose.position,
            quaternionFromYaw((degrees * Math.PI) / 180),
          ),
        ),
        "목표 방향 변경됨",
      );
    },
    [commitDocument, document, selectedGoal],
  );

  const updateGoalRadius = useCallback(
    (value: number): void => {
      if (selectedGoal === undefined || value <= 0) return;
      commitDocument(
        freezeMapEditorDocument({
          ...document,
          goals: document.goals.map((goal) =>
            goal.id === selectedGoal.id
              ? { ...goal, radiusMeters: value }
              : goal,
          ),
        }),
        "목표 반경 변경됨",
      );
    },
    [commitDocument, document, selectedGoal],
  );

  const updateAuthoredPoint = useCallback(
    (
      kind: "route" | "area",
      pointIndex: number,
      axisIndex: number,
      value: number,
    ): void => {
      const entity = kind === "route" ? selectedRoute : selectedArea;
      if (entity === undefined) return;
      const points = entity.points.map(
        (point) => [...point] as [number, number, number],
      );
      const point = points[pointIndex];
      if (point === undefined) return;
      point[axisIndex] = value;
      try {
        const next =
          kind === "route"
            ? updateMapRoutePoints(document, entity.id, points)
            : updateMapAreaPoints(document, entity.id, points);
        commitDocument(next, `${kind === "route" ? "경로" : "구역"} 점 변경됨`);
      } catch {
        setLastAction("도형을 무효로 만드는 좌표는 적용되지 않았습니다.");
      }
    },
    [commitDocument, document, selectedArea, selectedRoute],
  );

  const updateRouteTraversal = useCallback(
    (traversal: MapRouteTraversal): void => {
      if (selectedRoute === undefined) return;
      commitDocument(
        freezeMapEditorDocument({
          ...document,
          routes: document.routes.map((route) =>
            route.id === selectedRoute.id ? { ...route, traversal } : route,
          ),
        }),
        "경로 방향성 변경됨",
      );
    },
    [commitDocument, document, selectedRoute],
  );

  const updateAreaCategory = useCallback(
    (category: MapAreaCategory): void => {
      if (selectedArea === undefined) return;
      commitDocument(
        freezeMapEditorDocument({
          ...document,
          areas: document.areas.map((area) =>
            area.id === selectedArea.id ? { ...area, category } : area,
          ),
        }),
        "구역 의미 변경됨",
      );
    },
    [commitDocument, document, selectedArea],
  );

  const selectEntity = useCallback(
    (nextId: EntityId | null): void => {
      if (nextId === null) {
        setSelectedId(null);
        return;
      }
      const levelId = entityLevelId(document, nextId);
      if (levelId !== null) setActiveFloorId(levelId);
      if (authoring) {
        clearTransientDraft();
        setTool("select");
      }
      setSelectedId(nextId);
      setLastAction(`${document.labels[nextId] ?? nextId} 선택됨`);
    },
    [authoring, clearTransientDraft, document],
  );

  const changeFloor = useCallback(
    (nextLevelId: EntityId): void => {
      clearTransientDraft();
      setActiveFloorId(nextLevelId);
      setSelectedId(null);
      setPointDraft(createEmptyPointDraft(tool));
      setLastAction(`${floorLabel(nextLevelId)} 활성 · 진행 중 초안 취소됨`);
    },
    [clearTransientDraft, createEmptyPointDraft, tool],
  );

  useEffect(() => {
    setNameDraft(
      selectedId === null ? "" : (document.labels[selectedId] ?? ""),
    );
  }, [document.labels, selectedId]);

  useEffect(() => {
    if (selectedId !== null && !hasEntity(document, selectedId)) {
      setSelectedId(null);
    }
  }, [document, selectedId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.isComposing || editableTarget(event.target)) return;
      const activeElement = window.document.activeElement;
      if (
        editorRef.current === null ||
        (activeElement instanceof HTMLElement &&
          activeElement !== window.document.body &&
          !editorRef.current.contains(activeElement))
      ) {
        return;
      }
      const command = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (command && key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (command && key === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if (command || event.altKey || event.repeat) return;
      if (event.key === "Enter" && pointDraft !== null) {
        event.preventDefault();
        finishPointDraft();
        return;
      }
      if (event.key === "Backspace" && pointDraft?.committedPoints.length) {
        event.preventDefault();
        removeLastDraftPoint();
        return;
      }
      if (event.key === "Escape" && authoring) {
        event.preventDefault();
        if (pointDraft !== null && pointDraft.committedPoints.length > 0) {
          resetPointDraft();
        } else if (goalDraft !== null) {
          setGoalDraft(null);
          setHoverSnap(null);
          setDraftIssues([]);
          setLastAction("목표 초안 취소됨 · Esc를 다시 눌러 도구 종료");
        } else {
          chooseTool("select");
        }
        return;
      }
      if (key === "q") chooseTool("select");
      if (domain === "structure" && key === "w") chooseTool("translate");
      if (domain === "structure" && key === "e") chooseTool("rotate");
      if (domain === "structure" && key === "r") chooseTool("scale");
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        selectedLeaf
      ) {
        event.preventDefault();
        setDeleteOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    authoring,
    chooseTool,
    domain,
    finishPointDraft,
    goalDraft,
    pointDraft,
    redo,
    removeLastDraftPoint,
    resetPointDraft,
    selectedLeaf,
    undo,
  ]);

  const inspectorSections: InspectorSections = [];
  let inspectorActions: ReactNode;
  let inspectorItem: ComponentProps<typeof SelectionInspector>["item"] = null;

  if (authoring) {
    const pointCount = pointDraft?.committedPoints.length ?? 0;
    const placementInvalid = hoverPlacementValidity?.valid === false;
    const authoringInvalid = draftIssues.length > 0 || placementInvalid;
    inspectorItem = {
      label: toolLabel(tool),
      kind: `${floorLabel(activeFloorId)} 저작`,
      status: authoringInvalid ? "입력 확인" : "준비",
      statusTone: authoringInvalid ? "warning" : "signal",
    };
    inspectorSections.push({
      title: "제스처",
      fields: [
        {
          label: "방법",
          value:
            tool === "place-goal"
              ? "누르고 드래그: 위치 + 방향"
              : pointDraft !== null
                ? "클릭: 점 추가 · Enter: 완료"
                : "고스트 확인 후 클릭: 배치",
        },
        ...(pointDraft === null
          ? []
          : [
              { label: "확정 점", value: pointCount },
              {
                label: "최소 점",
                value: pointDraft.kind === "polyline" ? 2 : 3,
              },
            ]),
        {
          label: "스냅",
          value:
            hoverSnap === null
              ? "대기"
              : hoverSnap.kind === "vertex"
                ? "기존 정점"
                : hoverSnap.kind === "grid"
                  ? "격자"
                  : "정확한 격자점",
        },
        ...(draftIssues[0] === undefined
          ? []
          : [
              {
                label: "검증",
                value: authoringIssueLabel(draftIssues[0]),
                tone: "warning" as const,
              },
            ]),
        ...(hoverPlacementValidity === null
          ? []
          : [
              {
                label: "배치 검증",
                value: hoverPlacementValidity.message,
                ...(hoverPlacementValidity.valid
                  ? {}
                  : { tone: "warning" as const }),
              },
            ]),
      ],
    });
    inspectorSections.push({
      title: "좌표 입력",
      fields: [
        ...[0, 1].map((index) => ({
          label: axisLabel(index),
          valueNode: (
            <NumberField
              aria-label={`초안 ${axisLabel(index)} 좌표 미터`}
              size="sm"
              step={snap.translationMeters}
              value={draftInput[index] ?? 0}
              onChange={(value) => {
                const next = [...draftInput] as [number, number, number];
                next[index] = value;
                setDraftInput(next);
              }}
            />
          ),
        })),
        { label: "Z", value: activeElevation, unit: "m" },
        ...(objectKind === null || keyboardPlacementValidity === null
          ? []
          : [
              {
                label: "좌표 검증",
                value: keyboardPlacementValidity.message,
                ...(keyboardPlacementValidity.valid
                  ? {}
                  : { tone: "warning" as const }),
              },
            ]),
        ...(tool === "place-goal"
          ? [
              {
                label: "방향",
                valueNode: (
                  <NumberField
                    aria-label="초안 목표 방향 도"
                    size="sm"
                    step={15}
                    value={draftHeadingDegrees}
                    onChange={setDraftHeadingDegrees}
                  />
                ),
              },
            ]
          : []),
      ],
    });
    inspectorActions = (
      <Stack direction="row" gap="var(--space-2)" wrap>
        {tool === "place-goal" ? (
          <Button size="sm" variant="primary" onClick={addKeyboardGoal}>
            목표 추가
          </Button>
        ) : (
          <Button
            size="sm"
            variant="primary"
            disabled={keyboardPlacementValidity?.valid === false}
            onClick={addKeyboardPoint}
          >
            {pointDraft === null ? "좌표에 배치" : "점 추가"}
          </Button>
        )}
        {pointDraft === null ? null : (
          <>
            <Button
              size="sm"
              variant="secondary"
              disabled={pointCount === 0}
              onClick={removeLastDraftPoint}
            >
              마지막 점 취소
            </Button>
            <Button
              data-testid="map-finish-draft"
              size="sm"
              variant="secondary"
              onClick={finishPointDraft}
            >
              완료
            </Button>
          </>
        )}
        <Button size="sm" variant="ghost" onClick={() => chooseTool("select")}>
          도구 종료
        </Button>
      </Stack>
    );
  } else if (selectedId !== null) {
    inspectorItem =
      selectedNode === undefined &&
      selectedGoal === undefined &&
      selectedRoute === undefined &&
      selectedArea === undefined
        ? null
        : {
            label: document.labels[selectedId] ?? selectedId,
            kind: selectedKindLabel(
              selectedNode,
              selectedGoal !== undefined,
              selectedRoute !== undefined,
              selectedArea !== undefined,
            ),
            status: selectedLeaf ? "편집 가능" : "컨테이너",
            statusTone: selectedLeaf ? "signal" : "offline",
          };
    inspectorSections.push({
      title: "식별",
      fields: [
        {
          label: "이름",
          valueNode: (
            <Input
              aria-label="선택 객체 이름"
              size="sm"
              value={nameDraft}
              onBlur={commitName}
              onChange={(event) => setNameDraft(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitName();
                }
              }}
            />
          ),
        },
        { label: "ID", value: selectedId },
        {
          label: "층",
          value:
            selectedEntityLevel === null ? "—" : floorLabel(selectedEntityLevel),
        },
      ],
    });
    if (transformable !== undefined) {
      inspectorSections.push({
        title: "변환",
        fields: [
          {
            label: "축",
            valueNode: (
              <SegmentedControl
                aria-label="변환 축"
                options={AXIS_OPTIONS}
                size="sm"
                value={axis}
                onChange={(value) => setAxis(value as SpatialTransformAxis)}
              />
            ),
          },
          ...transformable.transform.translation.map((value, index) => ({
            label: `위치 ${axisLabel(index)}`,
            valueNode: (
              <NumberField
                aria-label={`위치 ${axisLabel(index)} 미터`}
                size="sm"
                step={snap.translationMeters}
                value={value}
                onChange={(next) =>
                  updateTransformVector("translation", index, next)
                }
              />
            ),
          })),
          ...transformable.transform.scale.map((value, index) => ({
            label: `크기 ${axisLabel(index)}`,
            valueNode: (
              <NumberField
                aria-label={`크기 ${axisLabel(index)}`}
                min={0.05}
                size="sm"
                step={snap.scaleStep}
                value={value}
                onChange={(next) =>
                  updateTransformVector("scale", index, next)
                }
              />
            ),
          })),
        ],
      });
    } else if (selectedGoal !== undefined) {
      inspectorSections.push({
        title: "목표 자세",
        fields: [
          ...selectedGoal.pose.position.map((value, index) => ({
            label: `위치 ${axisLabel(index)}`,
            valueNode: (
              <NumberField
                aria-label={`목표 위치 ${axisLabel(index)} 미터`}
                size="sm"
                step={snap.translationMeters}
                value={value}
                onChange={(next) => updateGoalPosition(index, next)}
              />
            ),
          })),
          {
            label: "방향",
            valueNode: (
              <NumberField
                aria-label="목표 방향 도"
                size="sm"
                step={15}
                value={Number(
                  (
                    (yawRadiansFromQuaternion(selectedGoal.pose.orientation) * 180) /
                    Math.PI
                  ).toFixed(1),
                )}
                onChange={updateGoalYaw}
              />
            ),
          },
          {
            label: "허용 반경",
            valueNode: (
              <NumberField
                aria-label="목표 허용 반경 미터"
                min={0.05}
                size="sm"
                step={0.05}
                value={selectedGoal.radiusMeters ?? 0.3}
                onChange={updateGoalRadius}
              />
            ),
          },
        ],
      });
    } else if (selectedRoute !== undefined) {
      inspectorSections.push({
        title: "경로 의미",
        fields: [
          {
            label: "통행 방향",
            valueNode: (
              <Select
                aria-label="경로 통행 방향"
                options={ROUTE_TRAVERSAL_OPTIONS}
                size="sm"
                value={selectedRoute.traversal}
                onChange={(value) =>
                  updateRouteTraversal(value as MapRouteTraversal)
                }
              />
            ),
          },
          { label: "점", value: selectedRoute.points.length },
          { label: "폭", value: selectedRoute.widthMeters, unit: "m" },
        ],
      });
      inspectorSections.push({
        title: "경로 점",
        fields: selectedRoute.points.flatMap((point, pointIndex) =>
          [0, 1].map((axisIndex) => ({
            label: `${(pointIndex + 1).toString()} · ${axisLabel(axisIndex)}`,
            valueNode: (
              <NumberField
                aria-label={`경로 ${(pointIndex + 1).toString()}번째 점 ${axisLabel(axisIndex)} 미터`}
                size="sm"
                step={snap.translationMeters}
                value={point[axisIndex] ?? 0}
                onChange={(value) =>
                  updateAuthoredPoint("route", pointIndex, axisIndex, value)
                }
              />
            ),
          })),
        ),
      });
    } else if (selectedArea !== undefined) {
      inspectorSections.push({
        title: "구역 의미",
        fields: [
          {
            label: "용도",
            valueNode: (
              <Select
                aria-label="구역 용도"
                options={AREA_CATEGORY_OPTIONS}
                size="sm"
                value={selectedArea.category}
                onChange={(value) =>
                  updateAreaCategory(value as MapAreaCategory)
                }
              />
            ),
          },
          { label: "꼭짓점", value: selectedArea.points.length },
          { label: "높이", value: "평면 구역" },
        ],
      });
      inspectorSections.push({
        title: "구역 꼭짓점",
        fields: selectedArea.points.flatMap((point, pointIndex) =>
          [0, 1].map((axisIndex) => ({
            label: `${(pointIndex + 1).toString()} · ${axisLabel(axisIndex)}`,
            valueNode: (
              <NumberField
                aria-label={`구역 ${(pointIndex + 1).toString()}번째 꼭짓점 ${axisLabel(axisIndex)} 미터`}
                size="sm"
                step={snap.translationMeters}
                value={point[axisIndex] ?? 0}
                onChange={(value) =>
                  updateAuthoredPoint("area", pointIndex, axisIndex, value)
                }
              />
            ),
          })),
        ),
      });
    }
    inspectorActions = selectedLeaf ? (
      <Stack direction="row" gap="var(--space-2)" wrap>
        {transformable === undefined ? null : (
          <>
            <Button size="sm" variant="secondary" onClick={() => stepSelection(-1)}>
              {axis.toUpperCase()} −
            </Button>
            <Button size="sm" variant="secondary" onClick={() => stepSelection(1)}>
              {axis.toUpperCase()} +
            </Button>
          </>
        )}
        <Button
          data-testid="map-duplicate-selection"
          size="sm"
          variant="secondary"
          onClick={duplicateSelection}
        >
          복제
        </Button>
        <Button
          aria-keyshortcuts="Delete Backspace"
          data-testid="map-delete-selection"
          size="sm"
          variant="danger"
          onClick={() => setDeleteOpen(true)}
        >
          삭제
        </Button>
      </Stack>
    ) : undefined;
  }

  const selectedLabel =
    selectedId === null ? "선택 없음" : (document.labels[selectedId] ?? selectedId);
  const placementMessage = authoring
    ? pointDraft !== null
      ? `${pointDraft.committedPoints.length.toString()}개 점 · Enter 완료 · Backspace 마지막 점 · Esc 초안 취소`
      : tool === "place-goal"
        ? "바닥을 누르고 드래그해 위치와 방향을 함께 지정"
        : (hoverPlacementValidity?.message ??
          "고스트와 스냅 표식을 확인한 뒤 클릭해 배치")
    : lastAction;

  return (
    <>
      <main
        ref={editorRef}
        aria-label="3D 맵 편집기"
        data-testid="spatial-map-editor"
        style={{ height: "100dvh", minHeight: 0 }}
      >
        <CanvasEditorShell
          title={document.name}
          description="저장·전송 없이 공간 저작 상호작용을 검토하는 fixture"
          toolbar={
            <CanvasEditorCommandBar
              canUndo={history.past.length > 0}
              canRedo={history.future.length > 0}
              onUndo={undo}
              onRedo={redo}
              undoKeyShortcuts="Control+Z Meta+Z"
              redoKeyShortcuts="Control+Shift+Z Meta+Shift+Z Control+Y"
            />
          }
          subheader={
            <Stack direction="row" gap="var(--space-3)" align="center" wrap>
              <SegmentedControl
                aria-label="맵 저작 영역"
                options={DOMAIN_OPTIONS}
                size="sm"
                value={domain}
                onChange={(value) => {
                  setDomain(value as AuthoringDomain);
                  chooseTool("select");
                }}
              />
              <Select
                aria-label="변환과 저작 스냅 프리셋"
                options={SNAP_OPTIONS}
                size="sm"
                style={{ width: 190 }}
                value={snapPreset}
                onChange={(value) => setSnapPreset(value as SnapPresetName)}
              />
            </Stack>
          }
          responsiveNavigation={
            <SegmentedControl
              aria-label="맵 편집기 영역"
              options={REGION_OPTIONS}
              size="sm"
              value={mobileRegion}
              onChange={(value) => setMobileRegion(value as MobileRegion)}
            />
          }
          mobileActiveRegion={mobileRegion}
          tools={
            <EditorToolbar
              items={tools}
              value={tool}
              onChange={(value) => chooseTool(value as MapEditorTool)}
              label="맵 저작 도구"
            />
          }
          layers={
            <Stack
              gap="var(--space-3)"
              style={{
                minHeight: 0,
                overflow: "auto",
                padding: "var(--space-3)",
              }}
            >
              <FloorSelector
                floors={FLOOR_OPTIONS}
                value={activeFloorId}
                onChange={(value) => changeFloor(value as EntityId)}
              />
              <Divider />
              <Tree
                ariaLabel="맵 객체 계층"
                defaultExpanded={[
                  "site",
                  "site/building",
                  GROUND_LEVEL_ID,
                  UPPER_LEVEL_ID,
                ]}
                nodes={treeNodes}
                onSelect={(node) => {
                  if (typeof node.id === "string") {
                    selectEntity(node.id as EntityId);
                  }
                }}
              />
            </Stack>
          }
          panel={
            <SelectionInspector
              title={authoring ? "저작 안내" : "선택 속성"}
              emptyLabel="계층이나 장면에서 객체를 선택하거나, 저작 도구를 선택하세요."
              item={inspectorItem}
              sections={inspectorSections}
              actions={inspectorActions}
              {...(authoring || selectedId === null
                ? {}
                : { onClearSelection: () => setSelectedId(null) })}
            />
          }
          status={
            <ViewportStatusBar
              items={[
                {
                  label: "도구",
                  value: toolLabel(tool),
                  priority: "high",
                  ...(authoring
                    ? { tone: "signal" as const, toneLabel: "저작 중" }
                    : {}),
                },
                { label: "층", value: floorLabel(activeFloorId) },
                { label: "스냅", value: `${snap.translationMeters.toFixed(2)} m` },
              ]}
              message={placementMessage}
              messageTone={
                draftIssues.length > 0 ||
                hoverPlacementValidity?.valid === false
                  ? "warning"
                  : "default"
              }
            />
          }
          panelWidth={272}
          layerPanelWidth={252}
          resizablePanels
        >
          <Scene3DFrame
            appearance="dark"
            label="운영동 3D 맵 저작 뷰포트"
            title={`${floorLabel(activeFloorId)} · map 프레임`}
            badges={<StatusBadge tone="positive">WebGL 준비됨</StatusBadge>}
            hud={`${visibleObjectCount.toString()} 구조 · ${visibleRoutes.length.toString()} 경로 · ${visibleAreas.length.toString()} 구역 · ${visibleGoals.length.toString()} 목표`}
            status={toolLabel(tool)}
            state="ready"
            variant="embedded"
            style={{ height: "100%" }}
            toolbar={
              <ViewerToolbar appearance="on-dark" label="맵 카메라 프리셋">
                <ViewerToolbarButton
                  label="기본 시점"
                  onClick={() => setCameraMode("home")}
                >
                  <Icon name="home" size={16} aria-hidden="true" />
                </ViewerToolbarButton>
                <ViewerToolbarButton
                  label="상단 시점"
                  onClick={() => setCameraMode("top")}
                >
                  <Icon name="map" size={16} aria-hidden="true" />
                </ViewerToolbarButton>
                <ViewerToolbarButton
                  disabled={focusBounds === undefined}
                  label="선택 객체에 초점"
                  onClick={() => setCameraMode("focus")}
                >
                  <Icon name="crosshair" size={16} aria-hidden="true" />
                </ViewerToolbarButton>
              </ViewerToolbar>
            }
          >
            <SceneCanvas
              ariaLabel="운영동 실제 WebGL 맵 편집 장면"
              cameraMode={cameraMode}
              devicePixelRatio={1}
              enableOrbit={!authoringGestureActive}
              environment={{
                sizeMeters: 18,
                minorSpacingMeters: snap.translationMeters,
                majorSpacingMeters: Math.max(1, snap.translationMeters * 4),
                shadowMapSize: 1024,
              }}
              focusBounds={focusBounds ?? AUTHORING_BOUNDS}
              frame={document.frame}
              frameLoop="demand"
              homePose={AUTHORING_HOME}
              onCameraModeChange={setCameraMode}
              onSelectionChange={(change) => {
                if (!authoring) selectEntity(change.entityId);
              }}
              profile="diagnostic-technical"
              renderQuality="balanced"
              renderState={{ kind: "ready" }}
              selectedEntityId={selectedId}
              style={{ height: "100%", minHeight: 280, borderRadius: 0 }}
              topBounds={AUTHORING_BOUNDS}
            >
              {authoring && tool === "place-goal" ? (
                <MapEditorAuthoringSurface
                  enabled
                  elevationMeters={activeElevation}
                  extentMeters={[10, 8]}
                  snapMeters={snap.translationMeters}
                  snapTargets={snapTargets}
                  vertexSnapToleranceMeters={snap.translationMeters * 1.25}
                  gestureMode="heading"
                  onGestureActiveChange={setAuthoringGestureActive}
                  onHoverPoint={handleAuthoringHover}
                  onHeadingStart={handleGoalStart}
                  onHeadingPreview={handleGoalPreview}
                  onHeadingCommit={handleGoalCommit}
                  onCancel={() => {
                    setGoalDraft(null);
                    setDraftIssues([]);
                    setLastAction("포인터 제스처 취소됨 · 문서는 변경되지 않음");
                  }}
                />
              ) : authoring ? (
                <MapEditorAuthoringSurface
                  enabled
                  elevationMeters={activeElevation}
                  extentMeters={[10, 8]}
                  snapMeters={snap.translationMeters}
                  snapTargets={snapTargets}
                  vertexSnapToleranceMeters={snap.translationMeters * 1.25}
                  gestureMode="point"
                  onGestureActiveChange={setAuthoringGestureActive}
                  onHoverPoint={handleAuthoringHover}
                  onPointCommit={commitAuthoringPoint}
                  onCancel={() => {
                    setLastAction("드래그는 점으로 확정하지 않음");
                  }}
                />
              ) : null}
              <SpatialStructure
                structure={visibleStructure}
                renderAsset={renderMapEditorAsset}
                {...(transformable === undefined || !isTransformMode(tool)
                  ? {}
                  : {
                      activeTransform: {
                        entityId: transformable.id,
                        mode,
                        space:
                          mode === "scale"
                            ? ("local" as const)
                            : ("target" as const),
                        snap,
                        onTransformChange: applyTransformChange,
                      },
                    })}
              />
              {visibleRoutes.map((route) => (
                <MapEditorRoute
                  key={route.id}
                  entityId={route.id}
                  pickWidthMeters={Math.max(route.widthMeters, 0.28)}
                  widthMeters={route.widthMeters}
                  points={
                    route.traversal === "reverse"
                      ? [...route.points].reverse()
                      : route.points
                  }
                  showDirectionCues={route.traversal !== "bidirectional"}
                />
              ))}
              {visibleAreas.map((area) => (
                <MapEditorArea
                  key={area.id}
                  entityId={area.id}
                  points={area.points}
                  color={areaColor(area.category)}
                />
              ))}
              {visibleGoals.map((goal) => (
                <GoalMarker
                  key={goal.id}
                  animated={false}
                  entity={goal}
                  variant="valid"
                />
              ))}
              {pointDraft?.kind === "polyline" ? (
                <MapEditorRouteDraft
                  points={pointDraft.committedPoints}
                  hoverPoint={pointDraft.previewPoint ?? null}
                />
              ) : pointDraft?.kind === "polygon" ? (
                <MapEditorAreaDraft
                  points={pointDraft.committedPoints}
                  hoverPoint={pointDraft.previewPoint ?? null}
                  closeToleranceMeters={snap.translationMeters * 1.5}
                />
              ) : null}
              {goalDraft === null ? null : (
                <MapEditorGoalDraft
                  origin={goalDraft.session.origin}
                  current={goalDraft.preview.cursor}
                />
              )}
              {objectKind === null || hoverSnap === null ? null : (
                <MapEditorPlacementGhost
                  point={hoverSnap.snapped}
                  footprintOffsetMeters={mapObjectFootprintCenterOffset(objectKind)}
                  footprintMeters={mapObjectFootprintSize(objectKind)}
                  kind={objectKind === "asset" ? "asset" : "object"}
                  valid={hoverPlacementValidity?.valid ?? false}
                />
              )}
              {authoring && hoverSnap !== null ? (
                <MapEditorSnapCue result={hoverSnap} />
              ) : null}
            </SceneCanvas>
          </Scene3DFrame>
        </CanvasEditorShell>
      </main>

      <ConfirmDialog
        open={deleteOpen}
        title="선택 객체를 삭제할까요?"
        tone="danger"
        toneLabel="파괴적 작업"
        confirmLabel="객체 삭제"
        cancelLabel="취소"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteOpen(false)}
      >
        {selectedLabel}을 맵 문서에서 제거합니다. 이 작업은 실행 취소할 수 있습니다.
      </ConfirmDialog>
    </>
  );
}

export const LdsIntegration: Story = {
  name: "개요",
  render: () => <SpatialMapEditor />,
};
