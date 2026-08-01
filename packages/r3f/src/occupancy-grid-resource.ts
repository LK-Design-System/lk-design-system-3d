import {
  OCCUPANCY_GRID_CELL_FREE,
  OCCUPANCY_GRID_CELL_OCCUPIED,
  OCCUPANCY_GRID_CELL_UNKNOWN,
  assertValidFrameId,
  assertValidOccupancyGridSnapshot,
  occupancyCellDataIndex,
  type FrameId,
  type OccupancyGridCell,
  type OccupancyGridSnapshot,
} from "@lk-design-system/lds-3d-core";
import {
  BufferGeometry,
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  DoubleSide,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  NearestFilter,
  NoColorSpace,
  RedFormat,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
} from "three";

export interface OccupancyGridPalette {
  readonly unknown: string;
  readonly free: string;
  readonly occupied: string;
  readonly gridLine: string;
}

export type OccupancyGridRenderState =
  | {
      readonly kind: "ready";
      readonly requestedCellCount: number;
      readonly acceptedCellCount: number;
    }
  | {
      readonly kind: "frame-mismatch";
      readonly expectedFrame: FrameId;
      readonly actualFrame: FrameId;
      readonly requestedCellCount: number;
      readonly acceptedCellCount: 0;
    }
  | {
      readonly kind: "budget-exceeded";
      readonly maxCells: number;
      readonly requestedCellCount: number;
      readonly acceptedCellCount: 0;
    }
  | {
      readonly kind: "texture-dimension-exceeded";
      readonly maxTextureDimension: number;
      readonly requestedWidth: number;
      readonly requestedHeight: number;
      readonly requestedCellCount: number;
      readonly acceptedCellCount: 0;
    };

export interface OccupancyGridRenderResourceOptions {
  readonly palette: OccupancyGridPalette;
  readonly opacity?: number;
  /** Local grid +Z offset used to avoid caller-owned coplanar surfaces. */
  readonly elevationOffsetMeters?: number;
}

export interface OccupancyGridRenderResource {
  readonly geometry: BufferGeometry;
  readonly texture: DataTexture;
  readonly material: ShaderMaterial;
  readonly mesh: Mesh<BufferGeometry, ShaderMaterial>;
  dispose(): void;
}

export interface OccupancyGridSelectionResourceOptions {
  readonly color: string;
  /** Local grid +Z offset shared with the raster surface. */
  readonly elevationOffsetMeters?: number;
}

export interface OccupancyGridSelectionResource {
  readonly geometry: BufferGeometry;
  readonly material: LineBasicMaterial;
  readonly outline: LineLoop<BufferGeometry, LineBasicMaterial>;
  dispose(): void;
}

function assertPositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive safe integer.`);
  }
}

function assertMaterialOptions(opacity: number, elevationOffsetMeters: number): void {
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
    throw new RangeError("OccupancyGridSurface opacity must be a finite number in [0, 1].");
  }
  if (!Number.isFinite(elevationOffsetMeters)) {
    throw new RangeError("OccupancyGridSurface elevationOffsetMeters must be finite.");
  }
}

/** Resolves frame, cell, and hardware texture budgets without implicit sampling. */
export function resolveOccupancyGridRenderState(
  snapshot: OccupancyGridSnapshot,
  sceneFrame: FrameId,
  maxCells: number,
  maxTextureDimension: number,
): OccupancyGridRenderState {
  assertValidOccupancyGridSnapshot(snapshot);
  assertValidFrameId(sceneFrame);
  assertPositiveSafeInteger(maxCells, "OccupancyGridSurface maxCells");
  assertPositiveSafeInteger(maxTextureDimension, "OccupancyGridSurface maxTextureDimension");

  const actualFrame = snapshot.geometry.gridToFrame.targetFrame;
  if (actualFrame !== sceneFrame) {
    return Object.freeze({
      kind: "frame-mismatch",
      expectedFrame: sceneFrame,
      actualFrame,
      requestedCellCount: snapshot.cellCount,
      acceptedCellCount: 0,
    });
  }
  if (snapshot.cellCount > maxCells) {
    return Object.freeze({
      kind: "budget-exceeded",
      maxCells,
      requestedCellCount: snapshot.cellCount,
      acceptedCellCount: 0,
    });
  }
  if (
    snapshot.geometry.widthCells > maxTextureDimension ||
    snapshot.geometry.heightCells > maxTextureDimension
  ) {
    return Object.freeze({
      kind: "texture-dimension-exceeded",
      maxTextureDimension,
      requestedWidth: snapshot.geometry.widthCells,
      requestedHeight: snapshot.geometry.heightCells,
      requestedCellCount: snapshot.cellCount,
      acceptedCellCount: 0,
    });
  }
  return Object.freeze({
    kind: "ready",
    requestedCellCount: snapshot.cellCount,
    acceptedCellCount: snapshot.cellCount,
  });
}

function encodedStateTexture(snapshot: OccupancyGridSnapshot): DataTexture {
  const encodedStates = new Uint8Array(snapshot.cellCount);
  for (let index = 0; index < snapshot.cellCount; index += 1) {
    const state = snapshot.cellStates[index];
    encodedStates[index] =
      state === OCCUPANCY_GRID_CELL_UNKNOWN
        ? 0
        : state === OCCUPANCY_GRID_CELL_FREE
          ? 127
          : state === OCCUPANCY_GRID_CELL_OCCUPIED
            ? 255
            : 0;
  }
  const texture = new DataTexture(
    encodedStates,
    snapshot.geometry.widthCells,
    snapshot.geometry.heightCells,
    RedFormat,
    UnsignedByteType,
  );
  texture.name = `lkds3d:occupancy-grid:${String(snapshot.revision)}`;
  // Occupancy states are categorical data, not encoded display colors.
  texture.colorSpace = NoColorSpace;
  texture.flipY = false;
  texture.generateMipmaps = false;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

function occupancyQuadGeometry(
  snapshot: OccupancyGridSnapshot,
  elevationOffsetMeters: number,
): BufferGeometry {
  const widthMeters = snapshot.geometry.widthCells * snapshot.geometry.resolutionMeters;
  const heightMeters = snapshot.geometry.heightCells * snapshot.geometry.resolutionMeters;
  const geometry = new BufferGeometry();
  geometry.name = `lkds3d:occupancy-grid:${String(snapshot.revision)}`;
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(
      [
        0,
        0,
        elevationOffsetMeters,
        widthMeters,
        0,
        elevationOffsetMeters,
        0,
        heightMeters,
        elevationOffsetMeters,
        widthMeters,
        heightMeters,
        elevationOffsetMeters,
      ],
      3,
    ),
  );
  // Texture row zero and UV v=0 both represent occupancy-grid row zero (+Y minimum).
  geometry.setAttribute("uv", new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
  geometry.setIndex([0, 1, 2, 2, 1, 3]);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

const OCCUPANCY_VERTEX_SHADER = /* glsl */ `
  varying vec2 vGridUv;

  void main() {
    vGridUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const OCCUPANCY_FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D stateMap;
  uniform vec2 gridSize;
  uniform vec3 unknownColor;
  uniform vec3 freeColor;
  uniform vec3 occupiedColor;
  uniform vec3 gridLineColor;
  uniform float surfaceOpacity;
  varying vec2 vGridUv;

  void main() {
    float state = texture2D(stateMap, vGridUv).r;
    vec2 cellUv = fract(vGridUv * gridSize);
    float checker = mod(floor(cellUv.x * 4.0) + floor(cellUv.y * 4.0), 2.0);
    float diagonal = step(0.52, fract((cellUv.x + cellUv.y) * 4.0));

    vec3 color;
    if (state > 0.75) {
      color = mix(occupiedColor, freeColor, diagonal * 0.16);
    } else if (state > 0.25) {
      color = freeColor;
    } else {
      color = mix(unknownColor, gridLineColor, checker * 0.36);
    }

    float edgeDistance = min(min(cellUv.x, 1.0 - cellUv.x), min(cellUv.y, 1.0 - cellUv.y));
    float edge = 1.0 - smoothstep(0.015, 0.055, edgeDistance);
    color = mix(color, gridLineColor, edge * 0.62);
    gl_FragColor = vec4(color, surfaceOpacity);
  }
`;

/**
 * Creates one patterned WebGL quad and one nearest-filter state texture. It
 * never mutates the caller-retained snapshot buffer and owns only its derived
 * GPU resources.
 */
export function createOccupancyGridRenderResource(
  snapshot: OccupancyGridSnapshot,
  options: OccupancyGridRenderResourceOptions,
): OccupancyGridRenderResource {
  assertValidOccupancyGridSnapshot(snapshot);
  const opacity = options.opacity ?? 1;
  const elevationOffsetMeters = options.elevationOffsetMeters ?? 0;
  assertMaterialOptions(opacity, elevationOffsetMeters);

  const geometry = occupancyQuadGeometry(snapshot, elevationOffsetMeters);
  const texture = encodedStateTexture(snapshot);
  const material = new ShaderMaterial({
    name: `lkds3d:occupancy-grid:${String(snapshot.revision)}`,
    uniforms: {
      stateMap: { value: texture },
      gridSize: {
        value: new Vector2(snapshot.geometry.widthCells, snapshot.geometry.heightCells),
      },
      unknownColor: { value: new Color(options.palette.unknown) },
      freeColor: { value: new Color(options.palette.free) },
      occupiedColor: { value: new Color(options.palette.occupied) },
      gridLineColor: { value: new Color(options.palette.gridLine) },
      surfaceOpacity: { value: opacity },
    },
    vertexShader: OCCUPANCY_VERTEX_SHADER,
    fragmentShader: OCCUPANCY_FRAGMENT_SHADER,
    side: DoubleSide,
    depthWrite: opacity >= 1,
    transparent: opacity < 1,
    toneMapped: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = `lkds3d:occupancy-grid:${String(snapshot.revision)}`;
  mesh.position.fromArray(snapshot.geometry.gridToFrame.translation);
  mesh.quaternion.fromArray(snapshot.geometry.gridToFrame.rotation);
  mesh.updateMatrix();

  let disposed = false;
  return Object.freeze({
    geometry,
    texture,
    material,
    mesh,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      geometry.dispose();
      texture.dispose();
      material.dispose();
    },
  });
}

/**
 * Creates one caller-controlled cell outline. The geometry is a real WebGL
 * line loop, so persistent selection does not rely on a color change alone.
 */
export function createOccupancyGridSelectionResource(
  snapshot: OccupancyGridSnapshot,
  cell: OccupancyGridCell,
  options: OccupancyGridSelectionResourceOptions,
): OccupancyGridSelectionResource {
  assertValidOccupancyGridSnapshot(snapshot);
  // Reuse the core cell contract for bounds and integer validation.
  occupancyCellDataIndex(snapshot.geometry, cell);
  const elevationOffsetMeters = options.elevationOffsetMeters ?? 0;
  if (!Number.isFinite(elevationOffsetMeters)) {
    throw new RangeError("OccupancyGridSurface elevationOffsetMeters must be finite.");
  }

  const resolution = snapshot.geometry.resolutionMeters;
  const minimumX = cell.column * resolution;
  const minimumY = cell.row * resolution;
  const maximumX = minimumX + resolution;
  const maximumY = minimumY + resolution;
  const selectionLiftMeters = Math.max(1e-5, resolution * 1e-4);
  const elevation = elevationOffsetMeters + selectionLiftMeters;
  const geometry = new BufferGeometry();
  geometry.name = `lkds3d:occupancy-grid-selection:${cell.column.toString()}:${cell.row.toString()}`;
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(
      [
        minimumX,
        minimumY,
        elevation,
        maximumX,
        minimumY,
        elevation,
        maximumX,
        maximumY,
        elevation,
        minimumX,
        maximumY,
        elevation,
      ],
      3,
    ),
  );
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const material = new LineBasicMaterial({
    color: options.color,
    depthWrite: false,
    toneMapped: false,
  });
  material.name = geometry.name;
  const outline = new LineLoop(geometry, material);
  outline.name = geometry.name;
  outline.position.fromArray(snapshot.geometry.gridToFrame.translation);
  outline.quaternion.fromArray(snapshot.geometry.gridToFrame.rotation);
  outline.renderOrder = 2;
  outline.updateMatrix();

  let disposed = false;
  return Object.freeze({
    geometry,
    material,
    outline,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      geometry.dispose();
      material.dispose();
    },
  });
}
