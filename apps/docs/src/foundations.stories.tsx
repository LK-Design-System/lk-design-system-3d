import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Code,
  DescriptionList,
  Grid,
  Stack,
  StatusBadge,
} from "@lk-robotics/design-system-core";
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
  title: "LDS 3D/Foundations/Coordinates and Frames",
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
      <title id="axis-title">LK 오른손 좌표계</title>
      <desc id="axis-description">
        양의 X축은 전방, 양의 Y축은 왼쪽, 양의 Z축은 위쪽을 가리킵니다.
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
          +X 전방
        </text>
        <text x="82" y="145" fill="var(--color-semantic-status-positive-text)">
          +Y 왼쪽
        </text>
        <text x="333" y="68" fill="var(--color-semantic-primary-normal)">
          +Z 위쪽
        </text>
      </g>
      <text
        x="332"
        y="258"
        fontFamily="var(--font-sans)"
        fontSize="13"
        fill="var(--color-semantic-label-neutral)"
      >
        원점 · 미터 · 오른손 좌표계
      </text>
    </svg>
  );
}

export const CoordinateSystem: Story = {
  name: "개요",
  render: () => (
    <TechnicalStoryLayout
      eyebrow="LDS 3D / 기반"
      title="LK 코어 좌표계"
      description="Alpha.1은 렌더러에 독립적인 오른손 좌표 계약을 고정합니다. +Z는 위쪽, +X는 전방이며 단위는 미터입니다. 이 SVG는 기술 다이어그램이며 완성된 WebGL 장면을 대신하지 않습니다."
    >
      <Grid minItemWidth="min(100%, 24rem)" gap="var(--space-6)">
        <TechnicalSection
          title="축의 의미"
          description="방향 라벨과 화살표 형상으로 색상에만 의존하지 않고 계약을 이해할 수 있습니다."
        >
          <Stack gap="var(--space-4)">
            <AxisDiagram />
            <DescriptionList
              items={[
                { term: "+X", description: "전방" },
                { term: "+Y", description: "왼쪽" },
                { term: "+Z", description: "위쪽" },
                { term: "단위", description: "미터" },
              ]}
              columns={2}
            />
          </Stack>
        </TechnicalSection>
        <TechnicalSection
          title="공개 예제"
          description="소비자 계약 테스트를 위해 내보내는 표준 축 예제입니다."
        >
          <JsonInspector value={COORDINATE_AXES_FIXTURE} label="좌표축 예제 JSON" />
        </TechnicalSection>
      </Grid>
    </TechnicalStoryLayout>
  ),
};

export const TransformRoundTrip: Story = {
  name: "참조 · 변환 왕복",
  render: () => {
    const report = createTransformRoundTripReport();
    return (
      <TechnicalStoryLayout
        eyebrow="LDS 3D / 기반"
        title="변환 왕복"
        description="소비자 CI와 같은 공개 검사를 사용해 소스 점을 코어로 투영한 뒤 역변환을 적용합니다. 최대 절대 오차는 1e-6 이하여야 합니다."
      >
        <Grid minItemWidth="min(100%, 24rem)" gap="var(--space-6)">
          <TechnicalSection
            title="계약 결과"
            description="왕복 불변 조건을 사람이 읽기 쉬운 형태로 요약합니다."
          >
            <Stack gap="var(--space-4)">
              <StatusBadge tone={report.passed ? "positive" : "negative"}>
                {report.passed ? "통과" : "실패"}
              </StatusBadge>
              <DescriptionList
                items={[
                  { term: "허용 오차", description: <Code>{report.tolerance}</Code> },
                  {
                    term: "최대 절대 오차",
                    description: <Code>{report.maxAbsoluteError}</Code>,
                  },
                  {
                    term: "복원된 프레임",
                    description: <Code>{report.recoveredSourcePoint?.frame ?? "생성되지 않음"}</Code>,
                  },
                ]}
              />
            </Stack>
          </TechnicalSection>
          <TechnicalSection
            title="직렬화 가능한 보고서"
            description="자동화된 소비자가 사용할 수 있는 전체 결과입니다."
          >
            <JsonInspector value={report} label="변환 왕복 보고서 JSON" />
          </TechnicalSection>
        </Grid>
      </TechnicalStoryLayout>
    );
  },
};

export const ShiftedOrigin: Story = {
  name: "참조 · 이동한 원점",
  render: () => {
    const report = createCoordinateContractReport();
    return (
      <TechnicalStoryLayout
        eyebrow="LDS 3D / 기반"
        title="이동한 지도 원점"
        description="큰 소스 지도 오프셋을 프레임 경계에서 정확히 한 번 적용하고 같은 강체 변환 계약으로 역변환합니다."
      >
        <Grid minItemWidth="min(100%, 24rem)" gap="var(--space-6)">
          <TechnicalSection
            title="입력과 예상 코어 점"
            description="소스 데이터와 예상 출력을 명시적인 프레임과 함께 유지합니다."
          >
            <DescriptionList
              items={[
                {
                  term: "소스 프레임",
                  description: <Code>{SHIFTED_ORIGIN_FIXTURE.sourcePoint.frame}</Code>,
                },
                {
                  term: "소스 점",
                  description: <Code>{SHIFTED_ORIGIN_FIXTURE.sourcePoint.value.join(", ")}</Code>,
                },
                {
                  term: "이동",
                  description: <Code>{SHIFTED_ORIGIN_FIXTURE.sourceToCore.translation.join(", ")}</Code>,
                },
                {
                  term: "예상 코어 점",
                  description: <Code>{SHIFTED_ORIGIN_FIXTURE.expectedCorePoint.value.join(", ")}</Code>,
                },
              ]}
            />
          </TechnicalSection>
          <TechnicalSection
            title="좌표 계약"
            description="집계된 예제 결과와 직렬화 가능한 근거입니다."
          >
            <Stack gap="var(--space-4)">
              <StatusBadge tone={report.passed ? "positive" : "negative"}>
                {report.passed ? "통과" : "실패"}
              </StatusBadge>
              <JsonInspector value={report} label="이동한 원점 좌표 계약 보고서" />
            </Stack>
          </TechnicalSection>
        </Grid>
      </TechnicalStoryLayout>
    );
  },
};
