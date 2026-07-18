# Visual Alpha V0 레퍼런스 조사와 시각 방향 결정

| 항목 | 값 |
| --- | --- |
| 상태 | Visual Alpha V0 구현 기준 — 사용자 비교 평가 전 provisional decision |
| 기준일 | 2026-07-17 |
| 대상 | 실제 WebGL Storybook의 동일 AMR 운영 장면 A/B |
| 권고 | `Operational Neutral`을 기본값으로 구현하고 `Diagnostic Technical`을 같은 의미 계약을 쓰는 Advanced profile로 제공한다. |
| LDS 기준 | 형제 저장소 `../LK Design System`, package `@lk-robotics/design-system-core@0.1.0`, commit `373dc6760efe25367b45a99cd7d6282bb42faaf4`의 public API와 공식 `styles.css`를 Visual Alpha Storybook에서 직접 소비한다. |
| 중요한 한계 | 실제 LDS code/package 통합은 완료했지만 Figma 기준 version 및 Control/Web Viz 사용자 비교 평가는 아직 G-D0 후속 검증이다. |

## 1. 이 문서가 결정하는 것

이 문서는 `DESIGN_AND_LDS_INTEGRATION_PLAN.md`의 working hypothesis인
**Operational Spatial Clarity**를 Visual Alpha에서 곧바로 구현할 수 있는 수준으로
구체화한다. 목표는 사실적인 창고를 만드는 것이 아니라 다음 질문에 답하는 것이다.

1. 로봇의 현재 상태, 계획된 의도와 오류를 5초 안에 구분할 수 있는가?
2. hover, keyboard focus, selection과 command target이 서로 혼동되지 않는가?
3. 동일한 entity와 interaction contract로 일상 운영과 진단 밀도를 모두 제공할 수
   있는가?
4. LDS가 소유할 DOM chrome과 LDS3D가 소유할 world-space visual이 섞이지 않는가?

이번 결정은 V0 구현을 위한 강한 기본값이다. 기존 Control/Web Viz와 실제 사용자
비교를 수행한 G-D0 승인은 아니며, 그 결과가 다르면 palette와 밀도는 교정한다.
좌표, entity ID, pick 결과와 interaction event 의미는 profile에 따라 바뀌지 않는다.

## 2. 현재 저장소와 제품 근거

현재 문서에서 확인한 사실은 다음과 같다.

- Control Full은 GLB 지도·로봇, path·target·landmark, floor picking과 3D/Top camera를
  한 운영 장면에 결합한다.
- Web Viz는 PointCloud·TF·Marker, GLB·구조·건물, 편집 picking과 Rerun을 더 높은
  정보 밀도로 제공한다.
- 두 제품은 좌표, camera, picking, asset과 scene style을 각각 구현한다.
- `apps/docs/.storybook/preview.ts`는 실제 LDS `styles.css`를 먼저 로드하고,
  `apps/docs/src/styles.css`는 WebGL label·legend와 viewport/inspector 배치만 담당한다.
  DOM chrome은 실제 LDS semantic color·spacing·typography token을 사용한다.
- 현재 `SceneTokenName`은 `scene.background`, grid·axis, selection, path, goal과
  warning만 포함한 experimental draft다. Visual Alpha는 hover/focus/status/label을
  별도 의미 channel로 다뤄야 하며, G-D0 전에 이를 stable API로 고정하지 않는다.

근거 문서:

- [기존 제품 3D 증거](PRODUCT_EVIDENCE.md)
- [디자인 방향·LDS 통합 계획](DESIGN_AND_LDS_INTEGRATION_PLAN.md)
- [플랫폼 아키텍처](ARCHITECTURE.md)
- [P0 실행 명세](P0_EXECUTION_SPEC.md)

## 3. 공식 레퍼런스에서 가져올 패턴

### 3.1 Foxglove 3D panel

