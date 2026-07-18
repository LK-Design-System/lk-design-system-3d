# LDS3D 디자인 방향·LDS 통합 상위 계획

| 항목 | 값 |
| --- | --- |
| 상태 | 실행 계획 초안 — LDS 실사와 디자인 방향 승인 전 |
| 기준일 | 2026-07-17 |
| 대상 | LK Design System, LK Design System 3D, Control Full, Web Viz |
| 핵심 결정 | 기술 공통화만으로 디자인 우수성을 주장하지 않는다. LDS 정합성과 기존 제품 대비 사용성 증거를 통과한 시각 방향만 LDS3D 기본값으로 채택한다. |
| 공격적 기준 일정 | 4개 실행 lane 기준 10주, 변경 canary가 발생하면 연장 |
| 첫 산출물 | D-1 LDS·제품 baseline audit와 D0 Reference & Visual Direction Gate |

## 1. 이 문서의 역할

LK Design System 3D는 좌표와 renderer API만 제공하는 기술 SDK이면서 동시에
LK 제품에서 반복되는 공간 UX 의미를 표준화하는 design-system extension이다.
따라서 성공은 다음 네 축을 모두 증명해야 한다.

1. **공간 정확성:** 같은 pose, asset, camera와 pick이 제품·renderer가 달라도
   같은 의미를 가진다.
2. **운용 명료성:** robot, goal, path, selection, stale와 error를 기존보다
   빠르고 오해 없이 읽을 수 있다.
3. **LDS 정합성:** viewport chrome, token, 상태, keyboard, focus와 접근성이
   LK Design System의 규칙과 충돌하거나 중복되지 않는다.
4. **실제 소비 가능성:** Storybook demo가 아니라 두 제품이 같은 package와
   fixture를 사용하고 rollback 가능한 상태로 운영된다.

이 문서는 디자인 발견, LDS 통합과 기술 구현의 전체 순서와 gate를 정한다.
세부 문서의 우선순위는 다음과 같다.

| 문서 | source of truth |
| --- | --- |
| [ADR-0001](ADR-0001-SIBLING-REPOSITORY.md) | 별도 형제 저장소와 공식 플랫폼 구축 결정 |
| 이 문서 | D-1, D0, LDS 통합, 디자인 품질 gate와 통합 일정 |
| [IMPLEMENTATION_PLAN](IMPLEMENTATION_PLAN.md) | 전체 package·migration 기술 프로그램 |
| [P0_EXECUTION_SPEC](P0_EXECUTION_SPEC.md) | P0 API, ticket, shadow 안전 계약과 기술 실행 상세 |
| [ARCHITECTURE](ARCHITECTURE.md) | package·제품·renderer 의존성 불변식 |

calendar 일정이나 release gate가 충돌하면 이 문서가 우선한다. P0 명세의
`T1~T8`은 기술 작업량과 의존 순서를 뜻하며 이 문서의 `W1~W10` calendar와
같은 날짜 표기가 아니다. P0의 좌표·asset·shadow 안전 계약은 이 문서가
변경하지 않는다.

### 1.1 Alpha와 gate 용어

구현 후보와 배포 완료를 같은 의미로 쓰지 않는다.

| 용어 | 의미 | 외부 변경 |
| --- | --- | --- |
| `A1-local` | `core`·`assets`·`testing`, Storybook과 tarball/local-registry consumer smoke가 통과한 Foundation 후보 | 없음 |
| `G1` | `0.1.0-alpha.1` registry artifact와 Control·Web Viz read-only CI까지 승인된 Foundation Alpha | registry publish와 제품 CI 필요 |
| `G-D0R` | 승인된 D0 시안이 실제 Three/R3F의 depth·occlusion·label·picking에서도 유지되는지 확인한 fidelity gate | 없음 |
| `G2` | `G-D0R`, `G-L0`과 renderer 기술 gate를 통과해 `0.1.0-alpha.2`가 배포된 상태 | registry publish와 consumer smoke 필요 |

현재 repository 안에서 package·Storybook·test를 만드는 작업은 우선 `A1-local`을
목표로 한다. Registry publish, 제품 repository 수정과 실제 배포는 해당 권한과
고정된 consumer commit이 확보된 뒤 별도 승인으로 `G1`을 통과한다.

## 2. 현재 판단과 아직 확인하지 않은 것

현재 문서와 제품 근거는 기술 플랫폼의 필요성을 충분히 지지한다. 그러나 다음은
아직 증명되지 않았다.

- LDS3D 후보가 기존 Control/Web Viz보다 시각적으로 또는 사용성 측면에서 낫다.
- 현재 LDS의 실제 token 이름, theme API, Storybook preset과 package 경계가
  기존 문서의 가정과 일치한다.
- 기존 문서에서 언급한 `Scene3DFrame`의 현재 public API, 상태와 접근성 계약이
  그대로 재사용 가능하다.
- LDS Figma library와 코드 token 사이의 source-of-truth 및 release 방식이
  LDS3D semantic token을 수용할 수 있다.
- Control과 Web Viz에 동일한 정보 밀도와 visual profile이 적합하다.

따라서 LDS repository URL·기준 commit, 배포 package, Storybook과 Figma library를
직접 확인하기 전에는 token 이름이나 `Scene3DFrame` API를 확정하지 않는다.
이 문서에서 해당 명칭은 책임 경계를 설명하는 가설이며 D-1에서 검증한다.

### 2.1 2026-07-17 D-1 LDS baseline audit (current)

이 문서의 앞선 `D-1에서 확인` 표현은 당시의 계획 가정이다. 현재 기준은 sibling
LDS `main`의 clean revision
`2894b7b7d0a572ca32d67e1ff4fbe98638114052`, public package
`@lk-robotics/design-system-core@0.1.0`, 그리고 공식 `styles.css`다. `apps/docs`의
local `link:`는 시각 검토용일 뿐 CI/배포 portability 증거는 아니다.

`Scene3DFrame`의 public contract와 `variant="embedded"`를 실제 source와 선언에서
확인했다. 부모 surface(`CanvasEditorShell`, `Card`)가 border/radius/overflow를
소유하는 중첩 viewer는 `embedded`를 사용해 자신의 perimeter만 제거한다. scene
identity, HUD, toolbar, normalized renderer state, accessibility role은 유지한다.
독립 viewer는 `standalone` 기본값을 유지하며 `style`로 border/radius를 제거하는
workaround를 만들지 않는다.

