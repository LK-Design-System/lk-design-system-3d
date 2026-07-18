# LK Design System 3D 공식 플랫폼 구현 및 마이그레이션 계획

| 항목 | 값 |
| --- | --- |
| 상태 | Approved — Official Go |
| 결정일 | 2026-07-16 |
| 대상 | `lkrobotics-control-full`, `lk_web_viz`, LK Design System |
| 목표 | LK 제품군의 공식 범용 3D 플랫폼을 구축하고 두 기존 제품을 동일 release로 전환한 뒤 `1.0.0`을 배포 |

## 0. 현재 구현 기준 (2026-07-17)

- LDS3D reference smoke stack은 React 19.1.1, R3F 9.6.1, Three.js 0.185.1이다.
- `3d-three`/`3d-r3f`의 선언 Three peer range는 `>=0.185.1 <1`이지만, 현재
  검증은 reference exact version에서만 수행한다.
- Control Full의 0.168/R3F 8과 Web Viz의 0.170은 제품 근거의 관측값으로
  유지한다. 두 조합의 consumer CI와 compatibility package는 아직 구현·검증되지
  않았으며, 제품 연결 승인 뒤의 별도 결정이다.
- raw Three host, core camera/picking math와 R3F asset/coordinate bridge는
  local vertical slice로 구현되었다. browser lifecycle, hardware performance,
  product shadow와 registry publish gate는 완료 전제조건으로 남는다.

## 1. 공식 결정

LK Design System 3D를 LK Design System의 형제 저장소이자 공식 범용 3D
플랫폼으로 즉시 구축한다. 플랫폼의 필요성이나 존속 여부는 더 이상 파일럿
결과로 결정하지 않는다. Control Full과 Web Viz 적용은 선택적 검증이 아니라
필수 rollout·migration wave다.

앞으로 마일스톤에서 검증할 것은 플랫폼의 존재가 아니라 다음 항목이다.

- public API와 package boundary가 실제 제품 요구를 올바르게 표현하는가
- 좌표, 자산, camera, picking과 renderer lifecycle이 정확하고 안전한가
- 어느 기능을 어느 release에 포함하고 어떤 순서로 전환할 것인가
- 성능, 접근성, 보안과 운영 기준을 충족한 release인가

추진 원칙은 다음과 같다.

1. 두 제품의 신규 공통 3D 기능은 platform-first로 개발한다. 제품 저장소에서
   새 공통 foundation 구현을 만들지 않는다.
2. 기존 좌표·자산·camera·picking·semantic primitive 구현은 characterization
   test와 shadow comparison으로 보호하면서 플랫폼으로 이관한다.
3. `3d-core`는 renderer, React와 제품 코드에 의존하지 않는다.
4. core 공간은 right-handed, Z-up, meter/radian/second를 사용한다. glTF
   Y-up과 Three.js render frame 변환은 명시적 adapter에서 한 번만 수행한다.
5. 신규 자산은 manifest로 frame, unit과 bounds를 선언한다. 런타임 bounding
   box 기반 축 추정은 기한이 정해진 legacy adapter에서만 허용한다.
6. 제품의 transport, command, 권한, 저장, 업무 schema와 최종 scene
   composition은 제품에 남긴다.
7. 표준 reference stack은 React 19.1.1, React Three Fiber 9.6.1, Three.js
   0.185.1과 Drei 10.7.7이다. 선언 peer range의 모든 소비자는 별도 검증한다.
8. Control 전환을 위한 R3F 8 compatibility binding은 필요성이 승인될 때에만
   별도 deprecated package로 만들며 `1.0.0` 전에 제거한다.
9. 제품별 platform fork와 package source 복사는 허용하지 않는다. 두 제품은
   같은 fixed version group release를 소비한다.
10. 플랫폼은 Three.js, WebGPU 또는 Rerun을 대체하는 자체 엔진이 아니다.
    LK의 공간 의미와 상호작용 계약을 각 renderer에 투영하는 표준 계층이다.
11. 기술 공통화만으로 디자인 개선을 주장하지 않는다. LDS 실사, 기존 제품
    baseline과 동일 과제의 후보 비교를 통과한 visual direction만 기본값으로
    채택한다.

## 2. 추진 근거와 현재 기준점

검토 기준점과 source mapping은
[PRODUCT_EVIDENCE.md](PRODUCT_EVIDENCE.md)에 기록한다.

| 제품 | 기준 커밋 | 공식 전환 근거 |
| --- | --- | --- |
| Control Full | `de64d3c9b98eb9ce7aeaf7765035153492a57359` | `InteractiveMap3D`가 GLB 맵·로봇, 경로, landmark, 바닥 picking, 이동 명령, 작업 위치·방향과 top view를 함께 처리한다. GLB bounds 축 추정, map origin과 `zSign` 기반 ROS↔scene 변환을 제품이 직접 소유하며 로봇 GLB는 약 63.6 MB다. |
| Web Viz | `a984def117c05acd213f494cbb8a42e990595505` | `PointCloudViewer`, `PcdMap3DPanel`, `StructurePreviewViewer`, `BuildingTopology3DView`, `FloorScene3D`, `SiteStructurePreview3D`, `RerunViewer`가 R3F, imperative Three.js, WebGPU/WebGL과 Rerun을 병행한다. ROS Z-up→Three Y-up, native Z-up 편집 camera와 map Y→scene `-Z` 등 서로 다른 규칙이 공존한다. |

