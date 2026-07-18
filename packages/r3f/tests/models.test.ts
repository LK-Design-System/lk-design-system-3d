import { describe, expect, it, vi } from "vitest";
import type { AssetManifestV1 } from "@lk-robotics/design-system-3d-assets";
import type { EntityId } from "@lk-robotics/design-system-3d-core";

const mocks = vi.hoisted(() => {
  const useLoader = Object.assign(vi.fn(), {
    clear: vi.fn(),
    preload: vi.fn(),
  });
  return {
    cloneThreeSceneInstance: vi.fn(),
    releaseThreeSceneInstance: vi.fn(),
    useEffect: vi.fn(),
    useLoader,
    useMemo: vi.fn(),
    useRef: vi.fn(),
  };
});

vi.mock("react", () => {
  class Component<Props, State> {
    props: Props;
    state!: State;

    constructor(props: Props) {
      this.props = props;
    }

    setState(update: Partial<State>): void {
      this.state = { ...this.state, ...update };
    }
  }

  return {
    Component,
    Suspense: Symbol.for("react.suspense"),
    useEffect: mocks.useEffect,
    useMemo: mocks.useMemo,
    useRef: mocks.useRef,
  };
});

vi.mock("@react-three/fiber", () => ({ useLoader: mocks.useLoader }));
vi.mock("@lk-robotics/design-system-3d-three/r3f-bridge", () => ({
  cloneThreeSceneInstance: mocks.cloneThreeSceneInstance,
  releaseThreeSceneInstance: mocks.releaseThreeSceneInstance,
}));
vi.mock("../src/primitives.js", () => ({
  SceneStateMarker: "scene-state-marker",
  Selectable: "selectable",
}));
vi.mock("../src/runtime.js", () => ({
  useSceneRuntime: () => ({
    theme: { materials: { live: "#00875A", selection: "#006EBD" } },
  }),
}));

import {
  GltfModel,
  createVisualAlphaModelUrls,
  resolveModelUrl,
  type GltfModelProps,
} from "../src/models.js";

const ENTITY_ID = "robot/amr-01" as EntityId;
const URL = "/models/amr.glb";
const GLTF_SCENE = {};
const PLACEMENT = {};

const VALID_MANIFEST = {
  schemaVersion: 1,
  assetId: "fixture/y-up-robot",
  version: "1.0.0",
  kind: "robot",
  format: "glb",
  fileFrame: "robot-file",
  fileCoordinate: {
    handedness: "right",
    upAxis: "+Y",
    forwardAxis: "+Z",
    metersPerUnit: 1,
  },
  coreFrame: "map",
  fileToCoreTransform: {
    sourceFrame: "robot-file",
    targetFrame: "map",
    translation: [0, 0, 0],
    rotation: [0.5, 0.5, 0.5, 0.5],
  },
  boundsInCoreMeters: {
    frame: "map",
    min: [-1, -1, 0],
    max: [1, 1, 2],
  },
} as unknown as AssetManifestV1;

const EXPLICIT_SOURCE_PROPS: GltfModelProps = {
  url: URL,
  entityId: ENTITY_ID,
  sourceConvention: "core",
};

const MANIFEST_PROPS: GltfModelProps = {
  url: URL,
  entityId: ENTITY_ID,
  manifest: VALID_MANIFEST,
};

// @ts-expect-error GltfModel requires explicit coordinate evidence.
const MISSING_COORDINATE_CONTRACT: GltfModelProps = { url: URL, entityId: ENTITY_ID };
void MISSING_COORDINATE_CONTRACT;

interface ElementLike {
  readonly type: unknown;
  readonly props: Record<string, unknown>;
}

interface EffectSlot {
  readonly kind: "effect";
  readonly deps: readonly unknown[];
  readonly cleanup?: () => void;
}

interface MemoSlot {
  readonly kind: "memo";
  readonly deps: readonly unknown[];
  readonly value: unknown;
}

interface RefSlot {
  readonly kind: "ref";
  readonly ref: { current: unknown };
}

type HookSlot = EffectSlot | MemoSlot | RefSlot;
type EffectCleanup = () => void;
type EffectResult = EffectCleanup | undefined;

interface PendingEffect {
  readonly index: number;
  readonly effect: () => EffectResult;
  readonly previousCleanup?: EffectCleanup;
  readonly deps: readonly unknown[];
}

function depsMatch(first: readonly unknown[], second: readonly unknown[]): boolean {
  return (
    first.length === second.length && first.every((value, index) => Object.is(value, second[index]))
  );
}

class HookHarness {
  private cursor = 0;
  private pending: PendingEffect[] = [];
  private slots: HookSlot[] = [];

  beginRender(): void {
    this.cursor = 0;
    this.pending = [];
  }

  useMemo<Value>(factory: () => Value, deps: readonly unknown[]): Value {
    const index = this.cursor++;
    const previous = this.slots[index];
    if (previous?.kind === "memo" && depsMatch(previous.deps, deps)) {
      return previous.value as Value;
    }
    const value = factory();
    this.slots[index] = { kind: "memo", deps, value };
    return value;
  }

  useRef<Value>(initialValue: Value): { current: Value } {
    const index = this.cursor++;
    const previous = this.slots[index];
    if (previous?.kind === "ref") return previous.ref as { current: Value };
    const ref = { current: initialValue };
    this.slots[index] = { kind: "ref", ref };
    return ref;
  }

  useEffect(effect: () => EffectResult, deps: readonly unknown[]): void {
    const index = this.cursor++;
    const previous = this.slots[index];
    if (previous?.kind === "effect" && depsMatch(previous.deps, deps)) return;
    this.pending.push({
      index,
      effect,
      deps,
      ...(previous?.kind === "effect" && previous.cleanup !== undefined
        ? { previousCleanup: previous.cleanup }
        : {}),
    });
  }

