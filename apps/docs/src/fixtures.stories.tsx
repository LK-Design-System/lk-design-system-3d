import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Code,
  Grid,
  Stack,
  StatusBadge,
  Table,
} from "@lk-robotics/design-system-core";
import {
  AUTHORITATIVE_FLOOR_HIT_FIXTURE,
  ROBOT_POSE_FIXTURE,
  checkAuthoritativeFloorHitProjection,
} from "@lk-robotics/design-system-3d-testing";
import {
  JsonInspector,
  TechnicalSection,
  TechnicalStoryLayout,
} from "./components.js";

const meta = {
  title: "LDS 3D/Foundations/Fixtures",
  id: "fixtures",
  parameters: { controls: { disable: true } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function RobotTopView(): React.ReactNode {
  const [x, y] = ROBOT_POSE_FIXTURE.pose.position;
  const [, , qz, qw] = ROBOT_POSE_FIXTURE.pose.orientation;
  const yawDegrees = (Math.atan2(2 * qw * qz, 1 - 2 * qz * qz) * 180) / Math.PI;
  const robotCanvasX = 300 + x * 45;
  const robotCanvasY = 180 - y * 45;
  const robotTransform = `translate(${String(robotCanvasX)} ${String(robotCanvasY)}) rotate(${String(-yawDegrees)})`;

  return (
    <svg
      viewBox="0 0 600 360"
      role="img"
      aria-labelledby="robot-top-view-title robot-top-view-description"
      style={{
        display: "block",
        width: "100%",
        height: "auto",
        borderRadius: "var(--radius-lg)",
        background: "var(--color-semantic-background-normal-alternative)",
      }}
    >
      <title id="robot-top-view-title">Top view of the robot pose fixture</title>
      <desc id="robot-top-view-description">
        A labeled grid showing the robot position and heading in the positive X and Y plane.
      </desc>
      <g stroke="var(--color-semantic-line-solid-normal)">
        {Array.from({ length: 13 }, (_, index) => (
          <line key={`v-${String(index)}`} x1={index * 50} y1="0" x2={index * 50} y2="360" />
        ))}
        {Array.from({ length: 8 }, (_, index) => (
          <line key={`h-${String(index)}`} x1="0" y1={index * 50} x2="600" y2={index * 50} />
        ))}
      </g>
      <g transform={robotTransform}>
        <circle
          r="26"
          fill="var(--color-semantic-primary-surface-normal)"
          stroke="var(--color-semantic-primary-normal)"
          strokeWidth="4"
        />
        <path d="M 0 -34 L 11 -13 L -11 -13 Z" fill="var(--color-semantic-primary-normal)" />
      </g>
      <text
        x="22"
        y="30"
        fontFamily="var(--font-sans)"
        fontSize="13"
        fill="var(--color-semantic-label-neutral)"
      >
        Top view · X right · Y up
      </text>
    </svg>
  );
}

export const RobotPose: Story = {
  name: "Robot Pose",
  render: () => (
    <TechnicalStoryLayout
      eyebrow="LDS 3D / Fixtures"
      title="Robot Pose Fixture"
      description="The public fixture preserves a framed position and normalized quaternion. This renderer-neutral SVG diagram explains the contract; it is not presented as a finished 3D scene."
    >
      <Grid minItemWidth="min(100%, 24rem)" gap="var(--space-6)">
        <TechnicalSection
          title="Top view"
          description="Position and heading projected into a static technical diagram."
        >
          <RobotTopView />
        </TechnicalSection>
        <TechnicalSection
          title="Entity contract"
          description="The exact serializable fixture consumed by package tests."
        >
          <JsonInspector value={ROBOT_POSE_FIXTURE} label="Robot pose fixture JSON" />
        </TechnicalSection>
      </Grid>
    </TechnicalStoryLayout>
  ),
};

interface ProjectionRow {
  readonly [key: string]: unknown;
  readonly stage: string;
  readonly frame: string;
  readonly point: string;
}

export const FloorHitProjection: Story = {
  name: "Floor Hit Projection",
  render: () => {
    const report = checkAuthoritativeFloorHitProjection();
    const rows: ProjectionRow[] = [
      {
        stage: "Authoritative hit",
        frame: AUTHORITATIVE_FLOOR_HIT_FIXTURE.legacyHit.frame,
        point: AUTHORITATIVE_FLOOR_HIT_FIXTURE.legacyHit.value.join(", "),
      },
      {
        stage: "Core",
        frame: report.projection?.coreHit.frame ?? "not produced",
        point: report.projection?.coreHit.value.join(", ") ?? "not produced",
      },
      {
        stage: "Product map",
        frame: report.projection?.productMapHit.frame ?? "not produced",
        point: report.projection?.productMapHit.value.join(", ") ?? "not produced",
      },
    ];

    return (
      <TechnicalStoryLayout
        eyebrow="LDS 3D / Fixtures"
        title="Authoritative Floor Hit Projection"
        description="Alpha.1 accepts an authoritative legacy hit and proves the render-to-core-to-product-map frame projection used by a later shadow comparator. This fixture does not perform raycasting."
      >
        <Grid minItemWidth="min(100%, 24rem)" gap="var(--space-6)">
          <TechnicalSection
            title="Projection chain"
            description="The same physical point represented at each explicit frame boundary."
          >
            <Stack gap="var(--space-4)">
              <StatusBadge tone={report.passed ? "positive" : "negative"}>
                {report.passed ? "PASS" : "FAIL"}
              </StatusBadge>
              <Table<ProjectionRow>
                aria-label="Authoritative floor hit projection stages"
                tabIndex={0}
                size="sm"
                hover={false}
                columns={[
                  { key: "stage", label: "Stage" },
                  { key: "frame", label: "Frame", render: (row) => <Code>{row.frame}</Code> },
                  { key: "point", label: "Point", render: (row) => <Code>{row.point}</Code> },
                ]}
                rows={rows}
              />
            </Stack>
          </TechnicalSection>
          <TechnicalSection
            title="Contract report"
            description="The complete result returned by the fixture checker."
          >
            <JsonInspector value={report} label="Floor hit projection report JSON" />
          </TechnicalSection>
        </Grid>
      </TechnicalStoryLayout>
    );
  },
};
