import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { stdout } from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = dirname(SCRIPT_DIR);
const OUTPUT_DIR = join(ROOT_DIR, "packages", "assets", "visual-alpha");
const MANIFEST_DIR = join(OUTPUT_DIR, "manifests");
const CORE_FRAME = "lk-world";
const VERSION = "0.1.0";
const TAU = Math.PI * 2;

const MATERIALS = Object.freeze([
  material("graphite", [0.075, 0.09, 0.105, 1], 0.72, 0.18),
  material("rubber", [0.018, 0.022, 0.026, 1], 0.92, 0.02),
  material("neutral-shell", [0.36, 0.4, 0.43, 1], 0.48, 0.22),
  material("lk-blue", [0.025, 0.25, 0.58, 1], 0.38, 0.28),
  material("cyan-indicator", [0.02, 0.65, 0.82, 1], 0.28, 0.1, [0.01, 0.38, 0.48]),
  material("safety-orange", [0.94, 0.24, 0.035, 1], 0.56, 0.06),
  material("signal-white", [0.88, 0.9, 0.88, 1], 0.5, 0.04),
  material("galvanized-steel", [0.39, 0.43, 0.46, 1], 0.34, 0.7),
  material("rack-blue", [0.055, 0.2, 0.4, 1], 0.46, 0.38),
  material("pallet-wood", [0.44, 0.27, 0.12, 1], 0.82, 0.01),
  material("cargo-neutral", [0.29, 0.34, 0.36, 1], 0.58, 0.06),
  material("caution-yellow", [0.96, 0.68, 0.04, 1], 0.5, 0.04),
  material("status-green", [0.05, 0.69, 0.31, 1], 0.3, 0.08, [0.02, 0.32, 0.11]),
  material("sensor-glass", [0.035, 0.09, 0.105, 1], 0.2, 0.34),
]);

const MATERIAL_INDEX = new Map(MATERIALS.map((entry, index) => [entry.name, index]));

const SHAPES = new Map([
  ["box", createBox()],
  ["cylinder", createFrustum(1, 24)],
  ["cone-18", createFrustum(0.18, 32)],
  ["cone-72", createFrustum(0.72, 32)],
  ["cone-82", createFrustum(0.82, 32)],
  ["sphere", createSphere(20, 12)],
]);

