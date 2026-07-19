import type { Meta, StoryObj } from "@storybook/react-vite";

import { GltfModelExperience, primitiveReviewParameters } from "./primitives.stories.js";

const meta = {
  title: "LDS 3D/Primitives/GltfModel",
  id: "lds-3d-primitives-gltf-model",
  parameters: { controls: { disable: true } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  name: "개요",
  parameters: primitiveReviewParameters("lds-3d-primitives-gltf-model--overview"),
  render: () => <GltfModelExperience />,
};
