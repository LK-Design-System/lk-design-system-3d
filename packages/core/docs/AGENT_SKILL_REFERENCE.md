# Agent Skill Reference — LDS 3D 소비 규칙

이 문서는 소비 레포의 에이전트 스킬(`lds-ui`, `@lk-design-system/lds-core/docs/agent-skills/lds-ui/`)이 3D 뷰 작업 시점에 로드하는 도메인 규칙 요약이다. 설치 기준 경로는 `@lk-design-system/lds-3d-core/docs/AGENT_SKILL_REFERENCE.md`. 산문과 실제 API 동작이 다르면 각 패키지의 타입 계약과 README가 정본이다.

## 진입 경로

- React 제품은 **`@lk-design-system/lds-3d-r3f`**(`SceneCanvas` + 공간 프리미티브)를 설치하고, 경계를 넘는 모든 값은 `lds-3d-core` 타입(`frameId`, `Pose3`, `Bounds3`, `EntityId`)으로 만든다. peer 범위는 `@lk-design-system/lds-3d-r3f`의 `package.json` `peerDependencies`가 정본이다(여기에 옮겨 적지 않는다).
- `lds-3d-three`는 어댑터 구현이다 — 제품이 직접 다루지 않는다. 비-React 제품만 그 루트 API를 쓰며, 루트 API는 의도적으로 `THREE.Scene`/`Object3D`/`WebGLRenderer`를 노출하지 않는다.
- 능력별 추가: `pointcloud`(포인트클라우드 스냅샷), `tf`(타임스탬프 프레임 트리), `markers`(마커 스냅샷), `assets`(매니페스트·로봇 GLB·키네마틱스), `testing`(소비자 CI용 계약 픽스처).
- 시나리오 헬퍼(`AmrOperationalScene` 등)는 데모 고정물이지 기본 조립 출발점이 아니다 — 가장 작은 의미 원자부터 조립한다.

## 소유 경계 — 3자 분할은 협상 불가

- **LDS(2D)**: 모든 DOM 크롬·포커스·상태 표시·브랜드. **LDS3D**: 공간 수학·WebGL·피킹·렌더러 수명주기. **제품**: 전송·커맨드·권한·워크플로 상태·라우팅·저장.
- 렌더러는 headless다. 카메라 툴바·선택 패널·재시도 버튼은 `SceneCanvas`가 그리지 않는다 — LDS 컴포넌트(`Scene3DFrame`, `ViewerToolbar`, `ViewportStatusBar`, `SelectionInspector` 등)로 밖에서 조립하고 overlay 슬롯 컨텍스트(`clearSelection`, `requestCameraMode`, `retry`)에 배선한다.
- **선택은 정체성이지 명령이 아니다.** 공간 선택은 `EntityId`를 방출할 뿐, 로봇 명령이나 제품 부작용을 직접 유발하면 안 된다. 해석은 경계를 넘은 뒤 제품 코드가 한다.
- **렌더러 객체를 제품 상태에 저장하지 않는다** (`THREE.Object3D`, 렌더러 핸들 금지).

## 좌표·프레임·시간

- 공개 공간 규약은 하나: **오른손, +Z up, +X forward, 미터, 라디안, 정규화 `[x,y,z,w]` 쿼터니언.**
- **프레임 없는 `[x,y,z]`는 패키지 경계를 넘지 않는다.** `SceneCanvas.frame`은 필수이고 모든 자식·`focusBounds`·`topBounds`는 이미 그 프레임이어야 한다 — 호스트에 닿기 전에 변환한다.
- **변환은 어댑터에서 정확히 한 번.** core→Three 기저는 `SceneCanvas`가 한 번 적용한다. 자손이 세계를 다시 회전하거나 제품 코드에 `x, z, -y` 보정을 흩뿌리지 않는다.
- 시간은 명시적이다. TF 조회는 exact/interpolated/held/stale/extrapolated 상태를 돌려준다 — 숨길지 얼릴지 주석할지는 소비자가 결정하고, 렌더러는 절대 identity 변환을 추측하지 않는다.

## 테마 — LDS 토큰 값을 복사하지 않는다

