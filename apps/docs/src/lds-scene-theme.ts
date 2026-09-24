import { useEffect, useState } from "react";
import type { SceneThemeCustomization } from "@lk-design-system/lds-3d-r3f";

/**
 * Composition-layer resolver: LDS semantic roles → LDS3D scene theme.
 *
 * The renderer packages never read CSS (AGENTS.md dependency boundary). A
 * product or this docs app resolves the LDS roles that mean the same thing in
 * the scene, and passes plain colour strings through `themeCustomization`.
 * Natural surfaces (sky, terrain, vegetation) have no LDS UI role and keep the
 * LDS3D defaults (GUNGNEUNG_3D_GAP_PLAN.md G6 decision, 2026-09-25).
 *
 * Each role is read through `var()` on a probe element, so the browser
 * resolves the active theme (light, dark, auto) and the conformance scan sees
 * every LDS token this file depends on.
 */
const ROLE_PROBES = Object.freeze({
  text: "var(--color-semantic-label-strong)",
  surface: "var(--color-semantic-background-normal-normal)",
  line: "var(--color-semantic-line-solid-normal)",
  primary: "var(--color-semantic-primary-normal)",
  negative: "var(--color-semantic-status-negative-foreground)",
});
const FONT_PROBE = "var(--font-sans)";

type Role = keyof typeof ROLE_PROBES;

export function readLdsSceneThemeCustomization(
  host: HTMLElement = document.body,
): SceneThemeCustomization {
  const probe = host.ownerDocument.createElement("span");
  probe.setAttribute("aria-hidden", "true");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  host.appendChild(probe);
  try {
    const resolved = {} as Record<Role, string>;
    for (const [role, expression] of Object.entries(ROLE_PROBES) as [Role, string][]) {
      probe.style.color = expression;
      resolved[role] = getComputedStyle(probe).color;
    }
    probe.style.fontFamily = FONT_PROBE;
    const fontFamily = getComputedStyle(probe).fontFamily;
    return {
      materials: {
        selection: resolved.primary,
        error: resolved.negative,
        text: resolved.text,
        panel: resolved.surface,
        panelBorder: resolved.line,
      },
      labels: {
        text: resolved.text,
        background: resolved.surface,
        border: resolved.line,
        accent: resolved.primary,
        ...(fontFamily === "" ? {} : { fontFamily }),
      },
    };
  } finally {
    probe.remove();
  }
}

/** Re-resolves when LDS switches theme (`data-theme`) or the OS colour scheme changes. */
export function useLdsSceneThemeCustomization(): SceneThemeCustomization | undefined {
  const [customization, setCustomization] = useState<SceneThemeCustomization>();
  useEffect(() => {
    const update = (): void => setCustomization(readLdsSceneThemeCustomization());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "class"],
    });
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", update);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", update);
    };
  }, []);
  return customization;
}
