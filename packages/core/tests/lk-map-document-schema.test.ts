import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * A0 LK Map Document draft-schema regression guard (see
 * docs/A0-MAP-CONTRACT-DRAFT.md §3, §9). The draft schema and its golden
 * fixtures live under docs/schemas/ until A0 sign-off promotes them into a
 * package (§10.1). This is a repo-native check (no ajv): it guards schema
 * self-consistency, the minimal-level fixture shape, and the Contract 1 raster
 * constants shared by the schema and the fixture.
 */

const SCHEMA_PATH = "../../../docs/schemas/lk-map-document.v1.draft.schema.json";
const FIXTURE_PATH = "../../../docs/schemas/fixtures/lk-map-document.minimal-level.json";

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8")) as unknown;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("expected a JSON object");
  }
  return value as Record<string, unknown>;
}

function collectRefs(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, out);
    return;
  }
  if (node === null || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === "$ref" && typeof value === "string") out.add(value);
    else collectRefs(value, out);
  }
}

describe("A0 LK Map Document draft schema", () => {
  it("resolves every internal $ref to a defined $def", () => {
    const schema = asRecord(readJson(SCHEMA_PATH));
    const defs = asRecord(schema.$defs);
    const refs = new Set<string>();
    collectRefs(schema, refs);
    const internal = [...refs].filter((ref) => ref.startsWith("#/$defs/"));

    expect(internal.length).toBeGreaterThan(0);
    for (const ref of internal) {
      const name = ref.slice("#/$defs/".length);
      expect(Object.prototype.hasOwnProperty.call(defs, name)).toBe(true);
    }
  });

  it("minimal-level fixture carries every schema-required top-level field", () => {
    const schema = asRecord(readJson(SCHEMA_PATH));
    const fixture = asRecord(readJson(FIXTURE_PATH));
    const required = (schema.required as unknown[]).map(String);

    expect(required).toContain("coordinate");
    for (const field of required) {
      expect(Object.prototype.hasOwnProperty.call(fixture, field)).toBe(true);
    }
  });

  it("shares the Contract 1 raster constants between schema and fixture", () => {
    const schema = asRecord(readJson(SCHEMA_PATH));
    const fixture = asRecord(readJson(FIXTURE_PATH));
    const rasterProps = asRecord(asRecord(asRecord(schema.$defs).rasterProfile).properties);
    const fixtureRaster = asRecord(asRecord(fixture.coordinate).raster);

    for (const key of ["imageOrigin", "gridRow0", "rowFlip", "rosYamlOrigin", "dataIndex"]) {
      const expected = asRecord(rasterProps[key]).const;
      expect(fixtureRaster[key]).toBe(expected);
    }
    // The constants themselves must state Contract 1 (top-left image, lower-left ROS).
    expect(fixtureRaster.imageOrigin).toBe("top-left");
    expect(fixtureRaster.rosYamlOrigin).toBe("lower-left");
    expect(fixtureRaster.dataIndex).toBe("row * width + column");
  });
});

const FIXTURE_NAMES = [
  "minimal-level",
  "durable-binding",
  "weak-remap",
  "unknown-preservation",
  "derived-provenance",
];

function readFixture(name: string): Record<string, unknown> {
  return asRecord(readJson(`../../../docs/schemas/fixtures/lk-map-document.${name}.json`));
}

describe("A0 LK Map Document golden fixtures", () => {
  it("every fixture carries the schema-required top-level fields", () => {
    const required = (asRecord(readJson(SCHEMA_PATH)).required as unknown[]).map(String);
    for (const name of FIXTURE_NAMES) {
      const fixture = readFixture(name);
      for (const field of required) {
        expect(Object.prototype.hasOwnProperty.call(fixture, field), `${name}.${field}`).toBe(true);
      }
    }
  });

  it("durable-binding pins a durable identity, source metadata and normalized base", () => {
    const binding = asRecord(readFixture("durable-binding").binding);
    const source = asRecord(binding.source);
    for (const field of ["tool", "version", "documentId", "hash"]) {
      expect(typeof source[field]).toBe("string");
    }
    expect(typeof binding.normalizedBaseRef).toBe("string");
    const entity = asRecord((binding.entities as unknown[])[0]);
    expect(entity.kind).toBe("durable");
    expect(typeof entity.durableId).toBe("string");
    for (const owner of Object.values(asRecord(entity.fieldOwnership))) {
      expect(["source", "web"]).toContain(owner);
    }
  });

  it("weak-remap binds by scene-graph path only (never a durable id)", () => {
    const binding = asRecord(readFixture("weak-remap").binding);
    for (const raw of binding.entities as unknown[]) {
      const entity = asRecord(raw);
      if (entity.kind === "weak") {
        expect(typeof entity.path).toBe("string");
        expect(entity.durableId).toBeUndefined();
      }
    }
  });

  it("unknown-preservation round-trips x-unknown losslessly", () => {
    const fixture = readFixture("unknown-preservation");
    expect(fixture["x-unknown"]).toBeDefined();
    const roundTrip = asRecord(JSON.parse(JSON.stringify(fixture)) as unknown);
    expect(roundTrip["x-unknown"]).toEqual(fixture["x-unknown"]);
  });

  it("derived-provenance records every derived artifact with source and generator", () => {
    const derived = asRecord(readFixture("derived-provenance").provenance).derived as unknown[];
    expect(derived.length).toBeGreaterThan(0);
    for (const raw of derived) {
      const entry = asRecord(raw);
      for (const field of ["artifact", "sourceHash", "generator", "generatorVersion"]) {
        expect(typeof entry[field]).toBe("string");
      }
    }
  });
});

const CAP_SCHEMA_PATH = "../../../docs/schemas/adapter-capability.v1.draft.schema.json";
const CAP_FIXTURE_PATH = "../../../docs/schemas/fixtures/adapter-capability.isaac-reference.json";

describe("A0 adapter capability contract", () => {
  it("forbids derived reverse import via a const false in the schema", () => {
    const schema = asRecord(readJson(CAP_SCHEMA_PATH));
    const capabilities = asRecord(asRecord(schema.properties).capabilities);
    const capProps = asRecord(capabilities.properties);
    expect(asRecord(capProps.derivedReverseImport).const).toBe(false);
  });

  it("isaac-reference fixture is a read-only reference adapter with derived export", () => {
    const fixture = asRecord(readJson(CAP_FIXTURE_PATH));
    expect(fixture.supportedDocumentSchemaVersions as unknown[]).toContain(1);
    const caps = asRecord(fixture.capabilities);
    expect(caps.import).toBe(true);
    expect(caps.reimport).toBe(true);
    expect(caps.bundleRead).toBe(true);
    expect(caps.bundleWrite).toBe(true);
    expect(caps.sourceWriteback).toBe("none");
    expect(caps.visualRoundTrip).toBe(false);
    expect(caps.derivedReverseImport).toBe(false);
    expect(caps.derivedExport as unknown[]).toContain("glb");
  });
});
