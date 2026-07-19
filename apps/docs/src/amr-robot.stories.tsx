import type { Meta, StoryObj } from "@storybook/react-vite";

import { AmrRobotExperience, primitiveReviewParameters } from "./primitives.stories.js";

const meta = {
  title: "LDS 3D/Primitives/AmrRobot",
  id: "lds-3d-primitives-amr-robot",
  parameters: { controls: { disable: true } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  name: "개요",
  parameters: primitiveReviewParameters("lds-3d-primitives-amr-robot--overview"),
  render: () => <AmrRobotExperience />,
};
