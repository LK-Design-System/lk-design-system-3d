import {
  assetId,
  entityId,
  frameId,
  occupancyGridGeometry,
  quaternionFromYaw,
  rigidTransform3,
  type Axis,
  type Bounds3,
  type FrameId,
  type FramedPoint3,
  type Mat4,
  type OccupancyGridCell,
  type OccupancyGridGeometry,
  type OccupancyGridImagePixel,
  type PathEntity,
  type Quat,
  type RigidTransform3,
  type RobotEntity,
  type Vec3,
} from "@lk-robotics/design-system-3d-core";
import type { AssetManifestV1 } from "@lk-robotics/design-system-3d-assets";

/** Stable frame identifiers shared by every public Alpha.1 fixture. */
export const FIXTURE_FRAMES = Object.freeze({
  core: frameId("lk-core"),
  sourceMap: frameId("fixture-source-map"),
  render: frameId("fixture-render"),
  productMap: frameId("fixture-product-map"),
  occupancyGrid: frameId("fixture-occupancy-grid"),
  assetFile: frameId("fixture-y-up-glb-file"),
  legacyAssetFile: frameId("fixture-legacy-z-up-glb-file"),
});

export interface CoordinateFixture {
  readonly name: string;
  readonly transform: RigidTransform3;
  readonly points: readonly {
    readonly input: FramedPoint3;
    readonly expected: FramedPoint3;
  }[];
}

export interface RendererCoordinateContext {
  readonly coreFrame: FrameId;
  readonly rendererFrame: FrameId;
  readonly coreToRenderer: RigidTransform3;
  readonly shiftedOriginInCore?: FramedPoint3;
}

export interface FramedRendererTransform {
  readonly sourceFrame: FrameId;
  readonly targetFrame: FrameId;
  readonly value: Mat4;
}

export interface CoordinateAdapterContract {
  toRendererPoint(
    point: FramedPoint3,
    context: RendererCoordinateContext,
  ): readonly [number, number, number];
  fromRendererPoint(
    point: readonly [number, number, number],
    context: RendererCoordinateContext,
  ): FramedPoint3;
  toRendererTransform(
    transform: RigidTransform3,
    context: RendererCoordinateContext,
  ): FramedRendererTransform;
  fromRendererTransform(
    transform: FramedRendererTransform,
    context: RendererCoordinateContext,
  ): RigidTransform3;
}

export interface UnitCubeFixture {
  readonly id: "unit-cube";
  readonly frame: FrameId;
  readonly edgeLengthMeters: 1;
  readonly bounds: Bounds3;
  readonly vertices: readonly Vec3[];
  /** Counter-clockwise triangle indices when viewed from outside the cube. */
  readonly triangles: readonly (readonly [number, number, number])[];
}

/** A one-meter cube centered on the LK core-frame origin. */
export const UNIT_CUBE_FIXTURE: UnitCubeFixture = {
  id: "unit-cube",
  frame: FIXTURE_FRAMES.core,
  edgeLengthMeters: 1,
  bounds: {
    frame: FIXTURE_FRAMES.core,
    min: [-0.5, -0.5, -0.5],
    max: [0.5, 0.5, 0.5],
  },
  vertices: [
    [-0.5, -0.5, -0.5],
    [0.5, -0.5, -0.5],
    [0.5, 0.5, -0.5],
    [-0.5, 0.5, -0.5],
    [-0.5, -0.5, 0.5],
    [0.5, -0.5, 0.5],
    [0.5, 0.5, 0.5],
    [-0.5, 0.5, 0.5],
  ],
  triangles: [
    [0, 2, 1],
    [0, 3, 2],
    [4, 5, 6],
    [4, 6, 7],
    [0, 1, 5],
    [0, 5, 4],
    [1, 2, 6],
    [1, 6, 5],
    [2, 3, 7],
    [2, 7, 6],
    [3, 0, 4],
    [3, 4, 7],
  ],
};

export interface CoordinateAxisFixture {
  readonly axis: Axis;
  readonly label: string;
  readonly direction: Vec3;
  readonly semantic: "forward" | "lateral" | "up";
}

export interface CoordinateAxesFixture {
  readonly id: "coordinate-axes";
  readonly frame: FrameId;
  readonly origin: FramedPoint3;
  readonly handedness: "right";
  readonly metersPerUnit: 1;
  readonly axes: readonly CoordinateAxisFixture[];
}

