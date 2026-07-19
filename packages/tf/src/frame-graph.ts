import {
  assertValidFrameId,
  assertValidRigidTransform,
  composeTransforms,
  identityTransform,
  invertTransform,
  rigidTransform3,
  timestamp,
  type ClockId,
  type FrameId,
  type Quat,
  type RigidTransform3,
  type Timestamp,
  type Vec3,
} from "@lk-robotics/design-system-3d-core";

export interface FrameTransformSampleInput {
  /** Child/source to parent/target transform. */
  readonly transform: RigidTransform3;
  readonly timestamp: Timestamp;
  /** Static samples apply at every query time and never become stale. */
  readonly static?: boolean;
}

export interface FrameTransformSample {
  readonly transform: RigidTransform3;
  readonly timestamp: Timestamp;
  readonly static: boolean;
}

export interface FrameEdge {
  readonly sourceFrame: FrameId;
  readonly targetFrame: FrameId;
  readonly samples: readonly FrameTransformSample[];
}

export interface FrameGraph {
  readonly samples: readonly FrameTransformSample[];
  /** Internal normalized edge list; public for deterministic inspection and serialization. */
  readonly edges: readonly FrameEdge[];
}

export interface FrameLookupOptions {
  /** A held dynamic transform older than this is reported as stale. */
  readonly staleAfterSeconds: number;
  /** Maximum forward hold-last window. Defaults to zero. */
  readonly extrapolationLimitSeconds?: number;
}

export type FrameSampleMode = "identity" | "static" | "exact" | "interpolated" | "held";

export interface FrameLookupSuccess {
  readonly kind: "ready";
  readonly sourceFrame: FrameId;
  readonly targetFrame: FrameId;
  readonly at: Timestamp;
  readonly transform: RigidTransform3;
  readonly path: readonly FrameId[];
  readonly mode: FrameSampleMode;
  readonly ageSeconds: number;
}

export type FrameLookupResult =
  | FrameLookupSuccess
  | {
      readonly kind: "missing";
      readonly sourceFrame: FrameId;
      readonly targetFrame: FrameId;
      readonly at: Timestamp;
      readonly missingFrame?: FrameId;
    }
  | {
      readonly kind: "clock-mismatch";
      readonly sourceFrame: FrameId;
      readonly targetFrame: FrameId;
      readonly at: Timestamp;
      readonly expectedClock: ClockId;
      readonly actualClocks: readonly ClockId[];
    }
  | {
      readonly kind: "stale";
      readonly sourceFrame: FrameId;
      readonly targetFrame: FrameId;
      readonly at: Timestamp;
      readonly ageSeconds: number;
      readonly staleAfterSeconds: number;
      readonly path: readonly FrameId[];
    }
  | {
      readonly kind: "extrapolation";
      readonly sourceFrame: FrameId;
      readonly targetFrame: FrameId;
      readonly at: Timestamp;
      readonly direction: "before-history" | "after-history";
      readonly deltaSeconds: number;
      readonly limitSeconds: number;
      readonly path: readonly FrameId[];
    };

export class FrameGraphValidationError extends RangeError {
  override readonly name = "FrameGraphValidationError";
}

function immutableTimestamp(value: Timestamp): Timestamp {
  return timestamp(value.clock, value.sec, value.nsec);
}

function immutableTransform(value: RigidTransform3): RigidTransform3 {
  return rigidTransform3(
    value.sourceFrame,
    value.targetFrame,
    [value.translation[0], value.translation[1], value.translation[2]],
    [value.rotation[0], value.rotation[1], value.rotation[2], value.rotation[3]],
  );
}

export function createFrameTransformSample(input: FrameTransformSampleInput): FrameTransformSample {
  const unknownInput: unknown = input;
  if (typeof unknownInput !== "object" || unknownInput === null || Array.isArray(unknownInput)) {
    throw new FrameGraphValidationError("FrameTransformSampleInput must be an object.");
  }
  assertValidRigidTransform(input.transform);
  if (input.transform.sourceFrame === input.transform.targetFrame) {
    throw new FrameGraphValidationError("A frame-tree edge cannot parent a frame to itself.");
  }
  if (input.static !== undefined && typeof input.static !== "boolean") {
    throw new FrameGraphValidationError("static must be a boolean when provided.");
  }
  return Object.freeze({
    transform: immutableTransform(input.transform),
    timestamp: immutableTimestamp(input.timestamp),
    static: input.static ?? false,
  });
}

