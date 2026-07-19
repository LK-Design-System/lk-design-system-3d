# LK Design System 3D

LK ROBOTICS 제품이 공통으로 사용하는 3D 좌표, 카메라, 자산, 장면 표현과
렌더러 수명주기 계약을 관리하는 **공식 범용 3D 플랫폼 형제 저장소**입니다.

플랫폼 구축은 `Official Go`로 확정되었습니다. 현재 `Foundation Alpha.1`과
`Visual Alpha V0`의 로컬 후보까지 구현됐으며 패키지는 아직 안정 버전이 아닙니다.
Control Full과 Web Viz의 첫 적용은
플랫폼 존속 여부를 판단하는 파일럿이 아니라 필수 마이그레이션의 첫 배포
wave입니다.

## Foundation Alpha.1 + Visual Alpha V0

현재 로컬 후보에는 renderer-neutral `core`, manifest·ownership을 담당하는
`assets`, golden fixture·contract check를 제공하는 `testing`, PointCloud·TF·Marker
계약을 담당하는 `pointcloud`·`tf`·`markers`, 실제 Three.js·R3F WebGL 구현을
제공하는 `r3f` package가 포함됩니다.

Storybook은 `Foundations → Assets → Primitives → States → Scenes → LDS Integration`
순서로 소유권을 드러냅니다. 각 public API 또는 명시적 API 묶음은 독립 owner
page에서 실제 WebGL로 검토하고, 상태·장면·LDS 조합은 별도 scenario page에 둡니다.
Primitive catalog는 `SceneCanvas`, `Selectable`, `AmrRobot`, `GoalMarker`,
`PathRibbon`, `PointCloudLayer(s)`, `MarkerLayer`, `SectionBox`, `EditVolume`,
`SpatialStructure`, `TransformGizmo`, `SceneStateMarker`, `GltfModel`의
사용·상태·상호작용을 각각 검토합니다. AMR operations, 실제 GLB 6종 asset review,
goal·path 상태, renderer loading·empty·error·retry, 실제 LDS composition도 각 소유
group 아래에서 검토합니다. 기본 시각 방향은
운영 상태 식별성과 LDS chrome 조합성이 더 높은 `Operational Neutral`입니다.
문서 앱은 형제 checkout `../LK Design System`의
`@lk-robotics/design-system-core@0.1.0`을 `link:`로 소비하며, 기준 commit은
`b5f910c20c87358700c85707b789dcfe489b99b6`입니다. `Scene3DFrame`,
`SelectionInspector`, `SegmentedControl`, `ViewportStatusBar`, `StatusBadge`와 공식
`styles.css`를 실제 public API로 사용합니다. renderer package에는 LDS 의존성을
넣지 않았고, LDS·제품 repository 변경이나 registry publish도 수행하지 않았습니다.

재현 가능한 지원 기준은 위 clean `b5f910c…` pin으로 유지합니다. 최종 로컬 검증
시점에는 공유 sibling checkout이 다른 작업으로 `0aa7f8d2856546d9193dac190f4777f0ca9caa64`
및 dirty 상태로 이동해 있었습니다. 두 commit 사이와 dirty source를 다시 비교했으며,
이번 조합이 사용하는 `CanvasEditorShell`, `Scene3DFrame`, `LayerPanel`,
`SelectionInspector`, `ViewportStatusBar`, `ViewerToolbar`, `Button`,
`SegmentedControl`, `styles.css`에는 source delta가 없었습니다. 따라서 로컬 재검증은
유효하지만, dirty sibling이나 `0aa7f8d…`를 새 지원 pin 또는 portable CI 근거로
승격하지 않습니다.

2026-07-17 LDS baseline audit에서 `Scene3DFrame`의 public
`variant="embedded"` 계약을 확인했습니다. `CanvasEditorShell`처럼 부모 surface에
중첩되는 wide viewer는 이 variant로 자신의 border/radius만 제거하고, narrow의
독립 viewer는 `standalone` 기본값을 유지합니다. 이는 LDS3D의 실제 docs composition에
적용한 규칙이며, 아직 `lk_web_viz` 제품 migration을 의미하지 않습니다.

```sh
pnpm install
pnpm build
pnpm typecheck
pnpm test
pnpm lint
pnpm build-storybook
pnpm visual-alpha:runtime-qa
pnpm package-smoke
```

개발 중 Storybook은 `pnpm storybook`으로 확인합니다. 형제 저장소와 동시에 띄울
수 있도록 `http://127.0.0.1:6007`에 바인딩합니다(코어 `6006`, Robotics UI `6008`). API report와 evidence는 각각
`pnpm api-report`, `pnpm evidence`로 다시 생성할 수 있습니다. `pnpm lint`는 승인된
root·subpath API baseline과 필수 package export 집합의 drift도 함께 차단합니다.
`pnpm visual-alpha:runtime-qa`는 먼저 `pnpm build-storybook`을 실행한 뒤 사용하며,
Chromium에서 실제 WebGL·GLB 로드, Home/Top/Focus, hover·selection, LDS inspector
동기화와 loading·empty·error·retry를 직접 조작해 검증합니다.

## 공식 결정

