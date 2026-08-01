import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useLoader, useThree } from "@react-three/fiber";
import type { Object3D } from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  cloneThreeSceneInstance,
  releaseThreeSceneInstance,
} from "@lk-design-system/lds-3d-three/r3f-bridge";
import {
  computeJointPoses,
  createFileToCoreRotation,
  validateAssetManifest,
  validateRobotKinematics,
  type AssetManifestV1,
  type JointValues,
  type RobotKinematicsV1,
} from "@lk-design-system/lds-3d-assets";
import type { EntityId, Quat, Vec3 } from "@lk-design-system/lds-3d-core";

import { SceneStateMarker, Selectable } from "./primitives.js";
import { shouldScheduleDemandFrame } from "./rendering.js";
import { useSceneRuntime } from "./runtime.js";

export type VisualAlphaModelKey =
  | "amr"
  | "rack"
  | "pallet"
  | "cargoBin"
  | "chargingStation"
  | "safetyCone";

export type VisualAlphaModelUrls = Readonly<Record<VisualAlphaModelKey, string>>;

export const VISUAL_ALPHA_MODEL_FILES: Readonly<Record<VisualAlphaModelKey, string>> =
  Object.freeze({
    amr: "amr.glb",
    rack: "rack.glb",
    pallet: "pallet.glb",
    cargoBin: "cargo-bin.glb",
    chargingStation: "charging-station.glb",
    safetyCone: "safety-cone.glb",
  });

export function resolveModelUrl(modelBasePath: string, fileName: string): string {
  const base = modelBasePath.trim().replace(/\/+$/u, "");
  const file = fileName.trim().replace(/^\/+/, "");
  if (base.length === 0) return `/${file}`;
  if (file.length === 0) throw new TypeError("fileName must not be empty.");
  return `${base}/${file}`;
}

export function createVisualAlphaModelUrls(modelBasePath: string): VisualAlphaModelUrls {
  return Object.freeze({
    amr: resolveModelUrl(modelBasePath, VISUAL_ALPHA_MODEL_FILES.amr),
    rack: resolveModelUrl(modelBasePath, VISUAL_ALPHA_MODEL_FILES.rack),
    pallet: resolveModelUrl(modelBasePath, VISUAL_ALPHA_MODEL_FILES.pallet),
    cargoBin: resolveModelUrl(modelBasePath, VISUAL_ALPHA_MODEL_FILES.cargoBin),
    chargingStation: resolveModelUrl(modelBasePath, VISUAL_ALPHA_MODEL_FILES.chargingStation),
    safetyCone: resolveModelUrl(modelBasePath, VISUAL_ALPHA_MODEL_FILES.safetyCone),
  });
}

export type ModelLoadState = "loading" | "ready" | "error";
export type ModelSourceConvention = "core" | "gltf";

/**
 * The coordinate evidence required to place a file in the LK core frame.
 *
 * A manifest is authoritative when supplied. Without one, the caller must
 * explicitly declare whether the file already uses the core convention or the
 * standard glTF Y-up convention.
 */
export type GltfModelCoordinateContract =
  | {
      readonly manifest: AssetManifestV1;
      readonly sourceConvention?: ModelSourceConvention;
    }
  | {
      readonly manifest?: never;
      readonly sourceConvention: ModelSourceConvention;
    };

export type GltfModelProps = {
  readonly url: string;
  readonly entityId: EntityId;
  readonly position?: Vec3;
  readonly orientation?: Quat;
  readonly scale?: number;
  readonly selectable?: boolean;
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
  /**
   * Change this value after an error to clear a failed cached GLTF request and
   * retry the same URL. It is intentionally caller-controlled so a failed
   * network request never loops automatically.
   */
  readonly retryKey?: string | number;
  readonly onLoadStateChange?: (state: ModelLoadState, error?: Error) => void;
} & GltfModelCoordinateContract;

/**
 * Each placement owns its Object3D hierarchy (including a unique skeleton), while
 * the immutable GLTF geometry and materials stay in the loader cache. Cloning
 * those GPU resources for every placement multiplied upload and memory cost
 * without enabling any per-instance material customization.
 */
const GLTF_TO_CORE_ROTATION = createFileToCoreRotation("+Y", "+Z");
const IDENTITY_QUATERNION: Quat = Object.freeze([0, 0, 0, 1]);
const ZERO: Vec3 = Object.freeze([0, 0, 0]);

/**
 * The articulation evidence required to pose a joint chain inside the file.
 *
 * `kinematics` must validate against the robot kinematics contract, and every
 * declared link must resolve to exactly one uniquely named glTF node.
 */
export interface GltfModelArticulationContract {
  readonly kinematics: RobotKinematicsV1;
  /**
   * Joint values keyed by jointId: radians for revolute joints, file units for
   * prismatic joints. Missing joints hold their rest value and out-of-range
   * values clamp to the declared limits.
   */
  readonly jointValues?: JointValues;
}

export type ArticulatedGltfModelProps = GltfModelProps & GltfModelArticulationContract;

