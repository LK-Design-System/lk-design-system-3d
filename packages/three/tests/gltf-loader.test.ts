import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { assetId, bounds3, frameId, identityTransform } from "@lk-design-system/lds-3d-core";

import { createGltfAssetLoader } from "../src/gltf-loader.js";
import { consumeAssetForR3F } from "../src/r3f-bridge.js";

const FRAME = frameId("map");
const MANIFEST = {
  schemaVersion: 1 as const,
  assetId: assetId("test-amr"),
  version: "test",
  kind: "robot" as const,
  format: "glb" as const,
  fileFrame: FRAME,
  fileCoordinate: {
    handedness: "right" as const,
    upAxis: "+Z" as const,
    forwardAxis: "+X" as const,
    metersPerUnit: 1,
  },
  coreFrame: FRAME,
  fileToCoreTransform: identityTransform(FRAME),
  boundsInCoreMeters: bounds3(FRAME, [-1, -1, 0], [1, 1, 1]),
};

function visualAlphaAmrBytes(): ArrayBuffer {
  const file = readFileSync(new URL("../../assets/visual-alpha/amr.glb", import.meta.url));
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
}

describe("Three GLTF loader", () => {
  it("uses the shared asset ownership token exactly once for a real GLB", async () => {
    const loader = createGltfAssetLoader();
    const loaded = await loader.load({
      manifest: MANIFEST,
      source: { kind: "bytes", data: visualAlphaAmrBytes(), mediaType: "model/gltf-binary" },
    });
    const token = loaded.transferOwnership();
    const resolved = consumeAssetForR3F(token);

    expect(() => consumeAssetForR3F(token)).toThrow(/already been consumed/u);
    resolved.dispose();
    resolved.dispose();
  });

  it("fails explicitly instead of pretending that standalone KTX2 support exists", () => {
    expect(() => createGltfAssetLoader({ ktx2TranscoderPath: "/ktx2/" })).toThrow(/KTX2/u);
  });
});
