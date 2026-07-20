import type { Meta, StoryObj } from "@storybook/react-vite";

import { RendererStateExperience } from "./visual-alpha.stories.js";

const meta = {
  title: "LDS 3D/States/Renderer Lifecycle",
  id: "lds-3d-states-renderer-lifecycle",
  parameters: {
    canvasShell: "flush",
    controls: { disable: true },
    layout: "fullscreen",
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  name: "개요",
  render: () => <RendererStateExperience />,
};

export const FocusRecovery: Story = {
  name: "상호작용 · 재시도 포커스 복구",
  render: () => <RendererStateExperience />,
  play: async ({ canvasElement }) => {
    const stateControl = canvasElement.querySelector('[aria-label="렌더러 상태"]');
    const errorControl = Array.from(stateControl?.querySelectorAll("button") ?? []).find(
      (button) => button.textContent.trim() === "오류",
    );
    if (!(errorControl instanceof HTMLButtonElement)) {
      throw new Error("Renderer error-state control is missing.");
    }
    errorControl.click();
    await new Promise((resolve) => window.setTimeout(resolve, 30));

    const retry = canvasElement.querySelector('[data-testid="renderer-retry-action"]');
    if (!(retry instanceof HTMLButtonElement)) {
      throw new Error("Renderer retry action is missing in the error state.");
    }
    retry.focus();
    retry.click();
    await new Promise((resolve) => window.setTimeout(resolve, 30));

    const retryProgress = canvasElement.querySelector('[data-testid="renderer-retry-action"]');
    if (retryProgress !== retry || retry.getAttribute("aria-disabled") !== "true") {
      throw new Error("Retry must preserve the same focus target while progress is shown.");
    }
    if (canvasElement.ownerDocument.activeElement !== retry) {
      throw new Error("Retry progress must retain focus instead of dropping it to the document body.");
    }
    if (!canvasElement.textContent.includes("렌더러 재시도 중 · 32%")) {
      throw new Error("Retry progress must expose the 32% loading state.");
    }

    await new Promise((resolve) => window.setTimeout(resolve, 720));
    const frame = canvasElement.querySelector('[data-lds-viewer-frame]');
    const activeElement = canvasElement.ownerDocument.activeElement;
    if (frame?.getAttribute("data-viewer-state") !== "live") {
      throw new Error("Renderer retry did not recover to the ready/live state.");
    }
    if (!(activeElement instanceof HTMLElement) || activeElement === canvasElement.ownerDocument.body) {
      throw new Error("Focus must return to ViewerFrame controls after recovery.");
    }
  },
};