/** LK standard: right-handed, +Z up, +X forward, meters. */
export const COORDINATE_AXES_FIXTURE: CoordinateAxesFixture = {
  id: "coordinate-axes",
  frame: FIXTURE_FRAMES.core,
  origin: { frame: FIXTURE_FRAMES.core, value: [0, 0, 0] },
  handedness: "right",
  metersPerUnit: 1,
  axes: [
    { axis: "+X", label: "+X forward", direction: [1, 0, 0], semantic: "forward" },
    { axis: "+Y", label: "+Y left", direction: [0, 1, 0], semantic: "lateral" },
    { axis: "+Z", label: "+Z up", direction: [0, 0, 1], semantic: "up" },
  ],
};

export interface ShiftedOriginFixture {
  readonly id: "shifted-origin";
  readonly sourceToCore: RigidTransform3;
  readonly sourcePoint: FramedPoint3;
  readonly expectedCorePoint: FramedPoint3;
}

/** A large product-map origin offset that remains exactly representable. */
export const SHIFTED_ORIGIN_FIXTURE: ShiftedOriginFixture = {
  id: "shifted-origin",
  sourceToCore: {
    sourceFrame: FIXTURE_FRAMES.sourceMap,
    targetFrame: FIXTURE_FRAMES.core,
    translation: [-1000, 500, -2],
    rotation: [0, 0, 0, 1],
  },
  sourcePoint: {
    frame: FIXTURE_FRAMES.sourceMap,
    value: [1012.5, -487.25, 3.5],
  },
  expectedCorePoint: {
    frame: FIXTURE_FRAMES.core,
    value: [12.5, 12.75, 1.5],
  },
};

export type OccupancyGridFixtureCellState = "unknown" | "free" | "occupied";

export interface OccupancyGridProbeFixture {
  readonly imagePixel: OccupancyGridImagePixel;
  readonly expectedCell: OccupancyGridCell;
  readonly expectedCenter: FramedPoint3;
}

export interface OccupancyGridFixture {
  readonly id: "rotated-occupancy-grid";
  readonly geometry: OccupancyGridGeometry;
  /** Semantic cell values in ROS row-major order, starting at cell (0, 0). */
  readonly cellStates: readonly OccupancyGridFixtureCellState[];
  readonly probes: readonly OccupancyGridProbeFixture[];
}

const ROTATED_OCCUPANCY_CELL_STATES = Object.freeze([
  "occupied",
  "occupied",
  "occupied",
  "occupied",
  "occupied",
  "free",
  "unknown",
  "occupied",
  "occupied",
  "free",
  "free",
  "occupied",
] as const satisfies readonly OccupancyGridFixtureCellState[]);

/**
 * A deliberately asymmetric raster with a shifted +90-degree origin. It makes
 * an accidental second Y flip or ignored yaw visible in tests and WebGL review.
 */
export const ROTATED_OCCUPANCY_GRID_FIXTURE: OccupancyGridFixture = Object.freeze({
  id: "rotated-occupancy-grid",
  geometry: occupancyGridGeometry({
    widthCells: 4,
    heightCells: 3,
    resolutionMeters: 0.5,
    gridToFrame: rigidTransform3(
      FIXTURE_FRAMES.occupancyGrid,
      FIXTURE_FRAMES.core,
      [10, 20, 0],
      quaternionFromYaw(Math.PI / 2),
    ),
  }),
  cellStates: ROTATED_OCCUPANCY_CELL_STATES,
  probes: Object.freeze([
    Object.freeze({
      imagePixel: Object.freeze({ column: 0, rowFromTop: 0 }),
      expectedCell: Object.freeze({ column: 0, row: 2 }),
      expectedCenter: Object.freeze({
        frame: FIXTURE_FRAMES.core,
        value: Object.freeze([8.75, 20.25, 0]) as Vec3,
      }),
    }),
    Object.freeze({
      imagePixel: Object.freeze({ column: 0, rowFromTop: 2 }),
      expectedCell: Object.freeze({ column: 0, row: 0 }),
      expectedCenter: Object.freeze({
        frame: FIXTURE_FRAMES.core,
        value: Object.freeze([9.75, 20.25, 0]) as Vec3,
      }),
    }),
  ]),
});

/** A renderer-neutral robot pose facing +Y in the LK core frame. */
export const ROBOT_POSE_FIXTURE: RobotEntity = {
  kind: "robot",
  id: entityId("fixture-robot"),
  pose: {
    frame: FIXTURE_FRAMES.core,
    position: [2.5, -1, 0],
    orientation: quaternionFromYaw(Math.PI / 2),
  },
  assetId: assetId("fixture-robot-glb"),
};