현재 stack은 다음처럼 갈라져 있다.

| 의존성 | Control Full | Web Viz | 플랫폼 목표 |
| --- | --- | --- | --- |
| React | 18.3 | 19 | 19 |
| Three.js | 0.168 | 0.170 | 0.185.1 reference (제품 호환 미검증) |
| React Three Fiber | 8 | 9 | 9 |
| Drei | 9 | 10 | 10 |

두 제품에는 이미 foundation, 실시간 공간 데이터, 저작과 renderer 연동 요구가
존재한다. 따라서 불확실성은 플랫폼 필요성이 아니라 API의 구체적 형태와
마이그레이션 순서에 있다. 이 계획은 foundation만 만든 뒤 존속을 재검토하지
않고 PointCloud·TF·Marker·Rerun과 Building·Floor·Site authoring까지 공식
roadmap에 포함한다.

## 3. 실행 체계와 책임

M0에서 다음 역할을 이름이 있는 담당자로 확정한다.

| 역할 | 책임 |
| --- | --- |
| Product Design Owner | 기존 제품 baseline, spatial visual direction, appearance matrix와 사용성 증거 |
| Platform Owner | package boundary, public API, roadmap와 최종 기술 결정 |
| LDS Core Reviewer | D-1에서 확인한 viewport/status component, token, 상태와 접근성 계약 정합성 |
| Control Migration Owner | `InteractiveMap3D` 전환, command payload 안전성과 rollback |
| Web Viz Migration Owner | editor, viewer, spatial-data와 authoring 전환 |
| Release Owner | registry, version group, changelog, canary와 rollback |
| Performance Owner | 장비·dataset·측정법과 성능 예산 승인 |
| Accessibility Owner | keyboard, focus, DOM 대안과 WCAG 2.2 AA 승인 |
| Security/Legal Owner | dependency, SBOM, license와 asset 배포 권리 승인 |

의사결정 원칙:

- Platform Owner가 공통 semantic API를 최종 승인한다.
- 제품 owner는 command, 권한, 저장과 제품 UX의 최종 책임을 유지한다.
- 한 제품만 필요한 동작을 억지로 core에 넣지 않는다. 제품 adapter 또는
  capability package로 격리한다.
- 마일스톤 gate 실패는 API, adapter 경계, release scope 또는 일정 교정으로
  처리한다. 플랫폼 구축 취소로 해석하지 않는다.
- 안전성 또는 데이터 정합성 gate가 실패한 기능은 해당 release에서
  비활성화할 수 있지만 대체 구현과 수정 계획을 동시에 남긴다.

## 4. 목표 패키지와 경계

상세 의존 방향은 [ARCHITECTURE.md](ARCHITECTURE.md)를 따른다.
좌표, glTF와 WebGL lifecycle의 공식 기준은
[TECHNICAL_REFERENCES.md](TECHNICAL_REFERENCES.md)를 따른다.

| 패키지 | 책임 | 금지 사항 |
| --- | --- | --- |
| `3d-core` | frame, transform, pose, entity, camera, selection과 spatial event의 renderer-neutral 계약 | React, Three.js, R3F, 제품 store/API import |
| `3d-assets` | GLB manifest, unit/frame/bounds 검증, legacy normalization과 asset metadata | 대용량 제품 원본 자산 저장, 제품별 CDN 정책 |
| `3d-testing` | coordinate round-trip, golden scene, asset, lifecycle와 성능 fixture | 제품 비밀 데이터와 대용량 production asset |
| `3d-three` | core↔Three 변환, camera rig, picking, semantic primitive, resize/dispose/context recovery | 제품 command, 권한과 업무 schema |
| `3d-r3f` | React 19/R3F 9용 binding과 lifecycle integration | R3F type을 core public API로 노출 |
| `3d-r3f-compat-v8` | 필요성이 승인될 때에만 만드는 최소 R3F 8 binding (현재 미구현) | 신규 기능 추가, `1.0.0` 포함 |
| `3d-pointcloud` | PointCloud buffer contract, material/LOD policy와 Three/WebGPU renderer adapter | ROS transport, 제품 저장과 backend PCD 변환 |
| `3d-tf` | timestamp가 있는 frame graph, transform resolution과 interpolation 정책 | ROS subscription과 제품 clock ownership |
| `3d-markers` | 공통 Marker 의미와 Three/R3F/Rerun projection | 제품 업무 marker schema 강제 |
| `3d-rerun` | core entity, PointCloud, TF와 Marker를 Rerun archetype으로 투영 | Rerun viewer UI 재구현, Three.js 의존 |
| `3d-authoring` | selection, gizmo, snapping, layer, validation과 serializable change contract | 권한, persistence와 제품 workflow |
| `3d-spatial` | Building·Floor·Site 공간 모델과 renderer primitive | 제품 backend schema와 배포 pipeline |