function timestampNanoseconds(value: Timestamp): bigint {
  return BigInt(value.sec) * 1_000_000_000n + BigInt(value.nsec);
}

function timestampDeltaSeconds(later: Timestamp, earlier: Timestamp): number {
  return Number(timestampNanoseconds(later) - timestampNanoseconds(earlier)) / 1_000_000_000;
}

function edgeKey(sourceFrame: FrameId, targetFrame: FrameId): string {
  return `${sourceFrame}\u0000${targetFrame}`;
}

function assertTreeTopology(edges: readonly FrameEdge[]): void {
  const parentByChild = new Map<FrameId, FrameId>();
  for (const edge of edges) {
    const existing = parentByChild.get(edge.sourceFrame);
    if (existing !== undefined && existing !== edge.targetFrame) {
      throw new FrameGraphValidationError(
        `Frame ${JSON.stringify(edge.sourceFrame)} has more than one parent.`,
      );
    }
    parentByChild.set(edge.sourceFrame, edge.targetFrame);
  }

  for (const start of parentByChild.keys()) {
    const visited = new Set<FrameId>();
    let current: FrameId | undefined = start;
    while (current !== undefined) {
      if (visited.has(current)) {
        throw new FrameGraphValidationError(
          `Frame tree contains a cycle through ${JSON.stringify(current)}.`,
        );
      }
      visited.add(current);
      current = parentByChild.get(current);
    }
  }
}

export function createFrameGraph(inputs: readonly FrameTransformSampleInput[]): FrameGraph {
  if (!Array.isArray(inputs)) {
    throw new FrameGraphValidationError("Frame graph samples must be an array.");
  }
  const samples = inputs.map(createFrameTransformSample);
  const grouped = new Map<string, FrameTransformSample[]>();
  for (const sample of samples) {
    const { sourceFrame, targetFrame } = sample.transform;
    const key = edgeKey(sourceFrame, targetFrame);
    const group = grouped.get(key) ?? [];
    if (
      group.some(
        (candidate) =>
          candidate.timestamp.clock === sample.timestamp.clock &&
          candidate.timestamp.sec === sample.timestamp.sec &&
          candidate.timestamp.nsec === sample.timestamp.nsec,
      )
    ) {
      throw new FrameGraphValidationError(
        `Duplicate timestamp for frame edge ${JSON.stringify(sourceFrame)} -> ${JSON.stringify(targetFrame)}.`,
      );
    }
    if (group.some((candidate) => candidate.static !== sample.static)) {
      throw new FrameGraphValidationError("A frame edge cannot mix static and dynamic samples.");
    }
    group.push(sample);
    grouped.set(key, group);
  }

  const edges = [...grouped.values()].map((group) => {
    const first = group[0];
    if (first === undefined) throw new FrameGraphValidationError("Frame edge cannot be empty.");
    const sorted = [...group].sort((left, right) => {
      const clockOrder = left.timestamp.clock.localeCompare(right.timestamp.clock);
      if (clockOrder !== 0) return clockOrder;
      const delta = timestampNanoseconds(left.timestamp) - timestampNanoseconds(right.timestamp);
      return delta < 0n ? -1 : delta > 0n ? 1 : 0;
    });
    return Object.freeze({
      sourceFrame: first.transform.sourceFrame,
      targetFrame: first.transform.targetFrame,
      samples: Object.freeze(sorted),
    });
  });
  assertTreeTopology(edges);
  return Object.freeze({
    samples: Object.freeze(samples),
    edges: Object.freeze(edges),
  });
}

interface PathStep {
  readonly edge: FrameEdge;
  readonly invert: boolean;
  readonly next: FrameId;
}

function findPath(
  graph: FrameGraph,
  sourceFrame: FrameId,
  targetFrame: FrameId,
): readonly PathStep[] | undefined {
  const adjacency = new Map<FrameId, PathStep[]>();
  for (const edge of graph.edges) {
    const forward = adjacency.get(edge.sourceFrame) ?? [];
    forward.push({ edge, invert: false, next: edge.targetFrame });
    adjacency.set(edge.sourceFrame, forward);
    const reverse = adjacency.get(edge.targetFrame) ?? [];
    reverse.push({ edge, invert: true, next: edge.sourceFrame });
    adjacency.set(edge.targetFrame, reverse);
  }
  if (!adjacency.has(sourceFrame) || !adjacency.has(targetFrame)) return undefined;

  const queue: { readonly frame: FrameId; readonly steps: readonly PathStep[] }[] = [
    { frame: sourceFrame, steps: [] },
  ];
  const visited = new Set<FrameId>([sourceFrame]);
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    for (const step of adjacency.get(current.frame) ?? []) {
      if (visited.has(step.next)) continue;
      const steps = [...current.steps, step];
      if (step.next === targetFrame) return Object.freeze(steps);
      visited.add(step.next);
      queue.push({ frame: step.next, steps });
    }
  }
  return undefined;
}

