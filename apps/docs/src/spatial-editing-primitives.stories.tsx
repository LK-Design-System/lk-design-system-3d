import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  SpatialEditingExperience,
  primitiveReviewParameters,
} from "./primitives.stories.js";

const meta = {
  title: "LDS 3D/Primitives/Spatial Editing Primitives",
  id: "lds-3d-primitives-spatial-editing",
  parameters: { controls: { disable: true } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  name: "개요",
  parameters: primitiveReviewParameters("lds-3d-primitives-spatial-editing--overview"),
  render: () => <SpatialEditingExperience />,
};