- LDS semantic 토큰의 해석은 **조립 레이어**에서 하고, 값을 `SceneCanvas`의 `theme`/`themeCustomization`(scene token 계약: `scene.background`, `grid.*`, `axis.*`, `selection.active`, `path.default`, `goal.default`, `warning`)으로 넘긴다. CSS 변수 이름을 3D에 넘기거나 토큰 값을 렌더러 코드에 굽지 않는다. 기본 팔레트는 `lds-3d-core`의 `OPERATIONAL_SCENE_TOKENS`/`DIAGNOSTIC_SCENE_TOKENS`이고 three·r3f 두 호스트가 같은 값을 읽는다(경로=실행 청록, 목표=의도 보라). r3f 재질 `live`/`intent`/`selection`/`warning`은 이 scene token에서 파생되므로 scene token 하나만 덮어쓰면 된다. 장면 범례도 같은 테마(`resolveSceneTheme(profile).materials`)에서 색을 읽는다 — LDS status 토큰으로 범례를 칠하면 장면과 어긋난다.
- 로봇 상태는 LDS Robotics `RobotPoseState` 어휘(`moving`/`idle`/`paused`/`fault`/`offline`/`unknown`)로 넘긴다. `AmrRobot`은 색과 함께 형상 단서(일시정지 막대·X·고리·꺼진 상태등·반투명 본체)로 상태를 보인다. `live`/`warning`/`error`는 옛 철자로 계속 받는다.
- 상태는 색만으로 전달하지 않는다 — 기하·패턴·글리프·외곽선·레이블 + LDS DOM 요약을 병행한다. 축 정체성은 색과 함께 X/Y/Z 문자.

## 성능·수명주기

- 기본은 demand 렌더링(`renderQuality="balanced"`). `frameLoop="always"`는 호출자 소유의 연속 애니메이션에만. 뷰포트당 `SceneCanvas`와 `SceneEnvironment`는 각각 하나 — 두 번째 세계 표면을 만들지 않는다.
- **예산은 필수이고, 초과는 거부이지 열화가 아니다.** `maxPoints`/`maxMarkers`/`maxCells`는 필수 prop이며 초과·프레임 불일치 입력은 아무것도 렌더하지 않고 `onRenderStateChange`로 보고된다 — 몰래 샘플링·절단·타일링하지 않는다.
- **버퍼 소유는 immutable-by-replacement.** 호출자가 소스 버퍼(`Float32Array` 등)를 소유하고, 내용이 바뀌면 새 스냅샷+revision을 발행한다. 어댑터는 파생 GPU 자원만 소유·폐기한다.

## 상호작용·접근성

- hover는 일시적, selection은 지속적 — **hover가 치명 정보의 유일한 공개 수단이면 안 된다.**
- 인터랙티브 `SceneCanvas`에는 장면별 `ariaLabel`을 반드시 준다(생략하면 모든 캔버스가 같은 기본 이름 "Interactive 3D scene"을 받아 보조기술에서 구분되지 않는다 — 코드가 막지는 않으므로 규칙으로 지킨다), 탭 정지 1개, 문서화된 카메라 키(`Home`/`T`/`F`/화살표 orbit/`Shift`+화살표 pan/`±` zoom). 모든 포인터 드래그(배치·기즈모)는 LDS `NumberField` 등의 숫자·키보드 대안 필수 (WCAG 2.2 Dragging Movements).
- 캔버스 선택은 DOM 요약/트리에 미러링한다 — 요약은 실제 WebGL 기하·깊이·피킹을 **보완**하지 대체하지 않는다.

## 자산

- `GltfModel`은 검증된 `manifest` 또는 명시적 `sourceConvention`이 필수다 — **파일명에서 축·스케일·경계를 추론하지 않는다.** 로더가 한 번 정규화하고, 컴포넌트는 로드된 장면을 보정 회전하지 않는다.
- URDF는 런타임 API가 아니라 빌드 타임 툴체인이다(GLB + kinematics 매니페스트 산출). 런타임은 `ArticulatedGltfModel` + 정규화된 관절값(라디안) — 모터 raw tick 변환·캘리브레이션·명령 전송은 제품 소유.

## 라우팅 (설치 기준 정본)

| 주제 | 경로 |
|---|---|
| 호스트 계약·예산·키보드·overlay | `@lk-design-system/lds-3d-r3f/README.md` |
| 프레임·포즈·occupancy 수학·scene token | `@lk-design-system/lds-3d-core/README.md` |
| 포인트클라우드/TF/마커 계약 | 각 패키지 `README.md` |
| 매니페스트 스키마·패키지드 로봇 | `@lk-design-system/lds-3d-assets/README.md` + 동봉 JSON 스키마 |
| 소비자 CI 계약 테스트 | `@lk-design-system/lds-3d-testing/README.md` |

저장소 심화 문서(`docs/SPATIAL_PRIMITIVES_GUIDE.md`, `docs/ARCHITECTURE.md`)는 패키지에 실리지 않는다 — 필요하면 저장소에서 읽는다.