function lerp(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}

function slerp(left: Quat, rightInput: Quat, amount: number): Quat {
  let right = rightInput;
  let dot = left[0] * right[0] + left[1] * right[1] + left[2] * right[2] + left[3] * right[3];
  if (dot < 0) {
    right = [-right[0], -right[1], -right[2], -right[3]];
    dot = -dot;
  }
  if (dot > 0.9995) {
    const value: Quat = [
      lerp(left[0], right[0], amount),
      lerp(left[1], right[1], amount),
      lerp(left[2], right[2], amount),
      lerp(left[3], right[3], amount),
    ];
    const norm = Math.hypot(value[0], value[1], value[2], value[3]);
    return [value[0] / norm, value[1] / norm, value[2] / norm, value[3] / norm];
  }
  const theta = Math.acos(Math.min(1, Math.max(-1, dot)));
  const sinTheta = Math.sin(theta);
  const leftWeight = Math.sin((1 - amount) * theta) / sinTheta;
  const rightWeight = Math.sin(amount * theta) / sinTheta;
  return [
    left[0] * leftWeight + right[0] * rightWeight,
    left[1] * leftWeight + right[1] * rightWeight,
    left[2] * leftWeight + right[2] * rightWeight,
    left[3] * leftWeight + right[3] * rightWeight,
  ];
}

type EdgeResolution =
  | {
      readonly kind: "resolved";
      readonly transform: RigidTransform3;
      readonly mode: FrameSampleMode;
      readonly ageSeconds: number;
    }
  | { readonly kind: "clock-mismatch"; readonly clocks: readonly ClockId[] }
  | {
      readonly kind: "extrapolation";
      readonly direction: "before-history" | "after-history";
      readonly deltaSeconds: number;
    };

function resolveEdge(
  edge: FrameEdge,
  at: Timestamp,
  extrapolationLimitSeconds: number,
): EdgeResolution {
  const staticSample = edge.samples.find((sample) => sample.static);
  if (staticSample !== undefined) {
    return { kind: "resolved", transform: staticSample.transform, mode: "static", ageSeconds: 0 };
  }
  const samples = edge.samples.filter((sample) => sample.timestamp.clock === at.clock);
  if (samples.length === 0) {
    return {
      kind: "clock-mismatch",
      clocks: Object.freeze([...new Set(edge.samples.map((sample) => sample.timestamp.clock))]),
    };
  }
  const query = timestampNanoseconds(at);
  const exact = samples.find((sample) => timestampNanoseconds(sample.timestamp) === query);
  if (exact !== undefined) {
    return { kind: "resolved", transform: exact.transform, mode: "exact", ageSeconds: 0 };
  }
  const before = [...samples]
    .reverse()
    .find((sample) => timestampNanoseconds(sample.timestamp) < query);
  const after = samples.find((sample) => timestampNanoseconds(sample.timestamp) > query);
  if (before === undefined && after !== undefined) {
    return {
      kind: "extrapolation",
      direction: "before-history",
      deltaSeconds: timestampDeltaSeconds(after.timestamp, at),
    };
  }
  if (before !== undefined && after !== undefined) {
    const span = timestampDeltaSeconds(after.timestamp, before.timestamp);
    const amount = timestampDeltaSeconds(at, before.timestamp) / span;
    const translation: Vec3 = [
      lerp(before.transform.translation[0], after.transform.translation[0], amount),
      lerp(before.transform.translation[1], after.transform.translation[1], amount),
      lerp(before.transform.translation[2], after.transform.translation[2], amount),
    ];
    return {
      kind: "resolved",
      transform: rigidTransform3(
        edge.sourceFrame,
        edge.targetFrame,
        translation,
        slerp(before.transform.rotation, after.transform.rotation, amount),
      ),
      mode: "interpolated",
      ageSeconds: 0,
    };
  }
  if (before === undefined) {
    throw new FrameGraphValidationError("Dynamic frame edge has no samples.");
  }
  const ageSeconds = timestampDeltaSeconds(at, before.timestamp);
  if (ageSeconds > extrapolationLimitSeconds) {
    return {
      kind: "extrapolation",
      direction: "after-history",
      deltaSeconds: ageSeconds,
    };
  }
  return { kind: "resolved", transform: before.transform, mode: "held", ageSeconds };
}

