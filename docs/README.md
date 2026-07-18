# 문서 안내

이 디렉터리는 Official Go로 확정된 LK Design System 3D 플랫폼의 제품 근거,
책임 경계, 기술 기준과 구축·마이그레이션 게이트를 관리합니다.

| 문서 | 역할 |
| --- | --- |
| [ADR-0001-SIBLING-REPOSITORY.md](ADR-0001-SIBLING-REPOSITORY.md) | 공식 형제 플랫폼 결정과 대안 |
| [PRODUCT_EVIDENCE.md](PRODUCT_EVIDENCE.md) | 실제 LK 제품에서 확인한 3D 구현 근거 |
| [DESIGN_AND_LDS_INTEGRATION_PLAN.md](DESIGN_AND_LDS_INTEGRATION_PLAN.md) | 디자인 baseline, LDS audit, 통합 일정과 디자인 품질 gate의 상위 계획 |
| [VISUAL_ALPHA_REFERENCE_RESEARCH.md](VISUAL_ALPHA_REFERENCE_RESEARCH.md) | 산업용 3D 레퍼런스, 동일 AMR 장면 A/B 기준과 Visual Alpha 기본 방향 결정 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | LDS Core, 3D foundation, 제품의 책임 분리 |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | 단계별 구현, 제품 rollout과 검증 게이트 |
| [P0_EXECUTION_SPEC.md](P0_EXECUTION_SPEC.md) | 저장소 scaffold, 초기 API, ticket backlog, 8주 기술 effort와 첫 shadow canary |
| [TECHNICAL_REFERENCES.md](TECHNICAL_REFERENCES.md) | ROS, glTF, Three.js와 renderer 공식 기술 기준 |
| [SPATIAL_PRIMITIVES_GUIDE.md](SPATIAL_PRIMITIVES_GUIDE.md) | 공개 WebGL 원자, LDS DOM 경계, Storybook 검토 순서와 사용 지침 |

질문별 source of truth는 다음과 같다.

| 질문 | 기준 문서 |
| --- | --- |
| 왜 별도 플랫폼인가 | ADR-0001 |
| 디자인·LDS 검토와 현재 통합 순서는 무엇인가 | DESIGN_AND_LDS_INTEGRATION_PLAN |
| Visual Alpha의 두 시각 방향과 기본안 근거는 무엇인가 | VISUAL_ALPHA_REFERENCE_RESEARCH |
| package·제품의 안정된 의존 방향은 무엇인가 | ARCHITECTURE |
| 장기 capability와 migration 범위는 무엇인가 | IMPLEMENTATION_PLAN |
| P0 API·ticket·shadow 안전 계약은 무엇인가 | P0_EXECUTION_SPEC |
| 어떤 공간 원자를 어떻게 조합하는가 | SPATIAL_PRIMITIVES_GUIDE |

문서의 제품 근거는 repository와 commit을 함께 기록합니다. 제품 코드의 현재
구현은 필요한 capability와 workflow seam의 근거이지, 이 저장소의 public API,
시각 스타일 또는 컴포넌트 구조를 그대로 복제하는 기준이 아닙니다.
