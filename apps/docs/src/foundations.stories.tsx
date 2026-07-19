import type { Meta, StoryObj } from "@storybook/react-vite";
import { Code, Grid, Stack, StatusBadge } from "@lk-robotics/lds-core";
import { DescriptionList } from "@lk-robotics/lds-product";
import {
  COORDINATE_AXES_FIXTURE,
  SHIFTED_ORIGIN_FIXTURE,
  createCoordinateContractReport,
  createTransformRoundTripReport,
} from "@lk-robotics/design-system-3d-testing";
import {
  JsonInspector,
  TechnicalSection,
  TechnicalStoryLayout,
} from "./components.js";

const meta = {
  title: "LDS 3D/Foundations",
  id: "foundations",
  parameters: { controls: { disable: true } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function AxisDiagram(): React.ReactNode {
  return (
    <svg
      viewBox="0 0 640 360"
      role="img"
      aria-labelledby="axis-title axis-description"
      style={{
        display: "block",
        width: "100%",
        height: "auto",
        borderRadius: "var(--radius-lg)",
        background: "var(--color-semantic-background-normal-alternative)",
      }}
    >
      <title id="axis-title">LK right-handed coordinate system</title>
      <desc id="axis-description">
        Positive X points forward, positive Y points left, and positive Z points up.
      </desc>
      <defs>
        <marker id="arrow-x" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--color-semantic-status-negative)" />
        </marker>
        <marker id="arrow-y" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--color-semantic-status-positive)" />
        </marker>
        <marker id="arrow-z" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--color-semantic-primary-normal)" />
        </marker>
      </defs>
      <g stroke="var(--color-semantic-line-solid-normal)" strokeWidth="1">
        {Array.from({ length: 11 }, (_, index) => (
          <line
            key={`v-${String(index)}`}
            x1={70 + index * 50}
            y1="35"
            x2={70 + index * 50}
            y2="325"
          />
        ))}
        {Array.from({ length: 6 }, (_, index) => (
          <line
            key={`h-${String(index)}`}
            x1="45"
            y1={60 + index * 50}
            x2="595"
            y2={60 + index * 50}
          />
        ))}
      </g>
      <circle cx="320" cy="235" r="6" fill="var(--color-semantic-label-strong)" />
      <line
        x1="320"
        y1="235"
        x2="540"
        y2="235"
        stroke="var(--color-semantic-status-negative)"
        strokeWidth="6"
        markerEnd="url(#arrow-x)"
      />
      <line
        x1="320"
        y1="235"
        x2="165"
        y2="150"
        stroke="var(--color-semantic-status-positive)"
        strokeWidth="6"
        markerEnd="url(#arrow-y)"
      />
      <line
        x1="320"
        y1="235"
        x2="320"
        y2="65"
        stroke="var(--color-semantic-primary-normal)"
        strokeWidth="6"
        markerEnd="url(#arrow-z)"
      />
      <g fontFamily="var(--font-sans)" fontSize="16" fontWeight="700">
        <text x="548" y="242" fill="var(--color-semantic-status-negative-text)">
          +X forward
        </text>
        <text x="82" y="145" fill="var(--color-semantic-status-positive-text)">
          +Y left
        </text>
        <text x="333" y="68" fill="var(--color-semantic-primary-normal)">
          +Z up
        </text>
      </g>
      <text
        x="332"
        y="258"
        fontFamily="var(--font-sans)"
        fontSize="13"
        fill="var(--color-semantic-label-neutral)"
      >
        origin · meters · right-handed
      </text>
    </svg>
  );
}