const ASSETS = Object.freeze([
  {
    slug: "amr",
    label: "Autonomous Mobile Robot",
    kind: "robot",
    description:
      "Compact differential-drive AMR with lidar, safety bumpers, status lighting, and visible wheel geometry.",
    parts: [
      part("lower-chassis", "box", "graphite", [0, 0, 0.24], [1.08, 0.72, 0.24]),
      part("upper-shell", "box", "neutral-shell", [-0.02, 0, 0.43], [0.88, 0.6, 0.18]),
      part("top-panel", "box", "lk-blue", [-0.08, 0, 0.545], [0.55, 0.38, 0.055]),
      part("front-bumper", "box", "rubber", [0.56, 0, 0.23], [0.08, 0.63, 0.18]),
      part("rear-bumper", "box", "rubber", [-0.56, 0, 0.23], [0.08, 0.63, 0.18]),
      part("front-light", "box", "cyan-indicator", [0.607, 0, 0.37], [0.012, 0.31, 0.055]),
      part("lidar-base", "cylinder", "graphite", [0.13, 0, 0.585], [0.18, 0.18, 0.065]),
      part("lidar-glass", "cylinder", "sensor-glass", [0.13, 0, 0.64], [0.15, 0.15, 0.055]),
      part("lidar-cap", "cylinder", "neutral-shell", [0.13, 0, 0.677], [0.16, 0.16, 0.02]),
      ...[-0.3, 0.3].flatMap((x) =>
        [-0.37, 0.37].map((y) =>
          part(
            `wheel-${x > 0 ? "front" : "rear"}-${y > 0 ? "left" : "right"}`,
            "cylinder",
            "rubber",
            [x, y, 0.16],
            [0.32, 0.32, 0.09],
            quaternionX(Math.PI / 2),
          ),
        ),
      ),
      part("front-caster", "sphere", "rubber", [0.43, 0, 0.075], [0.15, 0.15, 0.15]),
      part("rear-caster", "sphere", "rubber", [-0.43, 0, 0.075], [0.15, 0.15, 0.15]),
      part("forward-marker", "box", "signal-white", [0.455, 0, 0.568], [0.18, 0.05, 0.018]),
      part(
        "forward-chevron-left",
        "box",
        "signal-white",
        [0.425, 0.055, 0.568],
        [0.12, 0.035, 0.018],
        quaternionZ(-0.55),
      ),
      part(
        "forward-chevron-right",
        "box",
        "signal-white",
        [0.425, -0.055, 0.568],
        [0.12, 0.035, 0.018],
        quaternionZ(0.55),
      ),
    ],
  },
  {
    slug: "rack",
    label: "Industrial Storage Rack",
    kind: "building",
    description:
      "Three-level warehouse bay with uprights, beams, shelf decks, foot plates, and rear cross bracing.",
    parts: [
      ...[-0.42, 0.42].flatMap((x) =>
        [-1.12, 1.12].flatMap((y) => [
          part(`upright-${x}-${y}`, "box", "rack-blue", [x, y, 1.2], [0.09, 0.09, 2.4]),
          part(`foot-${x}-${y}`, "box", "galvanized-steel", [x, y, 0.025], [0.2, 0.2, 0.05]),
        ]),
      ),
      ...[0.25, 0.98, 1.71, 2.35].flatMap((z, level) => [
        part(`beam-front-${level}`, "box", "rack-blue", [0.43, 0, z], [0.1, 2.3, 0.12]),
        part(`beam-rear-${level}`, "box", "rack-blue", [-0.43, 0, z], [0.1, 2.3, 0.12]),
        part(`deck-${level}`, "box", "galvanized-steel", [0, 0, z + 0.06], [0.78, 2.18, 0.055]),
      ]),
      part(
        "rear-brace-a",
        "box",
        "galvanized-steel",
        [-0.49, 0, 1.25],
        [0.045, 0.06, 2.85],
        quaternionX(-0.74),
      ),
      part(
        "rear-brace-b",
        "box",
        "galvanized-steel",
        [-0.5, 0, 1.25],
        [0.045, 0.06, 2.85],
        quaternionX(0.74),
      ),
    ],
  },
  {
    slug: "pallet",
    label: "Euro-style Pallet",
    kind: "generic",
    description: "Reusable timber pallet with separated top boards, stringers, and support blocks.",
    parts: [
      ...[-0.34, -0.17, 0, 0.17, 0.34].map((y, index) =>
        part(`top-board-${index}`, "box", "pallet-wood", [0, y, 0.18], [1.2, 0.13, 0.08]),
      ),
      ...[-0.35, 0, 0.35].map((y, index) =>
        part(`stringer-${index}`, "box", "pallet-wood", [0, y, 0.105], [1.12, 0.095, 0.07]),
      ),
      ...[-0.5, 0, 0.5].flatMap((x, column) =>
        [-0.35, 0, 0.35].map((y, row) =>
          part(`support-${column}-${row}`, "box", "pallet-wood", [x, y, 0.05], [0.15, 0.14, 0.1]),
        ),
      ),
      ...[-0.35, 0, 0.35].map((y, index) =>
        part(`bottom-board-${index}`, "box", "pallet-wood", [0, y, 0.018], [1.16, 0.12, 0.036]),
      ),
    ],
  },
  {
    slug: "cargo-bin",
    label: "Stackable Cargo Bin",
    kind: "generic",
    description:
      "Open-top logistics tote with a reinforced rim, recessed side panels, feet, and visible cargo blocks.",
    parts: [
      part("floor", "box", "cargo-neutral", [0, 0, 0.08], [0.82, 0.58, 0.12]),
      part("front-wall", "box", "cargo-neutral", [0.39, 0, 0.35], [0.08, 0.62, 0.56]),
      part("rear-wall", "box", "cargo-neutral", [-0.39, 0, 0.35], [0.08, 0.62, 0.56]),
      part("left-wall", "box", "cargo-neutral", [0, 0.29, 0.35], [0.72, 0.08, 0.56]),
      part("right-wall", "box", "cargo-neutral", [0, -0.29, 0.35], [0.72, 0.08, 0.56]),
      part("front-rim", "box", "lk-blue", [0.42, 0, 0.65], [0.1, 0.69, 0.1]),
      part("rear-rim", "box", "lk-blue", [-0.42, 0, 0.65], [0.1, 0.69, 0.1]),
      part("left-rim", "box", "lk-blue", [0, 0.32, 0.65], [0.78, 0.1, 0.1]),
      part("right-rim", "box", "lk-blue", [0, -0.32, 0.65], [0.78, 0.1, 0.1]),
      ...[-0.31, 0.31].flatMap((x) =>
        [-0.22, 0.22].map((y) =>
          part(`foot-${x}-${y}`, "box", "graphite", [x, y, 0.025], [0.12, 0.12, 0.05]),
        ),
      ),
      part("cargo-a", "box", "caution-yellow", [-0.14, 0.1, 0.29], [0.32, 0.24, 0.34]),
      part("cargo-b", "box", "neutral-shell", [0.18, -0.09, 0.26], [0.27, 0.3, 0.28]),
    ],
  },
  {
    slug: "charging-station",
    label: "AMR Charging Station",
    kind: "generic",
    description:
      "Floor-mounted charging dock with tapered guide rails, contact pads, a service column, and status beacon.",
    parts: [
      part("floor-base", "box", "graphite", [0, 0, 0.04], [0.62, 0.82, 0.08]),
      part("column", "box", "neutral-shell", [-0.22, 0, 0.62], [0.28, 0.58, 1.16]),
      part("column-face", "box", "graphite", [-0.065, 0, 0.67], [0.035, 0.42, 0.72]),
      part("contact-left", "box", "galvanized-steel", [-0.043, 0.14, 0.51], [0.025, 0.13, 0.2]),
      part("contact-right", "box", "galvanized-steel", [-0.043, -0.14, 0.51], [0.025, 0.13, 0.2]),
      part(
        "guide-left",
        "box",
        "caution-yellow",
        [0.2, 0.28, 0.09],
        [0.62, 0.09, 0.12],
        quaternionZ(-0.18),
      ),
      part(
        "guide-right",
        "box",
        "caution-yellow",
        [0.2, -0.28, 0.09],
        [0.62, 0.09, 0.12],
        quaternionZ(0.18),
      ),
      part("beacon-base", "cylinder", "graphite", [-0.22, 0, 1.23], [0.15, 0.15, 0.08]),
      part("beacon", "cylinder", "status-green", [-0.22, 0, 1.31], [0.11, 0.11, 0.1]),
      part("service-panel", "box", "lk-blue", [-0.066, 0, 0.96], [0.032, 0.27, 0.19]),
    ],
  },
  {
    slug: "safety-cone",
    label: "Warehouse Safety Cone",
    kind: "generic",
    description:
      "High-visibility floor cone with weighted base, tapered body, and two contrasting reflective bands.",
    parts: [
      part("weighted-base", "box", "graphite", [0, 0, 0.035], [0.5, 0.5, 0.07]),
      part("base-color", "box", "safety-orange", [0, 0, 0.075], [0.43, 0.43, 0.05]),
      part("cone-body", "cone-18", "safety-orange", [0, 0, 0.42], [0.38, 0.38, 0.66]),
      part("reflective-lower", "cone-82", "signal-white", [0, 0, 0.36], [0.285, 0.285, 0.13]),
      part("reflective-upper", "cone-72", "signal-white", [0, 0, 0.53], [0.2, 0.2, 0.1]),
      part("top-cap", "cylinder", "safety-orange", [0, 0, 0.765], [0.07, 0.07, 0.04]),
    ],
  },
]);

