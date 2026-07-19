/**
 * A5 reimport 3-way diff contract (DRAFT — not re-exported from core index).
 * Pure logic per ADR-0002 A5: compare a new external source revision against the
 * previous normalized base and the web-authored edits.
 *
 * - durable-bound entities produce add / change / delete / conflict.
 * - a field changed by BOTH the source and the web (relative to the base) is a
 *   conflict; a field changed only by the source is a change; a field changed
 *   only by the web is kept (not reported).
 * - a path-only (weak) entity whose source path is gone becomes remap-required,
 *   never an automatic delete.
 *
 * Applying the diff (product-owned merge, history, persistence) is out of scope;
 * this returns a pure, deterministic result.
 */

import type { EntityId } from "./identifiers.js";

export interface ReimportEntity {
  readonly id: EntityId;
  readonly kind: "durable" | "weak";
  readonly durableId?: string;
  readonly path?: string;
  readonly fields: Readonly<Record<string, unknown>>;
}

export interface ReimportInput {
  /** Previous normalized source snapshot. */
  readonly base: readonly ReimportEntity[];
  /** Web-authored document (base plus web edits). */
  readonly current: readonly ReimportEntity[];
  /** New external source revision. */
  readonly incoming: readonly ReimportEntity[];
}

export interface ReimportEntityChange {
  readonly entityId: EntityId;
  readonly fields: readonly string[];
}
export interface ReimportFieldConflict {
  readonly entityId: EntityId;
  readonly field: string;
}

export interface ReimportDiff {
  readonly added: readonly EntityId[];
  readonly deleted: readonly EntityId[];
  readonly remapRequired: readonly EntityId[];
  readonly changed: readonly ReimportEntityChange[];
  readonly conflicts: readonly ReimportFieldConflict[];
}

function bindingKey(entity: ReimportEntity): string | undefined {
  return entity.kind === "durable" ? entity.durableId : entity.path;
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function indexByKey(entities: readonly ReimportEntity[]): Map<string, ReimportEntity> {
  const map = new Map<string, ReimportEntity>();
  for (const entity of entities) {
    const key = bindingKey(entity);
    if (key !== undefined) map.set(key, entity);
  }
  return map;
}

/** Computes the deterministic 3-way reimport diff. Does not mutate any input. */
export function computeReimportDiff(input: ReimportInput): ReimportDiff {
  const baseByKey = indexByKey(input.base);
  const currentByKey = indexByKey(input.current);
  const incomingByKey = indexByKey(input.incoming);

  const added: EntityId[] = [];
  const deleted: EntityId[] = [];
  const remapRequired: EntityId[] = [];
  const changed: ReimportEntityChange[] = [];
  const conflicts: ReimportFieldConflict[] = [];

  // New source entities with no base match are additions.
  for (const entity of input.incoming) {
    const key = bindingKey(entity);
    if (key !== undefined && !baseByKey.has(key)) added.push(entity.id);
  }

  for (const baseEntity of input.base) {
    const key = bindingKey(baseEntity);
    if (key === undefined) continue;
    const incoming = incomingByKey.get(key);

    if (incoming === undefined) {
      // Missing from the new source: durable => delete, weak/path-only => remap.
      if (baseEntity.kind === "weak") remapRequired.push(baseEntity.id);
      else deleted.push(baseEntity.id);
      continue;
    }

    const current = currentByKey.get(key) ?? baseEntity;
    const fieldNames = new Set<string>([
      ...Object.keys(baseEntity.fields),
      ...Object.keys(incoming.fields),
      ...Object.keys(current.fields),
    ]);
    const changedFields: string[] = [];
    for (const field of [...fieldNames].sort()) {
      const baseValue = baseEntity.fields[field];
      const incomingValue = incoming.fields[field];
      const currentValue = current.fields[field];
      const sourceChanged = !sameValue(incomingValue, baseValue);
      const webChanged = !sameValue(currentValue, baseValue);
      if (sourceChanged && webChanged && !sameValue(incomingValue, currentValue)) {
        conflicts.push({ entityId: baseEntity.id, field });
      } else if (sourceChanged) {
        changedFields.push(field);
      }
    }
    if (changedFields.length > 0) changed.push({ entityId: baseEntity.id, fields: changedFields });
  }

  return { added, deleted, remapRequired, changed, conflicts };
}
