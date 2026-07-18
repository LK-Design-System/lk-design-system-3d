# 기존 제품 3D 증거 조사

## 목적

이 문서는 `LK Design System 3D` 형제 레포를 공식 3D 플랫폼으로 구축한다는 조직 결정을 뒷받침하고 구현 순서를 정하기 위해, 현재 두 제품이 실제로 담당하는 3D 기능과 반복 구현된 문제를 고정 커밋 기준으로 정리한다.

결론을 먼저 요약하면 다음과 같다.

- **공통 3D Foundation의 필요성은 높다.** 두 제품 모두 좌표 변환, 카메라, GLB, picking, 로봇·경로·목표 표현을 제품 코드에서 직접 해결한다.
- **별도 형제 레포를 공식 플랫폼으로 구축한다.** 정적 증거만으로 “반드시 별도 Git 레포여야 한다”는 기술적 필연성을 증명할 수는 없지만, 독립 버전·CI·성능 검증·제품 간 마이그레이션을 운영하기 위한 조직 결정은 **Official Go**다.
- **공식 플랫폼은 하나의 범용 렌더러가 아니다.** 공통 좌표·자산·상태·primitive 계약과 Three.js/R3F/Rerun 등의 렌더러 adapter를 제공하는 구조를 채택한다.
- **PointCloud·TF·Rerun·건물 저작 기반은 공식 P1/P2 로드맵이다.** 현재 공통성·성능 증거의 차이는 해당 기능을 플랫폼에서 제외할 이유가 아니라 API 확정 시점과 마이그레이션 순서를 조절하는 근거다.
- **백엔드 PCD 처리 알고리즘은 제품 책임으로 유지한다.** 플랫폼은 그 결과물과 메타데이터를 소비하는 자산 계약을 제공하되, mesh 생성·평활화·감량 같은 도메인 파이프라인 자체를 소유하지 않는다.

## 조사 기준

