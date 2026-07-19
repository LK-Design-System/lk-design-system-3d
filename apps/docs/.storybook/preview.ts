import type { Decorator, Preview } from "@storybook/react-vite";
import { createElement, type ComponentType, type CSSProperties } from "react";
import "@lk-robotics/design-system-core/styles.css";
import "../src/styles.css";

const DARK_BACKGROUND_NAMES = new Set(["dark", "navy", "inverse"]);
const DARK_BACKGROUND_VALUES = new Set(["#101828", "#0e1329", "#0a0e1a", "#151a2b"]);

function property(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  return (value as Readonly<Record<string, unknown>>)[key];
}

function normalizeBackground(value: unknown): string {
  if (value === null || value === undefined) return "";
  const nestedValue = property(value, "value");
  if (nestedValue !== undefined) return normalizeBackground(nestedValue);
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function isDarkBackground(value: unknown): boolean {
  const background = normalizeBackground(value);
  if (DARK_BACKGROUND_NAMES.has(background) || DARK_BACKGROUND_VALUES.has(background)) {
    return true;
  }

  const hex = /^#([0-9a-f]{6})$/i.exec(background);
  if (hex?.[1] === undefined) return false;
  const valueHex = hex[1];
  const red = Number.parseInt(valueHex.slice(0, 2), 16);
  const green = Number.parseInt(valueHex.slice(2, 4), 16);
  const blue = Number.parseInt(valueHex.slice(4, 6), 16);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue < 110;
}

const withLdsCanvas: Decorator = (Story, context) => {
  const backgrounds = property(context.globals as unknown, "backgrounds");
  const backgroundValue = property(backgrounds, "value") ?? backgrounds;
  const theme = isDarkBackground(backgroundValue) ? "dark" : "light";
  const flush = property(context.parameters as unknown, "canvasShell") === "flush";
  const style: CSSProperties = {
    minHeight: "100vh",
    boxSizing: "border-box",
    padding: flush ? 0 : "clamp(16px, 5vw, 32px)",
    background: "var(--color-semantic-background-normal-normal)",
    color: "var(--color-semantic-label-normal)",
    fontFamily: "var(--font-sans)",
  };

  return createElement(
    "div",
    { "data-theme": theme, className: `theme-${theme}`, style },
    createElement(Story as ComponentType),
  );
};

const preview: Preview = {
  decorators: [withLdsCanvas],
  parameters: {
    layout: "fullscreen",
    controls: { expanded: true },
    a11y: {
      test: "error",
    },
    backgrounds: {
      default: "Base",
      values: [
        { name: "Base", value: "#f7f8fb" },
        { name: "Card", value: "#ffffff" },
        { name: "Navy", value: "#101828" },
        { name: "Dark", value: "#0a0e1a" },
      ],
    },
    docs: {
      toc: true,
    },
    options: {
      storySort: {
        method: "alphabetical",
        order: [
          "LDS 3D",
          [
            "Foundations",
            [
              "Coordinates and Frames",
              "Renderer Hosts",
              ["ThreeSceneHost"],
              "Contract Fixtures",
            ],
            "Assets",
            ["Asset Manifest", "Asset Validation"],
            "Primitives",
            [
              "SceneCanvas and CameraRig",
              "Selectable",
              "AmrRobot",
              "GoalMarker",
              "PathRibbon",
              "MarkerLayer",
              "GltfModel",
              "PointCloudLayer",
              "OccupancyGridSurface",
              "Spatial Editing Primitives",
              "Spatial Authoring Primitives",
              "SceneStateMarker",
            ],
            "States",
            ["Renderer Lifecycle", "Goal and Path"],
            "Scenes",
            [
              "AMR Operations",
              "Asset Review",
              "Occupancy Grid",
              "TF and Marker",
              "Spatial Editing",
            ],
            "LDS Integration",
            ["Focused Point Cloud Viewer", "Spatial Editor"],
          ],
        ],
      },
    },
  },
};

export default preview;
