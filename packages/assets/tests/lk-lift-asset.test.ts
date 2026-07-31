import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { computeJointPoses, parseAssetManifest, parseRobotKinematics } from "../src/index.js";

const assetUrl = new URL("../robots/lk-lift/lk-lift.glb", import.meta.url);
const manifestUrl = new URL("../robots/lk-lift/lk-lift.asset-manifest.json", import.meta.url);
const kinematicsUrl = new URL("../robots/lk-lift/lk-lift.kinematics.json", import.meta.url);
const reportUrl = new URL("../robots/lk-lift/import-report.json", import.meta.url);
const catalogUrl = new URL("../robots/catalog.json", import.meta.url);

interface GltfNode {
  readonly name?: string;
  readonly children?: readonly number[];
  readonly mesh?: number;
  readonly extras?: { readonly role?: string };
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

describe("URDF-imported LK Lift asset", () => {
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

  it("imports the URDF joint chain and folds the fixed sensor mount", () => {
    const parsed = parseRobotKinematics(readJson(kinematicsUrl));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.value.links.map((link) => link.linkId)).toEqual(["base_link", "mast", "boom"]);
    expect(parsed.value.joints.map((joint) => `${joint.jointId}:${joint.type}`)).toEqual([
      "lift_z:prismatic",
      "boom_yaw:revolute",
    ]);

    const report = readJson(reportUrl) as {
      readonly foldedFixedJoints: readonly { readonly joint: string; readonly into: string }[];
    };
    expect(report.foldedFixedJoints).toEqual([
      { joint: "sensor_mount", child: "sensor", into: "boom" },
    ]);
  });

  it("parents every kinematics link to a matching GLB node with folded visuals", () => {
    const parsed = parseRobotKinematics(readJson(kinematicsUrl));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const document = readGltfDocument();
    const nodeIndexByName = new Map<string, number>();
    document.nodes.forEach((node, index) => {
      if (node.extras?.role === "link" && node.name !== undefined) {
        nodeIndexByName.set(node.name, index);
      }
    });
    for (const joint of parsed.value.joints) {
      const parentNode = document.nodes[nodeIndexByName.get(joint.parentLink) ?? -1];
      expect(parentNode?.children).toContain(nodeIndexByName.get(joint.childLink));
    }

    const boom = document.nodes[nodeIndexByName.get("boom") ?? -1];
    const boomVisualNames = (boom?.children ?? [])
      .map((index) => document.nodes[index]?.name ?? "")
      .filter((name) => name.includes("visual"));
    expect(boomVisualNames.some((name) => name.startsWith("sensor/"))).toBe(true);
  });

  it("poses both joints across their limits and stays registered in the catalog", () => {
    const parsed = parseRobotKinematics(readJson(kinematicsUrl));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(computeJointPoses(parsed.value, { lift_z: 1.2, boom_yaw: -1.7 })).toHaveLength(2);
    const lifted = computeJointPoses(parsed.value, { lift_z: 0.8 });
    expect(lifted[0]?.translation[2]).toBeCloseTo(0.9, 12);

    const catalog = readJson(catalogUrl) as {
      readonly assets: readonly {
        readonly id: string;
        readonly integrity: { readonly sha256: string };
      }[];
    };
    const digest = createHash("sha256").update(readFileSync(assetUrl)).digest("hex");
    expect(
      catalog.assets.find((candidate) => candidate.id === "robots/lk-lift")?.integrity.sha256,
    ).toBe(digest);
  });
});
