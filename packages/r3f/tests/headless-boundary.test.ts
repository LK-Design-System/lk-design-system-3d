import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const sceneCanvasSource = readFileSync(new URL("../src/SceneCanvas.tsx", import.meta.url), "utf8");
const pointCloudSource = readFileSync(new URL("../src/pointcloud.tsx", import.meta.url), "utf8");
const primitivesSource = readFileSync(new URL("../src/primitives.tsx", import.meta.url), "utf8");
const spatialStructureSource = readFileSync(
  new URL("../src/spatial-structure.tsx", import.meta.url),
  "utf8",
);
const occupancyGridSource = readFileSync(
  new URL("../src/occupancy-grid.tsx", import.meta.url),
  "utf8",
);

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

  it("keeps section and edit-volume primitives free of destructive workflow policy", () => {
    expect(primitivesSource).not.toContain("@lk-robotics/design-system-core");
    expect(primitivesSource).not.toMatch(/<button\b/u);
    expect(primitivesSource).not.toContain("applyPCDManualEdit");
    expect(primitivesSource).not.toContain("removed_points");
    expect(primitivesSource).not.toContain("undoStack");
  });

  it("keeps spatial structure and transform authoring free of LDS DOM and product persistence", () => {
    expect(spatialStructureSource).not.toContain("@lk-robotics/design-system-core");
    expect(spatialStructureSource).not.toMatch(/<button\b/u);
    expect(spatialStructureSource).not.toContain("SiteAuthoringDraft");
    expect(spatialStructureSource).not.toContain("saveDraft");
    expect(spatialStructureSource).not.toContain("undoStack");
    expect(spatialStructureSource).not.toContain("wallSegments");
  });

  it("keeps occupancy rendering free of PGM parsing, product editing, and LDS DOM", () => {
    expect(occupancyGridSource).not.toContain("@lk-robotics/design-system-core");
    expect(occupancyGridSource).not.toMatch(/<button\b/u);
    expect(occupancyGridSource).not.toContain("parsePgm");
    expect(occupancyGridSource).not.toContain("uploadMapFile");
    expect(occupancyGridSource).not.toContain("undoStack");
  });
});