function material(name, baseColorFactor, roughnessFactor, metallicFactor, emissiveFactor) {
  const entry = {
    name,
    pbrMetallicRoughness: { baseColorFactor, roughnessFactor, metallicFactor },
  };
  if (emissiveFactor) entry.emissiveFactor = emissiveFactor;
  return Object.freeze(entry);
}

function part(name, shape, materialName, translation, scale, rotation = [0, 0, 0, 1]) {
  return Object.freeze({ name, shape, materialName, translation, scale, rotation });
}

function quaternionX(angle) {
  return [Math.sin(angle / 2), 0, 0, Math.cos(angle / 2)];
}

function quaternionZ(angle) {
  return [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)];
}

function createBox() {
  const faces = [
    [
      [0.5, -0.5, -0.5],
      [0.5, 0.5, -0.5],
      [0.5, 0.5, 0.5],
      [0.5, -0.5, 0.5],
      [1, 0, 0],
    ],
    [
      [-0.5, 0.5, -0.5],
      [-0.5, -0.5, -0.5],
      [-0.5, -0.5, 0.5],
      [-0.5, 0.5, 0.5],
      [-1, 0, 0],
    ],
    [
      [0.5, 0.5, -0.5],
      [-0.5, 0.5, -0.5],
      [-0.5, 0.5, 0.5],
      [0.5, 0.5, 0.5],
      [0, 1, 0],
    ],
    [
      [-0.5, -0.5, -0.5],
      [0.5, -0.5, -0.5],
      [0.5, -0.5, 0.5],
      [-0.5, -0.5, 0.5],
      [0, -1, 0],
    ],
    [
      [-0.5, -0.5, 0.5],
      [0.5, -0.5, 0.5],
      [0.5, 0.5, 0.5],
      [-0.5, 0.5, 0.5],
      [0, 0, 1],
    ],
    [
      [-0.5, 0.5, -0.5],
      [0.5, 0.5, -0.5],
      [0.5, -0.5, -0.5],
      [-0.5, -0.5, -0.5],
      [0, 0, -1],
    ],
  ];
  const positions = [];
  const normals = [];
  const indices = [];
  for (const face of faces) {
    const base = positions.length / 3;
    for (const vertex of face.slice(0, 4)) positions.push(...vertex);
    for (let index = 0; index < 4; index += 1) normals.push(...face[4]);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { positions, normals, indices };
}

function createFrustum(topRadiusRatio, segments) {
  const bottomRadius = 0.5;
  const topRadius = bottomRadius * topRadiusRatio;
  const positions = [];
  const normals = [];
  const indices = [];
  const slope = bottomRadius - topRadius;
  const normalLength = Math.hypot(1, slope);

  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * TAU;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    positions.push(bottomRadius * cosine, bottomRadius * sine, -0.5);
    positions.push(topRadius * cosine, topRadius * sine, 0.5);
    normals.push(cosine / normalLength, sine / normalLength, slope / normalLength);
    normals.push(cosine / normalLength, sine / normalLength, slope / normalLength);
  }

  for (let index = 0; index < segments; index += 1) {
    const base = index * 2;
    indices.push(base, base + 2, base + 3, base, base + 3, base + 1);
  }

  const bottomCenter = positions.length / 3;
  positions.push(0, 0, -0.5);
  normals.push(0, 0, -1);
  const bottomStart = positions.length / 3;
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * TAU;
    positions.push(bottomRadius * Math.cos(angle), bottomRadius * Math.sin(angle), -0.5);
    normals.push(0, 0, -1);
  }
  for (let index = 0; index < segments; index += 1) {
    indices.push(bottomCenter, bottomStart + ((index + 1) % segments), bottomStart + index);
  }

  const topCenter = positions.length / 3;
  positions.push(0, 0, 0.5);
  normals.push(0, 0, 1);
  const topStart = positions.length / 3;
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * TAU;
    positions.push(topRadius * Math.cos(angle), topRadius * Math.sin(angle), 0.5);
    normals.push(0, 0, 1);
  }
  for (let index = 0; index < segments; index += 1) {
    indices.push(topCenter, topStart + index, topStart + ((index + 1) % segments));
  }

  return { positions, normals, indices };
}

