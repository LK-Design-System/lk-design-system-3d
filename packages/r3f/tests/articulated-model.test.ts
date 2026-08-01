import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EntityId } from "@lk-design-system/lds-3d-core";

const mocks = vi.hoisted(() => {
  const useLoader = Object.assign(vi.fn(), {
    clear: vi.fn(),
    preload: vi.fn(),
  });
  return {
    cloneThreeSceneInstance: vi.fn(),
    invalidate: vi.fn(),
    releaseThreeSceneInstance: vi.fn(),
    useLoader,
  };
});

const effects: (() => unknown)[] = [];

vi.mock("react", () => ({
  Component: class MockComponent {
    props: unknown;

    constructor(props: unknown) {
      this.props = props;
    }
  },
  Suspense: Symbol.for("react.suspense"),
  useEffect: (effect: () => unknown) => {
    effects.push(effect);
  },
  useMemo: <Value>(factory: () => Value) => factory(),
  useRef: <Value>(initialValue: Value) => ({ current: initialValue }),
}));

vi.mock("@react-three/fiber", () => ({
  useLoader: mocks.useLoader,
  useThree: (selector: (state: unknown) => unknown) =>
    selector({ frameloop: "demand", invalidate: mocks.invalidate }),
}));
vi.mock("@lk-design-system/lds-3d-three/r3f-bridge", () => ({
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

import { parseRobotKinematics } from "@lk-design-system/lds-3d-assets";

import { ArticulatedGltfModel, type ArticulatedGltfModelProps } from "../src/models.js";

const ENTITY_ID = "robot/so-arm-01" as EntityId;
const URL = "/models/so-arm.glb";

const KINEMATICS_INPUT = {
  schemaVersion: 1,
  assetId: "fixture/so-arm-mini",
  version: "1.0.0",
  baseLink: "base",
  links: [
    { linkId: "base", nodeName: "Base" },
    { linkId: "shoulder", nodeName: "Shoulder" },
    { linkId: "slider", nodeName: "Slider" },
  ],
  joints: [
    {
      jointId: "yaw",
      type: "revolute",
      parentLink: "base",
      childLink: "shoulder",
      origin: { translation: [0, 0, 0.1], rotation: [0, 0, 0, 1] },
      axis: [0, 0, 1],
      limits: { lower: -Math.PI, upper: Math.PI },
    },
    {
      jointId: "slide",
      type: "prismatic",
      parentLink: "shoulder",
      childLink: "slider",
      origin: { translation: [0.2, 0, 0], rotation: [0, 0, 0, 1] },
      axis: [1, 0, 0],
      limits: { lower: 0, upper: 0.05 },
    },
  ],
};

function parseKinematics() {
  const result = parseRobotKinematics(KINEMATICS_INPUT);
  if (!result.ok) throw new Error("Fixture must parse.");
  return result.value;
}

interface FakeNode {
  readonly name: string;
  readonly children: FakeNode[];
  readonly position: { set: ReturnType<typeof vi.fn> };
  readonly quaternion: { set: ReturnType<typeof vi.fn> };
}

function fakeNode(name: string, children: FakeNode[] = []): FakeNode {
  return {
    name,
    children,
    position: { set: vi.fn() },
    quaternion: { set: vi.fn() },
  };
}

interface ElementLike {
  readonly type: unknown;
  readonly props: Record<string, unknown>;
}

function renderToGroup(props: ArticulatedGltfModelProps): ElementLike {
  const boundary = ArticulatedGltfModel(props) as unknown as ElementLike;
  const suspense = boundary.props.children as ElementLike;
  const guard = suspense.props.children as ElementLike;
  const loaded = (guard.type as (input: Record<string, unknown>) => ElementLike)({
    ...guard.props,
    onReady: vi.fn(),
  });
  const selectable = (loaded.type as (input: Record<string, unknown>) => ElementLike)(loaded.props);
  const renderChildren = selectable.props.children as (state: {
    hovered: boolean;
    selected: boolean;
  }) => ElementLike;
  return renderChildren({ hovered: false, selected: false });
}

function articulationDriver(group: ElementLike): ElementLike {
  const children = group.props.children as readonly unknown[];
  const driver = children[1] as ElementLike;
  expect(driver).not.toBeNull();
  return driver;
}

function commitEffects(): void {
  for (const effect of effects.splice(0)) effect();
}

beforeEach(() => {
  effects.length = 0;
  mocks.invalidate.mockClear();
  mocks.useLoader.mockReset();
  mocks.cloneThreeSceneInstance.mockReset();
});

describe("ArticulatedGltfModel contract", () => {
  it("rejects invalid kinematics before loading the GLTF", () => {
    const boundary = ArticulatedGltfModel({
      url: URL,
      entityId: ENTITY_ID,
      sourceConvention: "core",
      kinematics: { schemaVersion: 1 } as never,
    }) as unknown as ElementLike;
    const suspense = boundary.props.children as ElementLike;
    const guard = suspense.props.children as ElementLike;
    expect(() =>
      (guard.type as (input: Record<string, unknown>) => unknown)({
        ...guard.props,
        onReady: vi.fn(),
      }),
    ).toThrow(/invalid robot kinematics/u);
    expect(mocks.useLoader).not.toHaveBeenCalled();
  });

  it("reports missing link nodes as a contract error", () => {
    const root = fakeNode("", [fakeNode("Base", [fakeNode("Shoulder")])]);
    mocks.useLoader.mockReturnValue({ scene: {} });
    mocks.cloneThreeSceneInstance.mockReturnValue(root);

    const group = renderToGroup({
      url: URL,
      entityId: ENTITY_ID,
      sourceConvention: "core",
      kinematics: parseKinematics(),
    });
    const driver = articulationDriver(group);
    expect(() =>
      (driver.type as (input: Record<string, unknown>) => unknown)(driver.props),
    ).toThrow(/missing glTF nodes for declared links: Slider/u);
  });
});

describe("ArticulatedGltfModel posing", () => {
  it("poses link nodes from joint values and schedules a demand frame", () => {
    const slider = fakeNode("Slider");
    const shoulder = fakeNode("Shoulder", [slider]);
    const root = fakeNode("", [fakeNode("Base", [shoulder])]);
    mocks.useLoader.mockReturnValue({ scene: {} });
    mocks.cloneThreeSceneInstance.mockReturnValue(root);

    const group = renderToGroup({
      url: URL,
      entityId: ENTITY_ID,
      sourceConvention: "core",
      kinematics: parseKinematics(),
      jointValues: { yaw: Math.PI / 2, slide: 0.03 },
    });
    const driver = articulationDriver(group);
    (driver.type as (input: Record<string, unknown>) => unknown)(driver.props);
    commitEffects();

    expect(shoulder.position.set).toHaveBeenCalledWith(0, 0, 0.1);
    const [x, y, z, w] = shoulder.quaternion.set.mock.calls[0] as [number, number, number, number];
    expect(x).toBeCloseTo(0, 12);
    expect(y).toBeCloseTo(0, 12);
    expect(z).toBeCloseTo(Math.SQRT1_2, 12);
    expect(w).toBeCloseTo(Math.SQRT1_2, 12);
    const [sliderX, sliderY, sliderZ] = slider.position.set.mock.calls[0] as [
      number,
      number,
      number,
    ];
    expect(sliderX).toBeCloseTo(0.23, 12);
    expect(sliderY).toBeCloseTo(0, 12);
    expect(sliderZ).toBeCloseTo(0, 12);
    expect(slider.quaternion.set).toHaveBeenCalledWith(0, 0, 0, 1);
    expect(mocks.invalidate).toHaveBeenCalledTimes(1);
  });

  it("holds rest poses when no joint values are supplied", () => {
    const slider = fakeNode("Slider");
    const shoulder = fakeNode("Shoulder", [slider]);
    const root = fakeNode("", [fakeNode("Base", [shoulder])]);
    mocks.useLoader.mockReturnValue({ scene: {} });
    mocks.cloneThreeSceneInstance.mockReturnValue(root);

    const group = renderToGroup({
      url: URL,
      entityId: ENTITY_ID,
      sourceConvention: "core",
      kinematics: parseKinematics(),
    });
    const driver = articulationDriver(group);
    (driver.type as (input: Record<string, unknown>) => unknown)(driver.props);
    commitEffects();

    expect(shoulder.position.set).toHaveBeenCalledWith(0, 0, 0.1);
    expect(shoulder.quaternion.set).toHaveBeenCalledWith(0, 0, 0, 1);
    expect(slider.position.set).toHaveBeenCalledWith(0.2, 0, 0);
  });
});
