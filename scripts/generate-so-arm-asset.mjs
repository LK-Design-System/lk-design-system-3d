/**
 * Deterministic generator for the packaged SO-ARM-style articulated robot arm.
 *
 * Unlike the flat Visual Alpha assets, this GLB carries a parented link-node
 * hierarchy (Base > Shoulder > UpperArm > Forearm > Wrist > Gripper > Jaw) so
 * the robot kinematics contract can pose each link node directly. The asset,
 * its asset manifest, its kinematics manifest, its provenance record, and its
 * robots catalog entry are all rewritten from this single script.
 */
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { stdout } from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = dirname(SCRIPT_DIR);
const ROBOTS_DIR = join(ROOT_DIR, "packages", "assets", "robots");
const OUTPUT_DIR = join(ROBOTS_DIR, "so-arm");
const CATALOG_PATH = join(ROBOTS_DIR, "catalog.json");
const ASSET_ID = "robots/so-arm";
const FILE_FRAME = "robots/so-arm";
const CORE_FRAME = "lk-world";
const VERSION = "0.1.0";
const TAU = Math.PI * 2;

const MATERIALS = Object.freeze([
  material("graphite", [0.075, 0.09, 0.105, 1], 0.72, 0.18),
  material("neutral-shell", [0.36, 0.4, 0.43, 1], 0.48, 0.22),
  material("lk-blue", [0.025, 0.25, 0.58, 1], 0.38, 0.28),
  material("signal-white", [0.88, 0.9, 0.88, 1], 0.5, 0.04),
  material("safety-orange", [0.94, 0.24, 0.035, 1], 0.56, 0.06),
]);
const MATERIAL_INDEX = new Map(MATERIALS.map((entry, index) => [entry.name, index]));

const SHAPES = new Map([
  ["box", createBox()],
  ["cylinder", createFrustum(1, 24)],
]);

/**
 * Link chain. `origin` is the rest translation from the parent link node in
 * meters (identity rest rotation), and doubles as the kinematics joint origin.
 * `axis` is the child-link-local motion axis. Limits approximate an SO-ARM101
 * class 6-servo desktop arm; the rest pose points the arm straight up (+Z).
 */
const LINKS = Object.freeze([
  {
    linkId: "base",
    nodeName: "Base",
    parts: [
      part("base-plate", "box", "graphite", [0, 0, 0.015], [0.13, 0.13, 0.03]),
      part("base-servo", "box", "neutral-shell", [0, 0, 0.045], [0.062, 0.066, 0.05]),
    ],
  },
  {
    linkId: "shoulder",
    nodeName: "Shoulder",
    joint: { jointId: "shoulder_pan", axis: [0, 0, 1], limits: [-1.92, 1.92] },
    origin: [0, 0, 0.06],
    parts: [
      part("shoulder-turret", "cylinder", "lk-blue", [0, 0, 0.008], [0.05, 0.05, 0.016]),
      part("shoulder-yoke", "box", "neutral-shell", [0, 0, 0.026], [0.056, 0.05, 0.028]),
    ],
  },
  {
    linkId: "upper_arm",
    nodeName: "UpperArm",
    joint: { jointId: "shoulder_lift", axis: [0, 1, 0], limits: [-1.75, 1.75] },
    origin: [0, 0, 0.03],
    parts: [
      part(
        "shoulder-servo",
        "cylinder",
        "graphite",
        [0, 0, 0],
        [0.024, 0.024, 0.062],
        quaternionX(Math.PI / 2),
      ),
      part("upper-arm-beam", "box", "lk-blue", [0, 0, 0.055], [0.034, 0.04, 0.11]),
    ],
  },
  {
    linkId: "forearm",
    nodeName: "Forearm",
    joint: { jointId: "elbow_flex", axis: [0, 1, 0], limits: [-1.69, 1.69] },
    origin: [0, 0, 0.11],
    parts: [
      part(
        "elbow-servo",
        "cylinder",
        "graphite",
        [0, 0, 0],
        [0.022, 0.022, 0.058],
        quaternionX(Math.PI / 2),
      ),
      part("forearm-beam", "box", "lk-blue", [0, 0, 0.05], [0.03, 0.036, 0.1]),
    ],
  },
  {
    linkId: "wrist",
    nodeName: "Wrist",
    joint: { jointId: "wrist_flex", axis: [0, 1, 0], limits: [-1.66, 1.66] },
    origin: [0, 0, 0.1],
    parts: [
      part(
        "wrist-servo",
        "cylinder",
        "graphite",
        [0, 0, 0],
        [0.02, 0.02, 0.052],
        quaternionX(Math.PI / 2),
      ),
      part("wrist-block", "box", "neutral-shell", [0, 0, 0.024], [0.034, 0.042, 0.038]),
    ],
  },
  {
    linkId: "gripper",
    nodeName: "Gripper",
    joint: { jointId: "wrist_roll", axis: [0, 0, 1], limits: [-2.79, 2.79] },
    origin: [0, 0, 0.045],
    parts: [
      part("gripper-body", "box", "neutral-shell", [0, 0, 0.018], [0.044, 0.028, 0.036]),
      part("gripper-marker", "box", "signal-white", [0.017, 0, 0.037], [0.01, 0.02, 0.004]),
      part("fixed-jaw", "box", "safety-orange", [0.013, 0, 0.056], [0.009, 0.022, 0.04]),
    ],
  },
  {
    linkId: "jaw",
    nodeName: "Jaw",
    joint: { jointId: "gripper_jaw", axis: [0, 1, 0], limits: [0, 1.1] },
    origin: [-0.013, 0, 0.038],
    parts: [part("moving-jaw", "box", "safety-orange", [0, 0, 0.018], [0.009, 0.022, 0.04])],
  },
]);

