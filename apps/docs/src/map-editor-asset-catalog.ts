import type { AssetManifestV1 } from "@lk-design-system/lds-3d-assets";
import tronManifestJson from "@lk-design-system/lds-3d-assets/robots/tron/tron.asset-manifest.json";
import { bounds3, type Bounds3, type FrameId } from "@lk-design-system/lds-3d-core";

/** The single approved GLB entry used by the Storybook map-authoring fixture. */
export const MAP_EDITOR_TRON_MANIFEST =
  tronManifestJson as unknown as AssetManifestV1;

export const MAP_EDITOR_TRON_XY_FOOTPRINT = Object.freeze({
  centerOffsetMeters: Object.freeze([
    (MAP_EDITOR_TRON_MANIFEST.boundsInCoreMeters.min[0] +
      MAP_EDITOR_TRON_MANIFEST.boundsInCoreMeters.max[0]) /
      2,
    (MAP_EDITOR_TRON_MANIFEST.boundsInCoreMeters.min[1] +
      MAP_EDITOR_TRON_MANIFEST.boundsInCoreMeters.max[1]) /
      2,
  ] as const),
  sizeMeters: Object.freeze([
    MAP_EDITOR_TRON_MANIFEST.boundsInCoreMeters.max[0] -
      MAP_EDITOR_TRON_MANIFEST.boundsInCoreMeters.min[0],
    MAP_EDITOR_TRON_MANIFEST.boundsInCoreMeters.max[1] -
      MAP_EDITOR_TRON_MANIFEST.boundsInCoreMeters.min[1],
  ] as const),
});

/** Reframes the manifest's core-normalized bounds into an asset-node local frame. */
export function mapEditorTronBounds(frame: FrameId): Bounds3 {
  return bounds3(
    frame,
    MAP_EDITOR_TRON_MANIFEST.boundsInCoreMeters.min,
    MAP_EDITOR_TRON_MANIFEST.boundsInCoreMeters.max,
  );
}
