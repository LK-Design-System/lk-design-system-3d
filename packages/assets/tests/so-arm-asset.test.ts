import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { computeJointPoses, parseAssetManifest, parseRobotKinematics } from "../src/index.js";

const assetUrl = new URL("../robots/so-arm/so-arm.glb", import.meta.url);
const manifestUrl = new URL("../robots/so-arm/so-arm.asset-manifest.json", import.meta.url);
const kinematicsUrl = new URL("../robots/so-arm/so-arm.kinematics.json", import.meta.url);
const provenanceUrl = new URL("../robots/so-arm/provenance.json", import.meta.url);
const catalogUrl = new URL("../robots/catalog.json", import.meta.url);

interface GltfNode {
  readonly name?: string;
  readonly children?: readonly number[];
  readonly mesh?: number;
}

function readJson(url: URL): unknown {
  return JSON.parse(readFileSync(url, "utf8")) as unknown;
}

function readGltfDocument(): { readonly nodes: readonly GltfNode[] } {
  const bytes = readFileSync(assetUrl);
  const jsonChunkLength = bytes.readUInt32LE(12);
  return JSON.parse(bytes.toString("utf8", 20, 20 + jsonChunkLength)) as {
    readonly nodes: readonly GltfNode[];
  };
}

describe("packaged SO-ARM robot asset", () => {
  it("ships a valid manifest whose integrity digest matches the GLB", () => {
    const parsed = parseAssetManifest(readJson(manifestUrl));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const digest = createHash("sha256").update(readFileSync(assetUrl)).digest("hex");
    expect(digest).toBe(parsed.value.integrity?.sha256);
    expect(parsed.value.fileCoordinate).toEqual({
      handedness: "right",
      upAxis: "+Z",
      forwardAxis: "+X",
      metersPerUnit: 1,
    });
    expect(parsed.value.boundsInCoreMeters.min[2]).toBe(0);
  });

  it("ships valid kinematics whose links map to unique GLB nodes in parent order", () => {
    const parsed = parseRobotKinematics(readJson(kinematicsUrl));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const document = readGltfDocument();
    const nodeIndexByName = new Map<string, number>();
    document.nodes.forEach((node, index) => {
      if (node.name !== undefined && !node.name.includes("/")) {
        expect(nodeIndexByName.has(node.name)).toBe(false);
        nodeIndexByName.set(node.name, index);
      }
    });
    for (const link of parsed.value.links) {
      expect(nodeIndexByName.has(link.nodeName)).toBe(true);
    }

    for (const joint of parsed.value.joints) {
      const parentNodeName = parsed.value.links.find(
        (link) => link.linkId === joint.parentLink,
      )?.nodeName;
      const childNodeName = parsed.value.links.find(
        (link) => link.linkId === joint.childLink,
      )?.nodeName;
      expect(parentNodeName).toBeDefined();
      expect(childNodeName).toBeDefined();
      if (parentNodeName === undefined || childNodeName === undefined) continue;
      const parentNode = document.nodes[nodeIndexByName.get(parentNodeName) ?? -1];
      expect(parentNode?.children).toContain(nodeIndexByName.get(childNodeName));
    }
  });

  it("poses every joint at rest and at both declared limits without throwing", () => {
    const parsed = parseRobotKinematics(readJson(kinematicsUrl));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(computeJointPoses(parsed.value)).toHaveLength(parsed.value.joints.length);
    const lower = Object.fromEntries(
      parsed.value.joints.map((joint) => [joint.jointId, joint.limits.lower]),
    );
    const upper = Object.fromEntries(
      parsed.value.joints.map((joint) => [joint.jointId, joint.limits.upper]),
    );
    expect(computeJointPoses(parsed.value, lower)).toHaveLength(parsed.value.joints.length);
    expect(computeJointPoses(parsed.value, upper)).toHaveLength(parsed.value.joints.length);
  });

  it("keeps provenance and the robots catalog entry in sync with the GLB", () => {
    const provenance = readJson(provenanceUrl) as {
      readonly assetId: string;
      readonly derivative: { readonly sha256: string };
      readonly license: { readonly spdx: string };
    };
    const catalog = readJson(catalogUrl) as {
      readonly assets: readonly {
        readonly id: string;
        readonly kinematics?: string;
        readonly integrity: { readonly sha256: string };
      }[];
    };
    const digest = createHash("sha256").update(readFileSync(assetUrl)).digest("hex");

    expect(provenance.assetId).toBe("robots/so-arm");
    expect(provenance.derivative.sha256).toBe(digest);
    expect(provenance.license.spdx).toBe("CC-BY-4.0");
    const entry = catalog.assets.find((candidate) => candidate.id === "robots/so-arm");
    expect(entry?.integrity.sha256).toBe(digest);
    expect(entry?.kinematics).toBe("./so-arm/so-arm.kinematics.json");
  });
});
