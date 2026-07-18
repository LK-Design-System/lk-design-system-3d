import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";

import {
  FIXTURE_PROVENANCE,
  checkFixtureProvenance,
  fixtureContentSha256,
  type FixtureProvenance,
} from "./provenance.js";

describe("fixture provenance", () => {
  it("matches the platform SHA-256 implementation for canonical JSON", () => {
    const expected = createHash("sha256").update(JSON.stringify("abc")).digest("hex");

    expect(fixtureContentSha256("abc")).toBe(expected);
  });

  it("covers every public fixture with generated, customer-free metadata", () => {
    const report = checkFixtureProvenance();

    expect(report.passed).toBe(true);
    expect(report.provenanceRecordCount).toBe(report.expectedFixtureCount);
    expect(
      report.records.every((record) => {
        const containsCustomerData: unknown = record.containsCustomerData;
        return containsCustomerData === false;
      }),
    ).toBe(true);
  });

  it("rejects missing and malformed provenance", () => {
    const firstRecord = FIXTURE_PROVENANCE[0];
    if (firstRecord === undefined) {
      throw new Error("Fixture provenance catalog is empty.");
    }
    const malformed: FixtureProvenance = {
      ...firstRecord,
      contentSha256: "broken",
    };
    const report = checkFixtureProvenance([malformed]);

    expect(report.passed).toBe(false);
    expect(report.issues.some((issue) => issue.code === "invalid-sha256")).toBe(true);
    expect(report.issues.some((issue) => issue.code === "missing-provenance")).toBe(true);
  });
});