export const CoordinateSystem: Story = {
  name: "Coordinate System",
  render: () => (
    <TechnicalStoryLayout
      eyebrow="LDS 3D / Foundations"
      title="LK Core Coordinate System"
      description="Alpha.1 fixes a renderer-neutral, right-handed coordinate contract: +Z up, +X forward, and meters. This SVG is a technical diagram, not a substitute for a finished WebGL scene."
    >
      <Grid minItemWidth="min(100%, 24rem)" gap="var(--space-6)">
        <TechnicalSection
          title="Semantic axes"
          description="Direction labels and arrow geometry keep the contract understandable without relying on color alone."
        >
          <Stack gap="var(--space-4)">
            <AxisDiagram />
            <DescriptionList
              items={[
                { term: "+X", description: "Forward" },
                { term: "+Y", description: "Left" },
                { term: "+Z", description: "Up" },
                { term: "Unit", description: "Meters" },
              ]}
              columns={2}
            />
          </Stack>
        </TechnicalSection>
        <TechnicalSection
          title="Public fixture"
          description="The canonical axis fixture exported for consumer contract tests."
        >
          <JsonInspector value={COORDINATE_AXES_FIXTURE} label="Coordinate axes fixture JSON" />
        </TechnicalSection>
      </Grid>
    </TechnicalStoryLayout>
  ),
};

export const TransformRoundTrip: Story = {
  name: "Transform Round-trip",
  render: () => {
    const report = createTransformRoundTripReport();
    return (
      <TechnicalStoryLayout
        eyebrow="LDS 3D / Foundations"
        title="Transform Round-trip"
        description="The same public check used by consumer CI projects a source point into core and applies the inverse transform. Maximum absolute error must be at most 1e-6."
      >
        <Grid minItemWidth="min(100%, 24rem)" gap="var(--space-6)">
          <TechnicalSection
            title="Contract result"
            description="A concise human-readable summary of the round-trip invariant."
          >
            <Stack gap="var(--space-4)">
              <StatusBadge tone={report.passed ? "positive" : "negative"}>
                {report.passed ? "PASS" : "FAIL"}
              </StatusBadge>
              <DescriptionList
                items={[
                  { term: "Tolerance", description: <Code>{report.tolerance}</Code> },
                  {
                    term: "Maximum absolute error",
                    description: <Code>{report.maxAbsoluteError}</Code>,
                  },
                  {
                    term: "Recovered frame",
                    description: <Code>{report.recoveredSourcePoint?.frame ?? "not produced"}</Code>,
                  },
                ]}
              />
            </Stack>
          </TechnicalSection>
          <TechnicalSection
            title="Serializable report"
            description="The complete result available to automated consumers."
          >
            <JsonInspector value={report} label="Transform round-trip report JSON" />
          </TechnicalSection>
        </Grid>
      </TechnicalStoryLayout>
    );
  },
};

export const ShiftedOrigin: Story = {
  name: "Shifted Origin",
  render: () => {
    const report = createCoordinateContractReport();
    return (
      <TechnicalStoryLayout
        eyebrow="LDS 3D / Foundations"
        title="Shifted Map Origin"
        description="A large source-map offset is applied exactly once at the frame boundary and inverted by the same rigid transform contract."
      >
        <Grid minItemWidth="min(100%, 24rem)" gap="var(--space-6)">
          <TechnicalSection
            title="Input and expected core point"
            description="Source data and expected output remain explicitly framed."
          >
            <DescriptionList
              items={[
                {
                  term: "Source frame",
                  description: <Code>{SHIFTED_ORIGIN_FIXTURE.sourcePoint.frame}</Code>,
                },
                {
                  term: "Source point",
                  description: <Code>{SHIFTED_ORIGIN_FIXTURE.sourcePoint.value.join(", ")}</Code>,
                },
                {
                  term: "Translation",
                  description: <Code>{SHIFTED_ORIGIN_FIXTURE.sourceToCore.translation.join(", ")}</Code>,
                },
                {
                  term: "Expected core",
                  description: <Code>{SHIFTED_ORIGIN_FIXTURE.expectedCorePoint.value.join(", ")}</Code>,
                },
              ]}
            />
          </TechnicalSection>
          <TechnicalSection
            title="Coordinate contract"
            description="Aggregate fixture result and its serializable evidence."
          >
            <Stack gap="var(--space-4)">
              <StatusBadge tone={report.passed ? "positive" : "negative"}>
                {report.passed ? "PASS" : "FAIL"}
              </StatusBadge>
              <JsonInspector value={report} label="Shifted origin coordinate contract report" />
            </Stack>
          </TechnicalSection>
        </Grid>
      </TechnicalStoryLayout>
    );
  },
};