모든 패키지는 초기에는 fixed version group으로 함께 배포한다. capability
package는 core를 확장할 수 있지만 역방향 의존은 금지한다.

### 플랫폼과 제품의 책임 경계

플랫폼이 소유한다.

- 좌표계, unit, pose와 frame graph
- camera, picking, selection, gizmo와 scene lifecycle
- GLB manifest와 renderer-neutral asset metadata
- Robot, Goal, Path, Landmark, PointCloud, TF, Marker, Building, Floor와 Site의
  공통 semantic contract
- Three.js, R3F, WebGPU와 Rerun adapter
- 공통 성능, 접근성, 자원 해제와 context recovery 기준

제품이 소유한다.

- ROS, MQTT, WebSocket, REST 등 transport와 인증
- 로봇 이동 명령, 권한, 작업 규칙과 안전 interlock
- zone, stair, building 운영 등 제품 업무 schema
- 저장, undo/redo 정책, backend PCD→GLB 처리와 배포 pipeline
- 제품별 화면 구성과 최종 UX

## 5. 실행 순서

D-1 LDS·제품 baseline audit와 D0 visual direction을 M0·M1의 디자인 중립
foundation과 병렬 수행한다. G-D0는 M2의 renderer 기본 appearance와 M3의
visible rollout을 차단하지만 workspace, 좌표, asset과 testing 구현은 차단하지
않는다. 통합 순서와 gate는
[DESIGN_AND_LDS_INTEGRATION_PLAN.md](DESIGN_AND_LDS_INTEGRATION_PLAN.md)를
따른다.

M0→M1→M2가 기술 기반의 critical path다. M2 구현 중 M3의 adapter와 read-only
shadow 준비는 병렬화할 수 있지만 visible migration은 G-P0 뒤에 시작한다.
M4는 M2 완료 후 M3와 겹쳐 시작할 수 있으며, M3에서 확보한 실제 fixture를
반드시 재사용한다. M5는 M1 core contract를 기반으로 시작할 수 있지만 M4의
spatial-data 의미와 충돌하지 않도록 public alpha 전 통합 review를 거친다.
M6에서 전체 package group과 두 제품을 beta, release candidate, `1.0.0`
순으로 전개한다.

## 6. 단계별 구현 계획

M0·M1·M2와 첫 Control shadow canary를 ticket 단위로 실행하기 위한 저장소
구조, public API 초안, 의존성, `T1~T8` 기술 effort와 evidence bundle은
[P0_EXECUTION_SPEC.md](P0_EXECUTION_SPEC.md)를 따른다. 이 문서는 전체
프로그램의 범위와 release gate를 유지하며, P0 실행 명세는 첫 두 alpha와
제품 shadow 연결의 구체적인 작업 순서를 고정한다.

### D-1/D0 — LDS alignment와 visual direction

목적은 LDS3D의 필요성을 다시 판단하는 것이 아니라, LDS와 충돌하지 않으며
기존 제품보다 운용 의미가 명확한 기본 시각 언어를 선택하는 것이다.

필수 산출물:

- 실제 LDS repository·package·Storybook·Figma와 `Scene3DFrame` 또는 동등
  component의 기준 version audit
- Control·Web Viz의 동일 과제·상태 baseline
- LDS 재사용·LDS 확장·LDS3D 소유·제품 소유 ledger
- Operational Neutral과 Diagnostic Technical 후보
- semantic layer, entity state, interaction, label, motion과 contrast matrix
- public-export 기반 Current vs Candidate A/B Storybook
- task success, 오조작, 5초 판독, keyboard, contrast와 reduced-motion 결과

G-D0 전에는 renderer material·lighting·camera motion·semantic appearance와
scene token을 stable contract로 확정하지 않는다. 세부 실행과 승인은 디자인·LDS
통합 상위 계획을 따른다.

### M0 — 공식 kickoff, 기준선과 owner 확정

목적은 구축 여부 판단이 아니라 실행에 필요한 책임, 안전 기준과 측정 기반을
동결하는 것이다.

산출물:

- platform charter, Platform Owner와 제품별 migration owner
- 제품별 frame/axis/unit/origin 변환 목록과 source→core→render→pick
  역변환 표
- unit cube, 축 표식, robot pose, path, shifted origin, 표준 Y-up GLB와
  legacy Z-up-authored GLB를 포함한 작은 golden fixture
- 두 제품 전환 화면의 동작, screenshot, transform matrix, command payload와
  성능 기준값
- 좌표 오차, bundle, p50/p95 frame time, initial ready time, 안정 memory와
  GPU resource 예산
- package scope, registry, release 권한, changelog, canary와 rollback runbook
- 제품별 runtime master kill, shadow comparator flag, capability별
  `off | shadow | authoritative` mode와 기존 구현 fallback 경로
- React 19.1.1/R3F 9.6.1/Three 0.185.1 reference 수렴 계획과 조건부 R3F 8
  compatibility 제거 기한
- API decision log, risk register와 주간 migration review 운영 방식

완료 조건:

