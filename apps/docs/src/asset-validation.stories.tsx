import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  InvalidManifestCasesExperience,
  ValidationReportExperience,
} from "./assets.stories.js";

const meta = {
  title: "LDS 3D/Assets/Asset Validation",
  id: "lds-3d-assets-validation",
  parameters: { controls: { disable: true } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  name: "개요",
  render: () => <ValidationReportExperience />,
};

export const InvalidManifest: Story = {
  name: "변형·상태 · 유효하지 않은 manifest",
  render: () => <InvalidManifestCasesExperience />,
};