  commit(): void {
    for (const pending of this.pending) {
      pending.previousCleanup?.();
      const cleanup = pending.effect();
      this.slots[pending.index] = {
        kind: "effect",
        deps: pending.deps,
        ...(cleanup === undefined ? {} : { cleanup }),
      };
    }
    this.pending = [];
  }

  unmount(): void {
    for (const slot of this.slots) {
      if (slot.kind === "effect") slot.cleanup?.();
    }
    this.slots = [];
  }
}

function renderGltfModel(props: GltfModelProps): ElementLike {
  mocks.useMemo.mockImplementation((factory: () => unknown) => factory());
  return GltfModel(props) as unknown as ElementLike;
}

function coordinateGuard(props: GltfModelProps): (input: Record<string, unknown>) => unknown {
  const model = renderGltfModel(props);
  const suspense = model.props.children as ElementLike;
  const guard = suspense.props.children as ElementLike;
  return guard.type as (input: Record<string, unknown>) => unknown;
}

function loadedModel(props: GltfModelProps): (input: Record<string, unknown>) => unknown {
  const model = renderGltfModel(props);
  const suspense = model.props.children as ElementLike;
  const guard = suspense.props.children as ElementLike;
  const loaded = (guard.type as (input: Record<string, unknown>) => ElementLike)(guard.props);
  return loaded.type as (input: Record<string, unknown>) => unknown;
}

describe("Visual Alpha model URLs", () => {
  it("builds the six stable model URLs", () => {
    expect(createVisualAlphaModelUrls("/visual-alpha/")).toEqual({
      amr: "/visual-alpha/amr.glb",
      rack: "/visual-alpha/rack.glb",
      pallet: "/visual-alpha/pallet.glb",
      cargoBin: "/visual-alpha/cargo-bin.glb",
      chargingStation: "/visual-alpha/charging-station.glb",
      safetyCone: "/visual-alpha/safety-cone.glb",
    });
  });

  it("normalizes path separators", () => {
    expect(resolveModelUrl("/models///", "/amr.glb")).toBe("/models/amr.glb");
  });
});

describe("GltfModel coordinate contract", () => {
  it("accepts a validated manifest or an explicit source convention", () => {
    const guardWithSource = coordinateGuard(EXPLICIT_SOURCE_PROPS);
    expect(() => guardWithSource({ ...EXPLICIT_SOURCE_PROPS, onReady: vi.fn() })).not.toThrow();

    const guardWithManifest = coordinateGuard(MANIFEST_PROPS);
    expect(() => guardWithManifest({ ...MANIFEST_PROPS, onReady: vi.fn() })).not.toThrow();
  });

  it("rejects missing or invalid coordinate evidence before loading the GLTF", () => {
    const guard = coordinateGuard(EXPLICIT_SOURCE_PROPS);
    expect(() => guard({ url: URL, entityId: ENTITY_ID, onReady: vi.fn() })).toThrow(
      /requires a validated manifest or an explicit sourceConvention/u,
    );
    expect(() =>
      guard({
        url: URL,
        entityId: ENTITY_ID,
        manifest: { schemaVersion: 1 },
        onReady: vi.fn(),
      }),
    ).toThrow(/received an invalid asset manifest/u);
    expect(mocks.useLoader).not.toHaveBeenCalled();
  });
});

describe("GltfModel lifecycle and retry", () => {
  it("does not dispose a placement when only the load-state callback changes", () => {
    const harness = new HookHarness();
    const firstReady = vi.fn();
    const secondReady = vi.fn();
    const LoadedModel = loadedModel(EXPLICIT_SOURCE_PROPS);

    mocks.useLoader.mockReturnValue({ scene: GLTF_SCENE });
    mocks.cloneThreeSceneInstance.mockReturnValue(PLACEMENT);
    mocks.useMemo.mockImplementation(harness.useMemo.bind(harness));
    mocks.useEffect.mockImplementation(harness.useEffect.bind(harness));
    mocks.useRef.mockImplementation(harness.useRef.bind(harness));

    harness.beginRender();
    LoadedModel({ ...EXPLICIT_SOURCE_PROPS, onReady: firstReady });
    harness.commit();

    expect(mocks.cloneThreeSceneInstance).toHaveBeenCalledTimes(1);
    expect(firstReady).toHaveBeenCalledTimes(1);
    expect(mocks.releaseThreeSceneInstance).not.toHaveBeenCalled();

    harness.beginRender();
    LoadedModel({ ...EXPLICIT_SOURCE_PROPS, onReady: secondReady });
    harness.commit();

    expect(secondReady).not.toHaveBeenCalled();
    expect(mocks.releaseThreeSceneInstance).not.toHaveBeenCalled();

    harness.unmount();
    expect(mocks.releaseThreeSceneInstance).toHaveBeenCalledTimes(1);
    expect(mocks.releaseThreeSceneInstance).toHaveBeenCalledWith(PLACEMENT);
  });

  it("clears a failed cached request and resets the boundary when retryKey changes for the same URL", () => {
    const model = renderGltfModel({ ...EXPLICIT_SOURCE_PROPS, retryKey: 2 });
    const Boundary = model.type as new (props: Record<string, unknown>) => {
      state: { error: Error | null };
      componentDidUpdate(previous: Record<string, unknown>): void;
    };
    const boundary = new Boundary(model.props);
    boundary.state = { error: new Error("network failed") };

    boundary.componentDidUpdate({ ...model.props, retryKey: 1 });

    expect(mocks.useLoader.clear).toHaveBeenCalledTimes(1);
    expect(mocks.useLoader.clear.mock.calls[0]?.[1]).toBe(URL);
    expect(boundary.state).toEqual({ error: null });
  });
});
