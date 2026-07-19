import type { Meta, StoryObj } from "@storybook/react-vite";

import { SpatialEditingExperience } from "./pointcloud.scenarios.stories.js";

const meta = {
  title: "LDS 3D/Scenes/Spatial Editing",
  id: "lds-3d-scenes-spatial-editing",
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
  render: () => <SpatialEditingExperience />,
};