/** A short path with non-zero Z values to catch accidental 2D projection. */
export const PATH_FIXTURE: PathEntity = {
  kind: "path",
  id: entityId("fixture-path"),
  frame: FIXTURE_FRAMES.core,
  points: [
    [0, 0, 0],
    [1.25, 0.5, 0],
    [2.5, 1.5, 0.125],
    [4, 1, 0.25],
  ],
  widthMeters: 0.2,
};

/**
 * Maps file +Y to core +Z and file +Z to core +X. The quaternion represents a
 * +120 degree rotation around (1, 1, 1), so no axis inference is needed.
 */
export const Y_UP_TO_Z_UP_ROTATION: Quat = [0.5, 0.5, 0.5, 0.5];
export const MINIMAL_GLB_SHA256 =
  "d52ea15ab28b6a8dbc5a7623dd23c044eaa0f6460322c22030cc6b976e365637";

export const Y_UP_GLB_MANIFEST_FIXTURE: AssetManifestV1 = {
  schemaVersion: 1,
  assetId: assetId("fixture-y-up-glb"),
  version: "1.0.0",
  kind: "generic",
  format: "glb",
  fileFrame: FIXTURE_FRAMES.assetFile,
  fileCoordinate: {
    handedness: "right",
    upAxis: "+Y",
    forwardAxis: "+Z",
    metersPerUnit: 1,
  },
  coreFrame: FIXTURE_FRAMES.core,
  fileToCoreTransform: {
    sourceFrame: FIXTURE_FRAMES.assetFile,
    targetFrame: FIXTURE_FRAMES.core,
    translation: [0, 0, 0],
    rotation: Y_UP_TO_Z_UP_ROTATION,
  },
  boundsInCoreMeters: {
    frame: FIXTURE_FRAMES.core,
    min: [-0.5, -0.5, 0],
    max: [0.5, 0.5, 1],
  },
  integrity: {
    sha256: MINIMAL_GLB_SHA256,
  },
};

export const LEGACY_Z_UP_GLB_MANIFEST_FIXTURE: AssetManifestV1 = {
  schemaVersion: 1,
  assetId: assetId("fixture-legacy-z-up-glb"),
  version: "1.0.0",
  kind: "generic",
  format: "glb",
  fileFrame: FIXTURE_FRAMES.legacyAssetFile,
  fileCoordinate: {
    handedness: "right",
    upAxis: "+Z",
    forwardAxis: "+X",
    metersPerUnit: 1,
  },
  coreFrame: FIXTURE_FRAMES.core,
  fileToCoreTransform: {
    sourceFrame: FIXTURE_FRAMES.legacyAssetFile,
    targetFrame: FIXTURE_FRAMES.core,
    translation: [0, 0, 0],
    rotation: [0, 0, 0, 1],
  },
  boundsInCoreMeters: {
    frame: FIXTURE_FRAMES.core,
    min: [-1, -1, 0],
    max: [1, 1, 2],
  },
  integrity: {
    sha256: MINIMAL_GLB_SHA256,
  },
};

export interface AssetFixture {
  readonly name: string;
  readonly manifest: AssetManifestV1;
  readonly sourceUrl: URL;
  readonly sha256: string;
  readonly provenance: {
    readonly license: string;
    readonly source: string;
  };
}

const MINIMAL_GLB_DATA_URL =
  "data:model/gltf-binary;base64,Z2xURgIAAAAwAAAAHAAAAEpTT057ImFzc2V0Ijp7InZlcnNpb24iOiIyLjAifX0g";

export const assetFixtures: {
  readonly gltfYUp: AssetFixture;
  readonly legacyZUp: AssetFixture;
} = {
  gltfYUp: {
    name: "gltf-y-up",
    manifest: Y_UP_GLB_MANIFEST_FIXTURE,
    sourceUrl: new URL(MINIMAL_GLB_DATA_URL),
    sha256: MINIMAL_GLB_SHA256,
    provenance: {
      license: "CC0-1.0",
      source: "Analytically generated LK Design System 3D fixture metadata.",
    },
  },
  legacyZUp: {
    name: "legacy-z-up",
    manifest: LEGACY_Z_UP_GLB_MANIFEST_FIXTURE,
    sourceUrl: new URL(MINIMAL_GLB_DATA_URL),
    sha256: MINIMAL_GLB_SHA256,
    provenance: {
      license: "CC0-1.0",
      source: "Analytically generated LK Design System 3D fixture metadata.",
    },
  },
};

export type InvalidAssetManifestFixtureId =
  | "invalid-axis"
  | "invalid-unit"
  | "invalid-frame"
  | "invalid-bounds"
  | "invalid-checksum";

