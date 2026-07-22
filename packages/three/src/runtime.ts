import {
  consumeAssetOwnershipToken,
  type AdoptedAsset,
  type AssetOwnershipToken,
} from "@lk-robotics/lds-3d-assets";
import type {
  AssetEntity,
  FrameId,
  P0SpatialEntity,
  SceneThemeValues,
} from "@lk-robotics/lds-3d-core";
import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
  type Object3D,
} from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";

import {
  disposeThreeObjectTree,
  getThreeAssetScene,
  type ThreeAssetHandle,
} from "./asset-resource.js";

/** Opaque adopted source asset shared by imperative and React renderer adapters. */
export interface ThreeResolvedAsset {
  readonly __opaque: "ThreeResolvedAsset";
  dispose(): void;
}

interface ResolvedAssetState {
  readonly adopted: AdoptedAsset<ThreeAssetHandle>;
  disposed: boolean;
}

const resolvedAssets = new WeakMap<ThreeResolvedAsset, ResolvedAssetState>();

function resolvedAssetState(asset: ThreeResolvedAsset): ResolvedAssetState {
  const state = resolvedAssets.get(asset);
  if (state === undefined) {
    throw new TypeError("ThreeResolvedAsset was not issued by this package instance.");
  }
  if (state.disposed) {
    throw new TypeError("ThreeResolvedAsset has already been disposed.");
  }
  return state;
}

/** Consumes one ownership token and exposes a renderer-local resolved asset. */
export function consumeThreeAssetOwnership(
  token: AssetOwnershipToken<ThreeAssetHandle>,
): ThreeResolvedAsset {
  const adopted = consumeAssetOwnershipToken(token);
  getThreeAssetScene(adopted.resource);
  const state: ResolvedAssetState = { adopted, disposed: false };
  const resolved: ThreeResolvedAsset = Object.freeze({
    __opaque: "ThreeResolvedAsset" as const,
    dispose(): void {
      if (state.disposed) return;
      state.disposed = true;
      adopted.dispose();
    },
  });
  resolvedAssets.set(resolved, state);
  return resolved;
}

export interface ThreeVisualInput {
  readonly entity: P0SpatialEntity;
  readonly sceneFrame: FrameId;
  readonly theme: SceneThemeValues;
  readonly asset?: ThreeResolvedAsset;
}

export type ThreeVisualUpdateInput = Omit<ThreeVisualInput, "asset">;

/** A raw Three hierarchy that is private to a renderer adapter implementation. */
export interface ThreeVisualInstance {
  readonly object: Object3D;
  update(input: ThreeVisualUpdateInput): void;
  /** Disposes only hierarchy-local fallback resources, never a shared asset lease. */
  dispose(): void;
}

/**
 * Clones a GLTF hierarchy for a single placement while retaining immutable
 * geometry and materials in the source asset cache.
 */
export function cloneThreeSceneInstance(
  source: Object3D,
  castShadow: boolean,
  receiveShadow: boolean,
): Object3D {
  const instance = cloneSkeleton(source);
  instance.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = castShadow;
    object.receiveShadow = receiveShadow;
  });
  return instance;
}

/** Releases only a cloned placement hierarchy; its shared source cache remains owned elsewhere. */
export function releaseThreeSceneInstance(instance: Object3D): void {
  instance.clear();
}

interface VisualBuild {
  readonly root: Group;
  readonly usesSharedAsset: boolean;
}

function assertEntityFrame(entity: P0SpatialEntity, sceneFrame: FrameId): void {
  const entityFrame = entity.kind === "path" ? entity.frame : entity.pose.frame;
  if (entityFrame !== sceneFrame) {
    throw new RangeError(
      `Entity ${JSON.stringify(entity.id)} belongs to ${JSON.stringify(entityFrame)}, not scene frame ${JSON.stringify(sceneFrame)}.`,
    );
  }
}

function setPose(root: Group, entity: Exclude<P0SpatialEntity, { readonly kind: "path" }>): void {
  root.position.set(entity.pose.position[0], entity.pose.position[1], entity.pose.position[2]);
  root.quaternion.set(
    entity.pose.orientation[0],
    entity.pose.orientation[1],
    entity.pose.orientation[2],
    entity.pose.orientation[3],
  );
}

function visualColor(entity: P0SpatialEntity, theme: SceneThemeValues): string {
  switch (entity.kind) {
    case "goal":
      return theme["goal.default"];
    case "path":
      return theme["path.default"];
    case "robot":
      return theme["axis.x"];
    case "landmark":
      return theme.warning;
    case "asset":
      return theme["grid.major"];
  }
}

