/**
 * URDF importer toolchain.
 *
 * Converts a URDF robot description (plus its referenced meshes) into the
 * repository's articulated-asset layout:
 *
 *   packages/assets/robots/<slug>/
 *     <slug>.glb                    parented link-node hierarchy
 *     <slug>.asset-manifest.json    asset-manifest.v1
 *     <slug>.kinematics.json        robot-kinematics.v1
 *     provenance.json               source URDF/mesh digests and license
 *     import-report.json            what was imported, folded, and warned
 *
 * plus a robots/catalog.json entry. URDF's Z-up right-handed meter convention
 * matches the LK core convention, so the file-to-core transform is identity.
 *
 * Supported geometry: box, cylinder, sphere, and binary/ASCII STL meshes.
 * Fixed joints are folded into their parent link (the kinematics contract
 * models moving joints only); continuous joints import as revolute clamped to
 * ±π with a warning. Collision and inertial data are ignored.
 *
 * Every output is self-verified before it is written: the GLB is re-parsed,
 * both manifests are validated through the public assets package, and the
 * link nodes are checked against the kinematics contract. A failed check
 * aborts the import with no partial output.
 *
 * Usage:
 *   pnpm exec node scripts/import-urdf-robot.mjs --urdf <path> --slug <slug>
 *     [--label "Display Name"] [--version 0.1.0] [--license-holder "LK Robotics"]
 */
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { parseAssetManifest, parseRobotKinematics } from "@lk-design-system/lds-3d-assets";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.dirname(SCRIPT_DIR);
const ROBOTS_DIR = path.join(ROOT_DIR, "packages", "assets", "robots");
const CATALOG_PATH = path.join(ROBOTS_DIR, "catalog.json");
const CORE_FRAME = "lk-world";

// ---------------------------------------------------------------------------
// Minimal XML parsing (URDF subset: elements, attributes, comments)
// ---------------------------------------------------------------------------

function parseXml(text) {
  let cursor = 0;
  const source = text.replace(/<\?[^]*?\?>/gu, "").replace(/<!--[^]*?-->/gu, "");

  function skipWhitespace() {
    while (cursor < source.length && /\s/u.test(source[cursor])) cursor += 1;
  }

  function parseAttributes(tagBody) {
    const attributes = {};
    const pattern = /([\w:-]+)\s*=\s*"([^"]*)"/gu;
    for (const match of tagBody.matchAll(pattern)) attributes[match[1]] = match[2];
    return attributes;
  }

  function parseElement() {
    skipWhitespace();
    if (source[cursor] !== "<") throw new Error(`XML: expected '<' at ${String(cursor)}.`);
    const close = source.indexOf(">", cursor);
    if (close === -1) throw new Error("XML: unterminated tag.");
    const rawTag = source.slice(cursor + 1, close);
    cursor = close + 1;
    const selfClosing = rawTag.endsWith("/");
    const body = selfClosing ? rawTag.slice(0, -1) : rawTag;
    const nameMatch = body.match(/^([\w:-]+)/u);
    if (!nameMatch) throw new Error(`XML: invalid tag <${rawTag}>.`);
    const element = {
      tag: nameMatch[1],
      attributes: parseAttributes(body.slice(nameMatch[1].length)),
      children: [],
    };
    if (selfClosing) return element;

    for (;;) {
      skipWhitespace();
      if (source.startsWith("</", cursor)) {
        const end = source.indexOf(">", cursor);
        cursor = end + 1;
        return element;
      }
      if (source[cursor] === "<") {
        element.children.push(parseElement());
      } else {
        const next = source.indexOf("<", cursor);
        cursor = next === -1 ? source.length : next;
      }
    }
  }

  const root = parseElement();
  return root;
}

function childrenOf(element, tag) {
  return element.children.filter((child) => child.tag === tag);
}

function childOf(element, tag) {
  return element.children.find((child) => child.tag === tag);
}

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

function numbers(value, count, label) {
  const parts = (value ?? "").trim().split(/\s+/u).filter(Boolean).map(Number);
  if (parts.length !== count || parts.some((entry) => !Number.isFinite(entry))) {
    throw new Error(`URDF: ${label} must contain ${String(count)} finite numbers.`);
  }
  return parts;
}

function multiplyQuaternions(left, right) {
  const [lx, ly, lz, lw] = left;
  const [rx, ry, rz, rw] = right;
  return [
    lw * rx + lx * rw + ly * rz - lz * ry,
    lw * ry - lx * rz + ly * rw + lz * rx,
    lw * rz + lx * ry - ly * rx + lz * rw,
    lw * rw - lx * rx - ly * ry - lz * rz,
  ];
}