function createSphere(longitudeSegments, latitudeSegments) {
  const positions = [];
  const normals = [];
  const indices = [];
  for (let latitude = 0; latitude <= latitudeSegments; latitude += 1) {
    const polar = (latitude / latitudeSegments) * Math.PI;
    for (let longitude = 0; longitude <= longitudeSegments; longitude += 1) {
      const azimuth = (longitude / longitudeSegments) * TAU;
      const normal = [
        Math.sin(polar) * Math.cos(azimuth),
        Math.sin(polar) * Math.sin(azimuth),
        Math.cos(polar),
      ];
      normals.push(...normal);
      positions.push(normal[0] * 0.5, normal[1] * 0.5, normal[2] * 0.5);
    }
  }
  const row = longitudeSegments + 1;
  for (let latitude = 0; latitude < latitudeSegments; latitude += 1) {
    for (let longitude = 0; longitude < longitudeSegments; longitude += 1) {
      const current = latitude * row + longitude;
      const next = current + row;
      indices.push(current, next, current + 1, current + 1, next, next + 1);
    }
  }
  return { positions, normals, indices };
}

function encodeFloat32(values) {
  const buffer = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => buffer.writeFloatLE(value, index * 4));
  return buffer;
}

function encodeUint16(values) {
  const buffer = Buffer.alloc(values.length * 2);
  values.forEach((value, index) => buffer.writeUInt16LE(value, index * 2));
  return buffer;
}