export interface InvalidAssetManifestFixture {
  readonly id: InvalidAssetManifestFixtureId;
  readonly description: string;
  readonly manifest: unknown;
  readonly expectedIssuePath: string;
  readonly expectedIssueCode: string;
}

const invalidAxisManifest = {
  ...Y_UP_GLB_MANIFEST_FIXTURE,
  fileCoordinate: {
    ...Y_UP_GLB_MANIFEST_FIXTURE.fileCoordinate,
    forwardAxis: "-Y",
  },
};

const invalidUnitManifest = {
  ...Y_UP_GLB_MANIFEST_FIXTURE,
  fileCoordinate: {
    ...Y_UP_GLB_MANIFEST_FIXTURE.fileCoordinate,
    metersPerUnit: 0,
  },
};

const invalidFrameManifest = {
  ...Y_UP_GLB_MANIFEST_FIXTURE,
  fileToCoreTransform: {
    ...Y_UP_GLB_MANIFEST_FIXTURE.fileToCoreTransform,
    sourceFrame: frameId("wrong-file-frame"),
  },
};

const invalidBoundsManifest = {
  ...Y_UP_GLB_MANIFEST_FIXTURE,
  boundsInCoreMeters: {
    ...Y_UP_GLB_MANIFEST_FIXTURE.boundsInCoreMeters,
    min: [2, -0.5, 0],
    max: [1, 0.5, 1],
  },
};

const invalidChecksumManifest = {
  ...Y_UP_GLB_MANIFEST_FIXTURE,
  integrity: {
    sha256: "not-a-sha256-digest",
  },
};

/** Deliberately invalid raw inputs; they must never be cast to AssetManifestV1. */
export const INVALID_ASSET_MANIFEST_FIXTURES: Readonly<
  Record<InvalidAssetManifestFixtureId, InvalidAssetManifestFixture>
> = {
  "invalid-axis": {
    id: "invalid-axis",
    description: "Forward is opposite to up, so the basis is degenerate.",
    manifest: invalidAxisManifest,
    expectedIssuePath: "$.fileCoordinate",
    expectedIssueCode: "coordinate.invalid_axis_pair",
  },
  "invalid-unit": {
    id: "invalid-unit",
    description: "metersPerUnit must be finite and strictly positive.",
    manifest: invalidUnitManifest,
    expectedIssuePath: "$.fileCoordinate.metersPerUnit",
    expectedIssueCode: "coordinate.invalid_unit",
  },
  "invalid-frame": {
    id: "invalid-frame",
    description: "The transform source frame does not match fileFrame.",
    manifest: invalidFrameManifest,
    expectedIssuePath: "$.fileToCoreTransform.sourceFrame",
    expectedIssueCode: "transform.source_frame_mismatch",
  },
  "invalid-bounds": {
    id: "invalid-bounds",
    description: "The X minimum is greater than the X maximum.",
    manifest: invalidBoundsManifest,
    expectedIssuePath: "$.boundsInCoreMeters",
    expectedIssueCode: "bounds.invalid_order",
  },
  "invalid-checksum": {
    id: "invalid-checksum",
    description: "The integrity value is not a 64-character hexadecimal SHA-256 digest.",
    manifest: invalidChecksumManifest,
    expectedIssuePath: "$.integrity.sha256",
    expectedIssueCode: "integrity.invalid_sha256",
  },
};

export interface AuthoritativeFloorHitFixture {
  readonly id: "authoritative-floor-hit";
  readonly viewportPoint: {
    readonly xCssPixels: number;
    readonly yCssPixels: number;
  };
  readonly legacyHit: FramedPoint3;
  readonly renderToCore: RigidTransform3;
  readonly coreToProductMap: RigidTransform3;
  readonly expectedCoreHit: FramedPoint3;
  readonly expectedProductMapHit: FramedPoint3;
}

/**
 * Starts with an authoritative legacy-renderer hit. It intentionally performs
 * no raycast; only render -> core -> product-map projection is under test.
 */
