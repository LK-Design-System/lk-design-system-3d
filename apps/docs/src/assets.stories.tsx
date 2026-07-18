import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Code,
  DescriptionList,
  Grid,
  Stack,
  StatusBadge,
  Table,
} from "@lk-robotics/design-system-core";
import { createAssetReport } from "@lk-robotics/design-system-3d-assets";
import {
  INVALID_ASSET_MANIFEST_FIXTURES,
  Y_UP_GLB_MANIFEST_FIXTURE,
  checkAssetFixtureContracts,
} from "@lk-robotics/design-system-3d-testing";
import {
  JsonInspector,
  TechnicalSection,
  TechnicalStoryLayout,
} from "./components.js";

const meta = {
  title: "LDS 3D/Assets",
  id: "assets",
  parameters: { controls: { disable: true } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const AssetManifest: Story = {
  name: "Asset Manifest",
  render: () => (
    <TechnicalStoryLayout
      eyebrow="LDS 3D / Assets"
      title="Y-up GLB Asset Manifest"
      description="The manifest declares its file basis and explicit file-to-core transform. No filename, bounds, or axis heuristic is used."
    >
      <Grid minItemWidth="min(100%, 24rem)" gap="var(--space-6)">
        <TechnicalSection
          title="Coordinate contract"
          description="The source basis stays explicit until the adapter converts it into the LDS3D core frame."
        >
          <DescriptionList
            items={[
              {
                term: "Handedness",
                description: <Code>{Y_UP_GLB_MANIFEST_FIXTURE.fileCoordinate.handedness}</Code>,
              },
              {
                term: "File up",
                description: <Code>{Y_UP_GLB_MANIFEST_FIXTURE.fileCoordinate.upAxis}</Code>,
              },
              {
                term: "File forward",
                description: <Code>{Y_UP_GLB_MANIFEST_FIXTURE.fileCoordinate.forwardAxis}</Code>,
              },
              {
                term: "Core frame",
                description: <Code>{Y_UP_GLB_MANIFEST_FIXTURE.coreFrame}</Code>,
              },
              {
                term: "Meters per unit",
                description: Y_UP_GLB_MANIFEST_FIXTURE.fileCoordinate.metersPerUnit,
              },
            ]}
          />
        </TechnicalSection>
        <TechnicalSection
          title="Manifest JSON"
          description="Serializable fixture data exposed to package consumers."
        >
          <JsonInspector value={Y_UP_GLB_MANIFEST_FIXTURE} label="Y-up GLB manifest JSON" />
        </TechnicalSection>
      </Grid>
    </TechnicalStoryLayout>
  ),
};

export const ValidationReport: Story = {
  name: "Validation Report",
  render: () => {
    const report = createAssetReport(Y_UP_GLB_MANIFEST_FIXTURE);
    return (
      <TechnicalStoryLayout
        eyebrow="LDS 3D / Assets"
        title="Asset Validation Report"
        description="Consumers receive a serializable validation report. A manifest is returned only after every frame, basis, unit, bounds, transform, and checksum invariant passes."
      >
        <Grid minItemWidth="min(100%, 24rem)" gap="var(--space-6)">
          <TechnicalSection title="Summary" description="The fixture result from the public validator.">
            <StatusBadge tone={report.valid ? "positive" : "negative"}>
              {report.valid ? "VALID" : "INVALID"}
            </StatusBadge>
          </TechnicalSection>
          <TechnicalSection
            title="Report JSON"
            description="The complete machine-readable validation result."
          >
            <JsonInspector value={report} label="Asset validation report JSON" />
          </TechnicalSection>
        </Grid>
      </TechnicalStoryLayout>
    );
  },
};

interface InvalidCaseRow {
  readonly [key: string]: unknown;
  readonly id: string;
  readonly description: string;
  readonly expectedPath: string;
  readonly valid: boolean;
  readonly issues: string;
}

export const InvalidManifestCases: Story = {
  name: "Invalid Manifest Cases",
  render: () => {
    const aggregate = checkAssetFixtureContracts();
    const rows: InvalidCaseRow[] = Object.values(INVALID_ASSET_MANIFEST_FIXTURES).map(
      (fixture) => {
        const validation = createAssetReport(fixture.manifest);
        return {
          id: fixture.id,
          description: fixture.description,
          expectedPath: fixture.expectedIssuePath,
          valid: validation.valid,
          issues: validation.issues.map((issue) => `${issue.path}: ${issue.code}`).join(" · "),
        };
      },
    );

    return (
      <TechnicalStoryLayout
        eyebrow="LDS 3D / Assets"
        title="Invalid Manifest Cases"
        description="Each deliberate failure is fed through the same public validator used by package consumers. Invalid inputs never become AssetManifestV1 values."
      >
        <TechnicalSection
          title="Contract matrix"
          description="Every fixture must be rejected at its expected contract path."
        >
          <Stack gap="var(--space-4)">
            <StatusBadge tone={aggregate.passed ? "positive" : "negative"}>
              {aggregate.passed ? "ALL EXPECTED FAILURES REJECTED" : "CONTRACT FAILURE"}
            </StatusBadge>
            <Table<InvalidCaseRow>
              aria-label="Invalid asset manifest contract cases"
              tabIndex={0}
              size="sm"
              hover={false}
              columns={[
                {
                  key: "id",
                  label: "Case",
                  render: (row) => (
                    <Stack gap="var(--space-1)">
                      <Code>{row.id}</Code>
                      <span>{row.description}</span>
                    </Stack>
                  ),
                },
                {
                  key: "expectedPath",
                  label: "Expected path",
                  render: (row) => <Code>{row.expectedPath}</Code>,
                },
                {
                  key: "valid",
                  label: "Result",
                  render: (row) => (
                    <StatusBadge tone={row.valid ? "negative" : "positive"}>
                      {row.valid ? "UNEXPECTED VALID" : "REJECTED"}
                    </StatusBadge>
                  ),
                },
                { key: "issues", label: "Reported issues" },
              ]}
              rows={rows}
            />
          </Stack>
        </TechnicalSection>
      </TechnicalStoryLayout>
    );
  },
};