function validateLookupOptions(options: FrameLookupOptions): Required<FrameLookupOptions> {
  const staleAfterSeconds = options.staleAfterSeconds;
  const extrapolationLimitSeconds = options.extrapolationLimitSeconds ?? 0;
  for (const [label, value] of [
    ["staleAfterSeconds", staleAfterSeconds],
    ["extrapolationLimitSeconds", extrapolationLimitSeconds],
  ] as const) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new FrameGraphValidationError(`${label} must be a finite non-negative number.`);
    }
  }
  return { staleAfterSeconds, extrapolationLimitSeconds };
}

function dominantMode(modes: readonly FrameSampleMode[]): FrameSampleMode {
  if (modes.includes("held")) return "held";
  if (modes.includes("interpolated")) return "interpolated";
  if (modes.includes("exact")) return "exact";
  if (modes.includes("static")) return "static";
  return "identity";
}

export function lookupFrameTransform(
  graph: FrameGraph,
  sourceFrame: FrameId,
  targetFrame: FrameId,
  atInput: Timestamp,
  optionsInput: FrameLookupOptions,
): FrameLookupResult {
  assertValidFrameId(sourceFrame);
  assertValidFrameId(targetFrame);
  const at = immutableTimestamp(atInput);
  const options = validateLookupOptions(optionsInput);
  if (sourceFrame === targetFrame) {
    return Object.freeze({
      kind: "ready",
      sourceFrame,
      targetFrame,
      at,
      transform: identityTransform(sourceFrame),
      path: Object.freeze([sourceFrame]),
      mode: "identity",
      ageSeconds: 0,
    });
  }

  const steps = findPath(graph, sourceFrame, targetFrame);
  if (steps === undefined) {
    const known = new Set(graph.edges.flatMap((edge) => [edge.sourceFrame, edge.targetFrame]));
    return Object.freeze({
      kind: "missing",
      sourceFrame,
      targetFrame,
      at,
      ...(!known.has(sourceFrame)
        ? { missingFrame: sourceFrame }
        : !known.has(targetFrame)
          ? { missingFrame: targetFrame }
          : {}),
    });
  }

  const path: FrameId[] = [sourceFrame];
  const transforms: RigidTransform3[] = [];
  const modes: FrameSampleMode[] = [];
  let ageSeconds = 0;
  for (const step of steps) {
    path.push(step.next);
    const resolution = resolveEdge(step.edge, at, options.extrapolationLimitSeconds);
    if (resolution.kind === "clock-mismatch") {
      return Object.freeze({
        kind: "clock-mismatch",
        sourceFrame,
        targetFrame,
        at,
        expectedClock: at.clock,
        actualClocks: resolution.clocks,
      });
    }
    if (resolution.kind === "extrapolation") {
      return Object.freeze({
        kind: "extrapolation",
        sourceFrame,
        targetFrame,
        at,
        direction: resolution.direction,
        deltaSeconds: resolution.deltaSeconds,
        limitSeconds: options.extrapolationLimitSeconds,
        path: Object.freeze(path),
      });
    }
    transforms.push(step.invert ? invertTransform(resolution.transform) : resolution.transform);
    modes.push(resolution.mode);
    ageSeconds = Math.max(ageSeconds, resolution.ageSeconds);
  }

  if (ageSeconds > options.staleAfterSeconds) {
    return Object.freeze({
      kind: "stale",
      sourceFrame,
      targetFrame,
      at,
      ageSeconds,
      staleAfterSeconds: options.staleAfterSeconds,
      path: Object.freeze(path),
    });
  }
  const first = transforms[0];
  if (first === undefined) throw new FrameGraphValidationError("Resolved frame path is empty.");
  const transform = transforms.slice(1).reduce(composeTransforms, first);
  return Object.freeze({
    kind: "ready",
    sourceFrame,
    targetFrame,
    at,
    transform,
    path: Object.freeze(path),
    mode: dominantMode(modes),
    ageSeconds,
  });
}
