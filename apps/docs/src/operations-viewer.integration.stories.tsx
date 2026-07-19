import type { Meta, StoryObj } from "@storybook/react-vite";

import { VisualDirectionExperience } from "./visual-alpha.stories.js";

const meta = {
  title: "LDS 3D/LDS Integration/Operations Viewer",
  id: "lds-3d-lds-integration-operations-viewer",
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
  render: () => <VisualDirectionExperience profile="operational" />,
};
