export type SceneCameraKeyboardCommand =
  | { readonly kind: "preset"; readonly mode: "home" | "top" | "focus" }
  | { readonly kind: "orbit"; readonly horizontal: -1 | 0 | 1; readonly vertical: -1 | 0 | 1 }
  | { readonly kind: "pan"; readonly horizontal: -1 | 0 | 1; readonly vertical: -1 | 0 | 1 }
  | { readonly kind: "zoom"; readonly direction: "in" | "out" };

export interface SceneCameraKeyInput {
  readonly key: string;
  readonly shiftKey?: boolean;
  readonly altKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly isComposing?: boolean;
}

export interface SceneCameraKeyboardEventInput extends SceneCameraKeyInput {
  readonly defaultPrevented?: boolean;
  readonly target: EventTarget | null;
  readonly currentTarget: EventTarget | null;
  readonly activeElement: Element | null;
  readonly enableOrbit: boolean;
}

export const SCENE_CANVAS_KEYBOARD_INSTRUCTIONS =
  "Camera keys: Home resets the view, T shows Top, F focuses the target, arrow keys orbit, Shift plus arrow keys pans, and plus, minus, Page Up, or Page Down zooms.";

export const SCENE_CANVAS_PRESET_KEY_SHORTCUTS = "Home T F";
export const SCENE_CANVAS_ORBIT_KEY_SHORTCUTS =
  "ArrowLeft ArrowRight ArrowUp ArrowDown Shift+ArrowLeft Shift+ArrowRight Shift+ArrowUp Shift+ArrowDown PageUp PageDown";

/** Resolves only camera commands; callers retain ownership of DOM help and controls. */
export function resolveSceneCameraKey(
  input: SceneCameraKeyInput,
): SceneCameraKeyboardCommand | null {
  if (
    input.isComposing === true ||
    input.altKey === true ||
    input.ctrlKey === true ||
    input.metaKey === true
  ) {
    return null;
  }

  const key = input.key.toLowerCase();
  if (key === "home") return { kind: "preset", mode: "home" };
  if (key === "t") return { kind: "preset", mode: "top" };
  if (key === "f") return { kind: "preset", mode: "focus" };
  if (key === "+" || key === "=" || key === "pageup") {
    return { kind: "zoom", direction: "in" };
  }
  if (key === "-" || key === "_" || key === "pagedown") {
    return { kind: "zoom", direction: "out" };
  }

  const direction =
    key === "arrowleft"
      ? ({ horizontal: -1, vertical: 0 } as const)
      : key === "arrowright"
        ? ({ horizontal: 1, vertical: 0 } as const)
        : key === "arrowup"
          ? ({ horizontal: 0, vertical: 1 } as const)
          : key === "arrowdown"
            ? ({ horizontal: 0, vertical: -1 } as const)
            : null;
  if (direction === null) return null;
  return input.shiftKey === true ? { kind: "pan", ...direction } : { kind: "orbit", ...direction };
}

export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  return closestKeyboardTarget(
    target,
    "input, textarea, select, [contenteditable]:not([contenteditable='false'])",
  );
}

/** Interactive descendants retain their native/app-owned keyboard behavior. */
export function isInteractiveKeyboardTarget(target: EventTarget | null): boolean {
  return closestKeyboardTarget(
    target,
    [
      "button",
      "a[href]",
      "area[href]",
      "input",
      "select",
      "textarea",
      "summary",
      "iframe",
      "[contenteditable]:not([contenteditable='false'])",
      "[role='button']",
      "[role='checkbox']",
      "[role='combobox']",
      "[role='link']",
      "[role='listbox']",
      "[role='menu']",
      "[role='menuitem']",
      "[role='menuitemcheckbox']",
      "[role='menuitemradio']",
      "[role='option']",
      "[role='radio']",
      "[role='slider']",
      "[role='spinbutton']",
      "[role='switch']",
      "[role='tab']",
      "[role='toolbar']",
      "[role='tree']",
      "[role='treeitem']",
    ].join(", "),
  );
}

/**
 * Applies the DOM ownership and feature gates before a camera key is consumed.
 * The host itself normally owns focus; a focusable WebGL canvas is also allowed.
 */
export function resolveSceneCameraKeyboardEvent(
  input: SceneCameraKeyboardEventInput,
): SceneCameraKeyboardCommand | null {
  if (
    input.defaultPrevented === true ||
    input.target === null ||
    input.activeElement !== input.target ||
    !isSceneKeyboardOwner(input.target, input.currentTarget) ||
    isInteractiveKeyboardTarget(input.target)
  ) {
    return null;
  }
  const command = resolveSceneCameraKey(input);
  if (command === null || (!input.enableOrbit && command.kind !== "preset")) return null;
  return command;
}

interface ClosestTarget {
  readonly closest: (selectors: string) => Element | null;
}

interface ContainingTarget {
  readonly contains: (other: Node | null) => boolean;
}

function closestKeyboardTarget(target: EventTarget | null, selectors: string): boolean {
  if (target === null || !("closest" in target)) return false;
  const candidate = target as EventTarget & Partial<ClosestTarget>;
  return typeof candidate.closest === "function" && candidate.closest(selectors) !== null;
}

function isSceneKeyboardOwner(target: EventTarget, currentTarget: EventTarget | null): boolean {
  if (currentTarget === null) return false;
  if (target === currentTarget) return true;
  if (!("tagName" in target) || String(target.tagName).toLowerCase() !== "canvas") return false;
  if (!("contains" in currentTarget)) return false;
  const container = currentTarget as EventTarget & Partial<ContainingTarget>;
  return typeof container.contains === "function" && container.contains(target as unknown as Node);
}