function axisAngleQuaternion(axis, angle) {
  const half = angle / 2;
  const sin = Math.sin(half);
  return [axis[0] * sin, axis[1] * sin, axis[2] * sin, Math.cos(half)];
}

/** URDF rpy is fixed-axis XYZ: R = Rz(yaw) * Ry(pitch) * Rx(roll). */
function rpyToQuaternion([roll, pitch, yaw]) {
  return multiplyQuaternions(
    axisAngleQuaternion([0, 0, 1], yaw),
    multiplyQuaternions(
      axisAngleQuaternion([0, 1, 0], pitch),
      axisAngleQuaternion([1, 0, 0], roll),
    ),
  );
}

function rotateVector(quaternion, vector) {
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

function composePose(parent, child) {
  return {
    translation: addVectors(parent.translation, rotateVector(parent.rotation, child.translation)),
    rotation: normalizeQuaternion(multiplyQuaternions(parent.rotation, child.rotation)),
  };
}

function addVectors(left, right) {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function normalizeQuaternion(value) {
  const norm = Math.hypot(...value);
  return value.map((component) => component / norm);
}

function parseOrigin(element) {
  const originElement = element === undefined ? undefined : childOf(element, "origin");
  if (originElement === undefined) {
    return { translation: [0, 0, 0], rotation: [0, 0, 0, 1] };
  }
  const xyz = originElement.attributes.xyz
    ? numbers(originElement.attributes.xyz, 3, "origin xyz")
    : [0, 0, 0];
  const rpy = originElement.attributes.rpy
    ? numbers(originElement.attributes.rpy, 3, "origin rpy")
    : [0, 0, 0];
  return { translation: xyz, rotation: normalizeQuaternion(rpyToQuaternion(rpy)) };
}

function stableNumber(value) {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

// ---------------------------------------------------------------------------
// Geometry: unit primitives and STL meshes
// ---------------------------------------------------------------------------

const TAU = Math.PI * 2;

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

function createCylinder(segments = 24) {
  const positions = [];
  const normals = [];
  const indices = [];
  const radius = 0.5;
  const half = 0.5;
  for (let segment = 0; segment <= segments; segment += 1) {
    const angle = (segment / segments) * TAU;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    positions.push(cos * radius, sin * radius, -half, cos * radius, sin * radius, half);
    normals.push(cos, sin, 0, cos, sin, 0);
  }
  for (let segment = 0; segment < segments; segment += 1) {
    const base = segment * 2;
    indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  }
  for (const [z, normal] of [
    [-half, [0, 0, -1]],
    [half, [0, 0, 1]],
  ]) {
    const center = positions.length / 3;
    positions.push(0, 0, z);
    normals.push(...normal);
    for (let segment = 0; segment <= segments; segment += 1) {
      const angle = (segment / segments) * TAU;
      positions.push(Math.cos(angle) * radius, Math.sin(angle) * radius, z);
      normals.push(...normal);
    }
    for (let segment = 0; segment < segments; segment += 1) {
      const first = center + 1 + segment;
      if (normal[2] > 0) indices.push(center, first, first + 1);
      else indices.push(center, first + 1, first);
    }
  }
  return { positions, normals, indices };
}

function createSphere(longitudeSegments = 20, latitudeSegments = 12) {
  const positions = [];
  const normals = [];
  const indices = [];
  for (let latitude = 0; latitude <= latitudeSegments; latitude += 1) {
    const phi = (latitude / latitudeSegments) * Math.PI;
    for (let longitude = 0; longitude <= longitudeSegments; longitude += 1) {
      const theta = (longitude / longitudeSegments) * TAU;
      const x = Math.sin(phi) * Math.cos(theta) * 0.5;
      const y = Math.sin(phi) * Math.sin(theta) * 0.5;
      const z = Math.cos(phi) * 0.5;
      positions.push(x, y, z);
      const norm = Math.hypot(x, y, z) || 1;
      normals.push(x / norm, y / norm, z / norm);
    }
  }
  const stride = longitudeSegments + 1;
  for (let latitude = 0; latitude < latitudeSegments; latitude += 1) {
    for (let longitude = 0; longitude < longitudeSegments; longitude += 1) {
      const first = latitude * stride + longitude;
      indices.push(first, first + stride, first + 1, first + 1, first + stride, first + stride + 1);
    }
  }
  return { positions, normals, indices };
}

function parseStl(buffer, label) {
  const header = buffer.toString("ascii", 0, Math.min(buffer.length, 512));
  const looksAscii = header.trimStart().startsWith("solid") && header.includes("facet");
  return looksAscii ? parseAsciiStl(buffer.toString("utf8"), label) : parseBinaryStl(buffer, label);
}

function parseBinaryStl(buffer, label) {
  if (buffer.length < 84) throw new Error(`STL ${label}: file too small.`);
  const triangleCount = buffer.readUInt32LE(80);
  if (buffer.length < 84 + triangleCount * 50) {
    throw new Error(`STL ${label}: truncated binary payload.`);
  }
  const positions = [];
  const normals = [];
  const indices = [];
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const offset = 84 + triangle * 50;
    const normal = [
      buffer.readFloatLE(offset),
      buffer.readFloatLE(offset + 4),
      buffer.readFloatLE(offset + 8),
    ];
    const start = positions.length / 3;
    for (let vertex = 0; vertex < 3; vertex += 1) {
      const base = offset + 12 + vertex * 12;
      positions.push(
        buffer.readFloatLE(base),
        buffer.readFloatLE(base + 4),
        buffer.readFloatLE(base + 8),
      );
      normals.push(...normal);
    }
    indices.push(start, start + 1, start + 2);
  }
  return { positions, normals, indices };
}

function parseAsciiStl(text, label) {
  const positions = [];
  const normals = [];
  const indices = [];
  const facetPattern = /facet\s+normal\s+(\S+)\s+(\S+)\s+(\S+)[^]*?outer\s+loop([^]*?)endloop/gu;
  const vertexPattern = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/gu;
  for (const facet of text.matchAll(facetPattern)) {
    const normal = [Number(facet[1]), Number(facet[2]), Number(facet[3])];
    const vertices = [...facet[4].matchAll(vertexPattern)];
    if (vertices.length !== 3) throw new Error(`STL ${label}: facet without three vertices.`);
    const start = positions.length / 3;
    for (const vertex of vertices) {
      positions.push(Number(vertex[1]), Number(vertex[2]), Number(vertex[3]));
      normals.push(...normal);
    }
    indices.push(start, start + 1, start + 2);
  }
  if (indices.length === 0) throw new Error(`STL ${label}: no facets found.`);
  return { positions, normals, indices };
}

// ---------------------------------------------------------------------------
// URDF model extraction
// ---------------------------------------------------------------------------

const DEFAULT_MATERIAL = { name: "urdf-default", color: [0.62, 0.65, 0.68, 1] };

async function loadUrdfModel(urdfPath, warnings) {
  const urdfText = await readFile(urdfPath, "utf8");
  const root = parseXml(urdfText);
  if (root.tag !== "robot") throw new Error("URDF root element must be <robot>.");
  const robotName = root.attributes.name ?? "robot";

  const namedMaterials = new Map();
  for (const material of childrenOf(root, "material")) {
    const color = childOf(material, "color");
    if (material.attributes.name && color?.attributes.rgba) {
      namedMaterials.set(material.attributes.name, {
        name: material.attributes.name,
        color: numbers(color.attributes.rgba, 4, "material rgba"),
      });
    }
  }

  const meshCache = new Map();
  const meshSources = [];
  async function loadMesh(fileName) {
    if (meshCache.has(fileName)) return meshCache.get(fileName);
    let resolved = fileName;
    const packageMatch = fileName.match(/^package:\/\/[^/]+\/(.+)$/u);
    if (packageMatch) {
      resolved = packageMatch[1];
      warnings.push(
        `mesh ${fileName}: package:// URI resolved relative to the URDF directory as ${resolved}.`,
      );
    }
    const meshPath = path.resolve(path.dirname(urdfPath), resolved);
    if (!meshPath.toLowerCase().endsWith(".stl")) {
      throw new Error(`mesh ${fileName}: only STL meshes are supported (got ${meshPath}).`);
    }
    const bytes = await readFile(meshPath);
    const geometry = parseStl(bytes, fileName);
    meshCache.set(fileName, geometry);
    meshSources.push({
      file: path.relative(path.dirname(urdfPath), meshPath).replaceAll("\\", "/"),
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      triangles: geometry.indices.length / 3,
    });
    return geometry;
  }

  async function extractVisuals(linkElement) {
    const visuals = [];
    for (const [index, visual] of childrenOf(linkElement, "visual").entries()) {
      const geometryElement = childOf(visual, "geometry");
      if (geometryElement === undefined) continue;
      const pose = parseOrigin(visual);
      const materialElement = childOf(visual, "material");
      let material = DEFAULT_MATERIAL;
      if (materialElement !== undefined) {
        const inlineColor = childOf(materialElement, "color");
        if (inlineColor?.attributes.rgba) {
          material = {
            name: materialElement.attributes.name ?? `inline-${String(index)}`,
            color: numbers(inlineColor.attributes.rgba, 4, "material rgba"),
          };
        } else if (materialElement.attributes.name) {
          material = namedMaterials.get(materialElement.attributes.name) ?? DEFAULT_MATERIAL;
        }
      }

      const box = childOf(geometryElement, "box");
      const cylinder = childOf(geometryElement, "cylinder");
      const sphere = childOf(geometryElement, "sphere");
      const mesh = childOf(geometryElement, "mesh");
      const name = `${linkElement.attributes.name}/visual-${String(index)}`;
      if (box?.attributes.size) {
        visuals.push({
          name,
          kind: "box",
          scale: numbers(box.attributes.size, 3, "box size"),
          pose,
          material,
        });
      } else if (cylinder) {
        const radius = Number(cylinder.attributes.radius);
        const length = Number(cylinder.attributes.length);
        if (!Number.isFinite(radius) || !Number.isFinite(length)) {
          throw new Error(`URDF: cylinder in ${name} needs finite radius and length.`);
        }
        visuals.push({
          name,
          kind: "cylinder",
          scale: [radius * 2, radius * 2, length],
          pose,
          material,
        });
      } else if (sphere) {
        const radius = Number(sphere.attributes.radius);
        if (!Number.isFinite(radius)) throw new Error(`URDF: sphere in ${name} needs a radius.`);
        visuals.push({
          name,
          kind: "sphere",
          scale: [radius * 2, radius * 2, radius * 2],
          pose,
          material,
        });
      } else if (mesh?.attributes.filename) {
        const geometry = await loadMesh(mesh.attributes.filename);
        const scale = mesh.attributes.scale
          ? numbers(mesh.attributes.scale, 3, "mesh scale")
          : [1, 1, 1];
        visuals.push({ name, kind: "mesh", geometry, scale, pose, material });
      } else {
        warnings.push(`link ${linkElement.attributes.name}: unsupported geometry skipped.`);
      }
    }
    return visuals;
  }

  const links = new Map();
  for (const linkElement of childrenOf(root, "link")) {
    const name = linkElement.attributes.name;
    if (!name) throw new Error("URDF: every <link> needs a name.");
    if (links.has(name)) throw new Error(`URDF: duplicate link ${name}.`);
    links.set(name, { name, visuals: await extractVisuals(linkElement) });
  }

  const joints = [];
  for (const jointElement of childrenOf(root, "joint")) {
    const name = jointElement.attributes.name;
    const type = jointElement.attributes.type;
    const parent = childOf(jointElement, "parent")?.attributes.link;
    const child = childOf(jointElement, "child")?.attributes.link;
    if (!name || !type || !parent || !child) {
      throw new Error(`URDF: joint ${name ?? "?"} needs name, type, parent, and child.`);
    }
    if (!links.has(parent) || !links.has(child)) {
      throw new Error(`URDF: joint ${name} references unknown links.`);
    }
    const origin = parseOrigin(jointElement);
    const axisAttribute = childOf(jointElement, "axis")?.attributes.xyz;
    const axisRaw = axisAttribute ? numbers(axisAttribute, 3, "joint axis") : [1, 0, 0];
    const axisNorm = Math.hypot(...axisRaw);
    if (axisNorm <= Number.EPSILON) throw new Error(`URDF: joint ${name} has a zero axis.`);
    const axis = axisRaw.map((component) => stableNumber(component / axisNorm));
    const limitElement = childOf(jointElement, "limit");
    const lower = Number(limitElement?.attributes.lower ?? Number.NaN);
    const upper = Number(limitElement?.attributes.upper ?? Number.NaN);

    if (type === "fixed") {
      joints.push({ name, type: "fixed", parent, child, origin });
      continue;
    }
    if (type === "continuous") {
      warnings.push(`joint ${name}: continuous imported as revolute clamped to ±π.`);
      joints.push({
        name,
        type: "revolute",
        parent,
        child,
        origin,
        axis,
        limits: { lower: -Math.PI, upper: Math.PI },
      });
      continue;
    }
    if (type !== "revolute" && type !== "prismatic") {
      throw new Error(`URDF: joint ${name} has unsupported type ${type}.`);
    }
    if (!Number.isFinite(lower) || !Number.isFinite(upper) || lower > upper) {
      throw new Error(`URDF: joint ${name} needs finite ordered limits.`);
    }
    joints.push({ name, type, parent, child, origin, axis, limits: { lower, upper } });
  }

  return { robotName, links, joints, meshSources, urdfText };
}

/**
 * Folds fixed-jointed links into their parents: the child link's visuals move
 * into the parent with the joint origin baked into each visual pose, and the
 * child link disappears from the kinematic tree. Runs until no fixed joints
 * remain so fixed chains collapse fully.
 */
function foldFixedJoints(model, report) {
  const { links, joints } = model;
  let remaining = joints.filter((joint) => joint.type === "fixed");
  let moving = joints.filter((joint) => joint.type !== "fixed");
  while (remaining.length > 0) {
    const foldable = remaining.find(
      (candidate) => !moving.some((joint) => joint.parent === candidate.child),
    );
    const joint = foldable ?? remaining[0];
    if (foldable === undefined) {
      // A moving joint hangs off this fixed child; re-parent that joint
      // through the fixed origin instead of folding visuals.
      moving = moving.map((movingJoint) =>
        movingJoint.parent === joint.child
          ? {
              ...movingJoint,
              parent: joint.parent,
              origin: composePose(joint.origin, movingJoint.origin),
            }
          : movingJoint,
      );
    }
    const parentLink = links.get(joint.parent);
    const childLink = links.get(joint.child);
    for (const visual of childLink.visuals) {
      parentLink.visuals.push({ ...visual, pose: composePose(joint.origin, visual.pose) });
    }
    links.delete(joint.child);
    report.foldedFixedJoints.push({ joint: joint.name, child: joint.child, into: joint.parent });
    remaining = remaining
      .filter((candidate) => candidate !== joint)
      .map((candidate) =>
        candidate.parent === joint.child
          ? {
              ...candidate,
              parent: joint.parent,
              origin: composePose(joint.origin, candidate.origin),
            }
          : candidate,
      );
  }
  model.joints = moving;
}

function findBaseLink(model) {
  const children = new Set(model.joints.map((joint) => joint.child));
  const roots = [...model.links.keys()].filter((name) => !children.has(name));
  if (roots.length !== 1) {
    throw new Error(`URDF: expected exactly one root link, found ${roots.join(", ") || "none"}.`);
  }
  return roots[0];
}

// ---------------------------------------------------------------------------
// GLB assembly
// ---------------------------------------------------------------------------

function encodeFloat32(values) {
  const buffer = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => buffer.writeFloatLE(value, index * 4));
  return buffer;
}

function encodeIndices(values, vertexCount) {
  if (vertexCount <= 65_535) {
    const buffer = Buffer.alloc(values.length * 2);
    values.forEach((value, index) => buffer.writeUInt16LE(value, index * 2));
    return { buffer, componentType: 5_123 };
  }
  const buffer = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => buffer.writeUInt32LE(value, index * 4));
  return { buffer, componentType: 5_125 };
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

const UNIT_SHAPES = new Map([
  ["box", createBox()],
  ["cylinder", createCylinder()],
  ["sphere", createSphere()],
]);

function buildGlb(model, baseLink, assetId, label) {
  const binarySegments = [];
  const bufferViews = [];
  const accessors = [];
  const meshes = [];
  const nodes = [];
  const materials = [];
  const materialIndex = new Map();
  const unitGeometryAccessors = new Map();
  let binaryLength = 0;

  function appendBinary(buffer, target) {
    const bufferViewIndex = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset: binaryLength, byteLength: buffer.length, target });
    const padded = padBuffer(buffer);
    binarySegments.push(padded);
    binaryLength += padded.length;
    return bufferViewIndex;
  }

  function geometryAccessors(geometry) {
    const vertexCount = geometry.positions.length / 3;
    const positionBounds = componentBounds(geometry.positions, 3);
    const positionAccessor = accessors.length;
    accessors.push({
      bufferView: appendBinary(encodeFloat32(geometry.positions), 34_962),
      componentType: 5_126,
      count: vertexCount,
      type: "VEC3",
      min: positionBounds.minimum,
      max: positionBounds.maximum,
    });
    const normalAccessor = accessors.length;
    accessors.push({
      bufferView: appendBinary(encodeFloat32(geometry.normals), 34_962),
      componentType: 5_126,
      count: geometry.normals.length / 3,
      type: "VEC3",
    });
    const encoded = encodeIndices(geometry.indices, vertexCount);
    const indexAccessor = accessors.length;
    accessors.push({
      bufferView: appendBinary(encoded.buffer, 34_963),
      componentType: encoded.componentType,
      count: geometry.indices.length,
      type: "SCALAR",
      min: [Math.min(...geometry.indices)],
      max: [Math.max(...geometry.indices)],
    });
    return { positionAccessor, normalAccessor, indexAccessor };
  }

  function ensureMaterial(material) {
    if (materialIndex.has(material.name)) return materialIndex.get(material.name);
    const index = materials.length;
    materials.push({
      name: material.name,
      pbrMetallicRoughness: {
        baseColorFactor: material.color,
        roughnessFactor: 0.6,
        metallicFactor: 0.15,
      },
    });
    materialIndex.set(material.name, index);
    return index;
  }

  function ensureUnitAccessors(kind) {
    if (unitGeometryAccessors.has(kind)) return unitGeometryAccessors.get(kind);
    const result = geometryAccessors(UNIT_SHAPES.get(kind));
    unitGeometryAccessors.set(kind, result);
    return result;
  }

  function visualNode(visual) {
    const shape =
      visual.kind === "mesh"
        ? geometryAccessors(visual.geometry)
        : ensureUnitAccessors(visual.kind);
    const meshEntryIndex = meshes.length;
    meshes.push({
      name: visual.name,
      primitives: [
        {
          attributes: { POSITION: shape.positionAccessor, NORMAL: shape.normalAccessor },
          indices: shape.indexAccessor,
          material: ensureMaterial(visual.material),
          mode: 4,
        },
      ],
    });
    const index = nodes.length;
    nodes.push({
      name: visual.name,
      mesh: meshEntryIndex,
      translation: visual.pose.translation,
      rotation: visual.pose.rotation,
      scale: visual.scale,
      extras: { role: "visual" },
    });
    return index;
  }

  const jointByChild = new Map(model.joints.map((joint) => [joint.child, joint]));
  const childrenByParent = new Map();
  for (const joint of model.joints) {
    childrenByParent.set(joint.parent, [
      ...(childrenByParent.get(joint.parent) ?? []),
      joint.child,
    ]);
  }

  function linkNode(linkName) {
    const link = model.links.get(linkName);
    const joint = jointByChild.get(linkName);
    const childIndices = link.visuals.map((visual) => visualNode(visual));
    for (const childLink of childrenByParent.get(linkName) ?? []) {
      childIndices.push(linkNode(childLink));
    }
    const index = nodes.length;
    nodes.push({
      name: linkName,
      translation: joint?.origin.translation ?? [0, 0, 0],
      rotation: joint?.origin.rotation ?? [0, 0, 0, 1],
      children: childIndices,
      extras: { role: "link", linkId: linkName },
    });
    return index;
  }

  const rootIndex = linkNode(baseLink);
  const binary = Buffer.concat(binarySegments, binaryLength);
  const document = {
    asset: {
      version: "2.0",
      generator: "LK Design System 3D URDF importer",
      copyright: "CC-BY-4.0 — LK Robotics",
      extras: {
        assetId,
        coordinateSystem: {
          handedness: "right",
          upAxis: "+Z",
          forwardAxis: "+X",
          metersPerUnit: 1,
        },
      },
    },
    scene: 0,
    scenes: [{ name: label, nodes: [rootIndex] }],
    nodes,
    meshes,
    materials,
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

// ---------------------------------------------------------------------------
// Bounds at rest pose
// ---------------------------------------------------------------------------

function computeRestBounds(model, baseLink) {
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  function visit(linkName, worldPose) {
    const link = model.links.get(linkName);
    for (const visual of link.visuals) {
      const visualWorld = composePose(worldPose, visual.pose);
      const geometry = visual.kind === "mesh" ? visual.geometry : UNIT_SHAPES.get(visual.kind);
      for (let offset = 0; offset < geometry.positions.length; offset += 3) {
        const scaled = [
          geometry.positions[offset] * visual.scale[0],
          geometry.positions[offset + 1] * visual.scale[1],
          geometry.positions[offset + 2] * visual.scale[2],
        ];
        const world = addVectors(
          visualWorld.translation,
          rotateVector(visualWorld.rotation, scaled),
        );
        for (let component = 0; component < 3; component += 1) {
          minimum[component] = Math.min(minimum[component], world[component]);
          maximum[component] = Math.max(maximum[component], world[component]);
        }
      }
    }
    for (const joint of model.joints) {
      if (joint.parent !== linkName) continue;
      visit(joint.child, composePose(worldPose, joint.origin));
    }
  }

  visit(baseLink, { translation: [0, 0, 0], rotation: [0, 0, 0, 1] });
  return { min: minimum.map(stableNumber), max: maximum.map(stableNumber) };
}

// ---------------------------------------------------------------------------
// Manifests, provenance, catalog
// ---------------------------------------------------------------------------

function createAssetManifest(assetId, fileFrame, version, bounds, checksum) {
  return {
    schemaVersion: 1,
    assetId,
    version,
    kind: "robot",
    format: "glb",
    fileFrame,
    fileCoordinate: { handedness: "right", upAxis: "+Z", forwardAxis: "+X", metersPerUnit: 1 },
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

function createKinematicsManifest(model, baseLink, assetId, version) {
  return {
    schemaVersion: 1,
    assetId,
    version,
    baseLink,
    links: [...model.links.keys()].map((name) => ({ linkId: name, nodeName: name })),
    joints: model.joints.map((joint) => ({
      jointId: joint.name,
      type: joint.type,
      parentLink: joint.parent,
      childLink: joint.child,
      origin: {
        translation: joint.origin.translation.map(stableNumber),
        rotation: normalizeQuaternion(joint.origin.rotation).map(stableNumber),
      },
      axis: joint.axis,
      limits: joint.limits,
    })),
  };
}

async function updateCatalog(entry) {
  const catalog = JSON.parse(await readFile(CATALOG_PATH, "utf8"));
  const assets = catalog.assets.filter((candidate) => candidate.id !== entry.id);
  assets.push(entry);
  assets.sort((left, right) => left.id.localeCompare(right.id));
  await writeFile(CATALOG_PATH, `${JSON.stringify({ ...catalog, assets }, null, 2)}\n`);
}

// ---------------------------------------------------------------------------
// Self-verification
// ---------------------------------------------------------------------------

function verifyOutputs(glb, assetManifest, kinematicsManifest) {
  const parsedManifest = parseAssetManifest(assetManifest);
  if (!parsedManifest.ok) {
    throw new Error(
      `asset manifest failed validation: ${parsedManifest.issues.map((issue) => issue.code).join(", ")}`,
    );
  }
  const parsedKinematics = parseRobotKinematics(kinematicsManifest);
  if (!parsedKinematics.ok) {
    throw new Error(
      `kinematics manifest failed validation: ${parsedKinematics.issues.map((issue) => issue.code).join(", ")}`,
    );
  }

  if (glb.toString("ascii", 0, 4) !== "glTF" || glb.readUInt32LE(8) !== glb.length) {
    throw new Error("GLB container failed structural verification.");
  }
  const jsonChunkLength = glb.readUInt32LE(12);
  const document = JSON.parse(glb.toString("utf8", 20, 20 + jsonChunkLength));
  const nodeIndexByName = new Map();
  document.nodes.forEach((node, index) => {
    if (node.extras?.role === "link") {
      if (nodeIndexByName.has(node.name)) throw new Error(`duplicate link node ${node.name}.`);
      nodeIndexByName.set(node.name, index);
    }
  });
  for (const link of parsedKinematics.value.links) {
    if (!nodeIndexByName.has(link.nodeName)) {
      throw new Error(`GLB is missing link node ${link.nodeName}.`);
    }
  }
  for (const joint of parsedKinematics.value.joints) {
    const parentNode = document.nodes[nodeIndexByName.get(joint.parentLink)];
    if (!parentNode.children?.includes(nodeIndexByName.get(joint.childLink))) {
      throw new Error(
        `GLB hierarchy does not parent ${joint.childLink} under ${joint.parentLink}.`,
      );
    }
  }
  return { document, jointCount: parsedKinematics.value.joints.length };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function cliOptions(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Invalid argument pair: ${key ?? ""} ${value ?? ""}`);
    }
    options[key.slice(2)] = value;
  }
  if (!options.urdf || !options.slug) {
    throw new Error(
      "Usage: node scripts/import-urdf-robot.mjs --urdf <path> --slug <slug> [--label ...] [--version ...] [--license-holder ...]",
    );
  }
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(options.slug)) {
    throw new Error("slug must be lowercase kebab-case.");
  }
  return options;
}

async function importRobot(options) {
  const warnings = [];
  const report = {
    schemaVersion: 1,
    tool: "scripts/import-urdf-robot.mjs",
    source: { urdf: path.relative(ROOT_DIR, path.resolve(options.urdf)).replaceAll("\\", "/") },
    foldedFixedJoints: [],
    warnings,
  };

  const urdfPath = path.resolve(options.urdf);
  const model = await loadUrdfModel(urdfPath, warnings);
  foldFixedJoints(model, report);
  const baseLink = findBaseLink(model);

  const slug = options.slug;
  const assetId = `robots/${slug}`;
  const fileFrame = assetId;
  const version = options.version ?? "0.1.0";
  const label = options.label ?? model.robotName;
  const holder = options["license-holder"] ?? "LK Robotics";

  const glb = buildGlb(model, baseLink, assetId, label);
  const checksum = createHash("sha256").update(glb).digest("hex");
  const bounds = computeRestBounds(model, baseLink);
  const assetManifest = createAssetManifest(assetId, fileFrame, version, bounds, checksum);
  const kinematicsManifest = createKinematicsManifest(model, baseLink, assetId, version);
  const verification = verifyOutputs(glb, assetManifest, kinematicsManifest);

  const provenance = {
    schemaVersion: 1,
    assetId,
    containsCustomerData: false,
    source: {
      tool: "scripts/import-urdf-robot.mjs",
      urdf: report.source.urdf,
      urdfSha256: createHash("sha256").update(model.urdfText).digest("hex"),
      meshes: model.meshSources,
    },
    derivative: {
      file: `./${slug}.glb`,
      bytes: glb.length,
      sha256: checksum,
      triangles: verification.document.meshes.reduce(
        (total, mesh) =>
          total +
          mesh.primitives.reduce(
            (meshTotal, primitive) =>
              meshTotal + verification.document.accessors[primitive.indices].count / 3,
            0,
          ),
        0,
      ),
    },
    coordinateEvidence: {
      basis: "URDF right-handed Z-up meters (REP-103), identical to the LK core convention",
      upAxis: "+Z",
      forwardAxis: "+X",
      forwardAxisReason:
        "URDF/REP-103 defines +X as the robot's forward axis; the importer preserves it verbatim.",
      floorNormalizationMeters: 0,
    },
    license: {
      spdx: options["license-spdx"] ?? "CC-BY-4.0",
      holder,
      attributionRequired: true,
      authorization: `${holder} authorized importing this URDF source into the shared robots catalog.`,
      attribution: `${label} model © ${holder}.`,
    },
  };

  const catalogEntry = {
    id: assetId,
    label,
    description: `URDF import of ${model.robotName}: ${String(verification.jointCount)} moving joints with a parented link-node hierarchy.`,
    kind: "robot",
    format: "glb",
    file: `./${slug}/${slug}.glb`,
    manifest: `./${slug}/${slug}.asset-manifest.json`,
    kinematics: `./${slug}/${slug}.kinematics.json`,
    provenance: `./${slug}/provenance.json`,
    floorOrigin: Math.abs(bounds.min[2]) < 1e-6,
    coordinateSystem: { handedness: "right", upAxis: "+Z", forwardAxis: "+X", metersPerUnit: 1 },
    boundsInCoreMeters: { frame: CORE_FRAME, min: bounds.min, max: bounds.max },
    integrity: { sha256: checksum },
    license: { spdx: provenance.license.spdx, holder, attributionRequired: true },
  };

  report.result = {
    assetId,
    links: [...model.links.keys()],
    joints: model.joints.map((joint) => joint.name),
    bounds,
    glbBytes: glb.length,
    sha256: checksum,
  };

  const outputDir = path.join(ROBOTS_DIR, slug);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, `${slug}.glb`), glb);
  await writeFile(
    path.join(outputDir, `${slug}.asset-manifest.json`),
    `${JSON.stringify(assetManifest, null, 2)}\n`,
  );
  await writeFile(
    path.join(outputDir, `${slug}.kinematics.json`),
    `${JSON.stringify(kinematicsManifest, null, 2)}\n`,
  );
  await writeFile(
    path.join(outputDir, "provenance.json"),
    `${JSON.stringify(provenance, null, 2)}\n`,
  );
  await writeFile(
    path.join(outputDir, "import-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await updateCatalog(catalogEntry);

  process.stdout.write(
    `${assetId}: ${String(model.links.size)} links, ${String(model.joints.length)} joints, ${String(glb.length)} bytes, sha256=${checksum}\n`,
  );
  for (const warning of warnings) process.stdout.write(`  warning: ${warning}\n`);
}

await importRobot(cliOptions(process.argv.slice(2)));
