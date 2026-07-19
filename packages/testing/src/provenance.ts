import { ALL_FOUNDATION_FIXTURE_IDS, FOUNDATION_FIXTURE_CONTENT } from "./fixtures.js";

export interface FixtureProvenance {
  readonly fixtureId: string;
  readonly fixtureVersion: "1.0.0";
  readonly origin: "generated";
  readonly generatedBy: "LK Design System 3D";
  readonly generationRecipe: string;
  readonly licenseSpdx: "CC0-1.0";
  readonly containsCustomerData: false;
  readonly contentSha256: string;
}

export interface FixtureProvenanceIssue {
  readonly fixtureId: string;
  readonly code:
    | "missing-provenance"
    | "duplicate-provenance"
    | "invalid-sha256"
    | "digest-mismatch"
    | "customer-data"
    | "unknown-origin"
    | "missing-license";
  readonly message: string;
}

export interface FixtureProvenanceReport {
  readonly passed: boolean;
  readonly expectedFixtureCount: number;
  readonly provenanceRecordCount: number;
  readonly issues: readonly FixtureProvenanceIssue[];
  readonly records: readonly FixtureProvenance[];
}

const GENERATION_RECIPES: Readonly<Record<string, string>> = {
  "unit-cube": "Analytic one-meter cube centered at the core origin.",
  "coordinate-axes": "Analytic LK right-handed +Z-up, +X-forward basis.",
  "shifted-origin": "Synthetic source-map point translated into the LK core frame.",
  "rotated-occupancy-grid":
    "Synthetic 4x3 occupancy raster with a half-meter resolution and a shifted +90-degree origin.",
  "robot-pose": "Synthetic robot pose at a fixed core-frame position and yaw.",
  path: "Synthetic four-point path with non-zero elevation samples.",
  "y-up-glb-manifest": "Synthetic metadata for a right-handed +Y-up GLB basis.",
  "legacy-z-up-glb-manifest": "Synthetic metadata for a right-handed +Z-up legacy GLB basis.",
  "authoritative-floor-hit": "Synthetic authoritative render hit and two rigid transforms.",
  "invalid-axis": "Y-up manifest mutated to use an opposite forward axis.",
  "invalid-unit": "Y-up manifest mutated to use zero meters per unit.",
  "invalid-frame": "Y-up manifest mutated to use a mismatched transform source frame.",
  "invalid-bounds": "Y-up manifest mutated so minimum X exceeds maximum X.",
  "invalid-checksum": "Y-up manifest mutated to use a malformed SHA-256 value.",
};

function requiredMetadata(
  values: Readonly<Record<string, string>>,
  fixtureId: string,
  field: string,
): string {
  const value = values[fixtureId];
  if (value === undefined || value.length === 0) {
    throw new Error(`Fixture ${fixtureId} is missing ${field}.`);
  }
  return value;
}

function requiredFixtureContent(fixtureId: string): unknown {
  if (!(fixtureId in FOUNDATION_FIXTURE_CONTENT)) {
    throw new Error(`Fixture ${fixtureId} is missing provenance content.`);
  }
  return FOUNDATION_FIXTURE_CONTENT[fixtureId];
}

function serializeJsonPrimitive(value: string | number | boolean | null): string {
  return JSON.stringify(value);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return serializeJsonPrimitive(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Fixture provenance cannot hash a non-finite number.");
    }
    return serializeJsonPrimitive(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Readonly<Record<string, unknown>>;
    const properties = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
    return `{${properties.join(",")}}`;
  }
  throw new TypeError(`Fixture provenance cannot hash a ${typeof value} value.`);
}