LDS는 viewport frame, scene identity, HUD, viewport-local control, passive metadata와
normalized state placement를 소유한다. LDS3D는 renderer, camera math, picking과
renderer lifecycle을 소유한다. 제품은 transport, command, permission, workflow를
소유한다. 이 audit은 LDS3D docs composition의 근거이지 `lk_web_viz` 또는 LDS
repository 변경 승인은 아니다. dated embedded-surface handoff의 consumer migration도
여전히 별도 적용 작업이다.

남은 D-1/D0 항목은 Figma library와 product task-level comparative evidence이며,
현재 확인된 LDS public API를 다시 가정 대상으로 되돌리지 않는다.

## 3. 제품·LDS·LDS3D 책임 경계

### 3.1 기본 원칙

```text
Product  ──> LDS
Product  ──> LDS3D
apps/docs ──> LDS + LDS3D       # 공식 통합 증거

LDS Core ──X──> LDS3D
LDS3D core/renderer ──X──> LDS
```

- LDS와 LDS3D는 서로를 runtime 필수 dependency로 만들지 않는다.
- 제품 composition과 `apps/docs`만 두 시스템을 함께 import한다.
- 같은 mapping이 두 제품에서 반복되고 LDS/LDS3D release cadence가 검증된
  뒤에만 별도 integration package를 ADR로 검토한다.
- LDS3D가 LDS CSS variable 이름을 public API로 받거나 core token 값을 복사하지
  않는다. 제품 또는 integration example이 LDS theme를 resolved scene theme로
  변환한다.

### 3.2 책임 매트릭스

| 영역 | LDS | LDS3D | 제품 composition |
| --- | --- | --- | --- |
| brand·surface·text·border·spacing | 소유 | 복제 금지 | theme 선택 |
| button·toolbar·panel·tooltip·dialog | 소유 | semantic event 제공 | 기능 구성 |
| viewport chrome·title·description | 소유 또는 D-1에서 확정 | canvas slot과 status 제공 | 두 시스템 결합 |
| loading·empty·error·recovery DOM | 소유 | renderer lifecycle·capability 제공 | 상태 policy 매핑 |
| keyboard focus·live region | DOM 기반 소유 | serializable event·상태 제공 | workflow 연결 |
| frame·unit·pose·camera·pick | 해당 없음 | 소유 | 제품 데이터를 adapter로 변환 |
| map·robot·path·goal visual semantics | primitive/status token 제공 가능 여부를 D-1에서 확인 | semantic role과 visual state 소유 | 표시 우선순위 선택 |
| command·권한·확인·저장 | control 제공 | command 능력 없음 | 제품이 전부 소유 |
| final scene composition | 외곽 slot 제공 | primitive·renderer 제공 | 소유 |

### 3.3 Token mapping 원칙

LDS 실사 전에는 실제 token 이름 대신 역할만 고정한다.

| LDS resolved input 역할 | LDS3D semantic output 역할 |
| --- | --- |
| canvas/surface | `scene.background`, label backplate |
| text primary/secondary/inverse | label, measurement, axis annotation |
| border/focus/accent | focus ring, selection outline, active target |
| info/warning/error/disabled | renderer status와 entity operational state |
| spacing/radius/elevation/motion | DOM chrome와 overlay; world-space meter 값으로 변환 금지 |

규칙:

- `scene.background` 같은 LDS3D token은 의미를 정의하고 실제 값은 theme
  resolver가 제공한다.
- world-space 크기와 CSS spacing token을 직접 대응시키지 않는다.
- light, dark와 high-contrast theme 모두 실제 map fixture 위에서 검사한다.
- 상태는 색만으로 구분하지 않고 shape, line pattern, icon, label과 outline을
  함께 정의한다.
- token mapping 결과는 supported LDS version과 함께 snapshot으로 검증한다.

### 3.4 Version compatibility와 CI

LDS와 LDS3D는 lockstep versioning을 하지 않는다. D-1 결과로 다음 형식의
compatibility manifest를 만들고 실제 값으로 채운다.

```json
{
  "lds3d": "0.1.x",
  "lds": {
    "minimum": "<D-1 result>",
    "tested": ["<minimum>", "<current>"]
  },
  "react": "<D-1 result>",
  "storybook": "<D-1 result>"
}
```

G-L0와 release CI는 최소 다음을 검증한다.

- 최소 지원 LDS와 현재 LDS version matrix
- LDS·LDS3D tarball을 public export로만 설치한 독립 consumer build
- React peer 충돌과 duplicate runtime dependency
- LDS3D package가 LDS를 import하지 않는 dependency-boundary test
- resolved semantic token schema, 누락 token과 theme snapshot
- lifecycle→viewer state mapping contract
- light/dark/high-contrast visual test와 keyboard·focus·recovery browser test
- Control·Web Viz가 승인된 LDS/LDS3D 조합을 쓰는 read-only consumer CI

LDS token rename/removal, theme 또는 viewport frame의 breaking change는 사전
deprecation과 LDS3D integration CI를 요구한다. 양 저장소가 같은 날 동시에
배포돼야만 동작하는 변경은 허용하지 않는다.

### 3.5 Lifecycle target mapping

실제 type과 이름은 D-1에서 확인하되 책임 흐름은 다음과 같이 고정한다.

```text
RendererStatus + source freshness + product policy
                         ↓ product integration adapter
              LDS viewer presentation state
                         ↓
          viewport frame · status · recovery action
```

- LDS3D는 P0 contract의
  `idle | initializing | ready | paused | lost | restoring | error | disposed`
  renderer lifecycle과 capability를 제공한다.
- 제품은 data freshness, usable snapshot, 업무 severity와 retry/rollback policy를
  합성한다. stale data가 여전히 usable한지 LDS3D가 임의로 결정하지 않는다.
- `RendererStatus.snapshotUsable`이 false이면 제품은 LDS의 `degraded` 표현으로
  매핑할 수 없다.
- LDS는 loading·degraded·unavailable·error 표현, control disabled reason,
  keyboard focus와 recovery action을 DOM으로 제공한다.
- blocking context loss 뒤에는 recovery action 또는 viewport trigger로 focus를
  복원하고, reduced motion에서는 자동 camera transition을 생략한다.

## 4. 목표 디자인 방향

LDS3D가 D0에서 검증할 working hypothesis는 **Operational Spatial Clarity**다.

> 사실적인 3D를 최대화하는 것이 아니라 위치·상태·의도·위험을 빠르고 오해
> 없이 읽고, 필요할 때 정확한 공간 값을 확인하게 한다.

