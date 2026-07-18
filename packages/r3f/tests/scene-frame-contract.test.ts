import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const sceneCanvasSource = readFileSync(new URL("../src/SceneCanvas.tsx", import.meta.url), "utf8");
const runtimeSource = readFileSync(new URL("../src/runtime.tsx", import.meta.url), "utf8");

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
});
