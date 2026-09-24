# 궁릉 3D 근거 기반 보완 계획

- Status: Draft (제안 — 착수 순서와 결정 항목은 승인 전)
- Created: 2026-09-25
- Owner surface: LDS3D 공개 원자와 camera·interaction·theme 계약
- 근거 제품: `lkrobotics-control-gungneung` `origin/feat/3d-map`
  [`bc83977d`](https://github.com/LK-ROBOTICS/lkrobotics-control-gungneung/commit/bc83977dabf70d99e9725d19959fee331e6296e4)
  (2026-09-23 14:48 KST, `main` 대비 64 commit, merge-base `fa1853362a6a`)

## 왜 이 문서인가

궁릉 관제는 서오릉 디지털 트윈(`DigitalTwinMap/`, 117개 파일)을 LDS3D 없이 만들었다.
캔버스 밖 DOM chrome(`Scene3DFrame`, `ViewerToolbar`, `StatusBadge`, `Dimmer`,
`Spinner`, `ViewportStatusBar`)만 LDS를 쓰고, WebGL 안쪽은 전부 three.js·R3F·drei로
직접 구현했다. `@lk-design-system/lds-3d-*` 참조는 브랜치 전체에서 0건이다.

[PRODUCT_EVIDENCE.md](PRODUCT_EVIDENCE.md)는 Control Full과 `lk_web_viz`만 조사했다.
궁릉은 세 번째 3D 제품이며, 실제 현장 운영에서 부딪힌 문제(따라보기 끊김, 멈춘 위치,
콜드 로드 시간)를 코드와 커밋으로 남겼다. 이 문서는 그 근거에서 **여러 제품이 다시 쓸
수 있는 부분만** 골라 LDS3D 보완 순서로 정리한다.

제품 코드는 필요한 capability의 근거이지 LDS3D API나 시각 스타일을 그대로 복제하는
기준이 아니다([docs/README.md](README.md)). 아래 제안 API는 모두 초안이다.

## 선결 과제 — 스택 격차

| | 궁릉 `feat/3d-map` | Control Full (PRODUCT_EVIDENCE) | LDS3D reference |
| --- | --- | --- | --- |
| React | 18.3.1 | 18 | 19.1.1 이상 |
| `@react-three/fiber` | ^8.18.0 | 8 | ^9.6.1 |
| three | ^0.168.0 | 0.168 | 0.185.1 이상 |
| drei | ^9.122.0 | 사용 | 미사용 |

지금 상태로는 궁릉이 `lds-3d-r3f`를 설치할 수 없다. 아래 보완을 먼저 해도 궁릉에는
바로 들어가지 못한다. 경로는 세 가지다.

1. **core 순수 함수 우선 (권장, 결정 불필요)** — 보완 항목의 계산 부분(카메라 범위,
   따라보기 포즈, 전환 보간, 라벨 배치, 위치 신선도)을 React·three에 의존하지 않는
   `lds-3d-core` 순수 함수로 먼저 낸다. core에는 peer 의존이 없으므로 React 18·R3F 8
   제품도 지금 바로 쓸 수 있다. R3F 바인딩은 그 위에 얇게 얹는다. 기존 `camera.ts`의
   `computeHomeCameraState` / `computeFocusCameraState`와 같은 구조다.
2. **`lds-3d-r3f-compat-v8` 착수** — [ARCHITECTURE.md](ARCHITECTURE.md)와
   [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)는 "필요성이 승인될 때에만" 만드는
   deprecated binding으로 정의한다. 궁릉은 Control Full에 이은 두 번째 R3F 8 소비처라
   필요성 근거가 된다. 다만 legacy CI matrix 유지 비용이 따른다.
3. **제품 스택 상향** — 궁릉이 React 19·R3F 9·three 0.185로 올린다. 제품 팀 결정이며
   LDS3D가 요구할 수 없다.

1은 2·3과 독립적이므로 바로 진행하고, 2와 3 중 하나는 사용자·제품 팀 결정으로 남긴다
(아래 "결정 필요").

## 보완 항목

각 항목은 계산은 core, 렌더링은 r3f로 나눈다. 번호는 권장 순서다.

### G1. 따라보기 카메라

- 제품 근거: `RobotFollowCamera.jsx`, `followCameraTransition.js`,
  `followCameraOcclusion.js`, `officeCamera.js`의 `cameraPose(position, heading,
  posture, mode)`. 모드는 `free` / `third`(3인칭) / `robot`(1인칭).
  - 렌더된 변환(보간 후 위치)을 따라가야 흔들리지 않는다.
  - 0.8초 quintic 전환, reduced-motion이면 즉시 전환.
  - 따라보는 동안 `camera.near`를 0.08로 낮춘다.
  - 시야를 가리는 물체는 최대 0.18 불투명도로 흐린다. 카메라 붐이 벽을 뚫지 않게 자른다.
  - 최근 커밋 "robot follow mode 진입 끊김 원인 4개 제거"(v62)가 이 영역이다.
- LDS3D 현재: `CameraRig`는 home / top / focus / free만 있고 대상 추적이 없다.
- 제안:
  - core `computeFollowCameraState({ target, heading, mode, offset })`,
    `interpolateCameraState(from, to, t, easing)`, `clipCameraBoom(state, obstacles)`.
  - r3f `CameraRig`에 `follow` 모드와 `followTarget`(entity id 또는 렌더 변환 ref) 추가.
    가림 처리는 선택 가능한 `occlusionFade` 옵션.
- 범위 밖: 로봇 자세(`posture`) 정의, 제품 모드 이름과 전환 UI(툴바는 LDS DOM).
- 수용 기준: reduced-motion 즉시 전환, 전환 중 새 명령이 오면 취소 이유를 기존
  `CameraCancellationReason`으로 보고, 60 fps에서 1초 추적 시 떨림 없음(Storybook play).

### G2. 카메라 이동 범위와 장소 맞춤

- 제품 근거: `cameraBounds.js` — `pointInPolygon`, `clampToPolygon`, `groundHeightAt`,
  지면 여유(카메라 8 m, 대상 1.5 m), 거리에 따라 좁아지는 기울기 한도
  (`maxPolarAngleAt`, `TILT_FREE_DISTANCE`), `applyCameraBounds`. 가장자리 80 m 페이드
  (`useViewBounds`). 장소 맞춤은 `placeFocus.js`의 `placeFocusDistance(radius, fov,
  aspect)`.
- LDS3D 현재: focus bounds는 "무엇을 화면에 담을지"만 정한다. 카메라가 갈 수 있는
  영역 제한이 없다.
- 제안: core `CameraConstraints`(`polygon`, `targetPolygon`, `groundClearance`,
  `minDistance`/`maxDistance`, `polarLimitByDistance`)와
  `applyCameraConstraints(state, constraints, groundHeightAt?)`. 지면 높이는 호출자가
  함수로 주입한다(지형 데이터는 제품 소유). `fitDistanceForRadius(radius, fov, aspect)`는
  `computeFocusCameraState`와 합친다.
- 범위 밖: 부지 다각형과 상수 값.
- 수용 기준: 다각형 밖 입력은 가장 가까운 경계로 투영, 지면 아래 입력은 여유만큼 올림,
  단위 테스트로 결정론 고정.

### G3. 지도 라벨

- 제품 근거: `mapLabels.js`(`MAP_LABEL_ROLES`, `createMapLabel(text, role, focus)`,
  `layoutMapLabels` — 역할별 우선순위, 겹침 회피, 최대 표시 거리, 고정 픽셀 높이),
  `MapLabelController.jsx`(클릭하면 장소 초점). 가려지면 숨는 말풍선은
  `EventSignsLayer.jsx`(drei `Html` + raycast).
- LDS3D 현재: `markers.tsx`의 캔버스 텍스처 텍스트뿐. DOM 라벨·billboard 원자가 없다.
- 제안:
  - core `layoutScreenLabels(labels, projector, viewport)` — 우선순위와 충돌 회피,
    거리 컷오프를 순수 함수로.
  - r3f `SceneLabelLayer` — 화면 고정 크기 라벨, `Selectable`과 같은 선택 계약.
  - DOM 말풍선은 LDS 컴포넌트를 쓰도록 위치만 제공하는 `useProjectedAnchor`.
    말풍선 모양을 LDS3D가 그리지 않는다(DOM UI Ownership Gate).
- 범위 밖: 역할 이름(능·재실 등), 한국어 문구.
- 수용 기준: 100개 라벨에서 겹침 0, 선택 시 초점 이동, 폰트와 색은 G6 테마 계약에서만.

### G4. 로봇 마커의 위치 신뢰도

- 제품 근거: `Tron2Robot.jsx`의 마커 세 상태(정상 / 근사 / 끊김, `:127`),
  `poseFreshness.js`. 백엔드가 **같은 좌표를 새 타임스탬프로 계속 재발행**해서
  타임스탬프 기준 신선도로는 멈춘 위치를 잡지 못했다. 그래서 "WALK 상태인데 30초 동안
  좌표가 0.01 m 안에서 그대로면 멈춘 위치"로 판정한다. 2026-09-18에만 31회, 55분이
  이런 상태였다고 파일에 기록돼 있다.
- LDS3D 현재: `AmrRobot`의 `status`에 위치 신뢰도 축이 없다.
- 기존 LDS 어휘(Robotics UI, 2D):
  - `NavigationCoordinateSystem` freshness `fresh | stale | expired | future`
  - `FleetFreshnessState` `current | delayed | stale | unknown`
  - `RobotPoseMarker.localization`(2D 불확실성)
- 제안: `AmrRobot`에 `poseFreshness`와 `localization` prop을 추가하고 Robotics 어휘를
  그대로 쓴다(2D·3D 동일 의미). 신선도 판정 함수는 값 기준과 시간 기준을 모두 지원한다:
  core `evaluatePoseFreshness(samples, { movingState, stillForMs, toleranceMeters,
  staleAfterMs })`. 이 판정은 2D 마커도 필요하므로 Robotics와 소유 위치를 합의한다.
- 범위 밖: 로봇 상태(WALK 등) 매핑, 마커 PNG.
- 수용 기준: 같은 값 재발행 입력에서 stale 판정, 시각 표현은 색만이 아니라 형태로도
  구분(접근성).

### G5. 지형에 붙는 궤적과 경로

- 제품 근거: `RobotTrail.jsx`, `trailRibbon.js`, `trailWidth.js`(도로 폭의 70%,
  최소 6 px), `VisualPatrolRouteLayer.jsx`, `RegisteredRobotLayers.jsx:94`의 점선
  계획 경로(`lineWidth 1.5`, `dashSize 4`, `gapSize 6`).
- LDS3D 현재: `PathRibbon`은 `elevationMeters` 하나로 평면에 뜬다. "route corridor"는
  이미 기록된 설계 부채다.
- 제안: `PathRibbon`에 `groundHeightAt`(G2와 같은 함수 계약)과 `widthMode:
  'meters' | 'pixels'`, `minPixelWidth`를 추가. 계획/실제 구분은 기존 `variant`로.
- 범위 밖: 도로망 생성, 경로 계획.

### G6. 장면 테마 계약 확장과 토큰 연결

- 제품 근거: 궁릉은 WebGL 색·선 두께·라벨 폰트를 hex와 숫자로 박았다
  (`CompositeSiteScene.jsx:1324-1330`, `mapLabels.js:10-23`, `skyGradient.js:10-12`,
  `SiteLandmarksLayer.jsx` 다수). 반면 `.lds/adoption-report.json`은 WebGL도 LDS
  토큰이라고 적었다. 참조할 계약이 없었던 것이 원인이다.
- LDS3D 현재: `theme.ts`의 장면 토큰은 hex이고 실험 단계(G-D0 게이트)다. LDS
  `data-theme`을 따라가지 않고, 선 두께·라벨 스타일 슬롯이 없다.
- 제안:
  - 테마 계약에 `line`(trail·route·selection 두께, 대시), `label`(글꼴, 크기, 배경,
    강조), `environment`(sky, terrain, vegetation) 슬롯 추가.
  - `apps/docs` 조합 레이어에 "LDS semantic token → 장면 테마" resolver 예시를 둔다
    (`getComputedStyle`로 CSS 변수를 읽어 `themeCustomization`으로 전달).
    renderer 패키지는 LDS에 의존하지 않는다(AGENTS.md 의존 경계).
  - `data-theme` 변경 시 테마를 다시 계산하는 패턴을 스토리로 고정.
- 결정 필요: 이 슬롯에 들어갈 **값**은 공유 토큰 결정이다. LDS 쪽에 3D 전용 semantic
  token을 둘지, 기존 semantic 역할을 매핑할지는 design owner 승인 사항이다.

### G7. 레이어 상태와 렌더러 복구

- 제품 근거:
  - 레이어별 로딩 상태 집계(`CompositeSiteScene.jsx:1343-1360`)와 `LayerErrorBoundary`
  - WebGL context loss 감지와 재시도(`RendererGuard`, `:576`)
  - 필요할 때만 그리기(`frameloop 'demand'/'never'`, `RenderLoopActivity`)
  - 레이어 토글 키와 URL 플래그(`sceneOptions.js`)
- LDS3D 현재: 장면 전체 `renderState` 하나. 레이어 단위 상태, context loss 복구, 레이어
  토글 계약이 없다. `frameLoop` prop은 있다.
- 제안: core `LayerStatus`(`loading | ready | error | disabled`)와
  `aggregateLayerStatus`, r3f `SceneLayer` 경계(오류 격리 + 상태 보고), `SceneCanvas`에
  `onContextLost` / `onContextRestored`. 토글 UI는 LDS `ViewerToolbar`/`SegmentedControl`
  조합 예시로만 둔다.

### G8. 대규모 식생·구조물 성능 도구 (후순위)

- 제품 근거: `ReconstructionLayer.jsx`의 `THREE.LOD`와 sprite impostor(`:629`),
  `InstancedMesh`(`:760`), `forestImpostors.js`, 공간 인덱스 raycast
  (`raycastGrid.js:160`), GLB 사전 압축(콜드 로드 50.8 MB → 38 MB).
- 제안: `intersectIndexed`(공간 인덱스 picking)만 먼저 core/three 유틸로. impostor·LOD는
  두 번째 제품 근거가 생길 때 착수.

## 가져오지 않는 것

- TRON2 리그·자세·지면 안착(`tron2Rig.js`, `tron2Motion.js`, `tron2Ground.js`) —
  로봇 전용. 필요하면 기존 `ArticulatedGltfModel` 계약으로 제품이 조합한다.
- 능·담장·광장 절차 생성(`SiteLandmarksLayer.jsx`), 부지 상수, 위성·DEM·LiDAR 정합
  파이프라인(Python·Blender 스크립트) — 부지 전용 데이터 가공.
- 재생 제어 UI — LDS3D `PlaybackClock` 계약이 이미 있다. 궁릉 `usePathReplay`는
  이관 후보일 뿐 새 원자가 아니다.
- 명령·전송·권한 — 제품 소유(AGENTS.md).

## 단계

| 단계 | 내용 | 궁릉 적용 가능 시점 |
| --- | --- | --- |
| W1 | G2·G1 계산부, G4 신선도 판정을 core 순수 함수로 | core만 쓰면 즉시 |
| W2 | G1·G2 r3f 바인딩(`CameraRig` follow, constraints), G5 `PathRibbon` 확장 | 스택 결정 후 |
| W3 | G3 라벨, G7 레이어 상태·복구 | 스택 결정 후 |
| W4 | G6 테마 슬롯과 resolver 예시 (값은 design owner 승인 후) | 스택 결정 후 |
| 후순위 | G8 | 두 번째 근거 확보 시 |

각 단계는 기존 공개 API 규칙을 따른다: api-report baseline, package-smoke, 스토리 계약
(`scripts/storybook-contract.mjs`), 새 공개 원자는 owner 페이지와 리뷰 계약.

## 결정 필요

1. **스택 경로** — `lds-3d-r3f-compat-v8` 착수, 궁릉 스택 상향, 또는 당분간 core 함수만
   공급 중 무엇으로 갈지.
2. **위치 신선도 소유** — `evaluatePoseFreshness`를 LDS3D core에 둘지, 2D 마커와 함께
   Robotics UI에 둘지.
3. **3D 테마 값** — LDS에 3D 전용 semantic token을 만들지, 기존 역할을 매핑할지.
4. **궁릉 통보** — 궁릉은 다른 팀 저장소다. adoption report와 WebGL hex 불일치(G6)를
   알릴지, 알린다면 문구는 사용자 승인 후.

## 근거 기록

- 조사 방법: 읽기 전용. `git show origin/feat/3d-map:<path>`와 `git diff
  origin/main...origin/feat/3d-map`만 사용했고 궁릉 작업트리는 바꾸지 않았다.
- 경로는 모두 `frontend/src/views/dashboard/RobotDashboard/components/DigitalTwinMap/`
  기준이며 행 번호는 `bc83977d` 기준이다.
