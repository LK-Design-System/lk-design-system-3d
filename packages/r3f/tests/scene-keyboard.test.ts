import { describe, expect, it } from "vitest";

import {
  SCENE_CANVAS_KEYBOARD_INSTRUCTIONS,
  SCENE_CANVAS_ORBIT_KEY_SHORTCUTS,
  SCENE_CANVAS_PRESET_KEY_SHORTCUTS,
  isEditableKeyboardTarget,
  isInteractiveKeyboardTarget,
  resolveSceneCameraKey,
  resolveSceneCameraKeyboardEvent,
} from "../src/scene-keyboard.js";

interface KeyboardTargetStub extends EventTarget {
  readonly tagName?: string;
  readonly closest?: (selectors: string) => Element | null;
  readonly contains?: (other: Node | null) => boolean;
}

function targetStub(options: { readonly tagName?: string; readonly matches?: string } = {}) {
  const target: KeyboardTargetStub = {
    ...(options.tagName === undefined ? {} : { tagName: options.tagName }),
    closest(selectors): Element | null {
      return options.matches !== undefined && selectors.includes(options.matches)
        ? (target as unknown as Element)
        : null;
    },
    contains(other): boolean {
      return other === (target as unknown as Node);
    },
  } as KeyboardTargetStub;
  return target;
}

function resolveEvent(
  target: EventTarget,
  currentTarget: EventTarget,
  overrides: Partial<Parameters<typeof resolveSceneCameraKeyboardEvent>[0]> = {},
) {
  return resolveSceneCameraKeyboardEvent({
    key: "Home",
    target,
    currentTarget,
    activeElement: target as Element,
    enableOrbit: true,
    ...overrides,
  });
}

describe("SceneCanvas camera keyboard contract", () => {
  it.each([
    ["Home", { kind: "preset", mode: "home" }],
    ["t", { kind: "preset", mode: "top" }],
    ["F", { kind: "preset", mode: "focus" }],
    ["ArrowLeft", { kind: "orbit", horizontal: -1, vertical: 0 }],
    ["ArrowUp", { kind: "orbit", horizontal: 0, vertical: 1 }],
    ["+", { kind: "zoom", direction: "in" }],
    ["PageDown", { kind: "zoom", direction: "out" }],
  ] as const)("maps %s to a camera command", (key, expected) => {
    expect(resolveSceneCameraKey({ key })).toEqual(expected);
  });

  it("maps shifted arrows to pan without changing their screen direction", () => {
    expect(resolveSceneCameraKey({ key: "ArrowRight", shiftKey: true })).toEqual({
      kind: "pan",
      horizontal: 1,
      vertical: 0,
    });
  });

  it("ignores composition and modified shortcuts", () => {
    expect(resolveSceneCameraKey({ key: "ArrowLeft", isComposing: true })).toBeNull();
    expect(resolveSceneCameraKey({ key: "f", ctrlKey: true })).toBeNull();
    expect(resolveSceneCameraKey({ key: "t", metaKey: true })).toBeNull();
    expect(resolveSceneCameraKey({ key: "x" })).toBeNull();
  });

  it("is safe at the headless DOM boundary and documents every command family", () => {
    expect(isEditableKeyboardTarget(null)).toBe(false);
    expect(SCENE_CANVAS_KEYBOARD_INSTRUCTIONS).toMatch(/Home/u);
    expect(SCENE_CANVAS_KEYBOARD_INSTRUCTIONS).toMatch(/arrow keys orbit/u);
    expect(SCENE_CANVAS_KEYBOARD_INSTRUCTIONS).toMatch(/pan/u);
    expect(SCENE_CANVAS_KEYBOARD_INSTRUCTIONS).toMatch(/zoom/u);
    expect(SCENE_CANVAS_KEYBOARD_INSTRUCTIONS).toMatch(/Page Up/u);
  });

  it("handles camera keys only when the scene host or its canvas owns focus", () => {
    const host = targetStub();
    const canvas = targetStub({ tagName: "CANVAS" });
    const container = targetStub();
    Object.defineProperty(container, "contains", {
      value: (other: Node | null) => other === canvas,
    });

    expect(resolveEvent(host, host)).toEqual({ kind: "preset", mode: "home" });
    expect(resolveEvent(canvas, container)).toEqual({ kind: "preset", mode: "home" });
    expect(resolveEvent(host, host, { activeElement: null })).toBeNull();
    expect(resolveEvent(targetStub(), host)).toBeNull();
  });

  it("preserves already-handled and interactive descendant keyboard behavior", () => {
    const host = targetStub();
    const button = targetStub({ tagName: "BUTTON", matches: "button" });
    const toolbar = targetStub({ matches: "[role='toolbar']" });

    expect(isInteractiveKeyboardTarget(button)).toBe(true);
    expect(isInteractiveKeyboardTarget(toolbar)).toBe(true);
    expect(resolveEvent(host, host, { defaultPrevented: true })).toBeNull();
    expect(resolveEvent(button, host)).toBeNull();
    expect(resolveEvent(toolbar, host)).toBeNull();
  });

  it("keeps preset keys but does not advertise or consume navigation when orbit is disabled", () => {
    const host = targetStub();

    expect(resolveEvent(host, host, { enableOrbit: false })).toEqual({
      kind: "preset",
      mode: "home",
    });
    expect(resolveEvent(host, host, { key: "ArrowLeft", enableOrbit: false })).toBeNull();
    expect(resolveEvent(host, host, { key: "PageUp", enableOrbit: false })).toBeNull();
    expect(SCENE_CANVAS_PRESET_KEY_SHORTCUTS).toBe("Home T F");
    expect(SCENE_CANVAS_ORBIT_KEY_SHORTCUTS).toContain("PageUp PageDown");
    expect(SCENE_CANVAS_ORBIT_KEY_SHORTCUTS.split(" ")).not.toContain("+");
    expect(SCENE_CANVAS_ORBIT_KEY_SHORTCUTS.split(" ")).not.toContain("-");
  });
});
