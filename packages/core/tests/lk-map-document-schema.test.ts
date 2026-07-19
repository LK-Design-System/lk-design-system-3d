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