function fallbackVisual(entity: P0SpatialEntity, theme: SceneThemeValues): VisualBuild {
  const root = new Group();
  root.name = `lkds3d:${entity.kind}:${entity.id}`;
  const color = visualColor(entity, theme);
  if (entity.kind === "path") {
    const geometry = new BufferGeometry().setFromPoints(
      entity.points.map((point) => new Vector3(point[0], point[1], point[2])),
    );
    const line = new Line(geometry, new LineBasicMaterial({ color }));
    line.name = "lkds3d:path";
    root.add(line);
    return { root, usesSharedAsset: false };
  }

  const geometry =
    entity.kind === "goal"
      ? new ConeGeometry(entity.radiusMeters ?? 0.3, entity.radiusMeters ?? 0.3, 0.18, 24)
      : entity.kind === "landmark"
        ? new SphereGeometry(0.18, 16, 12)
        : new BoxGeometry(
            entity.kind === "robot" ? 0.65 : 0.5,
            0.45,
            entity.kind === "robot" ? 0.35 : 0.5,
          );
  const material = new MeshStandardMaterial({ color, roughness: 0.64, metalness: 0.08 });
  root.add(new Mesh(geometry, material));
  setPose(root, entity);
  return { root, usesSharedAsset: false };
}

function assetVisual(
  entity: AssetEntity | Extract<P0SpatialEntity, { readonly kind: "robot" }>,
  asset: ThreeResolvedAsset,
): VisualBuild {
  const state = resolvedAssetState(asset);
  const source = getThreeAssetScene(state.adopted.resource);
  if (state.adopted.manifest.coreFrame !== entity.pose.frame) {
    throw new RangeError(
      `Asset core frame ${JSON.stringify(state.adopted.manifest.coreFrame)} does not match entity frame ${JSON.stringify(entity.pose.frame)}.`,
    );
  }
  const root = new Group();
  root.name = `lkds3d:${entity.kind}:${entity.id}`;
  setPose(root, entity);
  const normalization = new Group();
  const transform = state.adopted.manifest.fileToCoreTransform;
  normalization.position.set(
    transform.translation[0],
    transform.translation[1],
    transform.translation[2],
  );
  normalization.quaternion.set(
    transform.rotation[0],
    transform.rotation[1],
    transform.rotation[2],
    transform.rotation[3],
  );
  normalization.scale.setScalar(state.adopted.manifest.fileCoordinate.metersPerUnit);
  normalization.add(cloneSkeleton(source));
  root.add(normalization);
  return { root, usesSharedAsset: true };
}

function updatePath(
  root: Group,
  entity: Extract<P0SpatialEntity, { readonly kind: "path" }>,
): void {
  const line = root.children.find((child): child is Line => child instanceof Line);
  if (line === undefined) return;
  line.geometry.setFromPoints(
    entity.points.map((point) => new Vector3(point[0], point[1], point[2])),
  );
  line.geometry.computeBoundingSphere();
}

function isAssetBackedEntity(
  entity: P0SpatialEntity,
): entity is AssetEntity | Extract<P0SpatialEntity, { readonly kind: "robot" }> {
  return entity.kind === "asset" || (entity.kind === "robot" && entity.assetId !== undefined);
}

/**
 * Creates a renderer-local visual hierarchy. It assumes the caller mounts the
 * result below a core-space root that applies the core-to-Three basis exactly once.
 */
export function createThreeVisualInstance(input: ThreeVisualInput): ThreeVisualInstance {
  assertEntityFrame(input.entity, input.sceneFrame);
  const build =
    input.asset !== undefined && isAssetBackedEntity(input.entity)
      ? assetVisual(input.entity, input.asset)
      : fallbackVisual(input.entity, input.theme);
  let disposed = false;

  return Object.freeze({
    object: build.root,
    update(next: ThreeVisualUpdateInput): void {
      if (disposed) return;
      assertEntityFrame(next.entity, next.sceneFrame);
      if (next.entity.id !== input.entity.id || next.entity.kind !== input.entity.kind) {
        throw new RangeError(
          "A ThreeVisualInstance can only update the same entity identity and kind.",
        );
      }
      if (next.entity.kind === "path") {
        updatePath(build.root, next.entity);
      } else {
        setPose(build.root, next.entity);
      }
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      if (build.usesSharedAsset) build.root.clear();
      else disposeThreeObjectTree(build.root);
    },
  });
}
