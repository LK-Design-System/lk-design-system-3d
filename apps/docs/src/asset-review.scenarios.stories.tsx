import type { Meta, StoryObj } from "@storybook/react-vite";

import { AssetCatalogExperience } from "./visual-alpha.stories.js";

const meta = {
  title: "LDS 3D/Scenes/Asset Review",
  id: "lds-3d-scenes-asset-review",
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
  render: () => <AssetCatalogExperience />,
};