function material(name, baseColorFactor, roughnessFactor, metallicFactor) {
  return {
    name,
    pbrMetallicRoughness: { baseColorFactor, roughnessFactor, metallicFactor },
  };
}

function part(name, shape, materialName, translation, scale, rotation = [0, 0, 0, 1]) {
  return { name, shape, materialName, translation, scale, rotation };
}

function quaternionX(angle) {
  return [Math.sin(angle / 2), 0, 0, Math.cos(angle / 2)];
}

function createBox() {
  const positions = [];
  const normals = [];
  const indices = [];
  const faces = [
    {
      normal: [0, 0, 1],
      corners: [
        [-1, -1, 1],
        [1, -1, 1],
        [1, 1, 1],
        [-1, 1, 1],
      ],
    },
    {
      normal: [0, 0, -1],
      corners: [
        [-1, 1, -1],
        [1, 1, -1],
        [1, -1, -1],
        [-1, -1, -1],
      ],
    },
    {
      normal: [1, 0, 0],
      corners: [
        [1, -1, -1],
        [1, 1, -1],
        [1, 1, 1],
        [1, -1, 1],
      ],
    },
    {
      normal: [-1, 0, 0],
      corners: [
        [-1, -1, 1],
        [-1, 1, 1],
        [-1, 1, -1],
        [-1, -1, -1],
      ],
    },
    {
      normal: [0, 1, 0],
      corners: [
        [-1, 1, -1],
        [-1, 1, 1],
        [1, 1, 1],
        [1, 1, -1],
      ],
    },
    {
      normal: [0, -1, 0],
      corners: [
        [1, -1, -1],
        [1, -1, 1],
        [-1, -1, 1],
        [-1, -1, -1],
      ],
    },
  ];
  for (const face of faces) {
    const start = positions.length / 3;
    for (const corner of face.corners) {
      positions.push(corner[0] / 2, corner[1] / 2, corner[2] / 2);
      normals.push(...face.normal);
    }
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
  return { positions, normals, indices };
}

function createFrustum(topRadiusRatio, segments) {
  const positions = [];
  const normals = [];
  const indices = [];
  const bottomRadius = 0.5;
  const topRadius = 0.5 * topRadiusRatio;
  const half = 0.5;
  const slopeY = (bottomRadius - topRadius) / 1;

  for (let segment = 0; segment <= segments; segment += 1) {
    const angle = (segment / segments) * TAU;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const sideNormal = normalize([cos, sin, slopeY]);
    positions.push(cos * bottomRadius, sin * bottomRadius, -half);
    normals.push(...sideNormal);
    positions.push(cos * topRadius, sin * topRadius, half);
    normals.push(...sideNormal);
  }
  for (let segment = 0; segment < segments; segment += 1) {
    const base = segment * 2;
    indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  }

  for (const [z, radius, normal] of [
    [-half, bottomRadius, [0, 0, -1]],
    [half, topRadius, [0, 0, 1]],
  ]) {
    const centerIndex = positions.length / 3;
    positions.push(0, 0, z);
    normals.push(...normal);
    for (let segment = 0; segment <= segments; segment += 1) {
      const angle = (segment / segments) * TAU;
      positions.push(Math.cos(angle) * radius, Math.sin(angle) * radius, z);
      normals.push(...normal);
    }
    for (let segment = 0; segment < segments; segment += 1) {
      const first = centerIndex + 1 + segment;
      if (normal[2] > 0) indices.push(centerIndex, first, first + 1);
      else indices.push(centerIndex, first + 1, first);
    }
  }
  return { positions, normals, indices };
}

function normalize(vector) {
  const length = Math.hypot(...vector);
  return vector.map((component) => component / length);
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

function buildGlb() {
  const binarySegments = [];
  const bufferViews = [];
  const accessors = [];
  const meshes = [];
  const nodes = [];
  const shapeAccessors = new Map();
  const meshIndex = new Map();
  let binaryLength = 0;

  function appendBinary(buffer, target) {
    const bufferViewIndex = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset: binaryLength, byteLength: buffer.length, target });
    const padded = padBuffer(buffer);
    binarySegments.push(padded);
    binaryLength += padded.length;
    return bufferViewIndex;
  }

  function ensureShape(shapeName) {
    if (shapeAccessors.has(shapeName)) return shapeAccessors.get(shapeName);
    const shape = SHAPES.get(shapeName);
    if (!shape) throw new Error(`Unknown shape: ${shapeName}`);

    const positionBounds = componentBounds(shape.positions, 3);
    const positionAccessor = accessors.length;
    accessors.push({
      bufferView: appendBinary(encodeFloat32(shape.positions), 34_962),
      componentType: 5_126,
      count: shape.positions.length / 3,
      type: "VEC3",
      min: positionBounds.minimum,
      max: positionBounds.maximum,
    });
    const normalAccessor = accessors.length;
    accessors.push({
      bufferView: appendBinary(encodeFloat32(shape.normals), 34_962),
      componentType: 5_126,
      count: shape.normals.length / 3,
      type: "VEC3",
    });
    const indexAccessor = accessors.length;
    accessors.push({
      bufferView: appendBinary(encodeUint16(shape.indices), 34_963),
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
    const index = meshes.length;
    meshes.push({
      name: key,
      primitives: [
        {
          attributes: { POSITION: shape.positionAccessor, NORMAL: shape.normalAccessor },
          indices: shape.indexAccessor,
          material: MATERIAL_INDEX.get(materialName),
          mode: 4,
        },
      ],
    });
    meshIndex.set(key, index);
    return index;
  }

  let previousLinkNode;
  for (const link of LINKS) {
    const partIndices = link.parts.map((entry) => {
      const index = nodes.length;
      nodes.push({
        name: `${link.nodeName}/${entry.name}`,
        mesh: ensureMesh(entry.shape, entry.materialName),
        translation: entry.translation,
        rotation: entry.rotation,
        scale: entry.scale,
        extras: { role: "visual", materialSemantic: entry.materialName },
      });
      return index;
    });
    const linkNode = {
      name: link.nodeName,
      translation: link.origin ?? [0, 0, 0],
      children: partIndices,
      extras: { role: "link", linkId: link.linkId },
    };
    const linkIndex = nodes.length;
    nodes.push(linkNode);
    if (previousLinkNode !== undefined) previousLinkNode.children.push(linkIndex);
    previousLinkNode = linkNode;
  }
  const rootIndex = nodes.findIndex((node) => node.name === "Base");

  const binary = Buffer.concat(binarySegments, binaryLength);
  const document = {
    asset: {
      version: "2.0",
      generator: "LK Design System 3D deterministic SO-ARM generator",
      copyright: "CC-BY-4.0 — LK Robotics",
      extras: {
        assetId: ASSET_ID,
        coordinateSystem: {
          handedness: "right",
          upAxis: "+Z",
          forwardAxis: "+X",
          metersPerUnit: 1,
        },
      },
    },
    scene: 0,
    scenes: [{ name: "SO-ARM Desktop Manipulator", nodes: [rootIndex] }],
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

function computeRestBounds() {
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  const linkOffset = [0, 0, 0];
  for (const link of LINKS) {
    const origin = link.origin ?? [0, 0, 0];
    for (let component = 0; component < 3; component += 1) {
      linkOffset[component] += origin[component];
    }
    for (const entry of link.parts) {
      const shape = SHAPES.get(entry.shape);
      for (let offset = 0; offset < shape.positions.length; offset += 3) {
        const scaled = [
          shape.positions[offset] * entry.scale[0],
          shape.positions[offset + 1] * entry.scale[1],
          shape.positions[offset + 2] * entry.scale[2],
        ];
        const rotated = rotateVector(scaled, entry.rotation);
        for (let component = 0; component < 3; component += 1) {
          const value = rotated[component] + entry.translation[component] + linkOffset[component];
          minimum[component] = Math.min(minimum[component], value);
          maximum[component] = Math.max(maximum[component], value);
        }
      }
    }
  }
  return { min: minimum.map(stableNumber), max: maximum.map(stableNumber) };
}

function stableNumber(value) {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function createAssetManifest(bounds, checksum) {
  return {
    schemaVersion: 1,
    assetId: ASSET_ID,
    version: VERSION,
    kind: "robot",
    format: "glb",
    fileFrame: FILE_FRAME,
    fileCoordinate: {
      handedness: "right",
      upAxis: "+Z",
      forwardAxis: "+X",
      metersPerUnit: 1,
    },
    coreFrame: CORE_FRAME,
    fileToCoreTransform: {
      sourceFrame: FILE_FRAME,
      targetFrame: CORE_FRAME,
      translation: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    },
    boundsInCoreMeters: { frame: CORE_FRAME, min: bounds.min, max: bounds.max },
    integrity: { sha256: checksum },
  };
}

function createKinematicsManifest() {
  return {
    schemaVersion: 1,
    assetId: ASSET_ID,
    version: VERSION,
    baseLink: "base",
    links: LINKS.map((link) => ({ linkId: link.linkId, nodeName: link.nodeName })),
    joints: LINKS.filter((link) => link.joint !== undefined).map((link, index) => ({
      jointId: link.joint.jointId,
      type: "revolute",
      parentLink: LINKS[index].linkId,
      childLink: link.linkId,
      origin: { translation: link.origin, rotation: [0, 0, 0, 1] },
      axis: link.joint.axis,
      limits: { lower: link.joint.limits[0], upper: link.joint.limits[1] },
    })),
  };
}

function createProvenance(glbBytes, checksum, triangles) {
  return {
    schemaVersion: 1,
    assetId: ASSET_ID,
    containsCustomerData: false,
    source: {
      generator: "scripts/generate-so-arm-asset.mjs",
      deterministic: true,
      description:
        "Original procedural SO-ARM-class desktop manipulator authored in this repository; joint topology and limits approximate a 6-servo hobby arm, and no external mesh or URDF was imported.",
    },
    derivative: {
      file: "./so-arm.glb",
      bytes: glbBytes,
      sha256: checksum,
      triangles,
    },
    coordinateEvidence: {
      basis: "glTF 2.0 right-handed meters",
      upAxis: "+Z",
      forwardAxis: "+X",
      forwardAxisReason:
        "The generator authors the arm directly in the LK core convention; the fixed gripper jaw faces local +X at rest.",
      floorNormalizationMeters: 0,
    },
    license: {
      spdx: "CC-BY-4.0",
      holder: "LK Robotics",
      attributionRequired: true,
      authorization:
        "LK Robotics authored this procedural asset in-repository for public distribution under CC-BY-4.0.",
      attribution: "SO-ARM Desktop Manipulator model © LK Robotics, licensed under CC BY 4.0.",
    },
  };
}

function countTriangles(glb) {
  const jsonChunkLength = glb.readUInt32LE(12);
  const document = JSON.parse(glb.toString("utf8", 20, 20 + jsonChunkLength));
  let unique = 0;
  for (const mesh of document.meshes) {
    for (const primitive of mesh.primitives) {
      unique += document.accessors[primitive.indices].count / 3;
    }
  }
  let rendered = 0;
  for (const node of document.nodes) {
    if (node.mesh === undefined) continue;
    const mesh = document.meshes[node.mesh];
    for (const primitive of mesh.primitives) {
      rendered += document.accessors[primitive.indices].count / 3;
    }
  }
  return { unique, rendered };
}

function createCatalogEntry(bounds, checksum) {
  return {
    id: ASSET_ID,
    label: "SO-ARM Desktop Manipulator",
    description:
      "Procedural SO-ARM-class 6-joint desktop arm with a parented link-node hierarchy for the robot kinematics contract.",
    kind: "robot",
    format: "glb",
    file: "./so-arm/so-arm.glb",
    manifest: "./so-arm/so-arm.asset-manifest.json",
    kinematics: "./so-arm/so-arm.kinematics.json",
    provenance: "./so-arm/provenance.json",
    floorOrigin: true,
    coordinateSystem: {
      handedness: "right",
      upAxis: "+Z",
      forwardAxis: "+X",
      metersPerUnit: 1,
    },
    boundsInCoreMeters: { frame: CORE_FRAME, min: bounds.min, max: bounds.max },
    integrity: { sha256: checksum },
    license: {
      spdx: "CC-BY-4.0",
      holder: "LK Robotics",
      attributionRequired: true,
    },
  };
}

async function updateCatalog(entry) {
  const catalog = JSON.parse(await readFile(CATALOG_PATH, "utf8"));
  const assets = catalog.assets.filter((candidate) => candidate.id !== entry.id);
  assets.push(entry);
  assets.sort((left, right) => left.id.localeCompare(right.id));
  const next = { ...catalog, assets };
  await writeFile(CATALOG_PATH, `${JSON.stringify(next, null, 2)}\n`);
}

async function generate() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const glb = buildGlb();
  const checksum = sha256(glb);
  const bounds = computeRestBounds();
  const triangles = countTriangles(glb);

  await writeFile(join(OUTPUT_DIR, "so-arm.glb"), glb);
  await writeFile(
    join(OUTPUT_DIR, "so-arm.asset-manifest.json"),
    `${JSON.stringify(createAssetManifest(bounds, checksum), null, 2)}\n`,
  );
  await writeFile(
    join(OUTPUT_DIR, "so-arm.kinematics.json"),
    `${JSON.stringify(createKinematicsManifest(), null, 2)}\n`,
  );
  await writeFile(
    join(OUTPUT_DIR, "provenance.json"),
    `${JSON.stringify(createProvenance(glb.length, checksum, triangles.unique), null, 2)}\n`,
  );
  await updateCatalog(createCatalogEntry(bounds, checksum));

  stdout.write(
    `so-arm.glb ${String(glb.length)} bytes sha256=${checksum} triangles=${String(triangles.unique)}/${String(triangles.rendered)} bounds=${JSON.stringify(bounds)}\n`,
  );
}

await generate();
