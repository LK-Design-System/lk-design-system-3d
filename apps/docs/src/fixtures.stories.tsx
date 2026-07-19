import type { Meta, StoryObj } from "@storybook/react-vite";
import { Code, Grid, Stack, StatusBadge } from "@lk-robotics/lds-core";
import { Table } from "@lk-robotics/lds-product";
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
  title: "LDS 3D/Foundations/Contract Fixtures",
  id: "fixtures",
  parameters: { controls: { disable: true } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function RobotTopView(): React.ReactNode {
  const [x, y] = ROBOT_POSE_FIXTURE.pose.position;
  const [, , qz, qw] = ROBOT_POSE_FIXTURE.pose.orientation;
  const yawRadians = Math.atan2(2 * qw * qz, 1 - 2 * qz * qz);
  const yawDegrees = (yawRadians * 180) / Math.PI;
  const originX = 220;
  const originY = 170;
  const pixelsPerMeter = 48;
  const robotCanvasX = originX + x * pixelsPerMeter;
  const robotCanvasY = originY - y * pixelsPerMeter;
  const headingStartOffset = 30;
  const headingLength = 86;
  const headingStartX = robotCanvasX + Math.cos(yawRadians) * headingStartOffset;
  const headingStartY = robotCanvasY - Math.sin(yawRadians) * headingStartOffset;
  const headingEndX = robotCanvasX + Math.cos(yawRadians) * headingLength;
  const headingEndY = robotCanvasY - Math.sin(yawRadians) * headingLength;
  const robotTransform = `translate(${String(robotCanvasX)} ${String(robotCanvasY)}) rotate(${String(-yawDegrees)})`;
  const formattedYaw = `${yawDegrees >= 0 ? "+" : ""}${yawDegrees.toFixed(1)}°`;

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
      <title id="robot-top-view-title">로봇 자세 예제 상단 보기</title>
      <desc id="robot-top-view-description">
        LK 코어 X-Y 평면에서 원점, 로봇 위치, 로컬 X 전방 벡터와 자세 값을 함께 보여주는
        좌표 다이어그램입니다.
      </desc>
      <defs>
        <marker
          id="robot-heading-arrow"
          markerWidth="14"
          markerHeight="14"
          refX="11"
          refY="7"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M 0 1 L 12 7 L 0 13 Z" fill="var(--color-semantic-primary-normal)" />
        </marker>
        <marker
          id="axis-x-arrow"
          markerWidth="12"
          markerHeight="12"
          refX="10"
          refY="6"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M 0 1 L 10 6 L 0 11 Z" fill="var(--color-semantic-status-negative)" />
        </marker>
        <marker
          id="axis-y-arrow"
          markerWidth="12"
          markerHeight="12"
          refX="10"
          refY="6"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M 0 1 L 10 6 L 0 11 Z" fill="var(--color-semantic-status-positive)" />
        </marker>
      </defs>

      <g stroke="var(--color-semantic-line-solid-normal)" strokeWidth="1" opacity="0.58">
        {Array.from({ length: 13 }, (_, index) => (
          <line
            key={`v-${String(index)}`}
            x1={28 + index * pixelsPerMeter}
            y1="0"
            x2={28 + index * pixelsPerMeter}
            y2="292"
          />
        ))}
        {Array.from({ length: 8 }, (_, index) => (
          <line
            key={`h-${String(index)}`}
            x1="0"
            y1={26 + index * pixelsPerMeter}
            x2="600"
            y2={26 + index * pixelsPerMeter}
          />
        ))}
      </g>

      <line
        x1="28"
        y1={originY}
        x2="570"
        y2={originY}
        stroke="var(--color-semantic-status-negative)"
        strokeWidth="3"
        markerEnd="url(#axis-x-arrow)"
      />
      <line
        x1={originX}
        y1="286"
        x2={originX}
        y2="34"
        stroke="var(--color-semantic-status-positive)"
        strokeWidth="3"
        markerEnd="url(#axis-y-arrow)"
      />
      <g fontFamily="var(--font-sans)" fontSize="13" fontWeight="700">
        <text x="540" y={originY - 12} fill="var(--color-semantic-status-negative-text)">
          +X
        </text>
        <text x={originX + 12} y="44" fill="var(--color-semantic-status-positive-text)">
          +Y
        </text>
      </g>
      <circle cx={originX} cy={originY} r="5" fill="var(--color-semantic-label-strong)" />
      <text
        x={originX + 10}
        y={originY + 18}
        fontFamily="var(--font-sans)"
        fontSize="12"
        fill="var(--color-semantic-label-neutral)"
      >
        원점
      </text>

      <path
        d={`M ${String(originX)} ${String(originY)} H ${String(robotCanvasX)} V ${String(robotCanvasY)}`}
        fill="none"
        stroke="var(--color-semantic-label-neutral)"
        strokeWidth="2"
        strokeDasharray="7 6"
        opacity="0.7"
      />
      <text
        x={(originX + robotCanvasX) / 2}
        y={originY - 10}
        textAnchor="middle"
        fontFamily="var(--font-sans)"
        fontSize="12"
        fill="var(--color-semantic-label-neutral)"
      >
        x {x.toFixed(2)} m
      </text>
      <text
        x={robotCanvasX + 42}
        y={(originY + robotCanvasY) / 2 + 4}
        fontFamily="var(--font-sans)"
        fontSize="12"
        fill="var(--color-semantic-label-neutral)"
      >
        y {y.toFixed(2)} m
      </text>

      <g transform={robotTransform}>
        <rect
          x="-36"
          y="-23"
          width="72"
          height="46"
          rx="10"
          fill="var(--color-semantic-primary-surface-normal)"
          stroke="var(--color-semantic-primary-normal)"
          strokeWidth="3"
        />
        <line
          x1="24"
          y1="-15"
          x2="24"
          y2="15"
          stroke="var(--color-semantic-primary-normal)"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <circle r="4" fill="var(--color-semantic-primary-normal)" />
      </g>

      <line
        x1={headingStartX}
        y1={headingStartY}
        x2={headingEndX}
        y2={headingEndY}
        stroke="var(--color-semantic-primary-normal)"
        strokeWidth="6"
        strokeLinecap="round"
        markerEnd="url(#robot-heading-arrow)"
      />
      <text
        x={headingEndX + 14}
        y={headingEndY + 5}
        fontFamily="var(--font-sans)"
        fontSize="12"
        fontWeight="700"
        fill="var(--color-semantic-primary-normal)"
      >
        로컬 +X 전방
      </text>

      <rect
        x="18"
        y="304"
        width="564"
        height="40"
        rx="8"
        fill="var(--color-semantic-background-normal-normal)"
        stroke="var(--color-semantic-line-solid-normal)"
      />
      <text
        x="32"
        y="329"
        fontFamily="var(--font-sans)"
        fontSize="13"
        fill="var(--color-semantic-label-strong)"
      >
        frame {ROBOT_POSE_FIXTURE.pose.frame} · x {x.toFixed(2)} m · y {y.toFixed(2)} m · yaw {formattedYaw}
      </text>
    </svg>
  );
}

