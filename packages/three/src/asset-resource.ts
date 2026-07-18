import { Line, Material, Mesh, Texture, type Group, type Object3D } from "three";

/** Opaque ownership handle for a parsed Three.js GLB/glTF resource. */
export interface ThreeAssetHandle {
  readonly __opaque: "ThreeAssetHandle";
}

interface ThreeAssetResource {
  readonly scene: Group;
  disposed: boolean;
}

const resources = new WeakMap<ThreeAssetHandle, ThreeAssetResource>();

export function createThreeAssetHandle(scene: Group): ThreeAssetHandle {
  const handle: ThreeAssetHandle = Object.freeze({ __opaque: "ThreeAssetHandle" });
  resources.set(handle, { scene, disposed: false });
  return handle;
}

function resourceFor(handle: ThreeAssetHandle): ThreeAssetResource {
  const resource = resources.get(handle);
  if (resource === undefined) {
    throw new TypeError("ThreeAssetHandle was not issued by this package instance.");
  }
  if (resource.disposed) {
    throw new TypeError("ThreeAssetHandle has already been disposed.");
  }
  return resource;
}

/** Private renderer-runtime access; never exported from the package root. */
export function getThreeAssetScene(handle: ThreeAssetHandle): Group {
  return resourceFor(handle).scene;
}

interface Disposable {
  dispose(): void;
}

function isDisposable(value: unknown): value is Disposable {
  return (
    typeof value === "object" &&
    value !== null &&
    "dispose" in value &&
    typeof (value as { readonly dispose?: unknown }).dispose === "function"
  );
}

function materialValues(material: object): readonly unknown[] {
  return Object.getOwnPropertyNames(material).map(
    (property): unknown => Reflect.get(material, property) as unknown,
  );
}

function disposeMaterial(
  material: object & Disposable,
  materials: Set<Disposable>,
  textures: Set<Disposable>,
): void {
  if (materials.has(material)) return;
  materials.add(material);
  for (const value of materialValues(material)) {
    if (value instanceof Texture) textures.add(value);
  }
  material.dispose();
}

/** Releases hierarchy-local geometry, material, and texture resources exactly once. */
export function disposeThreeObjectTree(root: Object3D): void {
  const geometries = new Set<Disposable>();
  const materials = new Set<Disposable>();
  const textures = new Set<Disposable>();
  root.traverse((object) => {
    if (!(object instanceof Mesh || object instanceof Line)) return;
    const geometry: unknown = object.geometry;
    if (isDisposable(geometry)) geometries.add(geometry);
    const material: unknown = object.material;
    if (Array.isArray(material)) {
      for (const item of material as unknown[]) {
        if (item instanceof Material) disposeMaterial(item, materials, textures);
      }
    } else if (material instanceof Material) {
      disposeMaterial(material, materials, textures);
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  textures.forEach((texture) => texture.dispose());
  root.clear();
}

/** Idempotently releases a parsed source asset and its owned GPU resources. */
export function disposeThreeAssetHandle(handle: ThreeAssetHandle): void {
  const resource = resources.get(handle);
  if (resource === undefined || resource.disposed) return;
  resource.disposed = true;
  disposeThreeObjectTree(resource.scene);
}