LK Design System 3D를 별도 저장소와 독립 release cadence를 가진 공식
플랫폼으로 구축합니다. 또 하나의 독립 UI 디자인 시스템이 아니라 기존
`LK Design System`의 공간·렌더링 확장입니다.

- `LK Design System`은 viewport chrome, 상태, toolbar, 접근성 표현을 소유합니다.
- 이 저장소는 좌표 변환, camera rig, 3D asset 계약, scene primitive와
  renderer lifecycle을 소유합니다.
- 맵 저작은 Native 2.5D Builder와 Unity·Unreal·Isaac 등 외부 장면 import를 모두
  지원하고, 두 경로가 같은 제안된 renderer-neutral 맵 계약으로 합류합니다.
- 이 저장소는 공통 map schema, 좌표/source binding 정규화와 순수
  validation·diff 계약을 소유합니다. 제품은 file I/O, 명령, 권한, history,
  저장·revision·merge, 변환 실행·배포와 완성 화면을 계속 소유합니다.
- 두 제품의 신규 공통 3D foundation은 이 플랫폼을 우선 사용합니다.
- 기존 제품의 중복 좌표·카메라·자산·picking 구현도 단계적으로 이관합니다.
- 제품별 fork 대신 같은 package release와 명시적 adapter를 사용합니다.

현재 reference smoke stack은 React 19.1.1, React Three Fiber 9.6.1,
Three.js 0.185.1입니다. `3d-three`와 `3d-r3f`의 선언 peer range는
`three >=0.185.1 <1`이지만, 이는 모든 범위의 소비자 검증을 뜻하지 않습니다.
Control Full의 R3F 8 조합용 compatibility binding은 아직 구현·검증되지 않았으며,
실제 제품 연결이 승인될 때에만 별도 deprecated package로 결정합니다.

## 문서

- [문서 안내](docs/README.md)
- [형제 저장소 의사결정](docs/ADR-0001-SIBLING-REPOSITORY.md)
- [Dual-path 맵 저작 의사결정](docs/ADR-0002-DUAL-PATH-MAP-AUTHORING.md)
- [제품 근거](docs/PRODUCT_EVIDENCE.md)
- [디자인 방향·LDS 통합 상위 계획](docs/DESIGN_AND_LDS_INTEGRATION_PLAN.md)
- [Visual Alpha 레퍼런스 조사·시각 방향 결정](docs/VISUAL_ALPHA_REFERENCE_RESEARCH.md)
- [아키텍처와 책임 경계](docs/ARCHITECTURE.md)
- [구현 및 마이그레이션 계획](docs/IMPLEMENTATION_PLAN.md)
- [P0 실행 명세와 첫 Shadow Canary](docs/P0_EXECUTION_SPEC.md)
- [기술 기준 자료](docs/TECHNICAL_REFERENCES.md)
- [공개 공간 원자 사용 지침](docs/SPATIAL_PRIMITIVES_GUIDE.md)

## 구축 로드맵

### D-1/D0 — Design & LDS Alignment

- Visual Alpha Storybook에서 실제 LDS 0.1.0 public component와 token CSS 조합
- 지원 LDS commit/package contract 기록; Figma·제품 적용 baseline 비교는 G-D0에서 수행
- Control·Web Viz 현재 화면과 사용자 과제 baseline
- Operational Neutral·Diagnostic Technical 비교 Storybook 구현, Operational 기본안 선정
- semantic layer·상태·token mapping과 디자인 평가 gate
- G-D0 승인 전 renderer 기본 visual과 scene token 안정화 금지

### P0 — Platform Core

- `core`, `assets`, `three`, `r3f`, `testing`
- 좌표·단위·frame과 map/ROS/Three 변환
- camera, picking, selection과 renderer lifecycle
- GLB manifest, validation과 legacy asset normalization
- Asset, Robot, Goal, Path, Landmark semantic entity와 G-D0에서 승인된 기본 visual

### P1 — Robotics Visualization

- PointCloud, TF, Marker
- Rerun projection adapter
- WebGPU/WebGL capability와 성능 계측

### P2 — Spatial Authoring

- Native 2.5D Builder와 External Scene Import가 공유하는 versioned map document
  및 source/derived provenance 계약
- Building, Level, Site hierarchy와 polygon floor, polyline wall, door/transition,
  waypoint-edge route graph, area/goal/charger/dock spatial contract
- transform gizmo, point capture, snapping, ghost placement와 authoring interaction
  foundation
- Isaac/OpenUSD reference import → Unreal USD → Unity adapter 순의 conformance 검증
- durable/weak source binding, 이전 normalized base와 hash 기반 reimport diff;
  persistence·remap·merge/conflict UI는 제품 소유

## 명시적 비범위

- 제품 application routing과 완성 화면
- 로봇 명령, 권한, 안전 정책
- ROS/MQTT/WebSocket transport
- PCD 정리, mesh 생성 같은 서버 알고리즘
- 특정 제품의 task, building, facility schema
- 대용량 로봇·시설 모델 원본 저장소
- Three.js, R3F 또는 Rerun을 대체하는 자체 렌더링 엔진
- 범용 CAD/mesh/material editor 또는 engine-native component의 완전한 왕복