function componentBounds(values, stride) {
  const minimum = Array(stride).fill(Infinity);
  const maximum = Array(stride).fill(-Infinity);
  for (let offset = 0; offset < values.length; offset += stride) {
    for (let component = 0; component < stride; component += 1) {
      minimum[component] = Math.min(minimum[component], values[offset + component]);
      maximum[component] = Math.max(maximum[component], values[offset + component]);
    }
  }
  return { minimum, maximum };
}

function padBuffer(buffer, byte = 0) {
  const padding = (4 - (buffer.length % 4)) % 4;
  return padding === 0 ? buffer : Buffer.concat([buffer, Buffer.alloc(padding, byte)]);
}

function buildGlb(asset) {
  const binarySegments = [];
  const bufferViews = [];
  const accessors = [];
  const meshes = [];
  const nodes = [];
  const shapeAccessors = new Map();
  const meshIndex = new Map();
  let binaryLength = 0;

  function appendBinary(buffer, target) {
    const alignedOffset = Math.ceil(binaryLength / 4) * 4;
    if (alignedOffset > binaryLength) {
      binarySegments.push(Buffer.alloc(alignedOffset - binaryLength));
      binaryLength = alignedOffset;
    }
    const bufferViewIndex = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset: binaryLength, byteLength: buffer.length, target });
    binarySegments.push(buffer);
    binaryLength += buffer.length;
    return bufferViewIndex;
  }

  function ensureShape(shapeName) {
    if (shapeAccessors.has(shapeName)) return shapeAccessors.get(shapeName);
    const shape = SHAPES.get(shapeName);
    if (!shape) throw new Error(`Unknown shape: ${shapeName}`);
    if (shape.positions.length / 3 > 65_535) throw new Error(`Shape too large: ${shapeName}`);

    const positionBounds = componentBounds(shape.positions, 3);
    const positionView = appendBinary(encodeFloat32(shape.positions), 34_962);
    const positionAccessor = accessors.length;
    accessors.push({
      bufferView: positionView,
      componentType: 5_126,
      count: shape.positions.length / 3,
      type: "VEC3",
      min: positionBounds.minimum,
      max: positionBounds.maximum,
    });

    const normalView = appendBinary(encodeFloat32(shape.normals), 34_962);
    const normalAccessor = accessors.length;
    accessors.push({
      bufferView: normalView,
      componentType: 5_126,
      count: shape.normals.length / 3,
      type: "VEC3",
    });

    const indexView = appendBinary(encodeUint16(shape.indices), 34_963);
    const indexAccessor = accessors.length;
    accessors.push({
      bufferView: indexView,
      componentType: 5_123,
      count: shape.indices.length,
      type: "SCALAR",
      min: [Math.min(...shape.indices)],
      max: [Math.max(...shape.indices)],
    });

    const result = { positionAccessor, normalAccessor, indexAccessor };
    shapeAccessors.set(shapeName, result);
    return result;
  }

  function ensureMesh(shapeName, materialName) {
    const key = `${shapeName}:${materialName}`;
    if (meshIndex.has(key)) return meshIndex.get(key);
    const shape = ensureShape(shapeName);
    const materialIndex = MATERIAL_INDEX.get(materialName);
    if (materialIndex === undefined) throw new Error(`Unknown material: ${materialName}`);
    const index = meshes.length;
    meshes.push({
      name: key,
      primitives: [
        {
          attributes: { POSITION: shape.positionAccessor, NORMAL: shape.normalAccessor },
          indices: shape.indexAccessor,
          material: materialIndex,
          mode: 4,
        },
      ],
    });
    meshIndex.set(key, index);
    return index;
  }

  for (const entry of asset.parts) {
    nodes.push({
      name: entry.name,
      mesh: ensureMesh(entry.shape, entry.materialName),
      translation: entry.translation,
      rotation: entry.rotation,
      scale: entry.scale,
      extras: { role: "visual", materialSemantic: entry.materialName },
    });
  }

  const binary = Buffer.concat(binarySegments, binaryLength);
  const document = {
    asset: {
      version: "2.0",
      generator: "LK Design System 3D Visual Alpha deterministic generator",
      copyright: "CC0-1.0 — LK Robotics",
      extras: {
        assetId: `visual-alpha/${asset.slug}`,
        coordinateSystem: {
          handedness: "right",
          upAxis: "+Z",
          forwardAxis: "+X",
          metersPerUnit: 1,
        },
      },
    },
    scene: 0,
    scenes: [{ name: asset.label, nodes: nodes.map((_, index) => index) }],
    nodes,
    meshes,
    materials: MATERIALS,
    accessors,
    bufferViews,
    buffers: [{ byteLength: binary.length }],
  };

  const json = padBuffer(Buffer.from(JSON.stringify(document), "utf8"), 0x20);
  const paddedBinary = padBuffer(binary);
  const totalLength = 12 + 8 + json.length + 8 + paddedBinary.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(json.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binaryHeader = Buffer.alloc(8);
  binaryHeader.writeUInt32LE(paddedBinary.length, 0);
  binaryHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonHeader, json, binaryHeader, paddedBinary], totalLength);
}

