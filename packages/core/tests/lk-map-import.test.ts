import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { validateLKMapDocument } from "../src/lk-map-document.js";
import { normalizeIsaacReferenceMapping, type IsaacMappingManifest } from "../src/lk-map-import.js";

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8")) as unknown;
}

const ISAAC_MANIFEST = "../../../docs/schemas/fixtures/isaac-mapping.one-level.json";
const NATIVE_DOCUMENT = "../../../docs/schemas/fixtures/lk-map-document.minimal-level.json";

function isaacDocument(): ReturnType<typeof normalizeIsaacReferenceMapping> {
  return normalizeIsaacReferenceMapping(readJson(ISAAC_MANIFEST) as IsaacMappingManifest);
}
function nativeDocument(): Record<string, unknown> {
  return readJson(NATIVE_DOCUMENT) as Record<string, unknown>;
}

describe("A2 dual-path vertical slice", () => {
  it("normalizes the Isaac reference mapping into a valid canonical document", () => {
    expect(validateLKMapDocument(isaacDocument())).toEqual([]);
  });

  it("converges with the native-authored document on structure and semantics", () => {
    const doc = isaacDocument();
    const native = nativeDocument();
    // Both entry paths produce the identical one-level spatial content
    // (floor + polyline wall + waypoint-edge route).
    expect(doc.structure).toEqual(native.structure);
    expect(doc.semantics).toEqual(native.semantics);
  });

  it("differs only by the durable source binding the import path records", () => {
    const doc = isaacDocument();
    const native = nativeDocument();
    expect(native.binding).toBeUndefined();
    expect(doc.binding).toBeDefined();
    const entities = doc.binding?.entities ?? [];
    expect(entities.length).toBeGreaterThan(0);
    expect(entities.every((entity) => entity.kind === "durable")).toBe(true);
    expect(entities.every((entity) => (entity.durableId ?? "").startsWith("lk:entityId:"))).toBe(
      true,
    );
  });
});