export const AUTHORITATIVE_FLOOR_HIT_FIXTURE: AuthoritativeFloorHitFixture = {
  id: "authoritative-floor-hit",
  viewportPoint: { xCssPixels: 320, yCssPixels: 180 },
  legacyHit: {
    frame: FIXTURE_FRAMES.render,
    value: [2, 3, -2],
  },
  renderToCore: {
    sourceFrame: FIXTURE_FRAMES.render,
    targetFrame: FIXTURE_FRAMES.core,
    translation: [10, -5, 2],
    rotation: quaternionFromYaw(Math.PI / 2),
  },
  coreToProductMap: {
    sourceFrame: FIXTURE_FRAMES.core,
    targetFrame: FIXTURE_FRAMES.productMap,
    translation: [100, 200, 0],
    rotation: quaternionFromYaw(-Math.PI / 2),
  },
  expectedCoreHit: {
    frame: FIXTURE_FRAMES.core,
    value: [7, -3, 0],
  },
  expectedProductMapHit: {
    frame: FIXTURE_FRAMES.productMap,
    value: [97, 193, 0],
  },
};

const coreToRendererIdentity: RigidTransform3 = {
  sourceFrame: FIXTURE_FRAMES.core,
  targetFrame: FIXTURE_FRAMES.render,
  translation: [0, 0, 0],
  rotation: [0, 0, 0, 1],
};

const robotCoreToRenderer: RigidTransform3 = {
  sourceFrame: FIXTURE_FRAMES.core,
  targetFrame: FIXTURE_FRAMES.render,
  translation: [10, 20, 1],
  rotation: quaternionFromYaw(Math.PI / 2),
};

/**
 * Canonical fixture collection from the P0 public contract. Each input point is
 * in the core frame and each expected point is in the renderer frame.
 */
export const coordinateFixtures: {
  readonly unitCube: CoordinateFixture;
  readonly shiftedOrigin: CoordinateFixture;
  readonly robotPose: CoordinateFixture;
  readonly path: CoordinateFixture;
} = {
  unitCube: {
    name: "unit-cube",
    transform: coreToRendererIdentity,
    points: UNIT_CUBE_FIXTURE.vertices.map((value) => ({
      input: { frame: FIXTURE_FRAMES.core, value },
      expected: { frame: FIXTURE_FRAMES.render, value },
    })),
  },
  shiftedOrigin: {
    name: "shifted-origin",
    transform: coreToRendererIdentity,
    points: [
      {
        input: { frame: FIXTURE_FRAMES.core, value: [1012.5, -487.25, 3.5] },
        expected: { frame: FIXTURE_FRAMES.render, value: [12.5, 12.75, 1.5] },
      },
    ],
  },
  robotPose: {
    name: "robot-pose",
    transform: robotCoreToRenderer,
    points: [
      {
        input: {
          frame: ROBOT_POSE_FIXTURE.pose.frame,
          value: ROBOT_POSE_FIXTURE.pose.position,
        },
        expected: {
          frame: FIXTURE_FRAMES.render,
          value: [11, 22.5, 1],
        },
      },
    ],
  },
  path: {
    name: "path",
    transform: coreToRendererIdentity,
    points: PATH_FIXTURE.points.map((value) => ({
      input: { frame: PATH_FIXTURE.frame, value },
      expected: { frame: FIXTURE_FRAMES.render, value },
    })),
  },
};

export const SHIFTED_ORIGIN_IN_CORE: FramedPoint3 = {
  frame: FIXTURE_FRAMES.core,
  value: [1000, -500, 2],
};

/** Exact payload covered by each provenance digest. */
export const FOUNDATION_FIXTURE_CONTENT: Readonly<Record<string, unknown>> = {
  [UNIT_CUBE_FIXTURE.id]: UNIT_CUBE_FIXTURE,
  [COORDINATE_AXES_FIXTURE.id]: COORDINATE_AXES_FIXTURE,
  [SHIFTED_ORIGIN_FIXTURE.id]: SHIFTED_ORIGIN_FIXTURE,
  [ROTATED_OCCUPANCY_GRID_FIXTURE.id]: ROTATED_OCCUPANCY_GRID_FIXTURE,
  "robot-pose": ROBOT_POSE_FIXTURE,
  path: PATH_FIXTURE,
  "y-up-glb-manifest": Y_UP_GLB_MANIFEST_FIXTURE,
  "legacy-z-up-glb-manifest": LEGACY_Z_UP_GLB_MANIFEST_FIXTURE,
  [AUTHORITATIVE_FLOOR_HIT_FIXTURE.id]: AUTHORITATIVE_FLOOR_HIT_FIXTURE,
  ...Object.fromEntries(
    Object.values(INVALID_ASSET_MANIFEST_FIXTURES).map((fixture) => [fixture.id, fixture.manifest]),
  ),
};

export const ALL_FOUNDATION_FIXTURE_IDS: readonly string[] = Object.freeze(
  Object.keys(FOUNDATION_FIXTURE_CONTENT),
);