- 모든 역할에 이름과 review SLA가 있으며 `TBD` owner가 없다.
- 모든 좌표 변환에 이름, 입력 frame, 출력 frame과 소유자가 있다.
- 기존 map point, robot pose, pick 결과와 command payload를 재현하는
  characterization test가 두 제품에서 통과한다.
- 성능 측정 장비, browser, dataset, 반복 횟수와 노이즈 허용치가 고정된다.
- target stack 수렴 순서와, compatibility binding이 실제 생성될 경우의 제거
  시점이 두 제품 roadmap에 반영된다.

gate 미충족 시:

- owner, 기준값 또는 fixture가 없는 migration lane은 착수 순서를 조정한다.
- M1의 renderer-neutral 작업은 계속 진행하되 위험 항목에 owner와 수정
  deadline을 부여한다.
- 플랫폼 Official Go 결정은 재검토하지 않는다.

### M1 — `3d-core`, `3d-assets`, `3d-testing`

산출물:

- branded type을 사용하는 frame, transform, pose, unit과 timestamp 계약
- ROS/map/core/glTF frame 변환과 역변환
- camera, selection, spatial event와 entity identity 계약
- GLB manifest schema, validator, asset report와 legacy axis-normalization
  adapter
- property test, round-trip test, golden matrix와 asset fixture
- package-boundary 검사와 public API report

완료 조건:

- `map → core → renderer frame → core → map` round-trip이 M0 승인 오차
  이내다.
- pure math fixture는 절대 오차 `1e-6` 이내이며 잘못된 unit, frame 또는
  비가역 transform은 명시적으로 실패한다.
- `3d-core` dependency graph에 React, Three.js, R3F와 제품 패키지가 없다.
- 신규 GLB는 manifest 없이는 CI를 통과하지 못한다.
- 축 휴리스틱은 deprecated legacy entry point 밖에서 호출할 수 없다.
- Control과 Web Viz fixture가 같은 `3d-testing` package에서 실행된다.

release:

- `A1-local`: tarball/local registry와 두 고정 consumer smoke까지이며 registry와
  제품 repository를 변경하지 않는다.
- `G1`: 별도 배포 권한 아래 fixed version group `0.1.0-alpha.1`을 publish하고
  두 제품 CI에 read-only validation과 fixture test로 연결한다.

### M2 — `3d-three`, `3d-r3f`와 stack 수렴

표준 지원 stack:

- React 19
- React Three Fiber 9
- Three.js 0.185.1 reference
- Drei 10

산출물:

- core transform을 Three `Matrix4`와 scene root에 적용하는 adapter
- orbit, top, home, focus와 bounded camera rig
- normalized picking/selection event와 layer filtering
- Robot, Goal, Path와 Landmark semantic primitive 및 renderer-neutral scene
  theme input. LDS CSS variable 해석은 제품 composition 또는 integration
  example이 담당하며 renderer package는 LDS를 import하지 않는다.
- mount, resize, pause, hidden, dispose, lost, restoring, restored lifecycle
- React 19/R3F 9용 `3d-r3f`
- 필요성이 승인될 경우의 Control transition용 deprecated `3d-r3f-compat-v8`
- dependency convergence guide와 codemod 또는 mechanical migration checklist

compatibility 정책:

- `3d-r3f-compat-v8`은 실제 Control consumer smoke가 필요성을 입증하고
  별도 ADR이 승인될 때에만 만든다.
- 만들어질 경우 semantic API를 새로 정의하지 않고 `3d-r3f`와 같은 core
  contract를 얇게 binding하며, metadata·문서·runtime warning에서 처음부터
  deprecated로 표시한다.
- 신규 화면과 신규 capability는 compatibility package를 사용할 수 없다.
- React 18/R3F 8/Three 0.168 조합의 CI는 Control rollout 기간에만 유지하며,
  Control을 React 19/R3F 9/Three 0.185.1 reference로 올린 뒤 compatibility
  package와 legacy matrix를 `1.0.0` 전에 제거한다.

완료 조건:

- Three.js는 peer dependency이며 제품 bundle에 두 번째 Three.js 사본이 없다.
- target stack이 build, typecheck, browser smoke와 visual fixture를 통과한다.
- temporary Control stack도 compatibility smoke test를 통과하되 public API
  report에 target 전용 API와의 차이가 없다.
- 20회 mount/unmount 후 geometry, material, texture, listener와 animation
  loop 수가 초기 안정값으로 돌아오고 WebGL context가 누적되지 않는다.
- 강제 context loss 후 오류 상태가 D-1에서 확인한 LDS viewport/status
  component 또는 제품 composition에 전달되고 자동 복구 또는 명시적 retry가
  가능하다.
- fixed camera, asset와 DPR에서 golden visual 차이가 승인 범위 안이다.

release:

- fixed version group `0.1.0-alpha.2`
- Control과 Web Viz consumer smoke를 수행하고 Control compatibility package는
  실제 R3F 8 연결에 필요할 때만 deprecated 상태로 publish

### M3 — Control Full과 Web Viz 병렬 migration