export const RobotPose: Story = {
  name: "개요",
  render: () => (
    <TechnicalStoryLayout
      eyebrow="LDS 3D / 계약 예제"
      title="로봇 자세 예제"
      description="공개 예제는 프레임이 지정된 위치와 정규화된 쿼터니언을 유지합니다. 이 렌더러 독립 SVG 다이어그램은 계약을 설명하며 완성된 3D 장면으로 제시하지 않습니다."
    >
      <Grid minItemWidth="min(100%, 24rem)" gap="var(--space-6)">
        <TechnicalSection
          title="상단 보기"
          description="위치와 진행 방향을 정적인 기술 다이어그램에 투영합니다."
        >
          <RobotTopView />
        </TechnicalSection>
        <TechnicalSection
          title="객체 계약"
          description="패키지 테스트가 사용하는 정확한 직렬화 가능 예제입니다."
        >
          <JsonInspector value={ROBOT_POSE_FIXTURE} label="로봇 자세 예제 JSON" />
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
  name: "참조 · 바닥 교차점",
  render: () => {
    const report = checkAuthoritativeFloorHitProjection();
    const rows: ProjectionRow[] = [
      {
        stage: "기준 교차점",
        frame: AUTHORITATIVE_FLOOR_HIT_FIXTURE.legacyHit.frame,
        point: AUTHORITATIVE_FLOOR_HIT_FIXTURE.legacyHit.value.join(", "),
      },
      {
        stage: "코어",
        frame: report.projection?.coreHit.frame ?? "생성되지 않음",
        point: report.projection?.coreHit.value.join(", ") ?? "생성되지 않음",
      },
      {
        stage: "제품 지도",
        frame: report.projection?.productMapHit.frame ?? "생성되지 않음",
        point: report.projection?.productMapHit.value.join(", ") ?? "생성되지 않음",
      },
    ];

    return (
      <TechnicalStoryLayout
        eyebrow="LDS 3D / 계약 예제"
        title="기준 바닥 교차점 투영"
        description="이 계약은 기존 시스템의 기준 교차점을 받아 렌더-코어-제품 지도 프레임 투영을 검증합니다. 이후 그림자 비교기에서 사용하는 계약이며 이 예제 자체는 레이캐스팅을 수행하지 않습니다."
      >
        <Grid minItemWidth="min(100%, 24rem)" gap="var(--space-6)">
          <TechnicalSection
            title="투영 체인"
            description="같은 물리적 점을 각 명시적 프레임 경계에서 표현합니다."
          >
            <Stack gap="var(--space-4)">
              <StatusBadge tone={report.passed ? "positive" : "negative"}>
                {report.passed ? "통과" : "실패"}
              </StatusBadge>
              <Table<ProjectionRow>
                aria-label="기준 바닥 교차점 투영 단계"
                tabIndex={0}
                size="sm"
                hover={false}
                columns={[
                  { key: "stage", label: "단계" },
                  { key: "frame", label: "프레임", render: (row) => <Code>{row.frame}</Code> },
                  { key: "point", label: "점", render: (row) => <Code>{row.point}</Code> },
                ]}
                rows={rows}
              />
            </Stack>
          </TechnicalSection>
          <TechnicalSection
            title="계약 보고서"
            description="예제 검사기가 반환한 전체 결과입니다."
          >
            <JsonInspector value={report} label="바닥 교차점 투영 보고서 JSON" />
          </TechnicalSection>
        </Grid>
      </TechnicalStoryLayout>
    );
  },
};
