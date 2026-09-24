import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import {
  layoutScreenLabels,
  type ScreenLabelAnchor,
  type ScreenLabelCandidate,
  type ScreenLabelHiddenReason,
  type Vec3,
} from "@lk-design-system/lds-3d-core";

import { coreToThreePosition } from "./coordinates.js";
import { resolveSceneLabelTokens, type SceneLabelTokens, type SceneVisualTheme } from "./themes.js";

export interface SceneLabel {
  readonly id: string;
  readonly text: string;
  /** Anchor in the canvas core frame. */
  readonly position: Vec3;
  /** Higher wins a collision. Default 0. */
  readonly priority?: number;
  /** Hidden beyond this camera distance unless selected. */
  readonly maxDistanceMeters?: number;
  readonly selected?: boolean;
  /** Overrides the estimated box width, in CSS pixels. */
  readonly widthPx?: number;
}

export interface PlacedSceneLabel {
  readonly label: SceneLabel;
  /** Top-left of the label box, in CSS pixels relative to the canvas. */
  readonly x: number;
  readonly y: number;
  readonly widthPx: number;
  readonly heightPx: number;
}

export interface SceneLabelLayout {
  readonly placed: readonly PlacedSceneLabel[];
  readonly hidden: readonly { readonly id: string; readonly reason: ScreenLabelHiddenReason }[];
}

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/u;

/**
 * Estimated label box width. Hangul and other full-width glyphs are close to
 * one em; Latin text averages about 0.6 em. Pass `widthPx` on a label when an
 * exact measurement is available.
 */
export function estimateSceneLabelWidthPx(text: string, tokens: SceneLabelTokens): number {
  let ems = 0;
  for (const character of text) ems += HANGUL.test(character) ? 1 : 0.6;
  return Math.ceil(ems * tokens.fontSizePx + tokens.paddingXPx * 2);
}

export interface SceneLabelProjectorProps {
  readonly labels: readonly SceneLabel[];
  readonly theme: SceneVisualTheme;
  /** Called whenever the visible set or a position changes. */
  readonly onLayout: (layout: SceneLabelLayout) => void;
  readonly anchor?: ScreenLabelAnchor;
  readonly paddingPx?: number;
  readonly maxVisible?: number;
}

function layoutKey(layout: SceneLabelLayout): string {
  return layout.placed
    .map(
      (entry) =>
        `${entry.label.id}@${Math.round(entry.x).toString()},${Math.round(entry.y).toString()}`,
    )
    .join("|");
}

/**
 * Projects label anchors every frame and places them with the core
 * `layoutScreenLabels` rules. Renders nothing inside the canvas: the result
 * goes to `onLayout`, and the composition layer draws the labels in the
 * SceneCanvas overlay (for example with `SceneLabelOverlay`).
 */
export function SceneLabelProjector({
  labels,
  theme,
  onLayout,
  anchor,
  paddingPx,
  maxVisible,
}: SceneLabelProjectorProps): null {
  const { camera, size } = useThree();
  const tokens = resolveSceneLabelTokens(theme);
  const heightPx = tokens.lineHeightPx + tokens.paddingYPx * 2;
  const anchors = useMemo(
    () =>
      labels.map((label) => {
        const three = coreToThreePosition(label.position);
        return new Vector3(three[0], three[1], three[2]);
      }),
    [labels],
  );
  const widths = useMemo(
    () => labels.map((label) => label.widthPx ?? estimateSceneLabelWidthPx(label.text, tokens)),
    [labels, tokens],
  );
  const lastKey = useRef<string | undefined>(undefined);
  useEffect(() => {
    lastKey.current = undefined;
  }, [labels, size.width, size.height]);
  const projected = useMemo(() => new Vector3(), []);

  useFrame(() => {
    if (size.width <= 0 || size.height <= 0) return;
    const candidates: ScreenLabelCandidate[] = labels.map((label, index) => {
      const world = anchors[index] ?? new Vector3();
      const distance = camera.position.distanceTo(world);
      projected.copy(world).project(camera);
      const inFront = projected.z > -1 && projected.z < 1;
      return {
        id: label.id,
        priority: label.priority ?? 0,
        anchor: inFront
          ? { x: ((projected.x + 1) / 2) * size.width, y: ((1 - projected.y) / 2) * size.height }
          : null,
        widthPx: widths[index] ?? heightPx,
        heightPx,
        distanceMeters: distance,
        ...(label.maxDistanceMeters === undefined
          ? {}
          : { maxDistanceMeters: label.maxDistanceMeters }),
        ...(label.selected === undefined ? {} : { selected: label.selected }),
      };
    });
    const result = layoutScreenLabels(candidates, {
      viewport: { width: size.width, height: size.height },
      ...(anchor === undefined ? {} : { anchor }),
      ...(paddingPx === undefined ? {} : { paddingPx }),
      ...(maxVisible === undefined ? {} : { maxVisible }),
    });
    const byId = new Map(labels.map((label) => [label.id, label]));
    const layout: SceneLabelLayout = {
      placed: result.visible.flatMap((placement) => {
        const label = byId.get(placement.id);
        return label === undefined ? [] : [{ label, ...placement }];
      }),
      hidden: result.hidden,
    };
    const key = layoutKey(layout);
    if (key === lastKey.current) return;
    lastKey.current = key;
    onLayout(layout);
  });
  return null;
}

export interface SceneLabelOverlayProps {
  readonly layout: SceneLabelLayout;
  readonly theme: SceneVisualTheme;
  /**
   * Renders one label. Use it to draw an LDS component (for example a
   * selectable Tag or Button) when labels must be interactive; the default is
   * a non-interactive text chip.
   */
  readonly renderLabel?: (entry: PlacedSceneLabel) => ReactNode;
}

/** DOM layer for the SceneCanvas `overlay` slot. Positions are from `SceneLabelProjector`. */
export function SceneLabelOverlay({ layout, theme, renderLabel }: SceneLabelOverlayProps) {
  const tokens = resolveSceneLabelTokens(theme);
  return (
    <div
      data-lkds3d-labels="true"
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      {layout.placed.map((entry) => {
        const position: CSSProperties = {
          position: "absolute",
          left: entry.x,
          top: entry.y,
          width: entry.widthPx,
          height: entry.heightPx,
        };
        if (renderLabel !== undefined) {
          return (
            <div key={entry.label.id} style={{ ...position, pointerEvents: "auto" }}>
              {renderLabel(entry)}
            </div>
          );
        }
        const selected = entry.label.selected === true;
        return (
          <span
            key={entry.label.id}
            data-lkds3d-label={entry.label.id}
            style={{
              ...position,
              boxSizing: "border-box",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: `${tokens.paddingYPx.toString()}px ${tokens.paddingXPx.toString()}px`,
              borderRadius: tokens.radiusPx,
              border: `1px solid ${selected ? tokens.accent : tokens.border}`,
              background: tokens.background,
              color: selected ? tokens.accent : tokens.text,
              font: `${tokens.fontWeight.toString()} ${tokens.fontSizePx.toString()}px/${tokens.lineHeightPx.toString()}px ${tokens.fontFamily}`,
              whiteSpace: "nowrap",
            }}
          >
            {entry.label.text}
          </span>
        );
      })}
    </div>
  );
}