두 migration lane은 같은 platform release와 같은 golden fixture를 사용하며
동시에 진행한다. 어느 한쪽도 선택적 pilot이 아니다.

#### M3-A — Control Full

대상:

- `InteractiveMap3D`
- GLB map과 robot placement
- Robot, Goal, Path와 Landmark 표시
- floor picking, top/home/focus camera와 loading/error state

전환 순서:

1. 기존 map/robot/path/landmark 위치, camera와 바닥 pick 결과를 fixture로
   고정한다.
2. 제품 입력을 `3d-core` frame으로 변환하는 `ControlSceneAdapter`를 추가한다.
3. 첫 production shadow에서는 기존 renderer의 authoritative floor hit를 양쪽
   계산에 전달하고 위치, 회전, hit 이후 frame projection과 command payload
   차이를 기록한다. 독립 LDS3D raycast는 M2 browser fixture에서 검증한다.
4. coordinate/origin, camera rig, GLB manifest/placement, picking과 semantic
   primitive를 platform package로 교체한다.
5. 첫 rollout에서는 필요성이 승인된 경우에만 `3d-r3f-compat-v8`을 사용한다.
6. Control stack을 React 19/R3F 9/Three 0.185.1 reference로 수렴시키고 target
   `3d-r3f`로 전환한다.
7. 관찰 기간 후 중복 transform, bounding-box 축 추정과 compatibility binding을
   제거한다.

Control에 남는 것:

- live robot data, 이동 명령, 권한과 안전 interlock
- 작업 위치·방향 생성 규칙, route와 product store
- 63.6 MB 로봇 모델 원본과 최종 scene composition

승인 조건:

- golden robot, path, goal과 landmark가 승인 오차 안에서 기존 위치·방향과
  일치한다.
- `map → scene → floor pick → map` 결과와 실제 command payload가 기존과
  동일하다.
- top/home/focus, GLB 가시성, loading/error/recovery가 회귀하지 않는다.
- target stack에서 bundle, p95 frame time, initial ready time과 memory gate를
  통과한다.
- runtime master kill로 registry rollback 없이 즉시 기존 경로를 활성화할 수
  있고, authoritative renderer를 유지한 채 shadow comparator만 별도로 끌 수
  있다.

#### M3-B — Web Viz

1차 대상:

- `PcdMap3DPanel`
- `PointCloudViewer`의 coordinate, camera, picking과 lifecycle foundation
- `StructurePreviewViewer`의 asset manifest와 renderer lifecycle

전환 순서:

1. PCD editor의 Z-up camera와 PointCloud viewer의 ROS Z-up→Three Y-up
   변환을 각각 characterization test로 고정한다.
2. 두 화면의 data frame을 같은 `3d-core` 계약으로 표현하고 render frame
   차이를 adapter에서만 처리한다.
3. camera preset, picking, selection과 lifecycle을 platform contract로
   교체한다.
4. Structure preview의 GLB frame, unit과 bounds를 manifest로 검증한다.
5. R3F 화면은 target `3d-r3f`, imperative Three 화면은 `3d-three`를
   사용하되 같은 core fixture를 통과시킨다.
6. PointCloud, TF, Marker와 Rerun의 실제 renderer 이관은 M4 capability
   package로 이어서 수행한다.

Web Viz에 남는 것:

- ROS/WebSocket transport와 product clock source
- zone·stair 업무 schema, 저장 payload와 editor store
- backend PCD→GLB 처리, asset publication과 renderer enablement·배포 정책

승인 조건:

- zone/stair 선택, 이동과 pick 결과가 기존 저장 payload와 일치한다.
- R3F와 imperative Three 경로가 같은 core transform fixture를 통과한다.
- Structure preview의 WebGPU→WebGL fallback과 context recovery가 유지된다.
- product store type이나 업무 schema가 platform package에 유입되지 않는다.

#### M3 공통 완료 조건

- Control과 Web Viz가 fork와 source copy 없이 동일 package release를 쓴다.
- 두 제품의 platform 경로가 runtime master와 capability mode 뒤에서 production
  canary로 실행되며 shadow comparator는 별도로 끌 수 있다.
- 좌표, command/save payload, 성능, lifecycle과 접근성 gate를 모두 통과한다.
- 실패한 항목은 공통 API, 제품 adapter 또는 rollout 순서 중 어디를 수정할지
  owner와 deadline이 기록된다.

### M4 — PointCloud·TF·Marker·Rerun capability

M4는 별도 Go 결정 대상이 아니라 공식 platform capability wave다.

산출물:

- PointCloud position/color/intensity/classification buffer contract
- static, streaming과 incremental update 수명주기
- point budget, LOD, frustum culling, material과 WebGPU/WebGL fallback 정책
- timestamp가 있는 TF frame graph, transform resolution, interpolation,
  extrapolation과 stale-data 상태
- line, points, pose, text, mesh와 volume Marker semantic contract
- Three/R3F renderer adapter와 Rerun projection
- PointCloud·TF·Marker의 동일 timestamp golden fixture
- 대용량 dataset을 대체하는 synthetic density/performance fixture

경계:

