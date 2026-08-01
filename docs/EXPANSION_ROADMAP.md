# Expansion Roadmap

- Status: Active
- Created: 2026-07-31
- Owner surface: articulation stack (robot kinematics contract, forward
  kinematics, `ArticulatedGltfModel`, SO-ARM joint viewer scenario)를 기반으로 한
  플랫폼 확장 순서.

## Why this document

2026-07-31에 관절 체인 계약이 플랫폼에 들어왔다:

- `@lk-design-system/lds-3d-assets` — `RobotKinematicsV1`(링크↔glTF 노드 매핑, 조인트
  origin/axis/limits), `parseRobotKinematics`, `computeJointPoses`(FK, 한계
  클램프), `createJointFrameTransforms`(FrameGraph 샘플 호환),
  `robot-kinematics.v1.schema.json`.
- `@lk-design-system/lds-3d-r3f` — `ArticulatedGltfModel`(검증된 kinematics로 클론된
  씬의 링크 노드 로컬 변환을 구동; 로딩·오류·선택 계약은 `GltfModel`과 동일).
- `packages/assets/robots/so-arm` — 절차 생성 SO-ARM급 6관절 자산(자산
  매니페스트 + 키네마틱스 매니페스트 + provenance + 카탈로그, 전부
  `scripts/generate-so-arm-asset.mjs`가 재생성).
- Storybook `LDS 3D/LDS Integration/SO-ARM Joint Viewer` — LDS `Slider` 패널이
  정규화된 관절 값(라디안)으로 모델을 구동하는 시나리오.

이 스택을 어느 방향으로 증폭할지에 대한 승인된 순서가 이 문서다. 각 단계는
독립적으로 리뷰 가능한 계약 단위로 나눈다.

## Approved sequence

### Phase 1 — 시간축: 재생과 스트림 (2026-07-31 완료)

FrameGraph는 이미 타임스탬프·보간(slerp)·stale/held 판정을 가진 시계열
계약이지만, 소비자는 아직 정적 스냅샷뿐이다. 이 단계는 시간을 일급 시민으로
올린다.

- `lds-3d-core` `PlaybackClock` — 렌더러 중립 재생 상태 기계. 순수 함수만으로
  play/pause/rate/seek/loop를 표현하고, wall-clock 델타는 호출자가 주입한다
  (결정론, `Date.now()` 미사용).
- `lds-3d-assets` `JointTrajectory` — 타임스탬프된 관절 값 샘플 시퀀스와 선형
  보간 샘플러. 출력은 기존 `JointValues`라 `computeJointPoses`와
  `ArticulatedGltfModel`이 그대로 소비한다.
- Storybook — SO-ARM 페이지에 `시나리오 · 궤적 재생` 스토리: 타임라인
  스크러버(LDS `Slider`) + 재생/일시정지 + 배속으로 기록된 에피소드를 재생.
- `lds-3d-tf` `FrameStream` — 라이브 텔레메트리 append/prune/materialize
  어댑터. 재전송 멱등 처리, 보존 창, per-edge 캡을 갖추고 기존 FrameGraph
  조회 의미론(exact/interpolated/held/stale/extrapolation)을 그대로 재사용한다.
- Storybook `TF and Marker` 페이지의 `시나리오 · 라이브 스트림` — 드롭아웃이
  포함된 텔레메트리 시뮬레이션으로 실시간 → hold-last 지연 → 두절(경과·외삽
  한계) 전이를 LDS `StatusBadge` 톤으로 매핑해 검증했다. Web Viz·Control Full
  마이그레이션의 라이브 데이터 관문을 미리 검증하는 자리다.

### Phase 2 — 자산 파이프라인: URDF 임포터 툴체인 (2026-07-31 완료)

실물 로봇 반입 경로. `scripts/import-urdf-robot.mjs`가
`URDF + 메시 → GLB(링크 노드 계층) + robot-kinematics.v1 + asset-manifest.v1 +
provenance + import-report + 카탈로그 항목`을 결정론적으로 산출한다.

- 지원: box/cylinder/sphere 프리미티브와 binary/ASCII STL 메시, URDF 재질,
  `package://` URI(경고와 함께 URDF 디렉터리 기준으로 해석). DAE 등은 명시적
  오류.
- 조인트 매핑: revolute/prismatic은 한계 필수, continuous는 ±π revolute로
  클램프(경고 기록), **fixed는 부모 링크로 폴딩**되어(비주얼 pose에 origin
  베이크) 키네마틱 트리에서 사라진다 — 계약이 가동 조인트만 모델링하기 때문.
- URDF의 Z-up 우수계 미터(REP-103)는 LK core 규약과 동일하므로 file-to-core
  변환은 항등이다.
