export { CameraRig, type CameraRigProps } from "./CameraRig.js";
export {
  CAMERA_OBSTACLE_USER_DATA_KEY,
  clipThreeCameraBoom,
  constrainThreeCameraPlacement,
  type ThreeCameraPlacement,
  type ThreeCameraPlacementResult,
} from "./camera-rig-constraints.js";
export { CoreSpace, type CoreSpaceProps } from "./CoreSpace.js";
export { OrientationTriad } from "./OrientationTriad.js";
export {
  SCENE_CANVAS_KEYBOARD_INSTRUCTIONS,
  isEditableKeyboardTarget,
  resolveSceneCameraKey,
  type SceneCameraKeyboardCommand,
  type SceneCameraKeyInput,
} from "./scene-keyboard.js";
export {
  drapePathPoints,
  resolveMinimumScreenWidthMeters,
  type PathGroundHeightSampler,
  type PathRibbonVariant,
} from "./path-ribbon.js";
export {
  resolveRobotPoseFreshnessVisual,
  type RobotLocalizationUncertainty,
  type RobotPoseFreshness,
  type RobotPoseFreshnessVisual,
} from "./robot-pose.js";
export {
  SceneCanvas,
  type SceneCameraChangeSource,
  type SceneCanvasHandle,
  type SceneCanvasProps,
  type SceneCanvasSnapshot,
  type SceneFrameLoop,
  type SceneRenderQuality,
  type SceneHoverChange,
  type SceneOverlayContext,
  type SceneSelectionChange,
} from "./SceneCanvas.js";
export {
  AmrRobot,
  canonicalRobotStatus,
  EditVolume,
  GoalMarker,
  GroundGrid,
  GroundPlane,
  PathRibbon,
  SceneEnvironment,
  SceneStateMarker,
  SectionBox,
  Selectable,
  type AmrRobotProps,
  type CanonicalRobotVisualStatus,
  type EditVolumeProps,
  type GoalMarkerProps,
  type GroundGridProps,
  type GroundPlaneProps,
  type PathRibbonProps,
  type RobotVisualStatus,
  type SceneEnvironmentProps,
  type SceneStateMarkerProps,
  type SectionBoxProps,
  type SelectableProps,
  type SelectableRenderState,
} from "./primitives.js";
export {
  DEFAULT_POINT_CLOUD_COLOR,
  DEFAULT_POINT_CLOUD_POINT_SIZE,
  PointCloudLayer,
  PointCloudLayers,
  type PointCloudLayerProps,
  type PointCloudLayersProps,
  type PointCloudSceneLayer,
  type PointCloudColorMode,
  type PointCloudHeightRange,
} from "./pointcloud.js";
export { MarkerLayer, type MarkerLayerProps, type MarkerMeshRenderer } from "./markers.js";
export {
  SceneRuntimeProvider,
  useEntityInteraction,
  useSceneRuntime,
  type EntityInteractionBindings,
  type ScenePointerDetail,
  type SceneRuntimeProviderProps,
  type SceneRuntimeValue,
} from "./runtime.js";
export { usePrefersReducedMotion } from "./motion.js";
export {
  AmrOperationalScene,
  type AmrOperationalSceneProps,
  type VisualAlphaAssetPlacement,
} from "./visual-alpha-scene.js";
export {
  SpatialStructure,
  TransformGizmo,
  type SpatialAssetRenderer,
  type SpatialStructureProps,
  type TransformGizmoProps,
} from "./spatial-structure.js";
export {
  OccupancyGridSurface,
  type OccupancyGridCellPointerDetail,
  type OccupancyGridPalette,
  type OccupancyGridRenderState,
  type OccupancyGridSurfaceProps,
} from "./occupancy-grid.js";

export {
  CameraFrustum,
  VoxelLayer,
  assertValidVoxelSnapshot,
  computeFrustumCorners,
  type CameraFrustumProps,
  type VoxelLayerProps,
  type VoxelLayerSnapshot,
} from "./sensors.js";
export {
  SceneLabelOverlay,
  SceneLabelProjector,
  estimateSceneLabelWidthPx,
  type PlacedSceneLabel,
  type SceneLabel,
  type SceneLabelLayout,
  type SceneLabelOverlayProps,
  type SceneLabelProjectorProps,
} from "./labels.js";
export {
  SceneLayer,
  useSceneLayerRegistry,
  type SceneLayerProps,
  type SceneLayerRegistry,
} from "./layers.js";