| 제품 | 조사 커밋 | 커밋 시각 | 커밋 링크 |
|---|---|---|---|
| `lkrobotics-control-full` | `de64d3c9b98eb9ce7aeaf7765035153492a57359` | 2026-07-16 13:26 KST | [commit](https://github.com/LK-ROBOTICS/lkrobotics-control-full/commit/de64d3c9b98eb9ce7aeaf7765035153492a57359) |
| `lk_web_viz` | `a984def117c05acd213f494cbb8a42e990595505` | 2026-06-24 19:51 KST | [commit](https://github.com/LK-ROBOTICS/lk_web_viz/commit/a984def117c05acd213f494cbb8a42e990595505) |

조사는 위 커밋의 소스, 패키지 매니페스트, 저장소 문서를 대상으로 한 정적 감사다.

이 문서의 **증거 강도**와 **조직 결정**은 서로 다른 판단 축이다. 증거 강도는 어느 API부터 안정화하고 어떤 마이그레이션 검증이 필요한지를 결정한다. Official Go는 플랫폼의 존재와 조직 표준화 방향을 확정한다. 따라서 실행·성능 증거가 부족한 영역도 플랫폼 존폐 판단으로 되돌리지 않고 P1/P2 단계에서 adapter와 제품 적용을 통해 구체화한다.

## 제품별 3D 기능

### `lkrobotics-control-full`

핵심 구현은 [InteractiveMap3D](https://github.com/LK-ROBOTICS/lkrobotics-control-full/blob/de64d3c9b98eb9ce7aeaf7765035153492a57359/frontend/src/views/dashboard/RobotDashboard/components/InteractiveMap3D/index.jsx)에 집중되어 있다.

| 기능 | 확인된 구현 |
|---|---|
| 공간 지도 | 서버에서 받은 GLB를 `useGLTF`로 로드하고 바운딩 박스에 맞춰 배치 |
| 좌표 적응 | GLB 바운딩 박스로 `z`, `y-world`, `y-local`을 추정하고 `mapOrigin`, `zSign`으로 맵·씬 좌표를 변환 |
| 로봇 표현 | 전용 GLB 로봇 모델을 현재 pose와 heading에 맞춰 표시 |
| 이동·작업 입력 | 투명 바닥 plane의 pointer event로 이동 목표와 작업 위치를 picking하고, 드래그로 방향 입력 |
| 운행 오버레이 | 로봇 이동 경로, 이동 목표, 작업 마커, 랜드마크 표시 |
| 카메라 | OrbitControls와 3D/Top View 전환, picking 중 회전 제한 |
| 명령 연결 | 선택한 좌표를 WebSocket 이동 명령으로 전송 |

제품이 직접 보관하는 [로봇 GLB](https://github.com/LK-ROBOTICS/lkrobotics-control-full/blob/de64d3c9b98eb9ce7aeaf7765035153492a57359/frontend/public/tron_model_47494A_full.glb)는 Git blob 기준 `63,609,848` bytes다. 3D 자산의 크기·축·단위·배포 정책도 제품 책임으로 남아 있다는 증거다.

### `lk_web_viz`

`lk_web_viz`는 단일 뷰어가 아니라 실시간 시각화, 편집, 건물 표현, 자산 생성까지 포함한다.

| 영역 | 핵심 파일 | 확인된 구현 |
|---|---|---|
| 실시간 PointCloud | [PointCloudViewer.tsx](https://github.com/LK-ROBOTICS/lk_web_viz/blob/a984def117c05acd213f494cbb8a42e990595505/frontend/src/components/3d/PointCloudViewer.tsx) | 다중 PointCloud, TF 변환·축, Marker, grid, 높이 색상, Z slice |
| ROS Marker·TF | [MarkerViewer.tsx](https://github.com/LK-ROBOTICS/lk_web_viz/blob/a984def117c05acd213f494cbb8a42e990595505/frontend/src/components/3d/MarkerViewer.tsx), [TFViewer.tsx](https://github.com/LK-ROBOTICS/lk_web_viz/blob/a984def117c05acd213f494cbb8a42e990595505/frontend/src/components/3d/TFViewer.tsx) | ROS Marker 종류와 TF frame을 Three.js object로 표현 |
| PCD 편집 | [PcdMap3DPanel.tsx](https://github.com/LK-ROBOTICS/lk_web_viz/blob/a984def117c05acd213f494cbb8a42e990595505/frontend/src/components/editor/PcdMap3DPanel.tsx) | zone 선택·polygon 편집, 계단 제어점 drag, OrbitControls |
| 구조 미리보기 | [StructurePreviewViewer.tsx](https://github.com/LK-ROBOTICS/lk_web_viz/blob/a984def117c05acd213f494cbb8a42e990595505/frontend/src/components/3d/StructurePreviewViewer.tsx) | GLB·primitive 렌더링, WebGPU 우선/WebGL fallback, 단순화, context loss 처리 |
| 건물 토폴로지 | [BuildingTopology3DView.tsx](https://github.com/LK-ROBOTICS/lk_web_viz/blob/a984def117c05acd213f494cbb8a42e990595505/frontend/src/components/building/BuildingTopology3DView.tsx) | 층 stack, PGM floor, waypoint, lane, robot, path, goal과 편집 interaction |
| 층 장면 | [FloorScene3D.tsx](https://github.com/LK-ROBOTICS/lk_web_viz/blob/a984def117c05acd213f494cbb8a42e990595505/frontend/src/components/building/FloorScene3D.tsx) | GLB·벽·랜드마크·경로·목표를 직접 Three.js lifecycle로 관리 |
| Site 저작 | [SiteStructurePreview3D.tsx](https://github.com/LK-ROBOTICS/lk_web_viz/blob/a984def117c05acd213f494cbb8a42e990595505/frontend/src/components/site/SiteStructurePreview3D.tsx) | 벽·object·texture, 다중 선택, marquee, 이동·회전·scale |
| 대체 렌더러 | [RerunViewer.tsx](https://github.com/LK-ROBOTICS/lk_web_viz/blob/a984def117c05acd213f494cbb8a42e990595505/frontend/src/components/3d/RerunViewer.tsx), [rerun_bridge.py](https://github.com/LK-ROBOTICS/lk_web_viz/blob/a984def117c05acd213f494cbb8a42e990595505/backend/app/services/rerun_bridge.py) | WebGPU/WebGL Rerun viewer와 별도 gRPC bridge, PointCloud·pose·TF·Marker 기록 |
| 자산 파이프라인 | [pcd_structure.py](https://github.com/LK-ROBOTICS/lk_web_viz/blob/a984def117c05acd213f494cbb8a42e990595505/backend/app/services/pcd_structure.py) | PCD에서 mesh를 생성·평활화·감량하고 GLB로 출력 |

저장소의 [ARCHITECTURE.md](https://github.com/LK-ROBOTICS/lk_web_viz/blob/a984def117c05acd213f494cbb8a42e990595505/docs/ARCHITECTURE.md)도 Three.js/WebGL, Rerun PoC, WebGPU 우선 fallback, GLB cache를 별도 렌더링 과제로 다룬다.

## 반복 구현된 공통 문제

아래는 코드가 동일하게 복사됐다는 뜻이 아니라, 두 제품이 같은 종류의 문제를 독립적으로 해결하고 있다는 뜻이다.

| 공통 문제 | Control Full | Web Viz | 공통화 가치 |
|---|---|---|---|
| 좌표계·축·부호 | GLB 축 추정, origin, `zSign` | ROS Z-up 변환, map Y→scene -Z, native Z-up 편집 | 매우 높음 |
| 카메라 | orbit, top view | orbit, focus, 층·편집별 camera | 높음 |
| Picking·선택 | 이동·작업 좌표와 방향 | zone, waypoint, goal, wall, object 편집 | 계약 공통화 가치 높음 |
| GLB | 맵·로봇 모델 로드와 축 보정 | 구조 로드, cache, 단순화, context 복구 | 높음 |
| 로봇 운행 표현 | robot, path, target, task, landmark | robot, path, goal, waypoint, lane | 높음 |
| Scene style | 조명, 경로·마커 색, 바닥 | grid, 축, 재질, 선택·상태 색 | token 공통화 가치 높음 |

## 확인된 차이

### 좌표계

좌표 정책은 제품 간뿐 아니라 `lk_web_viz` 내부에서도 다르다.

- Control Full은 GLB 바운딩 박스로 축과 좌표 범위를 추정한 뒤 `mapOrigin`과 `zSign`을 선택한다.
- `PointCloudViewer`는 ROS Z-up 데이터를 `[-π/2, 0, 0]` 회전한 content group에 넣고 Three.js Y-up 카메라를 사용한다.
- `PcdMap3DPanel`은 `camera.up = [0, 0, 1]`인 Z-up 장면을 그대로 사용한다.
- `BuildingTopology3DView`, `FloorScene3D`, `SiteStructurePreview3D`는 Y-up 장면에서 map Y를 scene `-Z`로 변환한다.
- Rerun backend도 별도의 Z-up→Y-up point·quaternion 변환을 수행한다.
- 공용 [coordinates.ts](https://github.com/LK-ROBOTICS/lk_web_viz/blob/a984def117c05acd213f494cbb8a42e990595505/frontend/src/utils/coordinates.ts)는 meter↔pixel 변환까지만 담당한다.

이 차이가 모두 오류라는 증거는 없다. 다만 좌표 계약이 중앙화되지 않아 새 뷰어나 자산을 추가할 때 부호·축·origin 규칙을 다시 판단해야 한다.

### 렌더러

| 제품/영역 | 렌더링 방식 |
|---|---|
| Control Full | React Three Fiber + Drei |
| Web Viz PointCloud·PCD·Topology·Site | React Three Fiber + Drei |
| Web Viz Structure·Floor | imperative Three.js WebGL/WebGPU |
| Web Viz Mapping 대안 | Rerun WebViewer + backend gRPC bridge |

따라서 모든 기능을 하나의 렌더링 엔진이나 scene API로 강제하지 않는다. 공식 플랫폼은 좌표·상태·primitive 계약을 중심에 두고, R3F·imperative Three.js·Rerun을 각각 adapter로 연결한다. renderer 간 차이는 플랫폼을 보류할 근거가 아니라 adapter 경계와 호환성 시험이 필요하다는 근거다.

이 정적 코드 감사는 기술 중복과 capability의 근거이지 현재 화면의 시각·사용성
baseline이나 LDS 통합 증거가 아니다. 디자인 우수성과 LDS 정합성은
[DESIGN_AND_LDS_INTEGRATION_PLAN.md](DESIGN_AND_LDS_INTEGRATION_PLAN.md)의
D-1/D0에서 실제 화면·LDS version과 동일 과제로 별도 검증한다.

### 의존성

각 [Control package.json](https://github.com/LK-ROBOTICS/lkrobotics-control-full/blob/de64d3c9b98eb9ce7aeaf7765035153492a57359/frontend/package.json), [Web Viz package.json](https://github.com/LK-ROBOTICS/lk_web_viz/blob/a984def117c05acd213f494cbb8a42e990595505/frontend/package.json)의 직접 의존성은 다음과 같이 갈린다.

| 패키지 | Control Full | Web Viz |
|---|---:|---:|
| React | `18.3.1` | `^19.0.0` |
| Three.js | `^0.168.0` | `^0.170.0` |
| React Three Fiber | `^8.18.0` | `^9.0.0` |
| Drei | `^9.122.0` | `^10.0.0` |
| Rerun WebViewer | 없음 | `^0.30.2` |

두 커밋 모두 frontend manifest와 source에서 `@lk-robotics` 또는 `design-system` 직접 사용이 확인되지 않았다. 새 3D 패키지를 만들더라도 기존 제품에 자동으로 도입된다고 볼 수 없으며, 별도 적용·마이그레이션 검증이 필요하다.

### 2026-07-17 제품 Pilot 대상 검증

두 제품의 위 고정 커밋을 얕은 읽기 전용 checkout으로 다시 확인했다. 두 checkout은
각각 `main`에서 표의 commit과 일치했고 작업 트리는 clean이었다. 이 확인은 새
제품 구현이나 배포를 뜻하지 않는다.

첫 **visible** Pilot의 대상은 Control이 아니라 Web Viz의
[`MapConvert3DScreen`](https://github.com/LK-ROBOTICS/lk_web_viz/blob/a984def117c05acd213f494cbb8a42e990595505/frontend/src/screens/MapConvert3DScreen.tsx#L1761-L1765)에
있는 `StructurePreviewViewer` slot이다. completed `extract-structure` job의
`structureResult`를 읽어 GLB 하나를 표시하는 구간이며, PCD 편집, ROS stream,
route·save, robot command를 같은 Pilot에 넣지 않아도 된다. 반대로 Control의
`InteractiveMap3D`는 GLB 축 추정, pointer-floor projection, 작업 상태와
`/app/control/move` WebSocket 전송을 한 컴포넌트에 결합한다. Control의 첫 적용은
visible 교체가 아니라 기존 command를 authoritative하게 유지하는 계산 전용 shadow로
남긴다.

이 선택은 LDS 페이지 정합성의 증거가 아니다. 초기 Pilot은 **WebGL asset·좌표·lifecycle
canary**이며, LDS `Scene3DFrame`·toolbar·inspector를 포함한 page-shell 이관은
별도 LDS package pin, page anatomy audit과 UI parity review를 통과해야 한다.

Pilot 전에 해소해야 하는 계약은 다음과 같다.

| Gate | 현재 근거 | Pilot에서 필요한 결정 |
| --- | --- | --- |
| Consumer stack | Web Viz는 `three ^0.170.0`, R3F `^9.0.0`; LDS3D renderer packages는 `three >=0.185.1`, R3F `^9.6.1`을 peer로 요구 | Web Viz target stack을 올려 consumer smoke를 통과시키거나, 별도 compat binding을 명시적으로 승인한다. 지원 범위 밖 `link:` 설치나 duplicate Three runtime은 금지한다. |
| Renderer capability | 기존 Structure Preview는 WebGPU 우선 후 WebGL fallback이고, LDS3D `ThreeSceneHost`는 현재 WebGLRenderer만 제공 | feature flag가 LDS3D WebGL path를 고를 때만 canary한다. WebGPU 환경은 legacy viewer를 유지하거나 WebGPU adapter를 별도 승인한다. |
| Asset evidence | product response에는 `glb_file`, vertex/face/z-range만 있으며 asset ID·version·hash·frame·unit·bounds·provenance가 없다 | product-owned resolver가 인증 URL을 해석하고, `WebVizSceneAdapter`가 검증 가능한 asset manifest와 immutable `AssetEntity` snapshot을 만든다. token, transport, job polling은 LDS3D로 넘기지 않는다. |
| Coordinate evidence | committed `structure_basic.glb`와 map fixture는 Z-up meter geometry로 보이는 수치를 보이지만 GLB metadata가 contract를 선언하지 않는다 | source frame, meters-per-unit, core transform, bounds를 fixture test와 manifest로 한 번만 선언한다. 정적 추정이나 viewer별 회전을 authoritative contract로 승격하지 않는다. |

따라서 최초 Pilot의 완료 정의는 “Web Viz 전체 3D 화면 이관”이 아니라 다음으로
제한한다.

1. product-local `WebVizSceneAdapter`가 완료된 structure result를 읽기 전용
   asset/entity snapshot으로 바꾼다.
2. feature flag로 legacy viewer와 LDS3D WebGL viewer를 선택할 수 있다.
3. LDS3D path는 실제 GLB 하나의 load/ready/error/context-recovery와 asset selection을
   검증하고, selection은 asset metadata DOM summary에만 반영한다.
4. PCD 생성, authentication, job polling, persistence, route, permissions와 모든
   edit/command callback은 기존 product 경로에 남는다.

`PointCloudViewer`, `PcdMap3DPanel`, `BuildingTopology3DView`, `FloorScene3D`,
`SiteStructurePreview3D`, Rerun은 이 Pilot에서 제외한다. 이들은 각각 streaming
renderer, authoring, multi-floor/domain topology 또는 별도 transport adapter를
포함하므로 P1/P2 범위를 앞당기지 않는다.

## 필요성 판단

| 판단 대상 | 증거 강도 | 증거 기반 해석 | 조직 결정 |
|---|---|---|---|
| 공통 좌표·카메라·scene primitive Foundation | 높음 | 두 제품과 Web Viz 내부에서 같은 문제를 반복 해결 | **P0 즉시 구축** |
| Core UI와 분리된 패키지/릴리스 | 중간 이상 | 대형 자산, GPU lifecycle, 서로 다른 Three/React 버전과 선택 렌더러가 존재 | **별도 형제 레포와 독립 릴리스 채택** |
| 반드시 별도 Git 레포여야 함 | 중간 | 기존 레포 내 독립 패키지로도 일부 기술 문제는 해결 가능 | 기술적 필연성과 별개로 **Official Go 확정** |
| 하나의 범용 renderer로 즉시 통합 | 낮음 | 실시간 PointCloud, 편집기, 건물 저작, Rerun의 실행 모델과 요구가 다름 | **채택하지 않음**. 공통 contract와 renderer adapter 구조 채택 |
| PointCloud·TF·Marker | Web Viz 직접 증거 높음, 제품 간 공통 증거 제한적 | 성능·데이터 규모별 API 검증 필요 | **P1 공식 로드맵**. Three/R3F adapter와 함께 제품 적용으로 안정화 |
| Rerun 연동 | Web Viz 직접 증거 높음, 제품 간 공통 증거 제한적 | Three.js와 다른 lifecycle·backend bridge를 사용 | **P1 공식 로드맵**. 독립 adapter로 통합 |
| Building·Floor·Site spatial primitive와 authoring 기반 | Web Viz 직접 증거 높음, 제품 간 공통 증거 제한적 | 제품 도메인 규칙과 재사용 가능한 공간 primitive의 경계를 검증해야 함 | **P2 공식 로드맵** |
| 백엔드 PCD mesh 생성·평활화·감량 알고리즘 | 제품 간 공통 증거 부족 | 제품 인프라와 도메인 처리 책임에 가까움 | **제품 소유 유지**. 플랫폼은 입력·출력 자산 및 메타데이터 계약만 소유 |
| Rerun backend bridge | Web Viz 직접 증거만 존재 | 배포·transport·기록 정책은 제품 인프라와 결합 | bridge 구현은 **제품 소유 유지**, frontend adapter와 교환 계약은 플랫폼 소유 |

P0의 최초 구현 범위는 `CoordinateSystem`, `MapTransform`, `CameraRig`, scene tokens, GLB asset contract, `Robot/Goal/Path/Landmark` 표현 계약이다. 이후 PointCloud·TF·Marker와 Rerun adapter를 P1, Building·Floor·Site spatial primitive와 authoring 기반을 P2로 확장한다. 이 순서는 플랫폼 필요성을 다시 판단하기 위한 파일럿이 아니라, 증거가 강한 계약부터 API를 안정화하고 제품을 안전하게 이관하기 위한 공식 플랫폼 배포 순서다.

정리하면, **“하나의 범용 렌더러”는 선택하지 않았고 “공통 계약과 복수 renderer adapter로 구성된 공식 범용 3D 플랫폼”은 선택했다.** 후속 검증에서 API나 adapter 구성은 바뀔 수 있지만 플랫폼 구축 결정 자체는 검증 대상으로 되돌리지 않는다.

## 증거의 한계

- 고정 커밋의 정적 소스 감사이며, 화면을 실행해 실제 라우트·사용 빈도·사용자 가치를 검증하지 않았다.
- FPS, 메모리, 로딩 시간, WebGPU 대비 효과를 직접 측정하지 않았다.
- 코드 주석의 vertex 한계, 크기 감소율, 성능 배수는 독립적으로 검증된 수치가 아니므로 판단 근거로 확정하지 않았다.
- GLB는 파일 크기와 참조 방식만 확인했으며, 시각 품질·좌표 정확성·최적화 상태를 렌더링해 검사하지 않았다.
- 두 레포 외의 제품, 현재 운영 브랜치, 향후 로드맵, 팀 소유권과 릴리스 프로세스는 조사 범위 밖이다.
- 코드 존재는 해당 기능이 현재 프로덕션에서 활성화되어 있다는 사실까지 증명하지 않는다.
- 이 한계는 성능 예산, adapter API, 호환 범위, 마이그레이션 우선순위를 검증해야 한다는 뜻이다. 플랫폼 존립 여부에 대한 보류 조건으로 해석하지 않는다.
