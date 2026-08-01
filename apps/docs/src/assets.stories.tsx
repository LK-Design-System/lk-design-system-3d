import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { Code, Grid, Stack, StatusBadge } from "@lk-design-system/lds-core";
import { DescriptionList, Table } from "@lk-design-system/lds-product";
import { createAssetReport } from "@lk-robotics/lds-3d-assets";
import {
  INVALID_ASSET_MANIFEST_FIXTURES,
  Y_UP_GLB_MANIFEST_FIXTURE,
  checkAssetFixtureContracts,
} from "@lk-robotics/lds-3d-testing";
import {
  JsonInspector,
  TechnicalSection,
  TechnicalStoryLayout,
} from "./components.js";

const meta = {
  title: "LDS 3D/Assets/Asset Manifest",
  id: "assets",
  excludeStories: /.*Experience$/,
  parameters: { controls: { disable: true } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const AssetManifest: Story = {
  name: "개요",
  render: () => (
    <TechnicalStoryLayout
      eyebrow="LDS 3D / 자산"
      title="Y-up GLB 자산 manifest"
      description="manifest는 파일 좌표 기준과 명시적인 파일-코어 변환을 선언합니다. 파일명, 경계, 축을 추측해 처리하지 않습니다."
    >
      <Grid minItemWidth="min(100%, 24rem)" gap="var(--space-6)">
        <TechnicalSection
          title="좌표 계약"
          description="어댑터가 LDS3D 코어 프레임으로 변환할 때까지 소스 좌표 기준을 명시적으로 유지합니다."
        >
          <DescriptionList
            items={[
              {
                term: "좌표계 방향",
                description: <Code>{Y_UP_GLB_MANIFEST_FIXTURE.fileCoordinate.handedness}</Code>,
              },
              {
                term: "파일 위쪽 축",
                description: <Code>{Y_UP_GLB_MANIFEST_FIXTURE.fileCoordinate.upAxis}</Code>,
              },
              {
                term: "파일 전방 축",
                description: <Code>{Y_UP_GLB_MANIFEST_FIXTURE.fileCoordinate.forwardAxis}</Code>,
              },
              {
                term: "코어 프레임",
                description: <Code>{Y_UP_GLB_MANIFEST_FIXTURE.coreFrame}</Code>,
              },
              {
                term: "단위당 미터",
                description: Y_UP_GLB_MANIFEST_FIXTURE.fileCoordinate.metersPerUnit,
              },
            ]}
          />
        </TechnicalSection>
        <TechnicalSection
          title="Manifest JSON"
          description="패키지 소비자에게 공개하는 직렬화 가능한 예제 데이터입니다."
        >
          <JsonInspector value={Y_UP_GLB_MANIFEST_FIXTURE} label="Y-up GLB manifest JSON 데이터" />
        </TechnicalSection>
      </Grid>
    </TechnicalStoryLayout>
  ),
};

export function ValidationReportExperience(): ReactNode {
    const report = createAssetReport(Y_UP_GLB_MANIFEST_FIXTURE);
    return (
      <TechnicalStoryLayout
        eyebrow="LDS 3D / 자산"
        title="자산 검증 보고서"
        description="소비자는 직렬화 가능한 검증 보고서를 받습니다. 모든 프레임, 좌표 기준, 단위, 경계, 변환, 체크섬 불변 조건을 통과한 경우에만 manifest를 반환합니다."
      >
        <Grid minItemWidth="min(100%, 24rem)" gap="var(--space-6)">
          <TechnicalSection title="요약" description="공개 검증기가 반환한 예제 결과입니다.">
            <StatusBadge tone={report.valid ? "positive" : "negative"}>
              {report.valid ? "유효" : "유효하지 않음"}
            </StatusBadge>
          </TechnicalSection>
          <TechnicalSection
            title="보고서 JSON"
            description="기계가 읽을 수 있는 전체 검증 결과입니다."
          >
            <JsonInspector value={report} label="자산 검증 보고서 JSON" />
          </TechnicalSection>
        </Grid>
      </TechnicalStoryLayout>
    );
}

interface InvalidCaseRow {
  readonly [key: string]: unknown;
  readonly id: string;
  readonly description: string;
  readonly expectedPath: string;
  readonly valid: boolean;
  readonly issues: string;
}

const INVALID_CASE_DESCRIPTIONS: Readonly<Record<string, string>> = {
  "invalid-axis": "전방 축이 위쪽 축과 반대라 좌표 기준이 퇴화합니다.",
  "invalid-unit": "metersPerUnit은 유한한 양수여야 합니다.",
  "invalid-frame": "변환의 소스 프레임이 fileFrame과 일치하지 않습니다.",
  "invalid-bounds": "X축 최솟값이 최댓값보다 큽니다.",
  "invalid-checksum": "무결성 값이 64자리 16진수 SHA-256 다이제스트가 아닙니다.",
};

export function InvalidManifestCasesExperience(): ReactNode {
    const aggregate = checkAssetFixtureContracts();
    const rows: InvalidCaseRow[] = Object.values(INVALID_ASSET_MANIFEST_FIXTURES).map(
      (fixture) => {
        const validation = createAssetReport(fixture.manifest);
        return {
          id: fixture.id,
          description: INVALID_CASE_DESCRIPTIONS[fixture.id] ?? fixture.description,
          expectedPath: fixture.expectedIssuePath,
          valid: validation.valid,
          issues: validation.issues.map((issue) => `${issue.path}: ${issue.code}`).join(" · "),
        };
      },
    );

    return (
      <TechnicalStoryLayout
        eyebrow="LDS 3D / 자산"
        title="유효하지 않은 manifest 사례"
        description="의도적으로 실패하게 만든 각 입력을 패키지 소비자와 같은 공개 검증기로 확인합니다. 유효하지 않은 입력은 AssetManifestV1 값이 되지 않습니다."
      >
        <TechnicalSection
          title="계약 매트릭스"
          description="모든 예제는 예상한 계약 경로에서 거부되어야 합니다."
        >
          <Stack gap="var(--space-4)">
            <StatusBadge
              style={{ alignSelf: "flex-start" }}
              tone={aggregate.passed ? "positive" : "negative"}
            >
              {aggregate.passed ? "예상한 실패를 모두 거부함" : "계약 실패"}
            </StatusBadge>
            <Table<InvalidCaseRow>
              aria-label="유효하지 않은 자산 manifest 계약 사례"
              tabIndex={0}
              size="sm"
              hover={false}
              columns={[
                {
                  key: "id",
                  label: "사례",
                  render: (row) => (
                    <Stack gap="var(--space-1)">
                      <Code>{row.id}</Code>
                      <span>{row.description}</span>
                    </Stack>
                  ),
                },
                {
                  key: "expectedPath",
                  label: "예상 경로",
                  render: (row) => <Code>{row.expectedPath}</Code>,
                },
                {
                  key: "valid",
                  label: "결과",
                  render: (row) => (
                    <StatusBadge tone={row.valid ? "negative" : "positive"}>
                      {row.valid ? "예상과 다르게 유효함" : "거부됨"}
                    </StatusBadge>
                  ),
                },
                { key: "issues", label: "보고된 문제" },
              ]}
              rows={rows}
            />
          </Stack>
        </TechnicalSection>
      </TechnicalStoryLayout>
    );
}
