/**
 * React renderer adapter-only access to raw Three hierarchy and asset helpers.
 * Product code must use the package root's opaque contracts instead.
 */
export {
  cloneThreeSceneInstance,
  consumeThreeAssetOwnership as consumeAssetForR3F,
  createThreeVisualInstance,
  releaseThreeSceneInstance,
  type ThreeResolvedAsset,
  type ThreeVisualInput,
  type ThreeVisualInstance,
  type ThreeVisualUpdateInput,
} from "./runtime.js";
export type { ThreeAssetHandle } from "./asset-resource.js";
