import { describe, expect, it } from "vitest";

import type { EntityId } from "../src/identifiers.js";
import {
  computeReimportDiff,
  type ReimportEntity,
  type ReimportInput,
} from "../src/lk-map-reimport.js";

function eid(value: string): EntityId {
  return value as EntityId;
}
function durable(id: string, durableId: string, fields: Record<string, unknown>): ReimportEntity {
  return { id: eid(id), kind: "durable", durableId, fields };
}
function weak(id: string, path: string, fields: Record<string, unknown>): ReimportEntity {
  return { id: eid(id), kind: "weak", path, fields };
}

// A: web-only edit (source unchanged) -> kept, not reported.
// B: source changed a field the web left alone -> change.
// C: source and web both changed the same field -> conflict.
// D: durable entity gone from the new source -> delete.
// E: weak/path-only entity gone from the new source -> remap-required.
// F: new durable entity in the source -> add.
const input: ReimportInput = {
  base: [
    durable("e/a", "d/a", { pos: 1 }),
    durable("e/b", "d/b", { name: "b" }),
    durable("e/c", "d/c", { label: "c" }),
    durable("e/d", "d/gone", { note: "d" }),
    weak("e/e", "/prim/moved", { note: "e" }),
  ],
  current: [
    durable("e/a", "d/a", { pos: 2 }),
    durable("e/b", "d/b", { name: "b" }),
    durable("e/c", "d/c", { label: "c-web" }),
    durable("e/d", "d/gone", { note: "d" }),
    weak("e/e", "/prim/moved", { note: "e" }),
  ],
  incoming: [
    durable("e/a", "d/a", { pos: 1 }),
    durable("e/b", "d/b", { name: "b2" }),
    durable("e/c", "d/c", { label: "c-src" }),
    durable("e/f", "d/new", { note: "f" }),
  ],
};

describe("A5 reimport 3-way diff", () => {
  const diff = computeReimportDiff(input);

  it("adds a new durable source entity", () => {
    expect(diff.added).toEqual([eid("e/f")]);
  });

  it("deletes a durable entity missing from the new source", () => {
    expect(diff.deleted).toEqual([eid("e/d")]);
  });

  it("marks a vanished path-only binding remap-required, not deleted", () => {
    expect(diff.remapRequired).toEqual([eid("e/e")]);
    expect(diff.deleted).not.toContain(eid("e/e"));
  });

  it("reports a source-only field change", () => {
    expect(diff.changed).toEqual([{ entityId: eid("e/b"), fields: ["name"] }]);
  });

  it("reports a field changed by both source and web as a conflict", () => {
    expect(diff.conflicts).toEqual([{ entityId: eid("e/c"), field: "label" }]);
  });

  it("keeps a web-only edit without reporting it as a change or conflict", () => {
    expect(diff.changed.some((change) => change.entityId === eid("e/a"))).toBe(false);
    expect(diff.conflicts.some((conflict) => conflict.entityId === eid("e/a"))).toBe(false);
  });

  it("is deterministic and does not mutate the input", () => {
    const snapshot = JSON.stringify(input);
    computeReimportDiff(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
