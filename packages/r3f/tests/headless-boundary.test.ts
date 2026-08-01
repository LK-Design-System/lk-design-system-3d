import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const sceneCanvasSource = readFileSync(new URL("../src/SceneCanvas.tsx", import.meta.url), "utf8");
const cameraRigSource = readFileSync(new URL("../src/CameraRig.tsx", import.meta.url), "utf8");
const orientationTriadSource = readFileSync(
  new URL("../src/OrientationTriad.tsx", import.meta.url),
  "utf8",
);
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
    expect(sceneCanvasSource).not.toContain("@lk-design-system/design-system-core");
  });

  it("keeps the persistent orientation aid inside WebGL", () => {
    expect(sceneCanvasSource).toContain("<OrientationTriad />");
    expect(orientationTriadSource).not.toContain("@lk-design-system/design-system-core");
    expect(orientationTriadSource).not.toMatch(/<(?:div|button|span)\b/u);
    expect(orientationTriadSource).toContain('label="X"');
    expect(orientationTriadSource).toContain('label="Y"');
    expect(orientationTriadSource).toContain('label="Z"');
  });

  it("makes the host one documented, visibly focusable camera surface", () => {
    expect(sceneCanvasSource).toContain("tabIndex={0}");
    expect(sceneCanvasSource).toContain("aria-keyshortcuts");
    expect(sceneCanvasSource).toContain("aria-describedby={describedBy}");
    expect(sceneCanvasSource).toContain("keyboardInstructionsId");
    expect(sceneCanvasSource).toContain("ariaDescribedBy");
    expect(sceneCanvasSource).toContain("resolveSceneCameraKeyboardEvent");
    expect(sceneCanvasSource).toContain("event.defaultPrevented");
    expect(sceneCanvasSource).toContain("ownerDocument.activeElement");
    expect(sceneCanvasSource).toContain("event.nativeEvent.isComposing");
    expect(sceneCanvasSource).toContain("outline: hostFocused");
  });

  it("distinguishes keyboard camera changes from OrbitControls user input", () => {
    expect(cameraRigSource).toContain("useRef<number | undefined>(undefined)");
    expect(cameraRigSource).toContain('onManualControl?.("keyboard")');
    expect(cameraRigSource).toContain('onManualControl?.("user")');
    expect(sceneCanvasSource).toContain('onCameraModeChange?.("free", source)');
  });

  it("keeps PointCloudLayer free of LDS chrome and product interaction", () => {
    expect(pointCloudSource).not.toContain("@lk-design-system/design-system-core");
    expect(pointCloudSource).not.toMatch(/<button\b/u);
    expect(pointCloudSource).not.toMatch(/\bonClick=/u);
    expect(pointCloudSource).not.toContain("PointCloud2");
    expect(pointCloudSource).not.toContain("PCD");
  });

  it("keeps section and edit-volume primitives free of destructive workflow policy", () => {
    expect(primitivesSource).not.toContain("@lk-design-system/design-system-core");
    expect(primitivesSource).not.toMatch(/<button\b/u);
    expect(primitivesSource).not.toContain("applyPCDManualEdit");
    expect(primitivesSource).not.toContain("removed_points");
    expect(primitivesSource).not.toContain("undoStack");
  });

  it("keeps spatial structure and transform authoring free of LDS DOM and product persistence", () => {
    expect(spatialStructureSource).not.toContain("@lk-design-system/design-system-core");
    expect(spatialStructureSource).not.toMatch(/<button\b/u);
    expect(spatialStructureSource).not.toContain("SiteAuthoringDraft");
    expect(spatialStructureSource).not.toContain("saveDraft");
    expect(spatialStructureSource).not.toContain("undoStack");
    expect(spatialStructureSource).not.toContain("wallSegments");
  });

  it("keeps occupancy rendering free of PGM parsing, product editing, and LDS DOM", () => {
    expect(occupancyGridSource).not.toContain("@lk-design-system/design-system-core");
    expect(occupancyGridSource).not.toMatch(/<button\b/u);
    expect(occupancyGridSource).not.toContain("parsePgm");
    expect(occupancyGridSource).not.toContain("uploadMapFile");
    expect(occupancyGridSource).not.toContain("undoStack");
  });
});
