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
