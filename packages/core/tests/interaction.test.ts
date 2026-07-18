import { describe, expect, it } from "vitest";

import {
  FrameMismatchError,
  createCameraState,
  createPickRay,
  frameId,
  intersectRayWithPlane,
} from "../src/index.js";

const MAP = frameId("map");
const CAMERA = createCameraState({
  frame: MAP,
  position: [0, 0, 10],
  target: [0, 0, 0],
  up: [0, 1, 0],
  projection: {
    kind: "perspective",
    verticalFovRadians: Math.PI / 2,
    aspect: 1,
    nearMeters: 0.1,
    farMeters: 100,
  },
});

const CENTER_REQUEST = {
  viewportPoint: { xCssPixels: 100, yCssPixels: 100 },
  viewport: { widthCssPixels: 200, heightCssPixels: 200, devicePixelRatio: 2 },
} as const;

describe("pure picking geometry", () => {
  it("maps CSS-pixel viewport center to a normalized core-frame perspective ray", () => {
    const ray = createPickRay(CAMERA, CENTER_REQUEST);

    expect(ray.frame).toBe(MAP);
    expect(ray.origin).toEqual([0, 0, 10]);
    expect(ray.direction[0]).toBeCloseTo(0, 12);
    expect(ray.direction[1]).toBeCloseTo(0, 12);
    expect(ray.direction[2]).toBeCloseTo(-1, 12);
  });

  it("intersects a forward core-frame floor plane and rejects a behind-camera hit", () => {
    const ray = createPickRay(CAMERA, CENTER_REQUEST);
    const floor = { frame: MAP, point: [0, 0, 0] as const, normal: [0, 0, 1] as const };

    expect(intersectRayWithPlane(ray, floor)).toEqual({ frame: MAP, value: [0, 0, 0] });
    expect(
      intersectRayWithPlane(ray, { frame: MAP, point: [0, 0, 20], normal: [0, 0, 1] }),
    ).toBeUndefined();
  });

  it("moves an orthographic ray origin by CSS-pixel position without applying DPR twice", () => {
    const camera = createCameraState({
      ...CAMERA,
      projection: {
        kind: "orthographic",
        verticalSizeMeters: 20,
        aspect: 2,
        nearMeters: 0.1,
        farMeters: 100,
      },
    });
    const ray = createPickRay(camera, {
      viewportPoint: { xCssPixels: 0, yCssPixels: 0 },
      viewport: { widthCssPixels: 200, heightCssPixels: 100, devicePixelRatio: 3 },
    });

    expect(ray.origin).toEqual([-20, 10, 10]);
    expect(ray.direction).toEqual([0, 0, -1]);
  });

  it("returns no hit for a parallel plane and rejects frame mismatches", () => {
    const ray = createPickRay(CAMERA, CENTER_REQUEST);
    expect(
      intersectRayWithPlane(ray, { frame: MAP, point: [0, 0, 0], normal: [1, 0, 0] }),
    ).toBeUndefined();
    expect(() =>
      intersectRayWithPlane(ray, {
        frame: frameId("odom"),
        point: [0, 0, 0],
        normal: [0, 0, 1],
      }),
    ).toThrow(FrameMismatchError);
  });
});