type LoadedGltfModelProps = GltfModelProps &
  Partial<GltfModelArticulationContract> & {
    readonly onReady: () => void;
  };

function collectArticulationNodes(
  root: Object3D,
  kinematics: RobotKinematicsV1,
): ReadonlyMap<string, Object3D> {
  const wanted = new Set(kinematics.links.map((link) => link.nodeName));
  const found = new Map<string, Object3D>();
  const duplicated = new Set<string>();
  const stack: Object3D[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) break;
    if (wanted.has(node.name)) {
      if (found.has(node.name)) duplicated.add(node.name);
      else found.set(node.name, node);
    }
    stack.push(...node.children);
  }
  const missing = [...wanted].filter((name) => !found.has(name));
  if (missing.length > 0) {
    throw new TypeError(
      `Articulated model is missing glTF nodes for declared links: ${missing.join(", ")}.`,
    );
  }
  if (duplicated.size > 0) {
    throw new TypeError(
      `Articulated model contains ambiguous duplicate glTF node names: ${[...duplicated].join(", ")}.`,
    );
  }
  return found;
}

interface ArticulationDriverProps {
  readonly root: Object3D;
  readonly kinematics: RobotKinematicsV1;
  readonly jointValues?: JointValues;
}

/**
 * Poses the cloned scene's link nodes whenever the joint values change. The
 * driver mutates node-local transforms only, so the placement's coordinate
 * normalization and selection behavior stay identical to a rigid GltfModel.
 */
function ArticulationDriver({ root, kinematics, jointValues }: ArticulationDriverProps) {
  const frameloop = useThree((state) => state.frameloop);
  const invalidate = useThree((state) => state.invalidate);
  const nodes = useMemo(() => collectArticulationNodes(root, kinematics), [kinematics, root]);

  useEffect(() => {
    for (const pose of computeJointPoses(kinematics, jointValues)) {
      const node = nodes.get(pose.nodeName);
      if (node === undefined) continue;
      node.position.set(pose.translation[0], pose.translation[1], pose.translation[2]);
      node.quaternion.set(pose.rotation[0], pose.rotation[1], pose.rotation[2], pose.rotation[3]);
    }
    if (shouldScheduleDemandFrame(frameloop, true)) invalidate();
  }, [frameloop, invalidate, jointValues, kinematics, nodes]);

  return null;
}

function assertGltfModelCoordinateContract({
  manifest,
  sourceConvention,
}: Pick<GltfModelProps, "manifest" | "sourceConvention">): void {
  if (manifest !== undefined) {
    const issues = validateAssetManifest(manifest);
    if (issues.length === 0) return;
    const details = issues.map((issue) => `${issue.path} (${issue.code})`).join(", ");
    throw new TypeError(`GltfModel received an invalid asset manifest: ${details}`);
  }

  if (sourceConvention === "core" || sourceConvention === "gltf") return;
  throw new TypeError(
    "GltfModel requires a validated manifest or an explicit sourceConvention ('core' or 'gltf').",
  );
}

function assertGltfModelArticulationContract({
  kinematics,
}: Pick<LoadedGltfModelProps, "kinematics">): void {
  if (kinematics === undefined) return;
  const issues = validateRobotKinematics(kinematics);
  if (issues.length === 0) return;
  const details = issues.map((issue) => `${issue.path} (${issue.code})`).join(", ");
  throw new TypeError(`ArticulatedGltfModel received invalid robot kinematics: ${details}`);
}

function ValidatedLoadedGltfModel(props: LoadedGltfModelProps) {
  assertGltfModelCoordinateContract(props);
  assertGltfModelArticulationContract(props);
  return <LoadedGltfModel {...props} />;
}

function LoadedGltfModel({
  url,
  entityId,
  position = ZERO,
  orientation = IDENTITY_QUATERNION,
  scale = 1,
  manifest,
  sourceConvention,
  kinematics,
  jointValues,
  selectable = true,
  castShadow = true,
  receiveShadow = true,
  onReady,
}: LoadedGltfModelProps) {
  const { theme } = useSceneRuntime();
  const gltf = useLoader(GLTFLoader, url) as GLTF;
  const sceneInstance = useMemo(
    () => cloneThreeSceneInstance(gltf.scene, castShadow, receiveShadow),
    [castShadow, gltf.scene, receiveShadow],
  );
  const onReadyRef = useRef(onReady);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    onReadyRef.current();
  }, [sceneInstance]);

  useEffect(() => () => releaseThreeSceneInstance(sceneInstance), [sceneInstance]);

  const normalizationPosition = manifest?.fileToCoreTransform.translation ?? ZERO;
  const normalizationRotation =
    manifest?.fileToCoreTransform.rotation ??
    (sourceConvention === "gltf" ? GLTF_TO_CORE_ROTATION : IDENTITY_QUATERNION);
  const normalizationScale = manifest?.fileCoordinate.metersPerUnit ?? 1;

  return (
    <Selectable
      entityId={entityId}
      position={position}
      quaternion={orientation}
      scale={scale}
      selectable={selectable}
    >
      {({ hovered, selected }) => (
        <group
          position={[normalizationPosition[0], normalizationPosition[1], normalizationPosition[2]]}
          quaternion={[
            normalizationRotation[0],
            normalizationRotation[1],
            normalizationRotation[2],
            normalizationRotation[3],
          ]}
          scale={normalizationScale}
        >
          <primitive object={sceneInstance} dispose={null} />
          {kinematics === undefined ? null : (
            <ArticulationDriver
              root={sceneInstance}
              kinematics={kinematics}
              {...(jointValues === undefined ? {} : { jointValues })}
            />
          )}
          {hovered || selected ? (
            <pointLight
              color={selected ? theme.materials.selection : theme.materials.live}
              distance={3.5}
              intensity={selected ? 2.2 : 1.1}
              position={[0, 0, 1.2]}
            />
          ) : null}
        </group>
      )}
    </Selectable>
  );
}

