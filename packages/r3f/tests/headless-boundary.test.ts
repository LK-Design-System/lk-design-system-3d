import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const sceneCanvasSource = readFileSync(new URL("../src/SceneCanvas.tsx", import.meta.url), "utf8");
const pointCloudSource = readFileSync(new URL("../src/pointcloud.tsx", import.meta.url), "utf8");

describe("SceneCanvas headless application-chrome boundary", () => {
  it("does not render renderer-owned interactive DOM controls", () => {
    expect(sceneCanvasSource).not.toMatch(/<button\b/u);
    expect(sceneCanvasSource).not.toContain("showDefaultToolbar");
    expect(sceneCanvasSource).not.toMatch(/\bonClick=/u);
  });

  it("does not couple the renderer host to LDS DOM components", () => {
    expect(sceneCanvasSource).not.toContain("@lk-robotics/design-system-core");
  });

  it("keeps PointCloudLayer free of LDS chrome and product interaction", () => {
    expect(pointCloudSource).not.toContain("@lk-robotics/design-system-core");
    expect(pointCloudSource).not.toMatch(/<button\b/u);
    expect(pointCloudSource).not.toMatch(/\bonClick=/u);
    expect(pointCloudSource).not.toContain("PointCloud2");
    expect(pointCloudSource).not.toContain("PCD");
  });
});