- ROS message subscription, reconnect와 인증은 제품이 소유한다.
- backend PCD parsing·정제·PCD→GLB 알고리즘은 이 package로 이동하지 않는다.
- platform은 제품 transport 결과를 canonical buffer와 timestamp contract로
  받는다.
- `3d-rerun`은 Rerun viewer UI를 복제하지 않고 동일 entity와 spatial data를
  Rerun archetype으로 투영한다.

완료 조건:

- PointCloud, TF와 Marker가 동일 timestamp fixture에서 Three/R3F와 Rerun
  사이에 승인된 좌표·색상·identity 정합을 유지한다.
- out-of-order, missing transform, stale frame과 partial buffer가 명시된
  상태와 복구 경로를 가진다.
- 고정 point budget별 p50/p95 frame time, upload time, memory와 context
  recovery가 예산을 통과한다.
- Web Viz production canary가 기존 renderer 대비 저장 payload와 interaction
  의미를 유지한다.
- Rerun adapter가 core 또는 Three package에 Rerun dependency를 역으로
  유입하지 않는다.

### M5 — Building·Floor·Site authoring foundation

M5는 Web Viz의 기존 building 화면을 기반으로 LK의 공통 공간 저작 foundation을
구축한다. 완성된 제품 editor를 복제하지 않고 여러 제품이 재사용할 공간 모델,
상호작용과 변경 계약을 제공한다.

`3d-spatial`이 Building·Floor·Site 모델과 renderer primitive를 소유하고,
`3d-authoring`이 selection, gizmo, snapping과 change contract를 소유한다.

대상:

- `BuildingTopology3DView`
- `FloorScene3D`
- `SiteStructurePreview3D`
- 이후 제품에서 사용할 Building·Floor·Site authoring surface

산출물:

- Building, Floor, Site, level, transform과 parent/child 공간 모델
- floor elevation, local frame, asset reference와 bounds 규칙
- selection, multi-selection, transform gizmo, axis lock, snapping과 validation
- layer visibility, isolate, focus, fit와 authoring camera preset
- serializable change set와 product persistence adapter contract
- preview/editor가 공유하는 asset placement와 scene composition primitive
- keyboard/DOM 대안을 포함한 authoring accessibility pattern

제품에 남는 것:

- 권한, 승인 workflow, 저장소, revision과 conflict 정책
- zone·stair 등 제품별 업무 entity와 validation
- backend geometry 생성, PCD 처리와 배포
- 제품별 undo/redo UX와 final screen composition

완료 조건:

- Building→Floor→Site transform round-trip과 serialization fixture가 데이터
  손실 없이 통과한다.
- preview, topology와 floor editor가 같은 asset/transform contract를 쓴다.
- gizmo, numeric input과 keyboard 대안이 같은 change set을 생성한다.
- 대형 building fixture에서 draw call, memory, selection latency와 load
  budget을 통과한다.
- 제품 업무 schema 없이도 capability package의 public API가 설명되고
  dependency boundary 검사를 통과한다.

### M6 — beta, stack 완전 수렴과 `1.0.0` rollout

M6의 목적은 플랫폼 존속 판단이 아니라 공식 지원 release의 배포다.

#### Beta

- 모든 package를 하나의 fixed version group beta로 배포한다.
- Control과 Web Viz production canary가 같은 beta release를 소비한다.
- 신규 3D 기능은 beta package를 기본 경로로 구현한다.
- API report, migration guide, coordinate handbook, asset guide, adapter guide,
  failure mode와 rollback runbook을 공개한다.
- security audit, license/SBOM과 asset redistribution review를 완료한다.
- WCAG 2.2 AA, golden visual, 성능, lifecycle과 context-loss gate를 통과한다.

#### Release candidate

- Control과 Web Viz의 platform 경로를 기본값으로 전환한다.
- legacy transform과 runtime axis heuristic을 제거하거나 명시적 legacy
  package로 격리한다.
- React 19/R3F 9/Three 0.185.1 reference로 두 제품 stack을 수렴시킨다.
- 실제 생성된 `3d-r3f-compat-v8`과 React 18/R3F 8 legacy CI matrix를 제거한다.
- support matrix, incident owner, review SLA와 release calendar를 확정한다.

#### `1.0.0`

- 지원 stack은 React 19, R3F 9, Three.js 0.185.1 reference와 Drei 10이다.
- 두 제품이 동일한 `1.0.0` release를 production 기본 경로로 사용한다.
- 제품별 fork, source copy와 compatibility package가 없다.
- rollback 가능한 직전 안정 release와 runtime/capability mode config를 최소
  한 release cycle 유지한다.
- SemVer, deprecation, security patch와 support policy를 시행한다.

`1.0.0` 전 breaking change에도 migration note를 요구한다. `1.0.0` 이후 제거
예정 API는 최소 한 minor release 동안 deprecation warning, 대체 API와
migration 예제를 제공한다.

## 7. 품질 및 릴리스 게이트