function LoadingModel({ onLoading }: { readonly onLoading: () => void }) {
  useEffect(() => {
    onLoading();
  }, [onLoading]);
  return <SceneStateMarker state={{ kind: "loading", label: "Loading 3D asset" }} />;
}

interface ModelErrorBoundaryProps {
  readonly url: string;
  readonly retryKey?: string | number;
  readonly onRetry: () => void;
  readonly onError: (error: Error) => void;
  readonly children: ReactNode;
}

interface ModelErrorBoundaryState {
  readonly error: Error | null;
}

class ModelErrorBoundary extends Component<ModelErrorBoundaryProps, ModelErrorBoundaryState> {
  override state: ModelErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ModelErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: Error): void {
    this.props.onError(error);
  }

  override componentDidUpdate(previous: ModelErrorBoundaryProps): void {
    const urlChanged = previous.url !== this.props.url;
    const retryingSameUrl = !urlChanged && previous.retryKey !== this.props.retryKey;
    if ((urlChanged || retryingSameUrl) && this.state.error !== null) {
      if (retryingSameUrl) this.props.onRetry();
      this.setState({ error: null });
    }
  }

  override render(): ReactNode {
    return this.state.error === null ? (
      this.props.children
    ) : (
      <SceneStateMarker
        state={{ kind: "error", message: this.state.error.message, recoverable: true }}
      />
    );
  }
}

export function GltfModel({ onLoadStateChange, ...props }: GltfModelProps) {
  const onLoading = useMemo(() => (): void => onLoadStateChange?.("loading"), [onLoadStateChange]);
  const onReady = useMemo(() => (): void => onLoadStateChange?.("ready"), [onLoadStateChange]);
  const onRetry = useMemo(() => (): void => clearGltfModel(props.url), [props.url]);
  const onError = useMemo(
    () =>
      (error: Error): void =>
        onLoadStateChange?.("error", error),
    [onLoadStateChange],
  );
  return (
    <ModelErrorBoundary
      url={props.url}
      onError={onError}
      onRetry={onRetry}
      {...(props.retryKey === undefined ? {} : { retryKey: props.retryKey })}
    >
      <Suspense fallback={<LoadingModel onLoading={onLoading} />}>
        <ValidatedLoadedGltfModel {...props} onReady={onReady} />
      </Suspense>
    </ModelErrorBoundary>
  );
}

/**
 * A GltfModel whose joint chain is posed from validated robot kinematics.
 *
 * The coordinate contract, loading/error/retry lifecycle, placement ownership,
 * and selection behavior are identical to `GltfModel`; the kinematics
 * contract additionally maps declared links to uniquely named glTF nodes and
 * drives their node-local transforms from the supplied joint values.
 */
export function ArticulatedGltfModel(props: ArticulatedGltfModelProps) {
  return GltfModel(props);
}

export interface VisualAlphaModelProps {
  readonly assetKey: VisualAlphaModelKey;
  readonly modelBasePath: string;
  readonly entityId: EntityId;
  readonly position?: Vec3;
  readonly orientation?: Quat;
  readonly scale?: number;
  readonly manifest?: AssetManifestV1;
  readonly sourceConvention?: ModelSourceConvention;
  readonly selectable?: boolean;
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
  readonly retryKey?: string | number;
  readonly onLoadStateChange?: (state: ModelLoadState, error?: Error) => void;
}

export function VisualAlphaModel({ assetKey, modelBasePath, ...props }: VisualAlphaModelProps) {
  const urls = useMemo(() => createVisualAlphaModelUrls(modelBasePath), [modelBasePath]);
  const { manifest, sourceConvention, ...modelProps } = props;
  const coordinateContract: GltfModelCoordinateContract =
    manifest === undefined
      ? { sourceConvention: sourceConvention ?? "core" }
      : sourceConvention === undefined
        ? { manifest }
        : { manifest, sourceConvention };
  return <GltfModel {...modelProps} url={urls[assetKey]} {...coordinateContract} />;
}

export function preloadGltfModel(url: string): void {
  useLoader.preload(GLTFLoader, url);
}

export function clearGltfModel(url: string): void {
  useLoader.clear(GLTFLoader, url);
}
