import { readFileSync } from "node:fs";

import { Group, PerspectiveCamera, Quaternion, Scene, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { updateOrientationTriadTransform } from "../src/OrientationTriad.js";
import { CORE_TO_THREE_BASIS_QUATERNION } from "../src/coordinates.js";

const sceneCanvasSource = readFileSync(new URL("../src/SceneCanvas.tsx", import.meta.url), "utf8");
const runtimeSource = readFileSync(new URL("../src/runtime.tsx", import.meta.url), "utf8");
const orientationTriadSource = readFileSync(
  new URL("../src/OrientationTriad.tsx", import.meta.url),
  "utf8",
);

describe("SceneCanvas frame contract", () => {
  it("requires one core frame and forwards it to runtime, overlay, and snapshots", () => {
    expect(sceneCanvasSource).toContain("readonly frame: FrameId");
    expect(sceneCanvasSource).toContain("assertValidFrameId(frame)");
    expect(sceneCanvasSource).toContain("frame={frame}");
    expect(sceneCanvasSource).toContain("SceneCanvas.focusBounds");
    expect(sceneCanvasSource).toContain("SceneCanvas.topBounds");
    expect(runtimeSource).toContain("readonly frame: FrameId");
    expect(runtimeSource).toContain("pointerDetail(entityId, event, runtime.frame)");
  });

  it("prevents default context loss and invalidates once WebGL restores", () => {
    expect(sceneCanvasSource).toContain("webglcontextlost");
    expect(sceneCanvasSource).toContain("webglcontextrestored");
    expect(sceneCanvasSource).toContain("event.preventDefault()");
    expect(sceneCanvasSource).toContain("gl.resetState()");
    expect(sceneCanvasSource).toContain("invalidate()");
  });

  it("keeps the camera-fixed triad aligned through the one core-to-Three basis", () => {
    expect(orientationTriadSource).toContain("CORE_TO_THREE_BASIS_QUATERNION");
    expect(sceneCanvasSource.indexOf("<OrientationTriad />")).toBeLessThan(
      sceneCanvasSource.indexOf("<CoreSpace>"),
    );
  });

  it("keeps the camera-fixed triad in the rendered scene graph", () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera(50, 4 / 3, 0.1, 100);
    const triad = new Group();
    const basis = new Quaternion(...CORE_TO_THREE_BASIS_QUATERNION);
    triad.name = "lk-core-orientation-triad";
    scene.add(triad);

    camera.position.set(4, 3, 8);
    camera.lookAt(0, 0, 0);
    updateOrientationTriadTransform(triad, camera, { width: 800, height: 600 }, basis);
    const firstPosition = triad.position.clone();

    expect(camera.parent).toBeNull();
    expect(triad.parent).toBe(scene);
    expect(scene.getObjectByName("lk-core-orientation-triad")).toBe(triad);
    expect(camera.children).not.toContain(triad);
    expect(triad.quaternion.angleTo(basis)).toBeCloseTo(0);

    camera.position.set(-6, 5, 2);
    camera.lookAt(0, 0, 0);
    updateOrientationTriadTransform(triad, camera, { width: 800, height: 600 }, basis);

    const distance = 2;
    const worldPerPixel = (2 * Math.tan(((camera.fov * Math.PI) / 180) * 0.5) * distance) / 600;
    const expectedCameraOffset = new Vector3(
      (800 / 2 - 58) * worldPerPixel,
      (-600 / 2 + 58) * worldPerPixel,
      -distance,
    );

    expect(triad.parent).toBe(scene);
    expect(triad.position.distanceTo(firstPosition)).toBeGreaterThan(0);
    expect(
      camera.worldToLocal(triad.position.clone()).distanceTo(expectedCameraOffset),
    ).toBeLessThan(0.000_001);
  });
});