| 영역 | 필수 증거 |
| --- | --- |
| 정확성 | unit/property/round-trip test, 두 제품 golden fixture, pick 역변환과 command/save payload 비교 |
| 타입·API | typecheck, public API report diff, 제품 타입 import 금지와 package-boundary 검사 |
| 시각 회귀 | 고정 camera·asset·DPR screenshot 비교와 승인된 차이 기록 |
| 성능 | 고정 장비·browser·dataset의 p50/p95 frame time, load, bundle, upload와 memory 비교 |
| 수명주기 | 반복 mount/unmount, resize, hidden/visible, context loss/restore browser test |
| 호환성 | target stack CI, migration 기간의 명시적 legacy matrix와 duplicate dependency 검사 |
| 접근성 | keyboard, focus, name/role/value, DOM 대안, motion과 non-text contrast 점검 |
| 보안·법무 | dependency audit, license/SBOM, fixture와 asset 배포 권리 확인 |
| 문서 | coordinate 예제, asset 규격, adapter 작성법, failure mode, migration과 rollback guide |
| 배포 | canary 설치→두 제품 smoke test→승인→registry publish→rollback 검증 |

모든 PR은 lint, typecheck, unit/property, package-boundary, bundle-size, browser
smoke와 API report를 통과해야 한다. beta와 stable release는 golden visual,
성능, 접근성, 보안과 두 제품 production canary 승인을 추가로 요구한다.

## 8. 성능 기준

- peer dependency가 제품 bundle에 중복 포함되지 않아야 한다.
- 공용화 전 대비 p95 frame time, initial ready time과 안정 memory가 5% 이상
  악화되면 기본적으로 release gate 실패다.
- M0에서 renderer별 특성과 측정 노이즈를 반영해 더 엄격하거나 적합한
  절대 예산으로 교체할 수 있으며 근거를 ADR에 남긴다.
- draw call, geometry, texture, point/instance 수, GPU upload와 retained
  resource를 fixture 결과에 함께 기록한다.
- 정적 장면은 on-demand rendering을 기본으로 하고 continuous loop는
  capability 또는 제품이 명시적으로 요청한다.
- PointCloud는 point budget, LOD 전환, upload latency와 memory ceiling을
  별도 측정한다.
- 대용량 제품 asset은 저장소와 일반 visual test에 넣지 않는다. 축소 fixture,
  checksum metadata와 production canary를 분리한다.
- resource counter와 browser memory 수치가 안정값으로 돌아오지 않으면
  release할 수 없다.

## 9. 접근성 기준

- D-1에서 확인한 LDS viewport/status component 또는 제품 composition이 scene
  이름, description, loading, error, recovery와 toolbar의 접근 가능한 DOM을
  소유한다.
- viewport는 Tab으로 진입·이탈할 수 있으며 keyboard trap을 만들지 않는다.
- camera preset, selection, reset, layer와 focus에는 keyboard 또는 동일
  기능의 DOM 대안이 있다.
- 이동 명령, transform과 authoring처럼 중요한 pointer 작업은 numeric input,
  목록 선택 또는 동등한 제품 UI 경로를 제공한다.
- 선택, 경고, stale data와 오류 상태는 색상만으로 구분하지 않고 DOM의
  이름과 상태에도 반영한다.
- motion 감소 설정에서 자동 camera animation을 제거하거나 즉시 완료할 수
  있다.
- transform gizmo의 axis와 delta는 screen reader가 읽을 수 있는 상태로
  노출하고 keyboard/numeric edit와 동일 change set을 생성한다.
- beta 전에 WCAG 2.2 AA 기준 keyboard, focus, name/role/value와 non-text
  contrast 점검 결과를 남긴다.

## 10. 주요 위험과 대응

| 위험 | 대응 |
| --- | --- |
| 공격적 일정이 좌표·명령 안전성 검증을 압박 | characterization test, deep-immutable shadow comparison, command payload diff, runtime/comparator kill과 capability mode rollback은 일정과 무관한 필수 gate로 유지 |
| 좌표 변경이 실제 로봇 명령 위치를 바꿈 | round-trip fixture, production-like command fixture와 Control owner 승인 없이는 기본 경로 전환 금지 |
| 플랫폼 범위가 빠르게 커져 잘못된 추상화가 고정 | renderer-neutral semantic contract와 capability package 분리, API report와 제품 schema 유입 CI 금지 |
| React/R3F upgrade와 scene migration이 충돌 | 임시 deprecated R3F 8 binding, Control lane의 단계적 target stack 수렴, `1.0.0` 전 compatibility 제거 |
| 임시 compatibility가 영구화 | 신규 기능 사용 금지, runtime deprecation, owner와 삭제 milestone 명시, `1.0.0` gate에서 package 부재 검증 |
| 제품별 adapter가 fork로 변질 | 동일 release 의무, source-copy 탐지, 공통 fixture와 adapter review |
| Three.js 중복과 bundle 증가 | peer dependency, lockfile/번들 분석과 size gate |
| GPU memory 또는 context 누수 | renderer resource counter, 반복 lifecycle과 forced context-loss test |
| WebGPU, WebGL과 Rerun을 하나의 renderer API로 억지 통합 | core semantic contract만 공유하고 adapter lifecycle과 capability를 분리 |
| PointCloud 성능이 평균 fixture만 통과 | density 단계별 p95, upload, memory와 production canary를 함께 gate |
| authoring foundation이 제품 workflow를 흡수 | change contract까지만 platform 소유, 권한·저장·승인·업무 schema는 제품에 유지 |
| maintainer와 release 운영 부하 | Platform Owner, reviewer SLA, release calendar, incident와 rollback runbook을 beta 전 확정 |
| canvas 접근성을 내부 객체 focus로만 해결 | LDS chrome, product DOM 대안과 keyboard workflow를 acceptance gate로 검증 |