공식 레퍼런스에서 채택할 원칙은 다음과 같다.

- [Foxglove 3D panel](https://docs.foxglove.dev/docs/visualization/panels/3d)의
  명시적인 Select·Measure·Publish mode와 camera 설정을 참고하되 topic 중심
  설정 밀도는 기본 제품 화면에 노출하지 않는다.
- [Rerun Viewer](https://rerun.io/docs/getting-started/configure-the-viewer)의
  viewport·entity·selection cross-highlight와 data/presentation 분리를
  참고하되 분석 IDE형 panel 밀도는 Advanced/Debug profile로 제한한다.
- [RViz User Guide](https://docs.ros.org/en/kinetic/api/rviz/html/user_guide/)의
  fixed frame, saved view, selection→focus와 display별 상태 귀속을 참고하되
  view controller와 property tree의 복잡도는 복제하지 않는다.
- [Mapbox source/layer](https://docs.mapbox.com/mapbox-gl-js/guides/styles/work-with-layers/),
  [Cesium styling](https://cesium.com/learn/cesiumjs-learn/cesiumjs-3d-tiles-styling/)과
  [deck.gl interactivity](https://deck.gl/docs/developer-guide/interactivity)의
  data/presentation 분리와 semantic picking을 참고한다.
- [Apple Spatial Layout](https://developer.apple.com/design/human-interface-guidelines/spatial-layout/)처럼
  depth는 위계를 설명할 때만 사용하고 3D text보다 screen-aligned label과 DOM
  대안을 우선한다.
- [WCAG Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color),
  [Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast)와
  [Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions)을
  visual·motion gate에 직접 적용한다.

### 4.1 시각 계층

| 우선순위 | layer | 예시 |
| --- | --- | --- |
| 5 | Critical | error, unavailable, safety block, command confirmation |
| 4 | Interaction | hover, keyboard focus, selection, active command target |
| 3 | Intent | goal, planned path, route, preview, invalid placement |
| 2 | Live state | robot, moving equipment, executing path, safety zone |
| 1 | Context | map, building, floor, landmark, inactive asset |
| 0 | Environment | background, floor, grid, axis, lighting |

상위 layer의 의미를 하위 layer의 photorealism, texture나 annotation이 가리면
실패다. 안전·명령 대상은 LOD와 density reduction으로 사라질 수 없다.

### 4.2 후보 profile

| 후보 | 목적 | 기본 특성 |
| --- | --- | --- |
| Operational Neutral | Control·일상 운영의 기본 후보 | 저채도 context, 낮은 정보 밀도, live·intent·critical 우선 |
| Diagnostic Technical | Web Viz·분석·debug 후보 | frame·axis·timestamp·layer·진단 정보를 progressive disclosure로 제공 |

D0 결과는 한 후보를 폐기하는 결정일 수도 있고, Operational Neutral을 default,
Diagnostic Technical을 Advanced profile로 승인하는 결정일 수도 있다. 두 후보가
서로 다른 entity 의미나 interaction event를 가져서는 안 된다.

## 5. D-1 — LDS와 현재 제품 baseline audit

### 5.1 입력

- LDS repository URL과 기준 commit
- 배포 package와 실제 consumer version
- LDS Storybook build 또는 접근 가능한 URL
- Figma library와 variable/component publish 방식이 있으면 해당 링크
- Control Full `de64d3c9b98eb9ce7aeaf7765035153492a57359`
- Web Viz `a984def117c05acd213f494cbb8a42e990595505`
- 실행 가능한 익명화 fixture 또는 동일 화면을 재현할 recording

### 5.2 LDS audit 항목

| 영역 | 확인 내용 | 결과 분류 |
| --- | --- | --- |
| package | package graph, React version, CSS/reset, exports, peer dependency | 재사용·정렬·격리 |
| token | primitive/semantic/status token, dark/high-contrast, CSS variable API | LDS 유지·LDS3D 정의·mapping |
| component | viewport/frame, toolbar, status, tooltip, panel, dialog | LDS 유지·확장·신규 제안 |
| accessibility | focus style, keyboard, live region, reduced motion, target size | 그대로 사용·gap 보완 |
| Storybook | builder, addons, theme decorator, visual/a11y test, publish | preset 공유·규칙만 정렬 |
| Figma | variable mode, component variant, code mapping, release owner | design source와 runtime 연결 |
| release | SemVer, changelog, registry, support matrix | version compatibility 계약 |

audit 결과는 모든 항목을 다음 네 가지 중 하나로 분류한다.

1. LDS에서 그대로 재사용
2. LDS 자체에 추가하거나 개선
3. LDS3D에서 정의
4. 제품 composition에 남김

### 5.3 제품 baseline 과제

두 제품에서 같은 과제와 상태를 고정한다.

1. `C1` 특정 robot을 찾아 live/stale/error 상태 확인
2. `C2` robot heading과 goal 판단
3. `C3` actual·planned·blocked path 구분
4. `C4` hover→selection→focus 수행
5. `C5` floor 위치 선택과 좌표 확인
6. `C6` Home·Top 전환 후 원래 맥락 복구
7. `C7` dense scene에서 critical entity 식별
8. `C8` 관찰 mode에서 command mode로 진입해 floor target을 preview하고,
   confirm trial과 cancel trial을 각각 수행

Diagnostic Technical 후보는 별도로 다음 Web Viz 과제를 평가한다.

1. `D1` 잘못된 fixed frame 또는 축 변환이 적용된 entity 찾기
2. `D2` timestamp와 freshness가 다른 두 source 비교
3. `D3` 선택 entity의 source layer와 transform provenance 추적
4. `D4` inspector에서 좌표·frame·asset metadata 확인

`C1`, `C7`, `C8`은 safety-critical 과제다. Command 기능이 없는 제품/profile에는
`C8`을 적용하지 않지만 0건으로 계산하지도 않는다.

`dense`는 주관적으로 고르지 않는다. D-1 recording에서 동시에 보이는 robot,
path, goal, label과 critical entity 수의 제품별 P95를 구하고 각 범주의
`ceil(max(P95) × 1.2)`를 fixture count로 고정한다. 또한 critical entity 3개,
selected 1개, command target 1개와 의도적인 label collision cluster 2개 이상을
포함하고 manifest·checksum을 evidence에 남긴다. Command 기능이 없는 fixture의
target 1개는 interaction-critical entity로 대체한다.

각 과제는 screenshot/영상, 성공 여부, 시간, 오조작, 발견된 장점·문제와 함께
기록한다. raw 고객 데이터와 식별자는 evidence에 포함하지 않는다.

### 5.4 G-D1 완료 조건

- LDS repository·package·Storybook·가능하면 Figma의 기준 version이 고정됐다.
- `Scene3DFrame`을 포함한 기존 가정이 source 위치와 API로 확인되거나 부재가
  명시됐다.
- LDS token→LDS3D semantic role mapping ledger가 owner와 함께 작성됐다.
- 두 제품의 대표 과제·상태 baseline이 동일한 형식으로 기록됐다.
- 재사용·LDS 변경·LDS3D 구현·제품 유지 분류에 owner가 지정됐다.

## 6. D0 — Reference & Visual Direction Gate

### 6.1 산출물

```text
docs/design/
├─ BASELINE.md
├─ REFERENCE_AUDIT.md
├─ PRINCIPLES.md
├─ VISUAL_LANGUAGE.md
├─ LDS_INTEGRATION.md
└─ EVALUATION_PLAN.md

evidence/design/
├─ baseline/
├─ candidate-a/
├─ candidate-b/
└─ decision.md
```

위 경로는 실제 산출물이 생성될 때 만든다. 빈 placeholder 문서로 gate를 통과할
수 없다.

### 6.2 appearance matrix

D0는 최소한 다음 조합을 정의한다.

- robot: live, inactive, stale, warning, error
- path: actual, planned, executing, blocked, completed
- goal: default, hover, selected, active, invalid
- interaction: hover, keyboard focus, selected, active command target, disabled
- renderer: loading, ready, live, stale, degraded, unavailable, error, paused
- density: empty, normal, dense
- theme: light, dark, high contrast
- motion: normal, reduced motion

각 상태는 color, opacity, outline, line pattern, icon, label, depth behavior와
DOM 대안을 함께 기록한다.

### 6.3 디자인 평가

최소 10명(Control 실제 사용자 또는 domain owner 4명, Web Viz 사용자·개발자
4명, 기존 화면을 잘 모르는 내부 사용자 2명)을 확보한다. Primary comparison은
`Operational A ↔ Control Current`, `Diagnostic B ↔ Web Viz Current`로 분리하며
각 참여자는 해당 Current와 candidate의 순서를 counterbalance한다. Cross-profile
결과는 탐색 자료로만 쓰고 두 후보의 outcome을 합산하지 않는다. `D1~D4` median은
Web Viz 또는 transform 진단 업무를 수행하는 qualified cohort 최소 4명만으로
산출한다. 소표본이므로 통계적 유의성을 과장하지 않고 paired raw outcome,
median과 모든 실패 사례를 함께 남긴다.

수집 항목은 task success, 최초 정답 시간, first-click accuracy, 잘못된
entity/floor 선택, command mode 오인·near miss, Home/Focus 복귀 시간, 5초 노출
뒤 상태 회상, 확신도와 혼란 원인이다. baseline 측정 뒤 더 엄격한 수치를 승인할
수 있으나 다음 하한보다 낮출 수 없다.

| 항목 | gate |
| --- | --- |
| safety-critical 과제 성공률 | 100% |
| 안전·command 의미 오인·잘못된 확정 | 0건 |
| 5초 판독 | error·active command target 100%, 전체 핵심 상태 95% 이상 |
| first-click accuracy | 95% 이상 |
| 비안전 과제 성공률 | Current보다 5%p 넘게 낮아지지 않음 |
| Operational A 시간 | Control Current 대비 C1~C8 중 5개 이상 median 10% 개선, 어떤 과제도 10% 초과 악화 금지 |
| Diagnostic B 공통 시간 | Web Viz Current 대비 적용 가능한 C1~C7 중 4개 이상 median 10% 개선, 어떤 과제도 10% 초과 악화 금지 |
| Diagnostic B 진단 시간 | D1~D4 중 2개 이상 median 10% 개선, 3개 이상 Current보다 악화 없음 |
| 색 비의존성 | grayscale/색각 simulation에서도 state 구분 |
| non-text contrast | 핵심 graphical object가 인접 배경 대비 3:1 이상 |
| text contrast | 일반 text 4.5:1, 큰 text 3:1 이상 |
| keyboard | entity 탐색, Home/Top/Focus와 주요 action 수행 가능 |
| motion | reduced motion에서 정보 손실과 강제 camera animation 0건 |
| dense scene | critical·active target이 LOD/occlusion policy로 사라지지 않음 |

Operational A와 Diagnostic B는 독립적으로 승인하거나 기각한다. 한 후보의 개선
수치로 다른 후보의 실패를 상쇄할 수 없다.

### 6.4 G-D0 승인

Product Design Owner, LDS Core Reviewer, Platform Owner, Control Owner,
Web Viz Owner와 Accessibility Owner가 다음을 서면 승인한다.

- 채택 profile과 default/Advanced 관계
- semantic layer와 appearance matrix
- LDS token mapping과 남은 LDS 변경 사항
- baseline 대비 평가 결과
- renderer Alpha에서 구현할 visual acceptance fixture

G-D0 전에는 renderer material, lighting, camera motion, semantic visual default와
scene token 이름을 stable public contract로 확정하지 않는다.

## 7. Figma와 Storybook의 역할

### 7.1 Figma

LDS Figma library가 확인되면 다음을 같은 library 또는 명시적인 companion
library에서 관리한다.

- viewport chrome과 toolbar composition
- semantic state swatch와 appearance matrix
- label, status, inspector와 recovery pattern
- Operational/Diagnostic profile의 대표 frame
- light/dark/high-contrast variable mapping

Figma는 3D runtime, depth picking, camera와 GPU lifecycle의 source of truth가
아니다. Figma 산출물에는 동일 fixture ID와 Storybook URL을 연결한다.

LDS primitive variable은 alias 또는 library instance로 사용하고 값을 복제하지
않는다. LDS3D semantic token schema의 source of truth는 versioned code이며,
Figma는 visual intent와 annotated state matrix를 소유한다. Token rename·삭제는
deprecation, mapping snapshot, Storybook visual diff와 migration note를 함께
요구한다. LDS Design/Library Owner가 variable publish를, Product Design Owner가
공간 의미와 candidate frame 승인을 맡는다.

### 7.2 Storybook

#### 7.2.1 2026-07-17 LDS 기준 감사와 focused-viewer 페이지 결정

이번 LDS 통합 구현은 다음 고정 기준으로 감사했다.

| 항목 | 확인 결과 |
| --- | --- |
| LDS checkout | `C:\Users\seoul\Documents\LK Design System` |
| LDS Git 기준 | `2894b7b7d0a572ca32d67e1ff4fbe98638114052`, clean worktree |
| LDS package | `@lk-robotics/design-system-core@0.1.0` |
| LDS Storybook | `10.4.6`, `addon-docs` + `addon-a11y`, Base/Card/Navy/Dark backgrounds, background 기반 light/dark decorator, story sort, 공식 favicon |
| LDS3D Storybook | `9.1.10` 유지. major migration은 별도 dependency 결정으로 분리하고, 호환되는 `addon-docs@9.1.10`과 동일한 공개 동작을 재구성 |

Audience-facing IA도 함께 감사했다. 현재 `Foundations`, `Fixtures`, `Assets`,
`Visual Alpha`의 flat top-level과 정확한 14개 story ID/URL은 README와
`scripts/check-storybook.mjs`가 검증하는 기존 review contract다. 이번 변경에서
`LDS 3D/...` namespace로 일괄 rename하면 공개 ID와 URL을 함께 바꾸는 scope
escalation이 되므로 현 구조를 provisional compatibility IA로 유지한다. 이는 새 story의
precedent가 아니며, namespace 전환은 사용자 승인, ID migration/redirect 정책과 함께
별도 작업으로 결정한다.

Visual Alpha는 command, undo/save, layer tree, 편집 tool mode가 없는 read-only
focused viewer다. 따라서 `CanvasEditorShell`을 사용하지 않고 다음 anatomy를
채택한다.

```text
Storybook review canvas
└─ main
   └─ LDS Container(size="wide")
      ├─ LDS PageHeader                    # page identity/profile only
      ├─ story fixture controls (optional) # product frame 밖 review input
      └─ focused-viewer viewport context   # documented layout-only exception
         ├─ LDS Scene3DFrame               # full bounds; dominant viewport/source/runtime
         └─ wide: LDS DockPanel             # DOM sibling, absolute right edge inside the same bounds
            └─ LDS SelectionInspector

narrow (<= 991px)
└─ LDS Scene3DFrame
   └─ LDS ViewerToolbar inspector trigger
      └─ LDS Drawer
         └─ LDS SelectionInspector
```

읽기와 키보드 순서는 page identity → 선택적인 fixture control → scene identity와
camera controls → WebGL canvas → persistent inspector 순이다. 좁은 화면에서는 scene만
주 영역으로 남고, inspector trigger가 modal Drawer를 열며 Escape와 focus return은
LDS Drawer가 소유한다.

| Surface | Owner | 구현 결정 |
| --- | --- | --- |
| page identity/profile | LDS `PageHeader`, `StatusBadge` | `AMR Operations` 같은 page scope만 표시 |
| scene identity/runtime | LDS `Scene3DFrame` | `Warehouse / LK-MAP`처럼 page와 다른 source scope 사용 |
| camera Home/Top/Focus | LDS `ViewerToolbar`, `ViewerToolbarButton`, `Icon` | Scene3DFrame toolbar slot에만 배치 |
| camera/selection/frame telemetry | LDS `ViewportStatusBar` | Scene3DFrame HUD에 배치 |
| persistent selection details | LDS `DockPanel` + `SelectionInspector` | viewport context 우측에 붙으며 DockPanel이 landmark, resize/collapse/Escape 소유 |
| narrow selection details | LDS `Drawer` + `SelectionInspector` | modal/focus behavior를 LDS에 위임 |
| renderer lifecycle | LDS `Scene3DFrame` state/action + LDS `Button` | 별도 page-level runtime bar 금지 |
| GLB, camera math, picking, spatial labels | LDS3D renderer | 실제 WebGL/GLB와 scene-bound overlay만 소유 |

삭제한 비정합 delta는 handwritten `visual-brand-mark`, custom
`visual-contextbar`, custom inspector surface, 독자 button/segmented/status CSS,
page/scene 중복 title, page/scene 중복 runtime badge다. 이 Story에는 global app
navigation/account scope가 없으므로 logo를 다른 모양으로 다시 그리지 않고 제거한다.
제품 shell 예시가 필요할 때만 `DashboardShell → TopBar → Lockup`을 별도 scenario로
구성한다.

LDS에는 현재 `FocusedViewerShell`, 자동 `DockPanel → Drawer` 전환 API, Drawer body
padding slot이 없다. 그러나 public `DockPanel`은 map/editor의 over-canvas side panel로
정의되고, LDS story도 rounded·clipped canvas frame 안의 absolute right/top/bottom
DOM sibling으로 배치한다. 따라서 wide는 `Scene3DFrame`을 전체 bounds로 두고
`DockPanel`을 그와 같은 viewport-context wrapper 안의 DOM sibling으로 절대 배치한다.
`Scene3DFrame`의 `children`/`overlay`에는 넣지 않는다. 전자는 renderer output이고,
후자는 public contract상 non-interactive이기 때문이다. Wrapper는 같은 LDS
`--radius-lg`로 clipping만 맞추며 surface, border, elevation, typography 또는 interaction을
새로 그리지 않는다.

991px mount 전환은 docs composition layer의 예외로 유지한다. 이는 LDS `--bp-md: 992px`
바로 아래이며, 992px에서 LDS wide `Container`의 좌우 20px margin과 300px DockPanel을
적용해도 가려지지 않은 viewport가 652px로 inspector 폭의 2.17배를 유지하는
content-driven 경계다. Wide에서는 DockPanel의 실제 resize 폭을 composition state로
받아 toolbar의 end margin을 열린 폭 + `var(--space-6)` handle clearance로, passive
spatial legend의 right inset을 열린 폭으로 함께 갱신한다. 닫힌 상태에서는 toolbar에
handle clearance만 남긴다. 이로써 resize 뒤에도 toolbar·legend가 panel 아래로 들어가지
않는다. Narrow에서는 passive spatial legend를 bottom 52px에 배치해 LDS Scene3DFrame의
bottom status 영역을 비운다. 이는 scene-bound overlay 충돌 방지이며 application chrome을
재구성하지 않는다. 좁은 Drawer의 고정 body inset과 SelectionInspector header 조합은 public
API 한계이며, 재사용 문제가 확인되면 LDS additive change 후보로 올린다.

#### 7.2.2 구현 후 parity 및 runtime 검토 결과

최종 구현은 LDS Storybook의 `Scene3DFrame / Appearance Variants`,
`DockPanel / Resizable`, `SelectionInspector / Selected Object`와 같은 화면에서
나란히 검토했다. LDS `PageHeader` source·public type·story도 동일 기준으로 감사했다.
검토 결과 page identity는 `PageHeader`, scene identity와 renderer state는
`Scene3DFrame`, selection detail은 `DockPanel`/`Drawer`와
`SelectionInspector`가 각각 소유하며 viewport가 inspector 폭의 두 배 이상을
유지한다. handwritten logo, custom context bar, custom inspector surface와 renderer
내부 raw button은 남아 있지 않다.

검토 matrix와 결과는 다음과 같다.

| 검토 | 결과 |
| --- | --- |
| wide/light, 1440px/992px | page header → dominant Scene3DFrame 순서. 300px DockPanel은 같은 viewport bounds의 우측에 붙고 rect가 frame 안에 머문다. 992px에서 usable viewport 652px(≥ inspector 2×), toolbar/legend와 panel overlap 0 확인 |
| wide/dark | LDS dark Scene3DFrame, ViewerToolbar, DockPanel, SelectionInspector 조합 확인 |
| narrow 800px/700px/320px | DockPanel 미마운트, viewport-local trigger로 LDS Drawer 열림, 320px page overflow·toolbar/HUD·legend/status 충돌 없음, `Selected` 우선 보존과 하위 camera/frame LDS ellipsis, Escape 닫기와 trigger focus return, wide 왕복 후 비의도 재개방 없음 확인 |
| loading/empty/error/retry | page shell과 scene identity 고정, Scene3DFrame state와 LDS Button만 교체, retry 후 live 복구 확인 |
| accessibility | Storybook a11y 기준 violations 0, passes 23, inconclusive 1 |
| actual renderer | WebGL 2, GLB 6개, hover/picking, inspector sync, Home/Top/Focus, goal/path, lifecycle state 모두 통과 |

접근성 inconclusive 1건은 투명·중첩된 scene-bound `WorldLabel`의 배경을 axe가
결정하지 못한 color-contrast 항목이다. Operational 조합 `#16202A` /
`rgba(255,255,255,0.94)`와 Diagnostic 조합 `#E9F5FF` /
`rgba(7,16,24,0.92)`를 수동 검토했다. `Html` wrapper와 passive scene legend는
`pointer-events: none`으로 고정해 label이 실제 WebGL picking을 가로막지 않는다.

자동 runtime 증거는 `evidence/visual-alpha/runtime-qa/report.json`과 같은 폴더의
camera/state capture에 기록한다. 이 실행은 SwiftShader software WebGL을 사용하므로
기능·결정성 증거이며 physical GPU 성능 증거가 아니다. Interactive in-app browser에서
light/dark와 wide/narrow 구성 및 Drawer focus behavior를 별도로 수동 확인했지만
hardware renderer 여부를 계측하지 않았으므로 이 역시 physical GPU 성능 증거로
취급하지 않는다.

남은 의도적 차이는 canvas-bound layout-only wrapper와 DockPanel handle clearance, 991px mount 전환,
narrow spatial legend의 status clearance, Drawer public body-padding 한계, Storybook major
9 유지뿐이다. wrapper·handle·mount 전환과 Drawer 한계는 LDS public API/구성 gap에 대한
좁은 docs-layer 대응이고, legend clearance는 spatial overlay 충돌 방지다. Storybook
major 차이는 별도 dependency migration 결정이며 시각 언어를 재구성하는 근거로
사용하지 않는다.

`apps/docs`는 실제 LDS public component와 공식 stylesheet를 LDS3D public package와
함께 사용하는 local visual-review composition consumer다. 현재 LDS 의존성은 감사된
commit `2894b7b7d0a572ca32d67e1ff4fbe98638114052`의 sibling `link:`이므로 official
CI/release portability나 registry integration을 증명하지 않는다. 그 주장은 명시적
checkout pin 또는 검증된 package artifact를 설치한 뒤에만 가능하다. `core`, `assets`,
`testing`, `r3f`는 계속 LDS와 무관하게 build하며, technical story의 LDS DOM 구성은
문서 표현 계층일 뿐 SVG fixture를 finished 3D evidence로 승격하지 않는다. LDS 내부
source와 `.storybook` 상대경로 import는 금지한다.

필수 design story:

```text
Design/Current vs Candidate A vs Candidate B
Design/Scene hierarchy
Design/Entity states
Design/Path semantics
Design/Hover Focus Selected Active
Design/Label legibility
Design/Light Dark High Contrast
Design/Reduced motion
Design/Empty Normal Dense
Design/Stale Warning Error Unavailable
```

Foundation Alpha.1에서는 DOM·SVG·표·JSON inspector로 상태 의미와 mapping을
검토할 수 있다. Renderer Alpha.2에서 같은 fixture ID를 실제 Three/R3F scene으로
교체하거나 병렬 표시한다. 현재 제품 screenshot과 후보를 같은 viewport·camera·
fixture로 비교하지 않은 snapshot은 디자인 승인 증거가 아니다.

DOM·SVG 후보는 실제 depth, occlusion, shader, label collision과 GPU picking을
증명하지 못한다. 실제 renderer 구현 뒤 동일 fixture·camera·viewport로 다시
비교해 `G-D0R`을 통과해야 `G2`를 승인한다.

LDS Storybook의 addon과 decorator를 audit한 뒤 공유 preset을 소비할지, 동일
규칙만 LDS3D에 재구성할지 결정한다. 설정 파일을 source copy하지 않는다.

#### 7.2.3 Visual Alpha rendering-budget decision (2026-07-17)

이번 성능 조정은 LDS baseline을 바꾸지 않는다. 기준은 sibling LDS commit
`2894b7b7d0a572ca32d67e1ff4fbe98638114052`,
`@lk-robotics/design-system-core@0.1.0`, 공식 stylesheet와 public
`Scene3DFrame` / `DockPanel` / `SelectionInspector` 조합이다. 읽기·키보드 순서는
page identity → scene identity와 viewport controls → 실제 WebGL canvas → wide의
persistent selection inspector이며, narrow에서는 같은 canvas 뒤에 LDS Drawer trigger와
Drawer가 온다.

성능 차이는 renderer 또는 scene-overlay layout glue로만 제한한다. LDS가 소유하는
surface, control, focus, responsive ownership은 변경하지 않는다.

| Delta | Owner | Reason and retained behavior |
| --- | --- | --- |
| Wide DockPanel가 열린 폭만큼 canvas drawing area를 줄임 | docs composition layout | DockPanel은 `Scene3DFrame` 안의 LDS persistent inspector로 계속 보이되, 가려진 영역까지 WebGL backing buffer를 만들지 않는다. panel closed/narrow Drawer에서는 전체 폭을 복원한다. |
| Static review story는 DPR 1, 1024px shadow map, `frameLoop="demand"` 사용 | docs composition + r3f | Storybook은 product quality preset이 아닌 review surface다. `SceneCanvas`의 public default(`always`, 2048px)는 호환성을 위해 유지한다. |
| Camera transition, OrbitControls change, active goal/path/loading marker만 demand frame을 invalidate | r3f renderer | [R3F scaling-performance guidance](https://r3f.docs.pmnd.rs/advanced/scaling-performance)의 on-demand rendering 및 imperative mutation invalidate 규칙을 적용한다. state가 의미상 정적인 Operational, Diagnostic, Asset Catalog story는 ambient animation을 끈다. Goal/Path state와 loading은 필요한 motion을 유지한다. |
| Story shadow resolution을 2048→1024로 낮춤 | docs composition | [Three.js LightShadow](https://threejs.org/docs/pages/LightShadow.html)의 power-of-two shadow `mapSize` 품질/비용 조절점을 따른다. 제품 caller는 public `environment.shadowMapSize`로 다른 budget을 선택할 수 있다. |
| GLB placement가 Object3D/skeleton만 분리하고 loader-cached geometry/material을 공유 | r3f renderer | placement마다 동일 GPU resource를 복제하던 비용을 없앤다. 각 entity의 transform, picking, cast/receive shadow와 skeleton independence는 유지한다. |
| Scene legend의 backdrop blur 제거 | docs scene overlay | 3D entity에 연결된 passive legend의 판독성은 불투명 surface로 보존하면서 WebGL 위 backdrop compositing을 피한다. 이는 LDS app chrome의 restyle이 아니다. |

Runtime QA는 wide/narrow에서 canvas CSS/backing pixels, pixel ratio, panel 회피 여부를
기록한다. SwiftShader 결과는 WebGL·interaction·determinism 증거일 뿐 physical GPU
frame-time 또는 제품 성능 보장은 아니다. 실제 hardware target에서 representative
scene, DPR, shadow setting, GPU renderer를 기록한 profile이 있어야 성능 주장을 할 수
있다.

### 7.3 G-D0R — Renderer Fidelity Gate

실제 Three/R3F 구현은 D0와 동일한 fixture ID, camera, viewport와 과제로 다시
평가한다. 최소 matrix는 다음과 같다.

- viewport 1280×720, 1440×900, 1920×1080; DPR 1과 2
- light, dark, high contrast; normal과 reduced motion
- empty, normal, dense scene
- live/error/stale robot, actual/planned/blocked path, valid/invalid goal
- `error + stale + selected`, `warning + focus`, `commandTarget + invalid` 합성 상태
- Home, Top, Focus, selection, floor picking과 context-loss recovery

통과 조건:

- 6.3의 task·판독·오조작·접근성 하한을 실제 renderer에서도 유지한다.
- deterministic pick fixture의 expected entity/floor ID가 100% 일치한다.
- dense manifest의 모든 critical entity는 on-scene label, collision cluster,
  edge indicator 또는 DOM critical summary 중 하나로 발견할 수 있어야 한다.
  모든 label을 동시에 강제하지 않으며 어떤 critical entity도 누락할 수 없다.
- command target은 depth·LOD·occlusion 때문에 의미가 사라지지 않는다. 일반
  label은 승인된 collision priority에 따라 숨길 수 있다.
- 고정 renderer·font·camera·DPR snapshot의 변경은 자동 diff와 Product Design,
  Platform, Accessibility Owner의 사유 있는 승인을 함께 남긴다.
- Figma/DOM reference와 차이가 있으면 renderer 제약, 허용 범위와 선택 이유를
  decision record에 기록한다.

## 8. 구현 순서와 동결 규칙

| phase | 구현 | 선행 gate | 동결 범위 |
| --- | --- | --- | --- |
| D-1 | LDS·제품 baseline audit | 없음 | 기준 commit과 책임 분류 |
| D0 | reference, candidate A/B, visual language | G-D1 | visual direction과 evaluation fixture |
| A1 | `core`, `assets`, `testing`, foundation Storybook | D-1과 병렬 가능 | `A1-local`; G1 전까지 registry release 아님, visual default 제외 |
| A2 | `three`, `r3f`, camera, picking, lifecycle | G-D0, A1-local | reference renderer 후보와 semantic visual |
| L0 | LDS composition·token·상태·접근성 | G-D0, A2 구현 후보 | supported LDS version과 integration contract |
| C0-Prep | Control adapter·pure calculation C0-01~04 | G1, 필요한 M1/M2 contract | 제품 mutation 없는 비교 준비 |
| C0-Shadow | staging·production calculation-only shadow C0-05~08 | G2, G-L0 | no-side-effect 비교와 rollback evidence |
| W0 | Web Viz fixture·adapter·다음 shadow 준비 | G1, G-D0 | 두 번째 소비자와 diagnostic profile 적합성 |
| M3/C1 | Control·Web Viz visible migration | G-P0 | capability별 canary와 제품 UX 승인 |

G-D0 전에 허용되는 작업:

- monorepo, build, lint, test, release scaffold
- renderer-neutral frame·transform·asset manifest 구현
- 제품 baseline fixture와 public-export consumer smoke
- 디자인 reference Story의 DOM·SVG prototype

G-D0 전에 금지되는 작업:

- 후보 시각값을 stable default로 publish
- LDS raw token 값을 LDS3D에 복사
- 하나의 제품 screenshot을 universal visual contract로 채택
- Three/R3F material·lighting·interaction을 제품 코드에 먼저 구현
- Figma mock만으로 runtime·접근성 gate를 통과 처리

## 9. 10주 공격적 기준 일정

다음 일정은 Platform 2명, Product migration 1명, Test/Release 1명,
Product Designer 최소 0.5명과 LDS·Accessibility reviewer의 part-time 참여를
전제로 한다. 전담 실행 인원이 3명 이하이면 13~14주를 기준으로 한다.

| 주 | 디자인·LDS lane | Foundation·renderer lane | 제품·검증 lane |
| --- | --- | --- | --- |
| W1 | LDS audit, 제품 baseline 측정, G-D1 | M0-00 workspace/tooling | fixture·evidence 형식 고정 |
| W2 | reference audit, Candidate A/B 제작 | core/asset 실험 구현 | 평가 참여자·과제 고정 |
| W3 | appearance matrix와 후보 수정 | A1 public API·testing | Storybook 비교 prototype·접근성 dry run |
| W4 | 사용자 비교 평가, G-D0 | `A1-local` build·pack·consumer smoke | G1 권한이 있으면 두 제품 read-only CI·publish |
| W5 | approved visual fixture | Three host, camera, picking | LDS composition test 준비 |
| W6 | Figma/Storybook 정합성 | R3F, lifecycle, semantic visual | visual·performance test |
| W7 | G-L0와 G-D0R | `alpha.2` pack·publish 준비 | Control adapter, Web Viz CI |
| W8 | design no-regression review | G2 Renderer Alpha gate | Control staging shadow·fault test |
| W9 | integration correction | package release/rollback drill | Control canary 준비, Web Viz adapter |
| W10 | 최종 LDS·design evidence | 변경 없을 때 release 고정 | 3~5영업일 shadow와 G-P0 최초 가능 |

Production canary 중 product commit, package SHA, comparator, tolerance, theme
mapping 또는 effective mode가 바뀌면 W10은 연장된다. 이전 표본을 합산해 gate를
통과할 수 없다.

## 10. Gate와 승인 관계

| gate | 필수 증거 | 승인자 |
| --- | --- | --- |
| G-D1 | LDS audit, 제품 baseline, ownership ledger | LDS Core, Product Design, Platform Owner |
| G-D0 | principles, visual language, A/B Storybook, 평가 결과 | Product Design, LDS Core, 두 제품, Accessibility |
| A1-local | core/assets/testing, API report, local package smoke | Platform, 두 제품 consumer owner |
| G1 | registry artifact, package SHA, 두 제품 read-only CI | Platform, Release, 두 제품 consumer owner |
| G-D0R | 실제 renderer의 depth/occlusion/label/picking과 D0 fixture 정합성 | Product Design, Platform, Accessibility |
| G-L0 | supported LDS version, token/state mapping, keyboard/focus/recovery | LDS Core, Accessibility, Product Design |
| G2 | G-D0R·G-L0, camera/picking/lifecycle, visual/performance report, registry artifact | Platform, Design, Performance, Accessibility, Release |
| G-C0 | no-side-effect shadow, rollback, threshold | Control, Platform, Performance, Release |
| G-P0 | G-D0·G1·G-D0R·G2·G-L0·G-C0와 Web Viz 준비 완료 | 모든 accountable owner |

Gate 실패는 플랫폼 구축 결정을 되돌리지 않지만 visual default, API, release 또는
rollout의 승인을 보류한다. 안전·접근성·데이터 정합성 실패를 일정으로 면제하지
않는다.

## 11. RACI

| 역할 | Accountable | 주요 책임 |
| --- | --- | --- |
| Product Design Owner | D0 | baseline, visual direction, appearance matrix와 usability evidence |
| LDS Design/Library Owner | D-1·D0·L0 | Figma variable/component alias, library publish와 visual 정합성 |
| LDS Core Reviewer | D-1·L0 | LDS source audit, token/component/version 정합성 |
| Platform Owner | A1·A2 | package/API/renderer architecture와 boundary |
| Control Owner | C0 | command semantics, operational profile와 rollback |
| Web Viz Owner | W0 | diagnostic profile, 두 번째 consumer 검증 |
| Accessibility Owner | D0·L0 | contrast, keyboard, focus, motion과 DOM 대안 |
| Performance Owner | A2·C0 | visual density, frame/ready/memory budget |
| Release Owner | A1 이후 | registry, fixed group, evidence와 rollback |

D-1에서 역할별 실명, review SLA와 대리자를 기록한다. Product Design Owner가
없는 상태에서는 G-D0를 통과할 수 없다.

## 12. 주요 위험과 대응

| 위험 | 대응 |
| --- | --- |
| 기술 통일을 디자인 개선으로 오해 | 기존 화면과 동일 과제·fixture의 A/B evidence를 필수화 |
| LDS token을 복사해 두 디자인 체계가 분기 | resolved mapping과 supported LDS version test, raw 값 복사 금지 |
| LDS↔LDS3D 순환 dependency | 제품/apps만 둘을 조합하고 package boundary CI 적용 |
| Control과 Web Viz가 서로 다른 밀도를 요구 | 의미 contract는 하나로 유지하고 Operational/Diagnostic profile만 분리 |
| photorealism이 작업 정보를 압도 | semantic layer 우선순위와 critical visibility gate |
| 색만으로 상태 전달 | icon·shape·pattern·label·outline과 contrast test |
| Figma와 runtime이 분기 | fixture ID, Storybook URL, token mapping snapshot을 release evidence로 연결 |
| LDS 실사 없이 `Scene3DFrame`을 가정 | D-1에서 API/부재를 확인하고 ownership을 재분류 |
| 디자인 단계가 무기한 연구로 확장 | G-D1은 W1, 후보 prototype은 W3, 평가와 G-D0는 W4로 timebox |
| 공격적 일정이 접근성·안전을 압박 | G-D0·G-L0·G-C0는 일정과 무관한 필수 gate |

## 13. 즉시 실행 순서

1. LDS repository URL, 기준 commit, Storybook과 Figma 접근 경로를 고정한다.
2. Control과 Web Viz의 baseline 화면·과제·상태를 익명화 fixture로 기록한다.
3. LDS audit와 reference audit를 병렬 수행한다.
4. Operational Neutral과 Diagnostic Technical 후보를 같은 fixture로 만든다.
5. 사용자 비교 평가를 수행하고 G-D0에서 결과, visual direction과 token
   mapping을 승인한다.
6. 동시에 진행한 Foundation을 `A1-local`로 검증하고, 배포 권한과 두 제품 CI가
   준비되면 별도 승인으로 G1을 통과한다.
7. 승인된 visual fixture로 Renderer Alpha.2와 LDS integration을 구현한다.
8. Control shadow와 Web Viz consumer 검증 후 G-P0를 통과한다.

다음 구현 turn의 첫 작업은 package code가 아니라 D-1 evidence 구조와 LDS audit
checklist를 구체화하는 것이다. 다만 이미 승인 가능한 renderer-neutral
workspace·좌표·asset scaffold는 D0와 병렬로 진행할 수 있다.
