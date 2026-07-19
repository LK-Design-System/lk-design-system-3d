import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parseAssetManifest } from "../src/index.js";

const assetUrl = new URL("../robots/tron/tron.glb", import.meta.url);
const manifestUrl = new URL("../robots/tron/tron.asset-manifest.json", import.meta.url);
const provenanceUrl = new URL("../robots/tron/provenance.json", import.meta.url);
const catalogUrl = new URL("../robots/catalog.json", import.meta.url);

function readJson(url: URL): unknown {
  return JSON.parse(readFileSync(url, "utf8")) as unknown;
}

describe("packaged Tron robot asset", () => {
  it("ships a valid manifest whose integrity digest matches the GLB", () => {
    const manifest = readJson(manifestUrl);
    const parsed = parseAssetManifest(manifest);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const bytes = readFileSync(assetUrl);
    const digest = createHash("sha256").update(bytes).digest("hex");
    expect(digest).toBe(parsed.value.integrity?.sha256);
    expect(parsed.value.fileCoordinate).toEqual({
      handedness: "right",
      upAxis: "+Y",
      forwardAxis: "+X",
      metersPerUnit: 1,
    });
    expect(parsed.value.boundsInCoreMeters.min[2]).toBe(0);
  });

  it("is a complete glTF 2.0 GLB with the documented runtime extension", () => {
    const bytes = readFileSync(assetUrl);
    expect(bytes.toString("ascii", 0, 4)).toBe("glTF");
    expect(bytes.readUInt32LE(4)).toBe(2);
    expect(bytes.readUInt32LE(8)).toBe(bytes.length);

    const jsonChunkLength = bytes.readUInt32LE(12);
    expect(bytes.toString("ascii", 16, 20)).toBe("JSON");
    const gltf = JSON.parse(bytes.toString("utf8", 20, 20 + jsonChunkLength)) as {
      readonly asset?: { readonly version?: string };
      readonly extensionsRequired?: readonly string[];
    };
    expect(gltf.asset?.version).toBe("2.0");
    expect(gltf.extensionsRequired).toEqual(["KHR_mesh_quantization"]);
  });

  it("keeps immutable source and derivative provenance in the robot catalog", () => {
    const provenance = readJson(provenanceUrl) as {
      readonly assetId: string;
      readonly source: { readonly sha256: string; readonly commit: string };
      readonly derivative: { readonly sha256: string; readonly triangles: number };
    };
    const catalog = readJson(catalogUrl) as {
      readonly assets: readonly { readonly id: string; readonly provenance: string }[];
    };

    expect(provenance.assetId).toBe("robots/tron");
    expect(provenance.source.sha256).toBe(
      "48d2c008ce490c610ec3172311257b8878aa03b7dda3dec7e21a7d3e4a18baaa",
    );
    expect(provenance.source.commit).toBe("de64d3c9b98eb9ce7aeaf7765035153492a57359");
    expect(provenance.derivative.sha256).toBe(
      "a2ca4479f1fe098c624b6b657ac9e343dc66a800474a45c6d16c49ba75dbf1fa",
    );
    expect(provenance.derivative.triangles).toBe(209_495);
    expect(catalog.assets).toContainEqual(
      expect.objectContaining({ id: "robots/tron", provenance: "./tron/provenance.json" }),
    );
  });
});
