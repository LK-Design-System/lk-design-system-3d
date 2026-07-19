import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  LK_MAP_DOCUMENT_SCHEMA_VERSION,
  LKMapDocumentValidationError,
  assertValidLKMapDocument,
  isValidLKMapDocument,
  validateLKMapDocument,
} from "../src/lk-map-document.js";

const FIXTURES = [
  "minimal-level",
  "durable-binding",
  "weak-remap",
  "unknown-preservation",
  "derived-provenance",
];

function readFixture(name: string): unknown {
  return JSON.parse(
    readFileSync(
      new URL(`../../../docs/schemas/fixtures/lk-map-document.${name}.json`, import.meta.url),
      "utf8",
    ),
  ) as unknown;
}

function rec(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}
function recAt(value: unknown, index: number): Record<string, unknown> {
  return (value as unknown[])[index] as Record<string, unknown>;
}
function codes(value: unknown): string[] {
  return validateLKMapDocument(value).map((issue) => issue.code);
}

describe("A1 LK Map Document validator", () => {
  it("accepts every golden fixture with zero issues", () => {
    for (const name of FIXTURES) {
      const doc = readFixture(name);
      expect(validateLKMapDocument(doc), name).toEqual([]);
      expect(isValidLKMapDocument(doc)).toBe(true);
    }
  });

  it("rejects a wrong schema version", () => {
    const doc = readFixture("minimal-level");
    rec(doc).schemaVersion = LK_MAP_DOCUMENT_SCHEMA_VERSION + 1;
    expect(codes(doc)).toContain("SCHEMA_VERSION");
  });

  it("rejects a floor vertexId that does not resolve to a vertex", () => {
    const doc = readFixture("minimal-level");
    recAt(rec(rec(doc).structure).floors, 0).vertexIds = ["v/1", "v/missing"];
    expect(codes(doc)).toContain("VERTEX_REF");
  });

  it("rejects an unknown level reference", () => {
    const doc = readFixture("minimal-level");
    recAt(rec(rec(doc).structure).walls, 0).levelId = "level/ghost";
    expect(codes(doc)).toContain("LEVEL_REF");
  });

  it("rejects a duplicate entity id", () => {
    const doc = readFixture("minimal-level");
    recAt(rec(rec(doc).structure).vertices, 1).id = "v/1";
    expect(codes(doc)).toContain("DUPLICATE_ID");
  });

  it("rejects a broken Contract 1 raster constant", () => {
    const doc = readFixture("minimal-level");
    rec(rec(rec(doc).coordinate).raster).rosYamlOrigin = "upper-left";
    expect(codes(doc)).toContain("RASTER_PROFILE");
  });

  it("rejects a weak binding without a path (remap-required)", () => {
    const doc = readFixture("weak-remap");
    recAt(rec(rec(doc).binding).entities, 0).path = "";
    expect(codes(doc)).toContain("BINDING_WEAK");
  });

  it("rejects a route edge referencing an unknown waypoint", () => {
    const doc = readFixture("minimal-level");
    recAt(rec(rec(rec(doc).semantics).routeGraph).edges, 0).toWaypointId = "wp/ghost";
    expect(codes(doc)).toContain("EDGE_WAYPOINT_REF");
  });

  it("assertValidLKMapDocument throws a typed error on invalid input", () => {
    expect(() => {
      assertValidLKMapDocument({ schemaVersion: 1 });
    }).toThrow(LKMapDocumentValidationError);
    expect(() => {
      assertValidLKMapDocument(readFixture("minimal-level"));
    }).not.toThrow();
  });
});