[Foxglove 3D panel](https://docs.foxglove.dev/docs/visualization/panels/3d)은 Select,
2D/3D, Measure, Publish를 명시적인 도구 mode로 분리한다. object click은 selected
object popup으로 연결되고, fixed/display frame과 camera follow mode를 구분한다.
`1`은 frame 재중앙화, `3`은 2D bird's-eye와 3D 전환, `i`는 inspector 전환에
사용된다.

채택:

- 기본 click은 선택이고, floor target 지정은 명시적인 mode에서만 활성화한다.
- `Home`, `Top`, `Focus selected`를 항상 보이는 camera preset으로 둔다.
- 선택 결과를 persistent inspector와 연결한다.
- operational 장면은 display frame을 숨은 전제로 두지 않고 상태 영역에 노출한다.

채택하지 않음:

- topic별 raw setting과 publish 설정 전체를 기본 운영 화면에 노출하지 않는다.
- 정상 select gesture에 command side effect를 결합하지 않는다.

### 3.2 NVIDIA Omniverse

[Omniverse Viewport Visor](https://docs.omniverse.nvidia.com/extensions/latest/ext_core/ext_viewport/visor.html)는
Home, Orbit과 선택 대상을 camera에 맞추는 Frame을 구분한다.
[Viewport Settings](https://docs.omniverse.nvidia.com/extensions/latest/ext_core/ext_viewport/controls/settings.html)는
selection color/line width, bounding box, grid fade와 camera-relative gizmo scale을
각각 제어한다.
[Selection Modes](https://docs.omniverse.nvidia.com/arch-diagrams/latest/common/selection-modes.html)는
가장 깊은 primitive 선택과 model-kind 기반 상위 assembly 선택을 구분한다.

채택:

- AMR은 mesh 조각이 아니라 `Robot` assembly entity로 선택한다.
- 선택은 material 전체 색 변경보다 screen-stable outline과 inspector anchor로
  표현한다.
- goal·heading·selection marker는 camera 거리에 따라 읽을 수 있는 화면 크기를
  유지하되 world-space 위치는 정확하게 보존한다.
- grid는 camera distance에 따라 fade하고 context보다 강해지지 않는다.

채택하지 않음:

- primitive/model-kind 전환과 authoring gizmo toolbar는 Diagnostic profile에서도
  V0 기본 기능으로 만들지 않는다.
- 산업 디지털 트윈의 photorealistic material을 상태 의미보다 우선하지 않는다.

### 3.3 Rerun Viewer

[Rerun Viewer](https://rerun.io/docs/getting-started/configure-the-viewer)는 data stream과
viewport의 presentation blueprint를 분리하고, hover popup과 selection panel을
통해 같은 entity를 여러 view에서 cross-highlight한다. Blueprint, Selection과
Timeline panel은 필요할 때 숨기거나 다시 보일 수 있다.

채택:

- 3D scene과 LDS inspector가 하나의 selected entity ID를 공유한다.
- hover는 짧은 preview이고 click/keyboard activation만 persistent selection을
  만든다.
- frame, timestamp, freshness, source layer와 transform provenance는 Diagnostic
  profile에서 progressive disclosure한다.
- visual override는 원본 entity state를 변경하지 않는 presentation layer다.

채택하지 않음:

- Blueprint tree와 Timeline을 Operational 기본 장면에 상시 표시하지 않는다.
- 분석 IDE의 전체 panel 밀도를 일상 운영 화면에 복제하지 않는다.

### 3.4 Cesium

[Cesium 3D Tiles styling](https://cesium.com/learn/cesiumjs-learn/cesiumjs-3d-tiles-styling/)은
feature metadata의 조건으로 `show`와 `color`를 정한다.
[Cesium camera guide](https://cesium.com/learn/cesiumjs-learn/cesiumjs-camera/)는 위치,
asset focus, camera reference frame과 input controller를 분리하고 `pickPosition`으로
screen point를 공간 위치에 연결한다.

채택:

- visual은 GLB authored material이 아니라 semantic role·status·interaction
  metadata에서 결정한다.
- `Focus`는 선택 entity bounds에서 deterministic camera target을 계산한다.
- pick은 mesh reference가 아니라 stable entity ID와 metadata를 반환한다.
- layer filter는 presentation state이며 domain entity를 변형하지 않는다.

채택하지 않음:

- critical/error/active target은 filter, distance LOD 또는 occlusion policy로 완전히
  사라지게 하지 않는다.
- 대규모 photorealistic context를 V0의 시각 품질 기준으로 사용하지 않는다.

### 3.5 접근성 기준

- [WCAG Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)에
  따라 상태 의미를 hue 하나로 전달하지 않는다.
- [WCAG Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)에
  따라 핵심 outline, marker와 control은 인접 배경 대비 최소 3:1을 목표로 한다.
- [WCAG Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)에
  따라 reduced-motion에서는 camera flight와 반복 pulse를 제거한다.

## 4. 두 후보가 공유하는 동일 장면

두 Story는 profile만 다르고 아래 fixture, camera와 interaction state를 공유한다.

### 4.1 고정 fixture

`visual-alpha/amr-warehouse-v0`:

- 18m × 12m floor, LK core 기준 `+X forward`, `+Y left`, `+Z up`
- primary AMR `robot/amr-01`: live + selected
- secondary AMR `robot/amr-02`: stale
- 오류 AMR `robot/amr-03`: error, dense-scene에서도 발견 가능해야 함
- rack 4개, pallet/cargo 4개, charging dock 1개, safety barrier 또는 bollard set
- planned path 1개, executing segment 1개, blocked segment 1개
- active goal 1개와 invalid preview goal 1개
- safety/keep-out zone 1개
- selected robot에서 goal까지 이어지는 heading과 path

실제 GLB catalog는 최소 다음 5종을 사용한다.

1. AMR
2. rack
3. pallet 또는 cargo
4. charging dock
5. safety barrier 또는 bollard

Goal, path, zone, grid와 selection outline은 semantic geometry이며 GLB 수에 포함하지
않는다. 모든 GLB는 manifest, authored unit, source up axis, origin, forward axis,
bounds와 provenance를 가진다.

### 4.2 고정 camera와 viewport

- 비교 viewport: 1280 × 720, DPR 1
- `Home`: 전체 18m × 12m floor와 모든 critical entity가 보이는 35°~45° 사선
- `Top`: core `+Z`에서 내려다보며 north/up convention을 label로 고정
- `Focus`: selected AMR bounds와 goal 방향을 함께 보이는 3/4 view
- A/B initial camera pose, FOV, near/far와 target은 동일
- profile 변경은 camera pose나 선택을 초기화하지 않음

### 4.3 공통 interaction 문법

| 상태 | world-space 표현 | DOM/LDS 대안 |
| --- | --- | --- |
| hover | 얇은 neutral rim, pointer와 짧은 label | tooltip에 이름·상태 |
| keyboard focus | 두 겹 또는 dashed focus ring; hover보다 굵음 | 실제 DOM focus indicator와 live description |
| selected | 3px 상당 screen-stable outline, ground anchor, persistent label | inspector open, selected ID 유지 |
| active command target | diamond/reticle shape와 `TARGET` label; selection과 다른 glyph | mode banner, confirm/cancel action |
| stale | 낮은 채도, dashed/hatch ring, age label | `Stale · n초` status |
| warning | amber triangle와 dashed ground ring | warning icon·text |
| error | red octagon/X와 persistent label | error status·recovery action |
| disabled | interaction affordance 제거, 이유 label | disabled control과 reason |

색은 보조 channel이다. outline 굵기, line pattern, glyph, label과 inspector가 의미를
중복 전달한다. selected와 entity status를 하나의 색으로 덮어쓰지 않는다.

## 5. 후보 A — Operational Neutral

목적은 Control Full의 일상 운용 장면이다. 사용자가 보는 순서는
`critical → interaction → intent → live state → context → environment`다.

### 5.1 외형

- 밝은 cool-neutral 환경과 diffuse lighting, 낮은 reflection
- rack·pallet·floor는 low-chroma; authored texture는 형태 판독에 필요한 수준만 유지
- robot body는 neutral material을 유지하고 status는 ground ring, badge와 label에
  표현
- grid minor는 멀리서 fade하고 major grid만 floor 규모를 읽게 함
- label은 selected, error, active target과 가까운 hover에 한정
- path는 상태별 pattern을 가진다: actual solid, planned dash, executing chevron,
  blocked cross-bar
- shadow와 ambient occlusion은 접지감을 위해 사용하되 path·goal을 덮지 않음

### 5.2 V0 prototype palette

실제 LDS resolver가 연결되기 전 Storybook 비교용 값이다. stable token 값이 아니다.

| role | 값 |
| --- | --- |
| scene background | `#E9EEF2` |
| ground | `#DCE3E8` |
| grid minor / major | `#C5CFD6` / `#94A4AF` |
| asset body / structure | `#D9E1E6` / `#60717E` |
| live/executing | `#007A66` |
| intent/goal | `#6D3CCB` |
| selection | `#005FCC` |
| warning | `#9A5B00` |
| error/blocked | `#B42318` |
| label text | `#16202A` |

### 5.3 정보 밀도

- frame/axis는 orientation widget 하나만 보이고 개별 entity frame은 숨김
- timestamp는 scene status에 source freshness 하나만 표시
- inspector는 selection이 있을 때만 열림
- performance stats, bounds, asset provenance와 layer tree는 숨김
- camera toolbar는 `Home`, `Top`, `Focus`와 interaction mode만 제공

## 6. 후보 B — Diagnostic Technical

목적은 Web Viz의 분석·debug 장면이다. entity와 interaction 의미는 A와 같고
presentation density만 높다.

### 6.1 외형

- dark graphite background, emissive가 아닌 고명도 technical line
- major/minor grid와 world origin을 더 명확히 표시
- selected entity의 local axes, bounds, forward vector와 transform chain을 표시
- source frame, timestamp, freshness, layer와 asset manifest ID를 inspector에 표시
- path point index, goal coordinate와 distance annotation을 선택 시 표시
- wire/bounds overlay는 기본 PBR 형태 위에 추가하며 mesh를 완전히 대체하지 않음

### 6.2 V0 prototype palette

| role | 값 |
| --- | --- |
| scene background | `#071018` |
| ground | `#0B1720` |
| grid minor / major | `#153245` / `#23607D` |
| asset body / structure | `#20313A` / `#526B78` |
| live/executing | `#4DE3C1` |
| intent/goal | `#D7A0FF` |
| selection | `#43D9FF` |
| warning | `#FFC857` |
| error/blocked | `#FF6B78` |
| label text | `#E9F5FF` |

### 6.3 Progressive disclosure

기본 B 화면에도 모든 frame label을 한꺼번에 표시하지 않는다.

1. 항상: origin widget, major grid, source freshness, active layer count
2. hover: entity ID, role, state
3. selected: bounds, forward, local axis, pose, frame, asset ID
4. inspector section 확장: transform provenance, checksum, timestamp, raw metadata

이 순서를 지키지 않으면 Diagnostic은 정보가 많은 것이 아니라 서로 가리는 장면이
된다.

## 7. 권고와 판단 기준

V0 기본값은 **Operational Neutral**로 결정한다. Diagnostic Technical은 버리지
않고 동일 Story의 `Advanced diagnostics` profile로 유지한다.

아래 점수는 현재 문서·공식 레퍼런스에 기반한 1~5점 expert heuristic이다. 실제
사용자 outcome이 아니므로 G-D0 승인 증거로 쓰지 않는다.

| 기준 | 가중치 | Operational | Diagnostic | 판단 |
| --- | ---: | ---: | ---: | --- |
| 5초 상태 판독과 critical visibility | 30% | 5 | 4 | context가 억제된 A가 유리 |
| hover/selection/target 비혼동 | 25% | 5 | 4 | overlay가 적은 A가 유리 |
| LDS chrome·상태와의 조합 용이성 | 15% | 5 | 3 | A가 일반 제품 shell에 더 자연스러움 |
| dense scene에서의 절제 | 15% | 5 | 2 | B는 disclosure 제어가 필수 |
| frame·timestamp·provenance 진단력 | 10% | 3 | 5 | B가 명확히 유리 |
| V0 구현·검증 위험 | 5% | 4 | 3 | A가 snapshot 안정성이 높음 |
| 가중 합계 | 100% | **4.75** | **3.60** | A default, B Advanced |

이 결정의 의미:

- component API를 A/B로 나누지 않는다.
- `visualProfile` 또는 resolved scene theme만 바꾼다.
- Control은 A를 default로, Web Viz는 같은 scene에서 B를 켤 수 있다.
- error, selection, goal과 path의 의미와 event payload는 두 profile에서 동일하다.

## 8. LDS resolved role mapping

실제 LDS token 이름을 이 저장소에 복사하지 않는다. 제품 또는 docs integration
layer가 LDS theme를 아래 resolved input으로 변환한다.

| LDS resolved input 역할 | LDS3D 사용 | 소유 경계 |
| --- | --- | --- |
| canvas/surface | scene background, label backplate | LDS value → product resolver → LDS3D |
| surface subtle/elevated | ground tone; DOM inspector surface | ground는 LDS3D, panel은 LDS |
| border subtle/strong | grid minor/major; viewport border | grid는 LDS3D, frame은 LDS |
| text primary/secondary/inverse | screen-aligned label과 inspector text | label role은 LDS3D, typography는 LDS |
| interactive accent | hover·selected outline 후보 | 상태 contrast 검증 후 resolved value 사용 |
| focus ring | keyboard focus의 world outline과 DOM focus | 양쪽에 같은 의미, 별도 rendering |
| info/success/warning/danger | live·warning·error semantic channel | 제품 policy가 상태를 결정, LDS3D가 spatial appearance 제공 |
| disabled | entity affordance와 control disabled reason | appearance는 LDS3D, reason DOM은 LDS |
| motion duration/easing | camera transition과 overlay transition | reduced-motion이면 instant 또는 정보 손실 없는 축소 |
| spacing/radius/elevation | toolbar·panel·tooltip | world meter 값으로 변환 금지 |

현재 experimental `SceneTokenName`에 장기적으로 필요한 의미는 다음과 같다.
이 이름은 V0 연구 어휘이며 G-D0 전 stable export 제안이 아니다.

```text
scene.background
scene.ground
context.asset
grid.minor
grid.major
interaction.hover
interaction.focus
interaction.selected
intent.goal
intent.path.planned
intent.path.executing
status.live
status.stale
status.warning
status.error
overlay.label.background
overlay.label.text
diagnostic.frame
diagnostic.measurement
```

LDS component 책임:

- viewport title, description와 border
- camera/mode toolbar button, tooltip와 keyboard focus
- inspector panel과 selected entity DOM summary
- loading, empty, stale, degraded, unavailable와 error status
- retry, recovery, confirm과 cancel action
- screen reader live region과 reduced-motion preference

LDS3D 책임:

- WebGL canvas, lighting, grid와 world geometry
- GLB instance placement와 semantic material resolution
- camera, hover, pick, selection, goal과 path
- world-space outline, marker, bounds와 diagnostic overlay
- renderer lifecycle/capability event

V0 Storybook은 이 책임 경계를 실제 public component로 구현한다.
`Scene3DFrame`이 renderer state와 viewport chrome을, `SelectionInspector`가 같은
entity ID의 DOM summary를, `SegmentedControl`이 camera/state mode를,
`ViewportStatusBar`가 frame·unit·selection readout을 소유한다. LDS3D는 그 내부의
WebGL canvas, camera math, hover/picking, goal/path와 GLB instance만 소유한다.

## 9. Visual Alpha Storybook acceptance checklist

- [x] A와 B는 같은 `visual-alpha/amr-warehouse-v0` fixture, entity ID, camera pose,
      viewport와 interaction contract를 사용한다.
- [x] 두 후보 모두 실제 WebGL2 canvas와 depth/picking을 사용하며 DOM·SVG 이미지로
      3D 결과를 대체하지 않는다.
- [x] AMR, rack, pallet, cargo bin, charging station, safety cone의 실제 GLB 6종을
      manifest를 통해 로드한다.
- [x] Story 시작 시 로봇, goal과 path가 즉시 식별되고 3D orbit이 가능하다.
- [x] `Home`, `Top`, `Focus`가 서로 다른 실제 render를 만들며 selection contract를
      유지한다.
- [x] hover는 임시, selection은 persistent이며 선택 객체와 실제 LDS inspector가
      같은 ID를 표시한다.
- [x] goal·path 상태 변경은 명시적 `SegmentedControl`에서만 일어나고 scene select는
      command side effect 없이 selection만 변경한다.
- [x] actual/planned/executing/blocked path를 line treatment와 직접 label로 함께
      구분한다.
- [x] live/stale/warning/error와 hover/selected/target을 상태 label 및 LDS DOM
      summary와 함께 제공한다.
- [x] loading, empty와 deliberate asset error를 LDS DOM status·recovery action과
      함께 Storybook에서 재현한다.
- [x] critical/error/active target은 dense fixture에서도 label 또는 LDS inspector로
      발견할 수 있다.
- [x] 상태를 색만으로 전달하지 않고 label, line treatment, glyph와 DOM summary를
      함께 사용한다.
- [x] reduced-motion에서는 반복 pulse와 강제 camera flight를 제거한다.
- [x] Operational Neutral을 기본 Story로, Diagnostic Technical을 Advanced Story로
      제공하며 두 profile의 fixture와 event contract는 동일하다.
- [x] 실제 `@lk-robotics/design-system-core@0.1.0` 공개 component·CSS·semantic token을
      docs composition에서 소비하고 LDS3D canvas 책임과 분리한다.

## 10. V0 이후 검증

V0 구현은 디자인 결정을 눈으로 검토할 수 있게 만드는 단계다. “기존보다 낫다”는
주장은 다음 증거가 있어야 가능하다.

1. 동일 fixture와 camera에서 Control Current ↔ Operational Neutral 비교
2. Web Viz Current ↔ Diagnostic Technical 비교
3. error/target 5초 판독, first-click accuracy와 task completion time
4. dense scene critical visibility, color-vision/grayscale와 contrast 검사
5. keyboard Home/Top/Focus/selection과 reduced-motion 검사
6. 실제 LDS repository·package·Storybook·Figma version audit와 resolved token
   snapshot

따라서 이번 구현의 정확한 완료 문구는 “두 시각 방향을 실제 WebGL로 구현하고,
실제 LDS 공개 component와 조합했으며, Operational Neutral을 V0 기본 후보로
선택했다”이다. 아직 “기존 제품보다 우수함을 증명했다”는 뜻은 아니다. 그 판단은
Control Current·Web Viz Current와의 동일 과업 비교 검증을 통과한 뒤 확정한다.
