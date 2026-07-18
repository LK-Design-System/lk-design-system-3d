import {
  createAssetLoader,
  type AssetLoader,
  type AssetResourceLoadContext,
  type AssetSource,
} from "@lk-robotics/design-system-3d-assets";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  createThreeAssetHandle,
  disposeThreeAssetHandle,
  type ThreeAssetHandle,
} from "./asset-resource.js";

export type { ThreeAssetHandle } from "./asset-resource.js";

export interface ThreeGltfAssetLoaderOptions {
  readonly dracoDecoderPath?: string;
  /**
   * KTX2 support needs renderer capability detection, so it is deliberately
   * rejected by this standalone loader rather than silently parsing incorrectly.
   */
  readonly ktx2TranscoderPath?: string;
}

function basePathFor(source: AssetSource): string {
  if (source.kind !== "url") return "";
  const slash = source.url.lastIndexOf("/");
  return slash < 0 ? "" : source.url.slice(0, slash + 1);
}

async function sourceBytes(
  source: AssetSource,
  context: AssetResourceLoadContext,
): Promise<ArrayBuffer> {
  if (source.kind === "bytes") {
    context.reportProgress({
      loadedBytes: source.data.byteLength,
      totalBytes: source.data.byteLength,
    });
    return source.data;
  }

  const response = await fetch(source.url);
  if (!response.ok) {
    throw new Error(
      `Unable to load GLB asset: ${response.status.toString()} ${response.statusText}`,
    );
  }
  const data = await response.arrayBuffer();
  const header = response.headers.get("content-length");
  const declaredTotal = header === null ? undefined : Number(header);
  context.reportProgress(
    Number.isFinite(declaredTotal) &&
      declaredTotal !== undefined &&
      declaredTotal >= data.byteLength
      ? { loadedBytes: data.byteLength, totalBytes: declaredTotal }
      : { loadedBytes: data.byteLength },
  );
  return data;
}

function parseGltf(loader: GLTFLoader, data: ArrayBuffer, path: string): Promise<GLTF> {
  return new Promise((resolve, reject) => {
    loader.parse(data, path, resolve, reject);
  });
}

/**
 * Creates a renderer-owned GLB/glTF loader with the assets package's normative
 * cancellation, late-result cleanup, progress, and ownership semantics.
 */
export function createGltfAssetLoader(
  options: ThreeGltfAssetLoaderOptions = {},
): AssetLoader<ThreeAssetHandle> {
  if (options.ktx2TranscoderPath !== undefined) {
    throw new RangeError(
      "ktx2TranscoderPath requires a renderer-bound KTX2 adapter and is not supported by createGltfAssetLoader.",
    );
  }

  const loader = new GLTFLoader();
  if (options.dracoDecoderPath !== undefined) {
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(options.dracoDecoderPath);
    loader.setDRACOLoader(dracoLoader);
  }

  return createAssetLoader(async (request, context) => {
    context.throwIfCancelled();
    const data = await sourceBytes(request.source, context);
    context.throwIfCancelled();
    const gltf = await parseGltf(loader, data, basePathFor(request.source));
    context.throwIfCancelled();
    return createThreeAssetHandle(gltf.scene);
  }, disposeThreeAssetHandle);
}