- 모든 산출물은 쓰기 전에 자기 검증된다: GLB 재파싱, 공개 assets 패키지의
  `parseAssetManifest`/`parseRobotKinematics` 통과, 링크 노드↔키네마틱스 계층
  일치. 실패하면 부분 산출 없이 중단한다.
- 검증용 데모: `packages/assets/robots/lk-lift` — 커밋된 URDF+STL 픽스처를
  실제 임포트한 결과(프리즘 `lift_z` + 회전 `boom_yaw`, fixed `sensor_mount`
  폴딩)이며 패키지 자산 테스트가 무결성·계층·포즈·카탈로그 동기화를 고정한다.

### Phase 3 — 상호작용: IK와 텔레오퍼레이션 (계약 완료 2026-07-31)

FK의 역방향. 목표 좌표 → IK 솔버 → 관절 값.

- `lds-3d-assets` `computeLinkPoses`(링크별 base-프레임 FK)와
  `solveJointPositionIk`(CCD 위치 IK) 계약이 들어왔다. 모든 후보 값은 조인트
  한계로 클램프되어 해가 계약을 위반할 수 없고, **미수렴은 예외가 아니라
  잔차·반복 횟수와 함께 보고되는 결과**다. 결정론(동일 입력 → 동일 해)을
  테스트로 고정했다.
- Storybook `SO-ARM Joint Viewer`의 `시나리오 · 역기구학` — 목표 좌표
  슬라이더/프리셋 → IK 해 → `ArticulatedGltfModel` 자세, 수렴 상태는 LDS
  `StatusBadge`로 표기(도달 불가 목표는 cautionary + 잔차).
- 2026-07-31 추가 완료: `solveJointPoseIk` — 오차 비례 감쇠(DLS/LM) 자코비안
  기반 6-DoF 위치+방향 목표 IK(한계 클램프, 잔차 분리 보고, 결정론). 역기구학
  스토리에는 `TransformGizmo` 목표 드래그가 배선되어 WebGL 환경에서 장면 내
  조작이 가능하다.
- 실기 양방향(모터 명령 송신)은 LDS3D 소관이 아니다 — 전송·명령·권한은 제품
  저장소가 소유하고, LDS3D는 "정규화된 관절 상태 in/out"에서 경계를 끊는다
  (AGENTS.md 소유권 규칙).

### Phase 4 — 센서 폭: rviz 패리티 (1차 반입 2026-07-31)

- **반입 완료**: `CameraFrustum`(검증된 내재 파라미터 → 와이어프레임, 광축
  로컬 +X)과 `VoxelLayer`(인스턴스드 3D 점유 복셀, 명시적 예산·조용한 절단
  없음)가 공개 원자로 등록되었고(리뷰 계약 + owner 페이지),
  `createSegmentationColors`(pointcloud)가 클래스 라벨을 기존 colors 채널로
  변환한다 — 세그멘테이션은 렌더링 모드가 아니라 데이터 변환이다.
  `Scenes/Sensor Overlays` 시나리오가 셋의 단일 프레임 정합을 검증한다.
- **의도적 보류 — 코스트맵 그라디언트**: 점유 그리드는 3상태(cellStates)
  셰이더 계약이라 0–100 코스트 램프는 스냅샷·셰이더 확장이 필요한 독립 변경
  단위다. 기존 검증된 `OccupancyGridSurface` 계약을 건드리는 작업이므로 제품
  요구가 확정될 때 별도 착수한다.
- 이미지 플레인(텍스처) 전송은 제품 소유 — `CameraFrustum`은 기하만 담당한다.

## Boundaries that hold across all phases

- 모터 raw tick ↔ 라디안 변환, 캘리브레이션, 전송, 명령은 제품 소유. LDS3D의
  입력 계약은 항상 정규화된 값이다.
- renderer 패키지는 LDS DOM UI에 의존하지 않는다. 타임라인·재생 chrome은
  `apps/docs`(또는 제품) 조합 레이어가 LDS 공개 컴포넌트로 소유한다.
- 새 public API는 api-report baseline·package-smoke·스토리 계약
  (`scripts/storybook-contract.mjs`)을 통과해야 하며, assets의 새 export
  서브패스는 업스트림 `LDS3D_EXTERNAL_SURFACE.json` 합의가 선행되어야 한다
  (2026-07-31 기준 미합의 — 정적 `staticDirs` 서빙으로 우회 중).

## Reference landscape

설계 벤치마크: 구조는 deck.gl(레이어 계약)·Rerun(로그/블루프린트), 프레임
규약은 ROS tf2/rviz, 자산 계약은 glTF/3D Tiles, DOM+3D 결합 운영 방식은
Bentley iTwin(iTwinUI + iTwin Viewer)이 가장 가까운 선례다.