function rotateVector(vector, quaternion) {
  const [x, y, z] = vector;
  const [qx, qy, qz, qw] = quaternion;
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  return [
    x + qw * tx + (qy * tz - qz * ty),
    y + qw * ty + (qz * tx - qx * tz),
    z + qw * tz + (qx * ty - qy * tx),
  ];
}

function computeBounds(parts) {
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  for (const entry of parts) {
    const shape = SHAPES.get(entry.shape);
    for (let offset = 0; offset < shape.positions.length; offset += 3) {
      const scaled = [
        shape.positions[offset] * entry.scale[0],
        shape.positions[offset + 1] * entry.scale[1],
        shape.positions[offset + 2] * entry.scale[2],
      ];
      const rotated = rotateVector(scaled, entry.rotation);
      for (let component = 0; component < 3; component += 1) {
        const value = rotated[component] + entry.translation[component];
        minimum[component] = Math.min(minimum[component], value);
        maximum[component] = Math.max(maximum[component], value);
      }
    }
  }
  return {
    min: minimum.map(stableNumber),
    max: maximum.map(stableNumber),
  };
}

function stableNumber(value) {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function createStrictManifest(asset, bounds, checksum) {
  const fileFrame = `visual-alpha/${asset.slug}`;
  return {
    schemaVersion: 1,
    assetId: fileFrame,
    version: VERSION,
    kind: asset.kind,
    format: "glb",
    fileFrame,
    fileCoordinate: {
      handedness: "right",
      upAxis: "+Z",
      forwardAxis: "+X",
      metersPerUnit: 1,
    },
    coreFrame: CORE_FRAME,
    fileToCoreTransform: {
      sourceFrame: fileFrame,
      targetFrame: CORE_FRAME,
      translation: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    },
    boundsInCoreMeters: { frame: CORE_FRAME, min: bounds.min, max: bounds.max },
    integrity: { sha256: checksum },
  };
}

function parseAndVerifyGlb(buffer, asset) {
  if (buffer.readUInt32LE(0) !== 0x46546c67) throw new Error(`${asset.slug}: invalid GLB magic`);
  if (buffer.readUInt32LE(4) !== 2) throw new Error(`${asset.slug}: GLB version is not 2`);
  if (buffer.readUInt32LE(8) !== buffer.length) throw new Error(`${asset.slug}: length mismatch`);
  const jsonLength = buffer.readUInt32LE(12);
  if (buffer.readUInt32LE(16) !== 0x4e4f534a) throw new Error(`${asset.slug}: missing JSON chunk`);
  const binaryHeaderOffset = 20 + jsonLength;
  if (buffer.readUInt32LE(binaryHeaderOffset + 4) !== 0x004e4942) {
    throw new Error(`${asset.slug}: missing BIN chunk`);
  }
  const binaryLength = buffer.readUInt32LE(binaryHeaderOffset);
  if (binaryHeaderOffset + 8 + binaryLength !== buffer.length) {
    throw new Error(`${asset.slug}: BIN chunk length mismatch`);
  }
  const document = JSON.parse(
    buffer
      .subarray(20, 20 + jsonLength)
      .toString("utf8")
      .trim(),
  );
  if (document.asset.version !== "2.0") throw new Error(`${asset.slug}: invalid asset version`);
  if (document.meshes.length < 1 || document.nodes.length < 4) {
    throw new Error(`${asset.slug}: expected a multi-part visible model`);
  }
  if (document.nodes.length !== asset.parts.length)
    throw new Error(`${asset.slug}: node count mismatch`);
  if (!document.accessors.some((accessor) => accessor.type === "VEC3" && accessor.count > 0)) {
    throw new Error(`${asset.slug}: no POSITION-compatible accessor`);
  }
  if (document.buffers[0].byteLength > binaryLength) {
    throw new Error(`${asset.slug}: declared buffer exceeds BIN chunk`);
  }
  const uniqueTriangles = document.meshes.reduce(
    (total, mesh) =>
      total +
      mesh.primitives.reduce(
        (meshTotal, primitive) => meshTotal + document.accessors[primitive.indices].count / 3,
        0,
      ),
    0,
  );
  const renderedTriangles = document.nodes.reduce(
    (total, node) =>
      total +
      document.meshes[node.mesh].primitives.reduce(
        (nodeTotal, primitive) => nodeTotal + document.accessors[primitive.indices].count / 3,
        0,
      ),
    0,
  );
  return {
    valid: true,
    glbVersion: document.asset.version,
    nodes: document.nodes.length,
    meshes: document.meshes.length,
    materials: document.materials.length,
    accessors: document.accessors.length,
    uniqueTriangles,
    renderedTriangles,
    jsonChunkBytes: jsonLength,
    binaryChunkBytes: binaryLength,
  };
}

async function generate() {
  await mkdir(MANIFEST_DIR, { recursive: true });
  const catalogAssets = [];
  const verificationAssets = [];

  for (const asset of ASSETS) {
    const glb = buildGlb(asset);
    const checksum = sha256(glb);
    const bounds = computeBounds(asset.parts);
    const filename = `${asset.slug}.glb`;
    const manifestFilename = `${asset.slug}.asset-manifest.json`;
    const strictManifest = createStrictManifest(asset, bounds, checksum);
    const validation = parseAndVerifyGlb(glb, asset);

    await writeFile(join(OUTPUT_DIR, filename), glb);
    await writeFile(
      join(MANIFEST_DIR, manifestFilename),
      `${JSON.stringify(strictManifest, null, 2)}\n`,
      "utf8",
    );

    catalogAssets.push({
      id: strictManifest.assetId,
      label: asset.label,
      description: asset.description,
      kind: asset.kind,
      file: `./${filename}`,
      manifest: `./manifests/${manifestFilename}`,
      format: "glb",
      coordinateSystem: strictManifest.fileCoordinate,
      floorOrigin: true,
      boundsInCoreMeters: strictManifest.boundsInCoreMeters,
      integrity: strictManifest.integrity,
      source: {
        type: "original-procedural",
        generator: "scripts/generate-visual-alpha-assets.mjs",
        externalSourceAssets: false,
      },
      license: {
        spdx: "CC0-1.0",
        attributionRequired: false,
        holder: "LK Robotics",
      },
      provenance: {
        designRevision: "visual-alpha-v0",
        method: "deterministic primitive mesh composition",
        customerData: false,
      },
    });

    verificationAssets.push({
      file: filename,
      bytes: glb.length,
      sha256: checksum,
      boundsInCoreMeters: strictManifest.boundsInCoreMeters,
      ...validation,
    });
  }

  const catalog = {
    schemaVersion: 1,
    collectionId: "lk-design-system-3d/visual-alpha",
    version: VERSION,
    description: "Original industrial GLB assets for LK Design System 3D Visual Alpha.",
    coordinateSystem: {
      handedness: "right",
      upAxis: "+Z",
      forwardAxis: "+X",
      metersPerUnit: 1,
      coreFrame: CORE_FRAME,
    },
    source: {
      type: "original-procedural",
      generator: "scripts/generate-visual-alpha-assets.mjs",
      deterministic: true,
      externalSourceAssets: false,
    },
    license: { spdx: "CC0-1.0", attributionRequired: false, holder: "LK Robotics" },
    provenance: {
      designRevision: "visual-alpha-v0",
      method: "deterministic primitive mesh composition",
      customerData: false,
    },
    assets: catalogAssets,
  };
  const verification = {
    schemaVersion: 1,
    generatedBy: relative(ROOT_DIR, fileURLToPath(import.meta.url)).replaceAll("\\", "/"),
    passed: verificationAssets.every((asset) => asset.valid),
    assetCount: verificationAssets.length,
    assets: verificationAssets,
  };
  await writeFile(
    join(OUTPUT_DIR, "catalog.json"),
    `${JSON.stringify(catalog, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    join(OUTPUT_DIR, "verification.json"),
    `${JSON.stringify(verification, null, 2)}\n`,
    "utf8",
  );

  for (const result of verificationAssets) {
    const persisted = await readFile(join(OUTPUT_DIR, result.file));
    if (sha256(persisted) !== result.sha256)
      throw new Error(`${result.file}: persisted hash mismatch`);
    const manifestFile = result.file.replace(/\.glb$/u, ".asset-manifest.json");
    const persistedManifest = JSON.parse(await readFile(join(MANIFEST_DIR, manifestFile), "utf8"));
    if (persistedManifest.integrity?.sha256 !== result.sha256) {
      throw new Error(`${manifestFile}: manifest checksum mismatch`);
    }
  }

  stdout.write(`${JSON.stringify(verification, null, 2)}\n`);
}

await generate();