## 11. 릴리스 및 범위 교정 게이트

이 계획에는 플랫폼 존속을 판단하는 Stop/Go gate가 없다. 각 gate는 release
준비도와 범위 교정만 판단한다.

| 시점 | 통과 조건 | 미통과 시 조치 |
| --- | --- | --- |
| G-D1 LDS·baseline gate | LDS actual API/version, 두 제품 현재 과제, ownership ledger와 평가 fixture 확인 | 미확인 LDS 가정을 target contract로 되돌리고 visual/API freeze 보류 |
| G-D0 visual direction gate | LDS token mapping, Candidate A/B, appearance matrix, 접근성과 동일 과제 평가 승인 | foundation math·asset은 계속하되 renderer 기본 visual과 visible rollout 보류 |
| M0 kickoff gate | owner, 기준선, fixture, 예산, target stack과 rollback 확정 | 누락 항목에 owner/deadline 부여, 영향받는 migration lane 순서 조정 |
| M1 foundation alpha | renderer-neutral core, asset validation과 두 제품 golden round-trip 통과 | frame/API 모델 수정, 실패 fixture를 회귀 suite에 추가하고 alpha 재배포 |
| G-D0R·G-L0·G2 renderer alpha | 실제 renderer fidelity, LDS integration, target stack, camera/picking/lifecycle, visual·접근성·duplicate dependency와 context recovery 통과 | visual direction, LDS mapping, renderer adapter 또는 resource ownership 교정, 해당 alpha release 보류 |
| M3 product rollout | 두 제품이 같은 release를 사용하고 command/save payload, immutable-input/no-side-effect와 성능 gate 통과 | 공통 API와 제품 adapter 책임을 재분류하고 해당 capability를 legacy mode로 rollback |
| M4 spatial-data alpha | PointCloud·TF·Marker가 Three/R3F/Rerun에서 같은 의미와 성능 예산 유지 | 문제 capability를 다음 alpha로 이동하거나 renderer별 adapter를 분리 |
| M5 authoring alpha | Building·Floor·Site serialization, gizmo와 accessibility workflow 통과 | authoring primitive 또는 change contract 범위를 교정하고 제품 workflow 유입 제거 |
| M6 beta | 두 production canary, target stack 수렴, 문서·보안·접근성·운영 gate 통과 | named foundation contract는 수정 후 beta에 유지하고 비핵심 capability 확장만 `1.1`로 이동 |
| M6 `1.0.0` | 두 제품 기본 경로, 동일 release, no fork, no R3F 8 compatibility, support/rollback 확정 | release candidate를 유지하며 실패 gate 수정 후 `1.0.0` 재심사 |

범위 교정은 capability의 release 시점을 바꾸거나 adapter를 더 명확히 분리하는
행위다. 플랫폼을 내부 utility로 축소하거나 별도 저장소 결정을 되돌리는
의사결정이 아니다. 다만 정확성, 명령 안전, 보안 또는 데이터 손실 위험이 있는
기능은 해당 release에서 반드시 제외하거나 비활성화한다.

## 12. 최종 완료 정의

이 계획은 다음이 현재 상태의 증거로 모두 확인될 때 완료된다.

1. LK Design System 3D가 owner, release process와 support policy를 가진 공식
   형제 저장소로 운영된다.
2. Control Full과 Web Viz가 동일한 `1.0.0` fixed version group release와
   `3d-testing` golden fixture를 쓴다.
3. 두 제품의 production 기본 화면에서 coordinate, asset, camera, picking,
   selection과 renderer lifecycle 계약이 동작한다.
4. Control의 실제 command payload와 Web Viz의 저장 payload가 migration 전
   semantics를 유지한다.
5. PointCloud, TF, Marker와 Rerun adapter가 동일 core entity와 timestamp
   contract를 사용한다.
6. Building, Floor와 Site 화면이 공통 authoring foundation의 transform,
   selection과 change contract를 사용한다.
7. React 19/R3F 9/Three 0.185.1 reference로 stack이 수렴했고, 실제 생성된
   `3d-r3f-compat-v8`, 제품별 fork와 source copy가 없다.
8. 중복 transform 공식과 런타임 축 추정이 제거되거나 기한이 있는 legacy
   adapter로 격리된다.
9. LDS Core, platform과 제품 책임 경계가 dependency 검사로 유지된다.
10. 정확성, 성능, lifecycle, 접근성, 호환성, 보안과 release gate가 모두
    통과한다.
11. migration, rollback, coordinate/asset guide, version support와 장기
    ownership 문서가 배포되어 있다.