const SHA256_CONSTANTS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotateRight(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

function wordAt(values: Uint32Array, index: number, label: string): number {
  const value = values[index];
  if (value === undefined) {
    throw new RangeError(`${label}[${String(index)}] is missing.`);
  }
  return value;
}

/** Small dependency-free SHA-256 used only for deterministic fixture provenance. */
export function fixtureContentSha256(value: unknown): string {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const bitLength = BigInt(bytes.length) * 8n;
  for (let index = 0; index < 8; index += 1) {
    padded[padded.length - 1 - index] = Number((bitLength >> BigInt(index * 8)) & 0xffn);
  }

  const state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const words = new Uint32Array(64);
  const paddedView = new DataView(padded.buffer);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = paddedView.getUint32(offset + index * 4, false);
    }
    for (let index = 16; index < 64; index += 1) {
      const previous15 = wordAt(words, index - 15, "message schedule");
      const previous2 = wordAt(words, index - 2, "message schedule");
      const smallSigma0 =
        rotateRight(previous15, 7) ^ rotateRight(previous15, 18) ^ (previous15 >>> 3);
      const smallSigma1 =
        rotateRight(previous2, 17) ^ rotateRight(previous2, 19) ^ (previous2 >>> 10);
      words[index] =
        (wordAt(words, index - 16, "message schedule") +
          smallSigma0 +
          wordAt(words, index - 7, "message schedule") +
          smallSigma1) >>>
        0;
    }

    let a = wordAt(state, 0, "hash state");
    let b = wordAt(state, 1, "hash state");
    let c = wordAt(state, 2, "hash state");
    let d = wordAt(state, 3, "hash state");
    let e = wordAt(state, 4, "hash state");
    let f = wordAt(state, 5, "hash state");
    let g = wordAt(state, 6, "hash state");
    let h = wordAt(state, 7, "hash state");
    for (let index = 0; index < 64; index += 1) {
      const bigSigma1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temporary1 =
        (h +
          bigSigma1 +
          choose +
          wordAt(SHA256_CONSTANTS, index, "SHA-256 constants") +
          wordAt(words, index, "message schedule")) >>>
        0;
      const bigSigma0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (bigSigma0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }
    state[0] = (wordAt(state, 0, "hash state") + a) >>> 0;
    state[1] = (wordAt(state, 1, "hash state") + b) >>> 0;
    state[2] = (wordAt(state, 2, "hash state") + c) >>> 0;
    state[3] = (wordAt(state, 3, "hash state") + d) >>> 0;
    state[4] = (wordAt(state, 4, "hash state") + e) >>> 0;
    state[5] = (wordAt(state, 5, "hash state") + f) >>> 0;
    state[6] = (wordAt(state, 6, "hash state") + g) >>> 0;
    state[7] = (wordAt(state, 7, "hash state") + h) >>> 0;
  }

  return Array.from(state, (word) => word.toString(16).padStart(8, "0")).join("");
}

/**
 * The fixtures are analytic/generated, contain no product or customer data, and
 * may be copied into consumer characterization tests under CC0-1.0.
 */
export const FIXTURE_PROVENANCE: readonly FixtureProvenance[] = ALL_FOUNDATION_FIXTURE_IDS.map(
  (fixtureId) => ({
    fixtureId,
    fixtureVersion: "1.0.0",
    origin: "generated",
    generatedBy: "LK Design System 3D",
    generationRecipe: requiredMetadata(GENERATION_RECIPES, fixtureId, "generation recipe"),
    licenseSpdx: "CC0-1.0",
    containsCustomerData: false,
    contentSha256: fixtureContentSha256(requiredFixtureContent(fixtureId)),
  }),
);

/** Checks completeness and safety metadata without any test-runner dependency. */
export function checkFixtureProvenance(
  records: readonly FixtureProvenance[] = FIXTURE_PROVENANCE,
): FixtureProvenanceReport {
  const issues: FixtureProvenanceIssue[] = [];
  const counts = new Map<string, number>();

  for (const record of records) {
    counts.set(record.fixtureId, (counts.get(record.fixtureId) ?? 0) + 1);
    if (!/^[a-f0-9]{64}$/.test(record.contentSha256)) {
      issues.push({
        fixtureId: record.fixtureId,
        code: "invalid-sha256",
        message: "contentSha256 must contain exactly 64 lowercase hexadecimal characters.",
      });
    }
    const fixtureContent = FOUNDATION_FIXTURE_CONTENT[record.fixtureId];
    if (
      fixtureContent !== undefined &&
      fixtureContentSha256(fixtureContent) !== record.contentSha256
    ) {
      issues.push({
        fixtureId: record.fixtureId,
        code: "digest-mismatch",
        message: "contentSha256 does not match the canonical public fixture content.",
      });
    }
    const containsCustomerData: unknown = record.containsCustomerData;
    if (containsCustomerData !== false) {
      issues.push({
        fixtureId: record.fixtureId,
        code: "customer-data",
        message: "Foundation fixtures must not contain customer data.",
      });
    }
    const origin: unknown = record.origin;
    if (origin !== "generated" || record.generationRecipe.trim().length === 0) {
      issues.push({
        fixtureId: record.fixtureId,
        code: "unknown-origin",
        message: "A generated fixture must include its generation recipe.",
      });
    }
    if (record.licenseSpdx.trim().length === 0) {
      issues.push({
        fixtureId: record.fixtureId,
        code: "missing-license",
        message: "Fixture provenance requires an SPDX license identifier.",
      });
    }
  }

  for (const fixtureId of ALL_FOUNDATION_FIXTURE_IDS) {
    const count = counts.get(fixtureId) ?? 0;
    if (count === 0) {
      issues.push({
        fixtureId,
        code: "missing-provenance",
        message: `Fixture ${fixtureId} has no provenance record.`,
      });
    } else if (count > 1) {
      issues.push({
        fixtureId,
        code: "duplicate-provenance",
        message: `Fixture ${fixtureId} has ${String(count)} provenance records.`,
      });
    }
  }

  return {
    passed: issues.length === 0,
    expectedFixtureCount: ALL_FOUNDATION_FIXTURE_IDS.length,
    provenanceRecordCount: records.length,
    issues,
    records,
  };
}
