# P0 실행 명세 — Foundation Alpha와 첫 Shadow Canary

| 항목 | 값 |
| --- | --- |
| 상태 | 실행 초안 |
| 기준일 | 2026-07-17 |
| 상위 계획 | [DESIGN_AND_LDS_INTEGRATION_PLAN.md](DESIGN_AND_LDS_INTEGRATION_PLAN.md), [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) M0·M1·M2·M3 |
| 실행 범위 | 저장소 scaffold, `3d-core`, `3d-assets`, `3d-testing`, `3d-three`, `3d-r3f`, Control 계산 전용 shadow canary |
| 목표 release | `0.1.0-alpha.1`, `0.1.0-alpha.2` fixed version group |
| 기준 일정 | 기술 실행 8주; D-1/D0와 LDS 통합을 포함한 상위 공격적 일정 10주 |
| 현재 repository 구현 이정표 | M1 + M2 초기 raw Three/R3F vertical slice; registry publish·제품 repository 변경 없이 local tarball·consumer smoke까지만 |
| 디자인 선행 조건 | G-D0 전에는 renderer 기본 appearance와 scene token을 stable contract로 확정하지 않음 |
| 첫 운영 결과 | Control Full에서 기존 경로만 authoritative하게 유지한 상태로 LDS3D 계산 결과와 command payload를 production shadow 비교 |

## 1. P0 결과

P0가 끝났다는 것은 문서나 prototype이 존재한다는 뜻이 아니다. 다음 결과가
실제 registry artifact, 제품 CI와 canary 증거로 확인되어야 한다.

1. `core`, `assets`, `testing`, `three`, `r3f`가 하나의 fixed version group으로
   빌드되고 배포된다.
2. Control Full과 Web Viz가 동일한 `alpha.1` foundation package와 golden
   fixture를 read-only CI에서 사용한다.
3. `alpha.2`가 camera, picking, semantic visual과 renderer lifecycle reference
   implementation을 제공한다.
4. Control Full이 기존 계산과 LDS3D 계산을 병렬 실행하고 위치, 회전,
   authoritative floor hit 이후의 frame projection과 최종 command payload
   차이를 기록한다.
5. 첫 production shadow에서는 기존 구현만 화면과 command를 결정하고
   LDS3D에는 command 전송 권한이나 callback이 전달되지 않는다.
6. Web Viz는 P0 동안 좌표·asset fixture와 package 소비 검증을 끝내고,
   다음 migration wave에서 `PcdMap3DPanel`과 `StructurePreviewViewer`를
   즉시 shadow 연결할 수 있는 adapter skeleton을 가진다.

P0에는 PointCloud renderer, 시간축 TF graph, 범용 ROS Marker, Rerun projection,
Building·Floor·Site authoring을 구현하지 않는다. 해당 범위는 각각 P1과 P2다.
다만 P0의 entity, timestamp, renderer capability와 extension seam은 P1/P2가
제품 type을 core로 역유입하지 않고 추가될 수 있어야 한다.

## 2. 일정과 인력 전제

이 절의 `T1~T8`은 D-1/D0와 병렬 실행되는 8주 분량의 기술 effort baseline이다.
같은 번호의 calendar week를 뜻하지 않는다. 디자인·LDS 통합까지 포함한 전체
일정과 gate 날짜는 상위 계획의 `W1~W10`을 따른다. 기술 effort는 다음 실행
capacity를 전제로 한다.

| lane | 기준 투입 |
| --- | --- |
| Platform foundation | 플랫폼 엔지니어 2명 |
| Control migration | Control 엔지니어 1명 |
| Test·release | 테스트·릴리스 엔지니어 1명 |
| Review | Platform Owner, LDS Core Reviewer, Performance Owner가 part-time |
| Design direction | Product Design Owner 최소 0.5명, Accessibility Owner와 LDS Design reviewer가 part-time |
| Web Viz preparation | Web Viz owner가 fixture·consumer CI·adapter review에 part-time |

전담 인원이 3명 이하라면 기술 lane만 11~12주, 디자인·LDS 통합 calendar는
13~14주를 기준으로 한다. 인력 부족으로 정확성, command safety, lifecycle 또는
rollback gate를 생략하지 않는다.

React 19/R3F 9 전환은 첫 계산 전용 shadow canary의 critical path가 아니다.
Control은 필요하면 deprecated R3F 8 compatibility binding을 사용한다. 좌표,
floor-hit projection과 command 의미를 먼저 shadow 검증한 뒤 실제 renderer
picking을 포함한 visible renderer 전환과 target stack 수렴을 이어간다.

Control을 첫 operational shadow로 두는 것은 제품 우선순위나 선택적 pilot
판정이 아니라 가장 넓은 P0 계약과 command safety를 한 화면에서 먼저 검증하기
위한 순서 결정이다. Web Viz migration은 필수이며 P0 안에서 consumer CI,
fixture와 adapter skeleton을 병렬 완료한다.

## 3. 저장소와 도구 결정

P0에서 다음을 기본 결정으로 사용한다. 소비자 smoke test가 반증하는 경우에만
M0 ADR로 교정한다.

| 영역 | 결정 |
| --- | --- |
| workspace | pnpm workspace |
| 언어 | TypeScript strict mode |
| build | tsup, ESM, declaration과 source map |
| release | Changesets fixed version group |
| unit test | Vitest |
| property test | fast-check |
| browser·lifecycle·visual | Playwright, 고정 Chromium |
| examples | Storybook |
| API report | API Extractor `.api.md` |
| package 검증 | publint, `@arethetypeswrong/cli` |
| dependency boundary | dependency-cruiser와 ESLint `no-restricted-imports` |
| bundle budget | size-limit |
| formatting | Prettier와 ESLint flat config |

기본 package 출력은 ESM-only다. M0에서 publish 전에 생성한 tarball을 두 고정
제품 커밋에 설치해 build와 typecheck를 수행한다. Control이 ESM dependency
chain을 소비하지 못하면 먼저 제품 bundler 교정을 시도하고, migration 일정상
불가능할 때만 Control이 소비하는 `core`·`assets`·`three`·compat package 전체에
기한이 있는 dual ESM/CJS 출력을 추가한다. compat package만 CJS로 만드는
불완전한 대응은 허용하지 않는다.

TypeScript 공통 설정은 최소한 다음을 켠다.

```json
{
  "strict": true,
  "exactOptionalPropertyTypes": true,
  "noUncheckedIndexedAccess": true,
  "verbatimModuleSyntax": true
}
```

## 4. 최초 저장소 구조

P1/P2 package는 구현을 시작할 때 생성한다. P0에서 빈 package를 미리 만들지
않는다.

```text
/
├─ apps/
│  ├─ docs/                    # Storybook: 공개 예제와 시각 fixture
│  └─ testbed/                 # Vite: lifecycle, context-loss, performance
├─ packages/
│  ├─ core/
│  ├─ assets/
│  ├─ three/                   # alpha.2 pre-publish artifact candidate
│  ├─ r3f/                     # alpha.2 pre-publish artifact candidate
│  ├─ r3f-compat-v8/           # 필요 시에만 publish, 처음에는 private
│  └─ testing/
├─ fixtures/
│  ├─ assets/                  # 작은 GLB와 manifest만 저장
│  ├─ coordinates/
│  └─ golden-scenes/
├─ scripts/
│  ├─ check-boundaries.mjs
│  ├─ check-package-exports.mjs
│  ├─ check-single-three.mjs
│  └─ generate-api-report.mjs
├─ .changeset/
├─ package.json
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ vitest.workspace.ts
├─ playwright.config.ts
├─ eslint.config.mjs
└─ api-extractor-base.json
```

각 package는 root export와 의도적으로 승인한 subpath만 공개한다.
`src/internal`과 raw native renderer 객체는 root export에 포함하지 않는다.
LK가 소유하는 `ThreeAssetHandle` 같은 opaque handle은 renderer package의
public contract로 허용한다. Raw `THREE.*`가 필요한 bridge는 승인된
`3d-three/r3f-bridge` subpath에서만 제공하며 제품 저장소가 이 subpath를 직접
import하면 dependency-boundary 위반이다.

Release group 편입 순서:

| release | publish package |
| --- | --- |
| `0.1.0-alpha.1` | `core`, `assets`, `testing` |
| `0.1.0-alpha.2` | 앞의 package + `three`, `r3f` |
| visible Control R3F 8 연결 직전 | 실제 필요가 확인된 경우 registry prerelease로 deprecated `r3f-compat-v8` publish |

`three`와 `r3f`는 registry publish 전에도 API·tarball 검증을 위해 publishable
manifest를 유지할 수 있다. 이는 registry 배포 권한이 아니다. publish 가능한
package는 모두 같은 fixed version group에 포함하며, 제품 저장소에서 tarball,
Git URL과 source copy를 production dependency로 사용하지 않는다.

## 5. 의존성 경계

```text
core      → runtime dependency 없음
assets    → core
testing   → core, assets
3d-three  → core, assets + three(peer)
3d-r3f    → core, assets, 3d-three
            + react/r3f/drei/three(peer)
compat-v8 → core, assets, 3d-three
            + react18/r3f8/drei9/three(peer)
apps      → 모든 package 사용 가능
```

강제 규칙:

- `core`의 TypeScript `lib`에는 DOM을 넣지 않는다.
- `core`, `assets`는 React, Three.js, R3F, Rerun과 LDS Core를 import하지 않는다.
- `three`, `r3f`는 제품 store, ROS message, command와 save payload type을
  import하지 않는다.
- `r3f-compat-v8`은 canonical `r3f` package를 import하지 않고 같은 core
  contract의 최소 subset만 별도로 binding한다.
- 제품은 `THREE.Object3D`, renderer, R3F root 또는 Rerun object를 store,
  command payload와 public product API에 저장하지 않는다.
- P0에는 umbrella package `@lk-design-system/lds-3d`를 만들지 않는다.

현재 `3d-three`와 `3d-r3f`의 Three peer range는 `>=0.185.1 <1`이며,
reference consumer smoke는 React 19.1.1/R3F 9.6.1/Three 0.185.1 조합에서
수행한다. peer range 전체와 제품의 0.168/0.170 조합은 아직 검증 대상이
아니다. 0.168/R3F 8 compatibility package는 실제 Control consumer smoke와
별도 ADR이 승인될 때에만 만들며, 만들어질 경우 `1.0.0` 전에 제거한다.

## 6. P0 public API 초안

아래 이름과 shape는 P0 전체(`alpha.1` + `alpha.2`)의 구현 기준이다. 현재
working tree는 M1 API와 `compute*CameraState`, `createPickRay`,
`intersectRayWithPlane`, raw Three host의 초기 vertical slice를 포함한다.
이는 Alpha.2 release 완료 선언이 아니다. lifecycle browser gate, hardware
performance evidence와 제품 consumer CI는 남아 있으며, registry artifact의
public API 변경에는 API report diff, migration note와 Platform Owner 승인이
필요하다.

### 6.1 `3d-core`

승인할 entrypoint:

```text
@lk-design-system/lds-3d-core
@lk-design-system/lds-3d-core/coordinates
@lk-design-system/lds-3d-core/entities
@lk-design-system/lds-3d-core/camera
@lk-design-system/lds-3d-core/interaction
@lk-design-system/lds-3d-core/renderer
@lk-design-system/lds-3d-core/time
@lk-design-system/lds-3d-core/theme
```

좌표와 identity:

```ts
export type Brand<TValue, TName extends string> = TValue & {
  readonly __brand: TName;
};

export type FrameId = Brand<string, "FrameId">;
export type EntityId = Brand<string, "EntityId">;
export type AssetId = Brand<string, "AssetId">;
export type LayerId = Brand<string, "LayerId">;
export type ClockId = Brand<string, "ClockId">;

export type Axis = "+X" | "-X" | "+Y" | "-Y" | "+Z" | "-Z";
export type Vec3 = readonly [number, number, number];
export type Quat = readonly [number, number, number, number]; // x, y, z, w
// Serialized column-major order, matching glTF matrix ordering.
export type Mat4 = readonly [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
];

export interface CoordinateSystem {
  readonly handedness: "right" | "left";
  readonly upAxis: Axis;
  readonly forwardAxis: Axis;
  readonly metersPerUnit: number;
}

export const LK_CORE_COORDINATE_SYSTEM: CoordinateSystem;
// right-handed, +Z up, +X forward, meter

export interface FramedPoint3 {
  readonly frame: FrameId;
  readonly value: Vec3;
}

export interface Pose3 {
  readonly frame: FrameId;
  readonly position: Vec3;
  readonly orientation: Quat;
}

export interface RigidTransform3 {
  readonly sourceFrame: FrameId;
  readonly targetFrame: FrameId;
  readonly translation: Vec3;
  readonly rotation: Quat;
}

export interface Bounds3 {
  readonly frame: FrameId;
  readonly min: Vec3;
  readonly max: Vec3;
}

export interface Timestamp {
  readonly clock: ClockId;
  readonly sec: number;
  readonly nsec: number;
}
```

필수 함수:

```ts
export const frameId: (value: string) => FrameId;
export const entityId: (value: string) => EntityId;
export const assetId: (value: string) => AssetId;
export const layerId: (value: string) => LayerId;
export const clockId: (value: string) => ClockId;
export function timestamp(
  clock: ClockId,
  sec: number,
  nsec: number,
): Timestamp;

export function identityTransform(frame: FrameId): RigidTransform3;
export function invertTransform(value: RigidTransform3): RigidTransform3;
export function composeTransforms(
  sourceToMiddle: RigidTransform3,
  middleToTarget: RigidTransform3,
): RigidTransform3;
export function transformPoint(
  transform: RigidTransform3,
  point: FramedPoint3,
): FramedPoint3;
export function transformPose(
  transform: RigidTransform3,
  pose: Pose3,
): Pose3;
export function transformToMatrix4(value: RigidTransform3): Mat4;
export function normalizeQuaternion(value: Quat): Quat;
export function quaternionFromYaw(yawRadians: number): Quat;
```

`composeTransforms`는 인접 frame이 일치하지 않으면 실패한다. public API는 frame이
없는 `[x, y, z]` 위치를 spatial event나 product boundary에서 받지 않는다.
`timestamp()`는 finite integer second와 `0 ≤ nsec < 1_000_000_000`을
검증하고 범위를 벗어나면 실패한다.

P0 semantic entity:

```ts
export interface RobotEntity {
  readonly kind: "robot";
  readonly id: EntityId;
  readonly pose: Pose3;
  readonly assetId?: AssetId;
  readonly layerId?: LayerId;
  readonly timestamp?: Timestamp;
}

export interface GoalEntity {
  readonly kind: "goal";
  readonly id: EntityId;
  readonly pose: Pose3;
  readonly radiusMeters?: number;
  readonly layerId?: LayerId;
}

export interface PathEntity {
  readonly kind: "path";
  readonly id: EntityId;
  readonly frame: FrameId;
  readonly points: readonly Vec3[];
  readonly widthMeters?: number;
  readonly layerId?: LayerId;
}

export interface LandmarkEntity {
  readonly kind: "landmark";
  readonly id: EntityId;
  readonly pose: Pose3;
  readonly label?: string;
  readonly layerId?: LayerId;
}

export interface AssetEntity {
  readonly kind: "asset";
  readonly id: EntityId;
  readonly assetId: AssetId;
  // Manifest로 core frame까지 정규화된 asset origin의 scene placement.
  readonly pose: Pose3;
  readonly layerId?: LayerId;
  readonly pickable?: boolean;
  readonly selectable?: boolean;
}

export type P0SpatialEntity =
  | AssetEntity
  | RobotEntity
  | GoalEntity
  | PathEntity
  | LandmarkEntity;
```

P1의 범용 Marker contract는 이 entity를 대체하지 않고 projection과 동적 update
계약을 추가한다. P0 renderer는 모든 entity의 frame이 host `frame`과 같아야
한다고 제한한다. 다른 frame의 값은 제품 adapter가 core frame으로 먼저
변환하며 임의 frame graph 해석은 P1 TF 범위다. `AssetEntity`는 map·building
같은 정적 GLB의 placement, layer와 picking identity를 제공한다.

Camera와 interaction:

```ts
export type CameraProjection =
  | {
      readonly kind: "perspective";
      readonly verticalFovRadians: number;
      readonly aspect: number;
      readonly nearMeters: number;
      readonly farMeters: number;
    }
  | {
      readonly kind: "orthographic";
      readonly verticalSizeMeters: number;
      readonly aspect: number;
      readonly nearMeters: number;
      readonly farMeters: number;
    };

export interface CameraState {
  readonly frame: FrameId;
  readonly position: Vec3;
  readonly target: Vec3;
  readonly up: Vec3;
  readonly projection: CameraProjection;
}

export interface CameraSolveInput {
  readonly current?: CameraState;
  readonly target: Bounds3 | FramedPoint3;
  readonly viewportAspect: number;
  readonly paddingRatio?: number;
}

// alpha.2 / M2-02 implementation surface
export function computeHomeCameraState(input: CameraSolveInput): CameraState;
export function computeTopCameraState(input: CameraSolveInput): CameraState;
export function computeFocusCameraState(input: CameraSolveInput): CameraState;

export interface CameraRigConfig {
  readonly homeState: CameraState;
  readonly initialState?: CameraState;
}

export type CameraCancellationReason =
  | "superseded"
  | "explicit"
  | "rollback"
  | "disposed";

export type CameraOperationResult =
  | { readonly status: "completed" }
  | {
      readonly status: "cancelled";
      readonly reason: CameraCancellationReason;
    };

export interface CameraRigPort {
  getState(): CameraState;
  setState(state: CameraState): Promise<CameraOperationResult>;
  setHomeState(state: CameraState): void;
  home(): Promise<CameraOperationResult>;
  top(target: Bounds3): Promise<CameraOperationResult>;
  focus(
    target: Bounds3 | FramedPoint3,
  ): Promise<CameraOperationResult>;
  cancel(reason?: "explicit" | "rollback"): void;
}

export interface ViewportMetrics {
  readonly widthCssPixels: number;
  readonly heightCssPixels: number;
  readonly devicePixelRatio: number;
}

export interface ViewportPoint {
  // CSS pixels from the viewport's top-left content edge.
  readonly xCssPixels: number;
  readonly yCssPixels: number;
}

export interface PickRequest {
  readonly viewportPoint: ViewportPoint;
  readonly viewport: ViewportMetrics;
  readonly layers?: readonly LayerId[];
  readonly mode?: "closest" | "all";
}

export interface Ray3 {
  readonly frame: FrameId;
  readonly origin: Vec3;
  readonly direction: Vec3;
}

export interface Plane3 {
  readonly frame: FrameId;
  readonly point: Vec3;
  readonly normal: Vec3;
}

// alpha.2 / M2-03 implementation surface
export function createPickRay(
  camera: CameraState,
  request: PickRequest,
): Ray3;

export function intersectRayWithPlane(
  ray: Ray3,
  plane: Plane3,
): FramedPoint3 | undefined;

export interface FramedDirection3 {
  readonly frame: FrameId;
  readonly value: Vec3;
}

export interface PickHit {
  readonly entityId: EntityId;
  readonly point: FramedPoint3;
  readonly normal?: FramedDirection3;
  readonly distanceMeters: number;
  readonly layerId?: LayerId;
  readonly instanceId?: number;
}

export interface SelectionState {
  readonly selected: readonly EntityId[];
  readonly primary?: EntityId;
  readonly hovered?: EntityId;
}

export interface SpatialEvent {
  readonly type:
    | "pointer-enter"
    | "pointer-leave"
    | "pointer-move"
    | "pick"
    | "pick-miss";
  readonly request: PickRequest;
  readonly hits: readonly PickHit[];
  readonly modifiers: {
    readonly alt: boolean;
    readonly ctrl: boolean;
    readonly meta: boolean;
    readonly shift: boolean;
  };
  readonly timestamp?: Timestamp;
}
```

`home()`은 구성 시 주입된 `homeState`로 돌아간다. map 또는 asset이 바뀌면
제품이 pure solver로 새 home state를 만든 뒤 `setHomeState()`를 호출한다.
`top()`과 `focus()`는 명시적인 core-frame target을 요구하며 renderer가 scene
hierarchy나 asset geometry를 순회해 target을 추정하지 않는다.

새 camera operation은 이전 operation을 `superseded`로 취소한다. `cancel()`과
host `dispose()`는 pending Promise를 각각 지정 reason과 `disposed` 결과로
resolve한다. 취소 또는 dispose 뒤에는 늦게 도착한 animation frame이 camera
state, callback이나 renderer status를 변경할 수 없다. 입력 검증 실패만
operation 시작 전에 throw할 수 있다.

`CameraState`는 `setState(getState())`가 같은 camera를 재현할 만큼 projection
parameter를 모두 보존한다. pure camera solver는 renderer나 canvas 없이 같은
입력에서 결정적인 state를 반환한다.

Picking point는 항상 viewport content edge의 좌상단을 원점으로 한 CSS pixel이다.
adapter는 `devicePixelRatio`를 사용해 device pixel 또는 NDC로 한 번만 변환한다.
제품이 DPR을 미리 곱하거나 Y축을 뒤집지 않는다. viewport 밖 좌표는
`pick-miss`이며 `PickHit.normal`은 `point`와 동일한 frame의 framed direction다.

Renderer state:

```ts
export type RendererLifecycleState =
  | "idle"
  | "initializing"
  | "ready"
  | "paused"
  | "lost"
  | "restoring"
  | "error"
  | "disposed";

export type RendererCapabilityId =
  | "rendering"
  | "picking"
  | "selection"
  | "editing"
  | "point-cloud"
  | "timeline"
  | "webgpu"
  | `extension:${string}`;

export interface RendererCapabilities {
  readonly supported: readonly RendererCapabilityId[];
}

export function hasRendererCapability(
  capabilities: RendererCapabilities,
  capability: RendererCapabilityId,
): boolean;

export interface RendererStatus {
  readonly state: RendererLifecycleState;
  readonly snapshotUsable: boolean;
  readonly error?: {
    readonly code: string;
    readonly message: string;
    readonly recoverable: boolean;
  };
}

export type SceneTokenName =
  | "scene.background"
  | "grid.major"
  | "grid.minor"
  | "axis.x"
  | "axis.y"
  | "axis.z"
  | "selection.active"
  | "path.default"
  | "goal.default"
  | "warning";

export type SceneThemeValues = Readonly<Record<SceneTokenName, string>>;
export type SceneThemeOverrides = Readonly<
  Partial<Record<SceneTokenName, string>>
>;
```

위 token 이름과 `Record<string>` shape는 G-D0 전까지 experimental draft다.
실제 LDS token inventory, 비색상 state channel과 Candidate A/B 검증 뒤 typed
semantic token model로 교체할 수 있다. LDS raw token 값이나 CSS variable
이름을 이 contract에 복사하지 않는다.

### 6.2 `3d-assets`

승인할 entrypoint:

```text
@lk-design-system/lds-3d-assets
@lk-design-system/lds-3d-assets/schema
@lk-design-system/lds-3d-assets/legacy
```

최초 manifest:

```ts
export interface AssetManifestV1 {
  readonly schemaVersion: 1;
  readonly assetId: AssetId;
  readonly version: string;
  readonly kind:
    | "robot"
    | "map"
    | "building"
    | "floor"
    | "site"
    | "generic";
  readonly format: "glb" | "gltf";
  readonly fileFrame: FrameId;
  readonly fileCoordinate: {
    readonly handedness: "right";
    readonly upAxis: Axis;
    readonly forwardAxis: Axis;
    readonly metersPerUnit: number;
  };
  readonly coreFrame: FrameId;
  readonly fileToCoreTransform: RigidTransform3;
  readonly boundsInCoreMeters: Bounds3;
  readonly integrity?: {
    readonly sha256: string;
  };
}

export interface AssetValidationIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
  readonly severity: "error" | "warning";
}

export interface AssetValidationReport {
  readonly valid: boolean;
  readonly issues: readonly AssetValidationIssue[];
  readonly manifest?: AssetManifestV1;
}

export type AssetManifestParseResult =
  | {
      readonly ok: true;
      readonly value: AssetManifestV1;
    }
  | {
      readonly ok: false;
      readonly issues: readonly AssetValidationIssue[];
    };

export type AssetSource =
  | { readonly kind: "url"; readonly url: string }
  | {
      readonly kind: "bytes";
      readonly data: ArrayBuffer;
      readonly mediaType: string;
    };

export interface AbortSignalLike {
  readonly aborted: boolean;
  addEventListener(type: "abort", listener: () => void): void;
  removeEventListener(type: "abort", listener: () => void): void;
}

export interface AssetLoadRequest {
  readonly manifest: AssetManifestV1;
  readonly source: AssetSource;
  readonly signal?: AbortSignalLike;
}

export type AssetLoadState =
  | "idle"
  | "loading"
  | "ready"
  | "error"
  | "cancelled"
  | "disposed";

export interface AssetLoadObserver {
  onStateChange?(state: AssetLoadState): void;
  onProgress?(progress: {
    readonly loadedBytes: number;
    readonly totalBytes?: number;
  }): void;
}

export interface AssetOwnershipToken<TResource> {
  readonly __opaque: "AssetOwnershipToken";
  readonly __resourceType?: TResource;
  readonly manifest: AssetManifestV1;
  readonly request: Omit<AssetLoadRequest, "signal">;
}

export interface LoadedAsset<TResource> {
  readonly manifest: AssetManifestV1;
  readonly request: Omit<AssetLoadRequest, "signal">;
  transferOwnership(): AssetOwnershipToken<TResource>;
  dispose(): void;
}

export interface AssetLoader<TResource> {
  load(
    request: AssetLoadRequest,
    observer?: AssetLoadObserver,
  ): Promise<LoadedAsset<TResource>>;
}

export function parseAssetManifest(input: unknown): AssetManifestParseResult;
export function validateAssetManifest(
  input: unknown,
): readonly AssetValidationIssue[];
export function createAssetReport(
  input: unknown,
): AssetValidationReport;
```

`LoadedAsset`은 load가 끝난 resource의 유일한 owner다. caller는 adopt 전에
`dispose()`하거나 `transferOwnership()`을 정확히 한 번 호출한다.
`transferOwnership()` 뒤 기존 `LoadedAsset.dispose()`는 host resource에
영향을 주지 않는 no-op이고 두 번째 transfer는 실패한다.
`AssetOwnershipToken`도 single-use며 host 또는 승인된 renderer bridge가
consume한 token을 다시 사용하면 실패한다. 이 상태 전이는 runtime contract
test로 검증하고 TypeScript의 `readonly`만으로 소유권을 증명하지 않는다.

`asset-manifest.v1.schema.json`을 package에 포함하고 `./schema`에서 제공한다.
좌표 적용 순서는 다음으로 고정한다.

1. raw file position에 `metersPerUnit`을 곱해 meter로 정규화한다.
2. `fileCoordinate`의 up·forward axis를
   `fileToCoreTransform.rotation`으로 core basis에 맞춘다.
3. 회전된 위치에 `fileToCoreTransform.translation`을 meter 단위로 더한다.

`fileToCoreTransform.sourceFrame`은 `fileFrame`,
`fileToCoreTransform.targetFrame`은 `coreFrame`이어야 한다.
`boundsInCoreMeters.frame`도 `coreFrame`이어야 하며 위 변환을 적용한 뒤의
bounds다. P0는 right-handed asset만 허용한다. left-handed asset은 reflection,
normal과 winding fixture를 갖춘 별도 capability 전까지 validator error다.

validator는 최소한 다음을 거부한다.

- up axis와 forward axis가 같은 축이거나 서로 반대인 경우
- `metersPerUnit`이 유한한 양수가 아닌 경우
- transform source/target frame이 manifest frame과 다른 경우
- `fileToCoreTransform.rotation`이 선언된 up·forward axis 변환과 불일치하는 경우
- 비정규 quaternion, NaN·Infinity와 비가역 transform
- core frame이 아닌 bounds, `min > max`인 bounds

축 추정은 root export에 포함하지 않는다. Production shadow 대상 asset은
`integrity.sha256`와 owner가 승인한 transform이 필수다.

```ts
// @lk-design-system/lds-3d-assets/legacy
/** @deprecated Migration-only API. */
export interface LegacyAssetEvidence {
  readonly bounds: {
    readonly min: Vec3;
    readonly max: Vec3;
  };
  readonly knownPlacement?: RigidTransform3;
}

export interface LegacyAssetInferenceReport {
  readonly inferred: boolean;
  readonly confidence: "low" | "medium" | "high";
  readonly coordinate?: AssetManifestV1["fileCoordinate"];
  readonly warnings: readonly string[];
}

export function inferLegacyAssetCoordinate(
  input: LegacyAssetEvidence,
): LegacyAssetInferenceReport;
```

### 6.3 `3d-three`

`3d-three`는 renderer-specific package지만 raw Three object가 product store와
core API로 확산되지 않도록 opaque handle을 기본으로 한다.

```ts
export interface ThreeSceneHostOptions {
  readonly canvas: HTMLCanvasElement;
  readonly frame: FrameId;
  readonly camera: CameraRigConfig;
  readonly renderMode?: "always" | "demand";
  readonly theme?: SceneThemeOverrides;
  readonly assetLoader?: AssetLoader<ThreeAssetHandle>;
}

export interface ThreeAssetHandle {
  readonly __opaque: "ThreeAssetHandle";
}

export interface ThreeGltfAssetLoaderOptions {
  readonly dracoDecoderPath?: string;
  readonly ktx2TranscoderPath?: string;
}

export interface ThreeDisposalReport {
  readonly remainingGeometries: number;
  readonly remainingMaterials: number;
  readonly remainingTextures: number;
  readonly remainingListeners: number;
  readonly remainingAnimationLoops: number;
  readonly remainingPendingLoads: number;
}

export interface ThreeSceneHost {
  readonly cameraRig: CameraRigPort;
  readonly capabilities: RendererCapabilities;

  resize(width: number, height: number, dpr?: number): void;
  invalidate(): void;
  pause(): void;
  resume(): void;
  setVisibility(value: "visible" | "hidden"): void;
  adoptAsset(
    assetId: AssetId,
    asset: AssetOwnershipToken<ThreeAssetHandle>,
  ): () => void;
  updateEntities(entities: readonly P0SpatialEntity[]): void;
  pick(request: PickRequest): readonly PickHit[];
  subscribeSpatialEvent(
    listener: (event: SpatialEvent) => void,
  ): () => void;
  subscribeStatus(
    listener: (status: RendererStatus) => void,
  ): () => void;
  retry(): Promise<void>;
  dispose(): ThreeDisposalReport;
}

export function createThreeSceneHost(
  options: ThreeSceneHostOptions,
): ThreeSceneHost;

export function createGltfAssetLoader(
  options?: ThreeGltfAssetLoaderOptions,
): AssetLoader<ThreeAssetHandle>;
```

host 내부 `coreRoot`는 항상 LK core Z-up이다. Three/glTF Y-up 변환은 host 또는
asset loader 경계에서 한 번만 수행한다. 제품 component가 scene root를 다시
회전하거나 asset scale을 추정하지 않는다.

`adoptAsset`은 single-use ownership token을 consume해 resource registry에
등록할 뿐 scene에 자동 부착하지 않는다. `AssetEntity`가 실제 instance의
placement, layer, pickable/selectable 상태와 `PickHit.entityId`를 결정한다.
unregister 함수와 host `dispose()`는 해당 asset을 idempotent하게 해제한다.
adopt 전에 load가 취소되거나 실패한 경우에는 caller가
`LoadedAsset.dispose()`를 호출한다. caller dispose, token 재사용과 host
dispose가 서로의 resource를 조기 해제하지 않는 contract test가 필수다.

`updateEntities`는 `EntityId` keyed snapshot diff다. 기존 entity의 pose·style
변경은 object와 geometry를 재생성하지 않고 갱신하고, snapshot에서 사라진
entity만 제거한다. `assetId`가 아직 adopt되지 않은 Robot 또는 `AssetEntity`는
pending fallback을 표시하되 다른 entity rendering을 차단하지 않는다. asset
준비 후 같은 entity ID를 갱신해 visual을 교체한다. host asset registry는 기본적으로
`assetId + version + sha256`으로 resource를 deduplicate하고, checksum이 없는
비-canary 개발 asset은 `assetId + version`을 사용한다. 여러 entity instance는
geometry·texture를 공유한다.

`retry()`는 recoverable context loss에서 기존 canonical entity snapshot과
adopt된 asset descriptor로 renderer resource를 재생성한다. 일정 시간 안에
복구할 수 없으면 non-recoverable `error`를 내고 제품이 host를 dispose한 뒤
새 host를 만들 수 있게 한다. asset rehydrate에는
`ThreeSceneHostOptions.assetLoader`를 사용하며 loader가 없으면 자동 retry 대신
host 재생성을 요구한다. `dispose()`와 flag off는 pending asset load, listener,
RAF와 recovery 작업을 모두 취소한다. `ThreeDisposalReport`의 remaining count는
모두 0이어야 한다.

고급 imperative extension이 필요한 경우 `3d-three/extension` subpath를
별도 ADR로 승인한다. P0 root API에 `THREE.Scene`, `THREE.Object3D`와
`WebGLRenderer`를 노출하지 않는다.

`3d-r3f`는 동일 visual factory와 asset cache를 재사용하기 위해 다음 승인된
adapter-only subpath를 사용한다.

```ts
// @lk-design-system/lds-3d-three/r3f-bridge
import type * as THREE from "three";

export interface ThreeResolvedAsset {
  readonly __opaque: "ThreeResolvedAsset";
  dispose(): void;
}

export interface ThreeVisualInput {
  readonly entity: P0SpatialEntity;
  readonly sceneFrame: FrameId;
  readonly theme: SceneThemeValues;
  readonly asset?: ThreeResolvedAsset;
}

export type ThreeVisualUpdateInput = Omit<ThreeVisualInput, "asset">;

export interface ThreeVisualInstance {
  readonly object: THREE.Object3D;
  update(input: ThreeVisualUpdateInput): void;
  // Instance hierarchy만 해제하며 shared asset cache ownership은 유지한다.
  dispose(): void;
}

export function consumeAssetForR3F(
  token: AssetOwnershipToken<ThreeAssetHandle>,
): ThreeResolvedAsset;

export function createThreeVisualInstance(
  input: ThreeVisualInput,
): ThreeVisualInstance;
```

`ThreeResolvedAsset.dispose()`는 해당 R3F asset lease를 해제하고
`ThreeVisualInstance.dispose()`는 instance 전용 hierarchy만 해제한다.
R3F unmount는 visual instance를 먼저 dispose한 뒤 asset lease를 해제한다.
entity pose·style·theme 변경은 `update()`로 반영하고 asset lease가 바뀌면
visual instance를 교체한다.
`3d-three` host와 `3d-r3f`는 같은 visual factory를 사용한다. 이 bridge는
package export에는 포함되지만 `3d-r3f` implementation 전용 semver contract다.
boundary CI는 제품, `core`, `assets`와 `testing`의 직접 import를 거부한다.

### 6.4 `3d-r3f`

D-1에서 확인된 LDS viewport component(`Scene3DFrame` 또는 동등 API) 안에
완성형 canvas를 넣는 방식과 기존 R3F Canvas 안에 spatial root만 넣는 방식을
지원하는 target composition이다. 아래 `LdsViewportFrame`은 실제 export가
확인되기 전까지 문서용 placeholder다.

```tsx
<LdsViewportFrame state={viewerState}>
  <SceneCanvas
    frame={frameId("map")}
    homeView={homeCamera}
    onStatusChange={setRendererStatus}
  >
    <CameraRig ref={cameraRigRef} reducedMotion={prefersReducedMotion} />
    <AssetInstance entity={mapEntity}>
      <AssetModel request={mapAssetRequest} />
    </AssetInstance>
    <Robot entity={robot}>
      <AssetModel request={robotAssetRequest} />
    </Robot>
    <Path entity={path} />
    <Goal entity={goal} />
    <Landmark entity={landmark} />
  </SceneCanvas>
</LdsViewportFrame>
```

최초 public surface:

```ts
export type AssetRequestResolver = (
  assetId: AssetId,
) => AssetLoadRequest | undefined;

export interface SceneCanvasProps {
  readonly frame: FrameId;
  readonly homeView: CameraState;
  readonly initialCamera?: CameraState;
  readonly entities?: readonly P0SpatialEntity[];
  readonly dpr?: number | readonly [number, number];
  readonly renderMode?: "always" | "demand";
  readonly theme?: SceneThemeOverrides;
  readonly assetLoader?: AssetLoader<ThreeAssetHandle>;
  readonly resolveAsset?: AssetRequestResolver;
  readonly selection?: SelectionState;
  readonly defaultSelection?: SelectionState;
  readonly onStatusChange?: (status: RendererStatus) => void;
  readonly onSelectionChange?: (selection: SelectionState) => void;
  readonly onSpatialEvent?: (event: SpatialEvent) => void;
  readonly children?: React.ReactNode;
}

export interface SpatialSceneProps {
  readonly frame: FrameId;
  readonly homeView: CameraState;
  readonly initialCamera?: CameraState;
  readonly entities?: readonly P0SpatialEntity[];
  readonly theme?: SceneThemeOverrides;
  readonly assetLoader: AssetLoader<ThreeAssetHandle>;
  readonly resolveAsset?: AssetRequestResolver;
  readonly selection?: SelectionState;
  readonly defaultSelection?: SelectionState;
  readonly onSelectionChange?: (selection: SelectionState) => void;
  readonly onSpatialEvent?: (event: SpatialEvent) => void;
  readonly children?: React.ReactNode;
}

export interface CameraRigProps {
  readonly reducedMotion?: boolean;
}

export interface AssetInstanceProps {
  readonly entity: AssetEntity;
  readonly children?: React.ReactNode;
}

export interface RobotProps {
  readonly entity: RobotEntity;
  readonly children?: React.ReactNode;
}

export interface GoalProps {
  readonly entity: GoalEntity;
}

export interface PathProps {
  readonly entity: PathEntity;
}

export interface LandmarkProps {
  readonly entity: LandmarkEntity;
}

export interface AssetModelProps {
  readonly request: AssetLoadRequest;
  readonly fallback?: React.ReactNode;
  readonly onStateChange?: (state: AssetLoadState) => void;
  readonly onProgress?: (progress: {
    readonly loadedBytes: number;
    readonly totalBytes?: number;
  }) => void;
}

export interface SelectableProps {
  readonly entityId: EntityId;
  readonly layerId?: LayerId;
  readonly children: React.ReactNode;
}

export interface SceneSelectionController {
  readonly state: SelectionState;
  select(entityId: EntityId, options?: { readonly additive?: boolean }): void;
  clear(): void;
}

export function SceneCanvas(props: SceneCanvasProps): React.ReactElement;
export function SpatialScene(props: SpatialSceneProps): React.ReactElement;
export const CameraRig: React.ForwardRefExoticComponent<
  CameraRigProps & React.RefAttributes<CameraRigPort>
>;

export function AssetInstance(
  props: AssetInstanceProps,
): React.ReactElement;
export function Robot(props: RobotProps): React.ReactElement;
export function Goal(props: GoalProps): React.ReactElement;
export function Path(props: PathProps): React.ReactElement;
export function Landmark(props: LandmarkProps): React.ReactElement;
export function AssetModel(props: AssetModelProps): React.ReactElement;
export function Selectable(props: SelectableProps): React.ReactElement;

export function useCameraRig(): CameraRigPort;
export function useSceneSelection(): SceneSelectionController;
export function useRendererCapabilities(): RendererCapabilities;
export function useRendererStatus(): RendererStatus;
```

public props에는 Drei control type과 `THREE.*`를 노출하지 않는다. Drei는
implementation detail이다. `r3f-compat-v8`은 위 API 중 Control migration에
필요한 subset만 같은 이름으로 제공하며 모든 export에 `@deprecated`를 붙인다.
`entities` prop은 기본 semantic visual을 일괄 렌더링할 때 사용하고, 명시적인
`AssetInstance`·`Robot`·`Path` child는 제품이 composition을 제어할 때 사용한다.
동일 entity를 두 경로에 동시에 전달하면 개발 모드에서 중복 identity 오류를
낸다.

`SceneCanvas`와 `SpatialScene`은 `homeView`와 `initialCamera`로 정확히 하나의
camera rig를 만든다. 선택적인 `CameraRig` child는 그 rig의 ref와 motion
preference를 연결할 뿐 두 번째 camera를 만들지 않으며 둘 이상이면 오류다.

`SceneCanvas`는 기본 Three GLTF loader를 제공하고, 기존 Canvas에 넣는
`SpatialScene`은 명시적인 `assetLoader`를 요구한다. `AssetModel`은 이 context로
load·cancel·progress를 수행한 뒤 ownership token을 `r3f-bridge`가 consume하게
한다. bridge가 만든 raw `Object3D`는 `3d-r3f` implementation 안에서만
`<primitive>`에 연결하며 child나 callback으로 반환하지 않는다. batch
`entities`에서 `AssetEntity` 또는 asset-backed Robot을 만날 때는
`resolveAsset(assetId)`로 request를 얻는다. controlled `selection`을 제공한
경우 제품 state가 source of truth이며, uncontrolled mode에서도
`onSelectionChange`와 `onSpatialEvent`로 동일한 serializable event를 제품 DOM
UI에 전달한다.

LDS CSS variable을 실제 color 값으로 해석해 `SceneThemeOverrides`를 만드는
작업은 제품 composition 또는 `apps/docs` integration example이 소유한다.
`3d-core`, `3d-three`, `3d-r3f`는 LDS package를 import하지 않는다. 제품 theme
변경 시 resolved theme object를 다시 전달해 renderer를 invalidate한다.

### 6.5 `3d-testing`

public package에는 특정 test runner에 종속되지 않는 fixture data와 검사 함수만
넣는다.

```ts
export interface CoordinateFixture {
  readonly name: string;
  readonly transform: RigidTransform3;
  readonly points: readonly {
    readonly input: FramedPoint3;
    readonly expected: FramedPoint3;
  }[];
}

export interface RendererCoordinateContext {
  readonly coreFrame: FrameId;
  readonly rendererFrame: FrameId;
  readonly coreToRenderer: RigidTransform3;
  readonly shiftedOriginInCore?: FramedPoint3;
}

export interface FramedRendererTransform {
  readonly sourceFrame: FrameId;
  readonly targetFrame: FrameId;
  readonly value: Mat4;
}

export interface CoordinateAdapterContract {
  toRendererPoint(
    point: FramedPoint3,
    context: RendererCoordinateContext,
  ): readonly [number, number, number];
  fromRendererPoint(
    point: readonly [number, number, number],
    context: RendererCoordinateContext,
  ): FramedPoint3;
  toRendererTransform(
    transform: RigidTransform3,
    context: RendererCoordinateContext,
  ): FramedRendererTransform;
  fromRendererTransform(
    transform: FramedRendererTransform,
    context: RendererCoordinateContext,
  ): RigidTransform3;
}

export interface ContractViolation {
  readonly fixture: string;
  readonly code: string;
  readonly message: string;
  readonly actual?: unknown;
  readonly expected?: unknown;
}

export const coordinateFixtures: {
  readonly unitCube: CoordinateFixture;
  readonly shiftedOrigin: CoordinateFixture;
  readonly robotPose: CoordinateFixture;
  readonly path: CoordinateFixture;
};

export interface AssetFixture {
  readonly name: string;
  readonly manifest: AssetManifestV1;
  readonly sourceUrl: URL;
  readonly sha256: string;
  readonly provenance: {
    readonly license: string;
    readonly source: string;
  };
}

export const assetFixtures: {
  readonly gltfYUp: AssetFixture;
  readonly legacyZUp: AssetFixture;
};

export function checkTransformRoundTrip(
  transform: RigidTransform3,
  tolerance?: number,
): readonly ContractViolation[];

export function checkCoordinateContract(
  adapter: CoordinateAdapterContract,
  fixtures?: readonly CoordinateFixture[],
): readonly ContractViolation[];

export function checkPickingContract(
  actual: readonly PickHit[],
  expected: readonly PickHit[],
  tolerance?: number,
): readonly ContractViolation[];

export function assertNoContractViolations(
  violations: readonly ContractViolation[],
): void;
```

Vitest matcher와 Playwright helper는 repository-internal test utility로 둔다.
`checkCoordinateContract`는 각 fixture의 transform과
`RendererCoordinateContext`를 adapter의 point·transform 양방향 호출에 실제로
전달한다. shifted origin fixture가 context에 반영되지 않으면 contract failure다.
renderer transform의 source/target frame은 `FramedRendererTransform`에
보존되며 reverse conversion caller가 임의 frame을 다시 붙일 수 없다.
`fromRendererPoint()`의 결과 frame도 항상 `context.coreFrame`이다.

## 7. LDS·LDS3D·제품 통합 계약

이 절은 D-1 LDS source audit에서 확인할 **target contract**다. 실제 LDS
repository와 기준 version에서 `Scene3DFrame`, `ViewerState` 또는 동등 API가
확인되기 전에는 현행 public API로 간주하지 않는다. 이름이나 상태가 다르면
LDS additive change 또는 제품 composition으로 재분류하며 LDS3D에 가짜 호환
component를 만들지 않는다.

의존 방향은 고정한다.

```text
LDS ──X──> LDS3D
LDS3D core/renderer ──X──> LDS
Product ──> LDS + LDS3D
```

제품이 두 시스템을 조합한다.

```tsx
<LdsViewportFrame /* D-1에서 확인한 LDS component 또는 product composition */>
  <SceneCanvas /* LDS3D: renderer, camera, picking, lifecycle */ />
</LdsViewportFrame>
```

Renderer lifecycle과 LDS viewer state의 매핑도 제품 composition이 수행한다.

| LDS3D renderer 상태 | 제품 source 상태 | LDS viewer state |
| --- | --- | --- |
| `idle`, `initializing` | 무관 | `loading` |
| `ready` | static | `ready` |
| `ready` | source advancing | `live` |
| `lost`, `restoring` | 실제 snapshot이 계속 보임 | `degraded` |
| `lost` | canvas가 비거나 사용할 수 없음 | recoverable이면 `unavailable`, 아니면 `error` |
| `restoring` | usable snapshot 없음 | `loading` |
| `ready` | source timestamp stale | `stale` |
| `paused` | 사용자 pause | `paused` |
| 필수 `rendering` capability 없음 | scene 사용 불가 | `unavailable` |
| optional capability 없음 | scene 사용 가능 | 관련 toolbar control 비활성화와 이유 표시 |
| non-recoverable `error` | 무관 | `error` |

LDS3D는 LDS `ViewerState`를 import하지 않는다. 제품이 `RendererStatus`, source
freshness와 product policy를 조합해 LDS state를 계산한다.
`RendererStatus.snapshotUsable`이 false이면 `degraded`로 매핑할 수 없다.

### Product adapter 위치

`ControlSceneAdapter`, `ControlShadowComparator`는 Control Full 저장소에 둔다.
`WebVizSceneAdapter`는 Web Viz 저장소에 둔다. 이 adapter는 제품 type,
command/save schema와 LDS3D canonical type을 함께 import할 수 있다. 금지되는
방향은 LDS3D package가 제품 adapter 또는 제품 type을 역으로 import하는 것이다.

```text
Control product type
  → ControlSceneAdapter
  → LDS3D Pose3 / Entity / PickHit
  → ControlShadowComparator
  → 기존 command payload와 diff
```

LDS3D는 frame이 명시된 pose, camera state, spatial event와 pick 결과까지만
반환한다. command payload 생성, byte/semantic comparator와 network no-op spy는
제품 저장소가 소유한다.

## 8. 실행 백로그

### M0 — 실행 기준 동결

| ID | 작업 | 의존성 | 완료 증거 |
| --- | --- | --- | --- |
| M0-00 | 최소 workspace와 package scaffold | 없음 | `core`, `assets`, `testing` 최소 entrypoint와 exports가 build·pack되고 root pnpm workspace가 동작 |
| M0-01 | 실명 owner, RACI, review SLA 확정 | 없음 | 역할별 담당자, 승인자, 주간 review 일정 |
| M0-02 | 두 제품 좌표·축·단위·origin·pick 변환 원장 | 없음 | `source→core→render→pick→product` 표, 코드 위치와 소유자 |
| M0-03 | 기존 동작 characterization harness | M0-02 | 고정 커밋에서 pose, camera, pick, command/save payload 재현 |
| M0-04 | 익명화 golden fixture 제작 | M0-02, M0-03 | unit cube, axes, map, robot, path, shifted origin, Y/Z-up GLB, checksum과 license provenance |
| M0-05 | 성능 기준선과 허용 예산 | M0-03, M0-04 | 장비·browser·반복 횟수를 포함한 benchmark JSON과 승인 기준 |
| M0-06 | registry·fixed version group·release CI | M0-00, M0-01 | 생성된 tarball을 두 고정 제품 commit에 설치해 build/typecheck, dry-run publish, changelog와 package rollback 절차 검증 |
| M0-07 | shadow safety contract와 flag provisioning | M0-01, M0-03 | mode dependency·precedence, circuit-breaker 조건, fault matrix, remote kill SLA와 rollback runbook 승인; no-op cohort flag propagation 검증 |
| M0-08 | target stack과 compatibility 종료 ADR | M0-01 | React/R3F/Three 지원표와 compat 제거 milestone |
| G0 | kickoff gate | M0-00~08 | owner가 승인한 M0 evidence bundle |

M0-00은 소비 형식 검증에 필요한 최소 scaffold만 만들고 domain API 구현은
시작하지 않는다. M0-07은 안전 장치의 설계, 설정 경로와 시험 계획을 승인하는
gate다. 실제 shadow 계산의 fault injection, circuit breaker 동작과 rollback
실행 증거는 C0-05와 C0-06에서 생성한다.

### M1 — Core, Assets, Testing

| ID | 작업 | 의존성 | 완료 증거 |
| --- | --- | --- | --- |
| M1-01 | foundation 구현용 CI·toolchain 완성 | G0, M0-00 | lint, typecheck, unit/property test, API report와 boundary gate가 CI에서 동작 |
| M1-02 | frame, unit, timestamp branded type | G0, M1-01 | API report와 잘못된 조합의 compile-fail test |
| M1-03 | transform, inverse, ROS/map/core/glTF 변환 | M1-02, M0-04 | property·round-trip test, pure math 오차 `≤1e-6` |
| M1-04 | entity, camera, selection, spatial event 계약 | M1-02 | renderer import 없는 API와 예제 |
| M1-05 | asset manifest schema와 validator | M1-02, M0-04 | 모든 fixture validation report |
| M1-06 | deprecated legacy axis normalizer | M1-05, M0-02 | 기존 heuristic 비교와 root API 격리 |
| M1-07 | 공용 golden testing package | M1-03~05 | Control·Web Viz fixture를 같은 runner로 실행 |
| M1-08 | dependency boundary와 API guard | M1-02~07 | core의 React·Three·제품 dependency 부재, 필수 export key 집합, root·공개 subpath API report baseline check |
| M1-09a | `alpha.1` pre-publish consumer smoke | M1-07, M1-08 | local registry 또는 tarball을 설치한 격리 consumer의 typecheck·contract·ESM runtime test |
| A1-local | Foundation local candidate gate | M1-09a | registry·제품 repository를 변경하지 않은 package, Storybook과 consumer smoke 승인 |
| M1-09b | `0.1.0-alpha.1` registry publish | A1-local | 설치 가능한 registry artifact와 package SHA |
| M1-09c | published artifact Control·Web Viz read-only CI | M1-09b | 두 고정 consumer commit의 build·typecheck·contract CI 로그 |
| G1 | Foundation Alpha gate | M1-09c | registry artifact, 두 제품 CI, 좌표·asset·boundary 승인 |

### M2 — Three/R3F reference adapter

| ID | 작업 | 의존성 | 완료 증거 |
| --- | --- | --- | --- |
| M2-01 | core↔Three transform과 scene host | M1-03, M1-04 | golden matrix와 scene fixture |
| M2-02 | pure camera solver와 orbit·top·home·focus CameraRig | M1-04 | canvas 없는 camera state, 명시적 home target, typed cancellation과 late-write 0건 test |
| M2-03 | pure pick ray·floor intersection, scene picking 역변환과 selection filtering | M2-01, M1-03 | canvas 없는 floor pick와 `map→scene→pick→map` fixture |
| M2-04 | Asset·Robot·Path·Goal·Landmark와 renderer-neutral theme input | M2-01, G-D0 | 승인된 appearance matrix, map placement·pick identity, visual snapshot, theme update와 semantic event test, LDS import 부재 |
| M2-05 | resize·hidden/visible·dispose·context-loss lifecycle | M2-01 | 20회 mount/unmount, camera/load cancellation, ownership token 재사용 거부, repeated recovery와 resource count |
| M2-06 | React 19/R3F 9 binding과 restricted bridge | M2-01~05 | target stack browser smoke, root raw Three export 부재와 제품의 bridge import 차단 |
| M2-07C | 조건부 deprecated R3F 8 compatibility binding | M2-01~05, M0-08 | visible Control R3F 연결이 필요할 때만 workspace smoke와 deprecation evidence |
| M2-08 | visual·성능·duplicate dependency gate | M2-06, 필요 시 M2-07C | D0 fixed fixture screenshot diff, benchmark, 단일 Three 사본 |
| G-D0R | Renderer Fidelity Gate | M2-04, M2-08 | 동일 fixture의 depth·occlusion·label·picking, 합성 상태와 상위 계획의 디자인 평가 하한을 Design·Platform·Accessibility Owner가 승인 |
| M2-09a | `alpha.2` pre-publish consumer smoke | G-D0R, G-L0 | Web Viz target R3F browser smoke, Control core/assets/three build와 필요 시 compat workspace smoke |
| M2-09b | `0.1.0-alpha.2` registry publish | M2-09a | version-group artifact, package SHA와 migration checklist |
| G2 | Renderer Alpha gate | M2-09b | lifecycle, picking, camera와 성능 승인 |

M2-01은 M1-03 transform contract가 review를 통과하면 G1 이전에 시작할 수 있다.

### C0 — Control Full 계산 전용 shadow canary

| ID | 작업 | 의존성 | 완료 증거 |
| --- | --- | --- | --- |
| C0-01 | `ControlSceneAdapter` 입력 mapping | G1, M0-02 | 제품 type→core entity/frame mapping test |
| C0-02 | robot·path·goal·landmark와 pure camera 병렬 계산 | C0-01, M2-02 | legacy/platform 위치·회전·camera diff, hidden canvas 불필요 |
| C0-03 | authoritative floor hit projection과 command payload 병렬 계산 | C0-01, M1-03, M0-07 | 같은 legacy hit의 render→core→product-map 변환, product-owned comparator, payload diff, static import 금지와 network·store mutation no-op spy |
| C0-04 | GLB manifest와 legacy 축 heuristic 비교 | C0-01, M1-06 | asset별 transform·bounds·checksum diff, production 중복 fetch/parse/GPU upload 0 |
| C0-05 | recorded-data staging shadow와 fault test | C0-02~04, G2, G-L0 | 최소 2개 map/asset replay, invalid frame·NaN·throw·slow calculation·cancelled asset·late camera completion 주입 결과 |
| C0-06 | canary release, circuit breaker와 rollback drill | C0-05 | lockfile, effective mode config, runtime/comparator kill SLA, mode 전환 smoke와 rollback 기록 |
| C0-07 | 제한된 production shadow canary | C0-06 | 기준 commit/package/comparator SHA, sticky cohort, eligible·sampled denominator, 성능과 diff dashboard |
| C0-08 | canary exit review | C0-07 | Control, Platform, Performance와 Release Owner가 threshold, no-side-effect와 rollback evidence 승인 |
| G-C0 | Control Shadow Gate | C0-08 | calculation-only·no-side-effect, threshold와 rollback evidence 승인 |

### W0 — Web Viz P0 준비

| ID | 작업 | 의존성 | 완료 증거 |
| --- | --- | --- | --- |
| W0-01 | PCD, PointCloud, Structure 좌표·camera 원장 | M0-02 | 화면별 source→core→render 표 |
| W0-02 | Web Viz golden fixture mapping | M0-04 | PCD editor, ROS Z-up, structure GLB fixture |
| W0-03 | G1 Web Viz consumer CI를 required check로 고정 | G1 | 승인된 LDS/LDS3D 조합의 build·typecheck·contract workflow와 evidence link |
| W0-04 | 제품 저장소의 `WebVizSceneAdapter` skeleton | G1 | Web Viz type→core mapping test와 LDS3D package의 역방향 product import 부재 |
| W0-05 | 다음 shadow 대상과 flag 확정 | W0-01~04 | `PcdMap3DPanel`, `StructurePreviewViewer` rollout checklist |

#### W0-P — Structure Preview visible WebGL Pilot preflight

2026-07-17 current-source audit은 `StructurePreviewViewer`를 Web Viz의 첫 visible
candidate로 고정한다. 이는 Control의 command-safe shadow 순서나 P1/P2 scope를
바꾸지 않는다. Pilot은 full page migration이 아니라 GLB 한 개의 asset·coordinate·
lifecycle·selection 계약을 검증하는 feature-flagged WebGL canary다. 상세 source
evidence와 제외 범위는 [PRODUCT_EVIDENCE.md](PRODUCT_EVIDENCE.md#2026-07-17-제품-pilot-대상-검증)를
따른다.

| ID | 작업 | 의존성 | 완료 증거 |
| --- | --- | --- | --- |
| W0-P01 | consumer compatibility decision | W0-03 | Web Viz가 LDS3D renderer peer range를 만족하는 single-Three consumer smoke를 통과하거나, 명시적으로 승인된 compat binding의 matrix·deprecation plan이 있다. 단순 local `link:`는 증거가 아니다. |
| W0-P02 | product-local authenticated asset resolver와 manifest builder | W0-01, W0-02, W0-P01 | `glb_file`·token·job response를 LDS3D 밖에서 해석하고, asset ID/version/hash/frame/unit/bounds/provenance를 가진 manifest와 immutable `AssetEntity` snapshot test를 만든다. |
| W0-P03 | WebGPU/WebGL routing policy | W0-P01 | WebGPU environment는 legacy path를 유지하거나 승인된 adapter를 사용하며, LDS3D WebGL flag가 unsupported parity를 주장하지 않는 browser test가 있다. |
| W0-P04 | read-only Structure Preview canary | W0-P02, W0-P03, G2 | 하나의 anonymized generated GLB와 `structure_basic.glb` fixture에서 flag-on/off, load/ready/error/context recovery, camera, selection, DOM asset summary를 검증한다. product auth, polling, route, persistence, edit/command callback은 LDS3D path에 전달되지 않는다. |
| W0-P05 | LDS page-composition decision | W0-P04, G-L0 | `Scene3DFrame`/toolbar/inspector를 포함할지와 closest LDS shell anatomy를 별도 승인한다. W0-P04의 renderer canary만으로 LDS visual parity 또는 full-page migration을 주장하지 않는다. |

### L0 — LDS integration과 접근성

| ID | 작업 | 의존성 | 완료 증거 |
| --- | --- | --- | --- |
| L0-01 | 지원 LDS version과 검증된 viewport/status component integration 고정 | M0-01, M2-06, G-D1 | supported-version, lifecycle→viewer-state mapping과 composition browser test |
| L0-02 | keyboard·focus·recovery 접근성 검증 | L0-01, M2-05 | toolbar keyboard, viewport 진입·이탈, reduced motion와 context-loss recovery focus report |
| G-L0 | LDS Integration Gate | L0-02 | supported-version, token/state, keyboard/focus/recovery와 public-export consumer CI 승인 |
| G-P0 | P0 exit gate | G-D0, G1, G-D0R, G2, G-L0, G-C0, W0-05 | Control shadow, Web Viz 준비와 LDS integration evidence를 모든 accountable owner가 서면 승인 |

D-1의 LDS repository·token·Storybook·Figma audit와 G-D0 visual direction은
상위 계획에서 W1~W4에 수행한다. L0은 이 선행 감사를 반복하는 작업이 아니라
실제 Alpha.2 renderer를 승인된 LDS version과 결합해 browser·접근성을 검증하는
late integration gate다.

## 9. 기술 실행 8주 작업량 기준

아래 `T1~T8`은 기술 task의 effort와 의존 순서이며 calendar week가 아니다.
상위 계획의 `W1~W10`만 wall-clock 일정과 release gate 날짜를 정한다. 예를 들어
기술 lane의 T6 작업이 끝나도 G-D0R·G-L0가 상위 W7에 승인되기 전에는 G2를
열 수 없다.

| 기술 주차 | 핵심 실행 |
| --- | --- |
| T1 | M0-00·01·02·06·08, 최소 package scaffold, 제품 source 원장과 owner 확정 |
| T2 | M0-03·04·05·07, G0 통과, M1-01 착수 |
| T3 | M1-02·03·04·05·07 병렬 구현, M1-06과 W0-01·02 시작 |
| T4 | M1-08·09a와 A1-local; 권한이 있으면 M1-09b·09c·G1, M2-01·02·03 선행 착수 |
| T5 | M2-04·05·06, 조건부 M2-07C; C0-01, W0-03·04, L0-01 integration example 시작 |
| T6 | M2-08·G-D0R, L0-01·02·G-L0 뒤 M2-09a·09b와 G2; C0-02~04 |
| T7 | C0-05·06, mismatch 수정, staging replay와 rollback drill |
| T8 | C0-07을 3~5영업일 관찰, threshold 충족 후 C0-08·G-C0, W0-05와 G-P0 |

Critical path:

```text
transform ledger
→ characterization fixture
→ core transform
→ shared testing
→ alpha.1
→ Three picking/lifecycle
→ alpha.2
→ Control adapter
→ payload shadow
→ rollback drill
→ production shadow canary
```

## 10. Shadow canary 안전 계약

첫 canary에서 다음을 강제한다.

- 기존 구현만 실제 scene과 command payload를 결정한다.
- LDS3D 경로는 같은 입력을 읽고 결과 차이만 기록한다.
- platform package와 `ControlSceneAdapter`에는 command API reference,
  sender callback과 인증 token을 전달하지 않는다.
- 신규 계산의 exception, timeout과 resource failure가 기존 화면과 command
  경로에 영향을 주지 않는다.
- raw 고객 geometry, map 이름과 robot identifier를 telemetry에 기록하지
  않는다. 익명화된 fixture ID와 numeric diff만 수집한다.
- production asset shadow는 기존 loader가 이미 계산한 metadata와 sidecar
  manifest만 비교한다. 동일 GLB를 두 번째로 fetch, parse 또는 GPU upload하지
  않는다.

P0 production shadow는 독립적인 `ThreeSceneHost.pick()`이나 raycast geometry
intersection을 실행하지 않는다. 기존 renderer가 authoritative하게 계산한 floor
hit를 입력에 포함하고, legacy와 LDS3D가 같은 hit 이후의
`render frame → core frame → product map frame` 변환과 command payload만
비교한다. 실제 LDS3D scene picking은 M2 browser fixture에서 검증하고,
두 renderer의 raycast 독립 비교는 visible renderer migration wave에서 수행한다.

```ts
interface FloorPickShadowInput {
  readonly viewportPoint: ViewportPoint;
  readonly legacyHit: FramedPoint3;
  readonly renderToCore: RigidTransform3;
  readonly coreToProductMap: RigidTransform3;
}
```

### 10.1 동일 입력과 provenance

legacy와 LDS3D 계산은 서로 다른 tick을 읽지 않는다. 제품 adapter는 한 tick에서
canonical serialized snapshot을 한 번 만들고, 그 snapshot에서 생성한 서로 다른
deep-immutable instance를 두 경로에 전달한다. mutable reference를 공유하지
않으며 legacy authoritative input은 shadow 코드가 접근하거나 변경할 수 없다.

```ts
type DeepReadonly<T> =
  T extends (...args: never[]) => unknown
    ? T
    : T extends readonly (infer TValue)[]
      ? readonly DeepReadonly<TValue>[]
      : T extends object
        ? { readonly [TKey in keyof T]: DeepReadonly<T[TKey]> }
        : T;

interface ShadowInputEnvelope<TInput> {
  readonly sequence: number;
  readonly sourceTimestamp: Timestamp;
  readonly input: DeepReadonly<TInput>;
  readonly inputHash: string;
  readonly productStoreRevision: string;
  readonly fixtureOrAssetHash: string;
  readonly productCommit: string;
  readonly packageVersion: string;
  readonly packageSha: string;
  readonly comparatorVersion: string;
  readonly effectiveFlags: readonly string[];
}
```

`Readonly<T>`만으로는 불변성을 증명하지 않는다. Staging에서는 두 instance에
deep-freeze와 mutation trap을 적용한다. Production에서는 계산 전후 input hash와
관련 product store revision이 동일한지 검증한다. `legacyInput !== shadowInput`
이지만 canonical hash는 같아야 한다. shadow throw·timeout 뒤에도 legacy command
payload, input hash와 product store revision은 변하지 않아야 한다.

모든 diff row에는 sequence, source timestamp, input·fixture·asset hash, product
store revision, 제품 commit, package version·SHA, comparator version과 effective
mode set을 기록한다. denominator가 없는 “mismatch 0건” 보고서는 승인 증거가
아니다.

### 10.2 Sampling, fault isolation과 circuit breaker

- staging replay는 대상 입력의 100%를 비교한다.
- production의 고빈도 pose transform은 아래 deterministic HMAC에서
  `hash modulo 10 == 0`인 event를 선택한 뒤 entity별 최대 10Hz로 제한한다.

  ```text
  HMAC_SHA256(
    canarySamplingSecret,
    sessionPseudonym + entityPseudonym + sequence + packageSha
  )
  ```

  raw session, robot 또는 map identifier와 sampling secret은 telemetry에
  저장하지 않는다.
- floor-hit projection과 command-intent event는 100% 비교한다.
- asset metadata는 asset checksum당 한 번 비교한다.
- shadow 계산의 동기 main-thread overhead는 p95 2ms 이하를 기본 예산으로
  한다. 전체 frame·ready·memory 지표의 허용 악화 5% 기준도 함께 적용한다.
- command payload mismatch, frame 누락, NaN 또는 비가역 transform이 한 번이라도
  발생하면 해당 cohort의 shadow를 즉시 중단한다.
- 일반 exception이 3회 연속 또는 60초에 5회 발생하거나 p95 overhead가
  5분 연속 예산을 넘으면 local circuit breaker가 shadow를 비활성화한다.
- runtime master kill과 shadow comparator kill은 각각 60초 안에 cohort에
  반영되어야 한다.
- C0-05 fault test는 invalid frame, NaN, throw, 취소된 asset load와 예산을
  넘는 느린 계산, 늦게 완료되는 camera animation을 주입하고 legacy
  화면·command·store에 영향이 없음을 증명한다.

Control runtime과 comparator flag:

```text
lds3d.control.enabled
lds3d.control.shadow.enabled
lds3d.control.transforms.mode
lds3d.control.assets.mode
lds3d.control.camera.mode
lds3d.control.markers.mode
lds3d.control.pick-projection.mode
lds3d.control.picking.mode
lds3d.control.renderer.mode
```

각 capability mode는 `off | shadow | authoritative`다.

| capability | 필수 선행 capability |
| --- | --- |
| `transforms` | 없음 |
| `assets` | `transforms` |
| `camera` | `transforms` |
| `markers` | `transforms` |
| `pick-projection` | `transforms`, `camera` |
| `picking` | `transforms`, `camera`, `renderer` |
| `renderer` | `transforms`, `assets`, `camera`, `markers` |

- `shadow` mode는 `control.enabled=true`와 `shadow.enabled=true`를 모두 요구하며
  legacy가 authoritative다.
- `authoritative` mode는 `control.enabled=true`만 요구하고 comparator를 끈
  상태에서도 유지할 수 있다.
- `control.enabled=false`는 모든 capability를 `off`로 강제하고 legacy 경로로
  돌아가는 runtime master kill이다.
- `shadow.enabled=false`는 shadow comparator만 끈다. authoritative renderer를
  종료하지 않는다.
- capability는 선행 capability보다 강한 mode로 갈 수 없다. `renderer`와 실제
  geometry `picking`을 authoritative로 켜려면 해당 선행 capability도 모두
  authoritative여야 한다.

illegal combination은 배포 config validation에서 거부한다. cohort는 session
동안 sticky하게 유지하고 effective mode set을 모든 telemetry에 포함한다.

P0 production shadow의 고정 config는 `control.enabled=true`,
`shadow.enabled=true`, `transforms/assets/camera/pick-projection.mode=shadow`,
`markers/picking/renderer.mode=off`다. platform 결과는 command와 화면에
사용되지 않는다. camera shadow는 pure solver를 사용하며 hidden canvas를
생성하지 않는다. visible wave에서는 capability를 순서대로 authoritative로
올린 뒤 comparator가 더 필요 없으면 `shadow.enabled=false`만 적용할 수 있다.

Web Viz 다음 wave flag:

```text
lds3d.webviz.pcd-panel
lds3d.webviz.pointcloud
lds3d.webviz.structure-preview
lds3d.webviz.tf-markers
lds3d.webviz.rerun
lds3d.webviz.spatial
lds3d.webviz.authoring
```

transport, store, save payload와 command schema는 renderer flag와 분리한다.

### 10.3 Rollback과 상태 인계

P0 계산 전용 canary의 rollback은 circuit breaker 또는 shadow comparator
kill로 병렬 연산을 중단하는 것이다. runtime master kill은 모든 LDS3D
capability를 끄고 legacy 경로를 강제한다. visible renderer 전환 전에 다음 canonical state
handoff를 별도 fixture로 구현한다.

- `CameraState`
- `SelectionState`
- visible `LayerId` 목록
- paused/live 상태
- focus 복원 대상 DOM ID

visible rollback 순서는 다음으로 고정한다.

1. 신규 spatial event와 input 수신을 중단한다.
2. pending camera operation을 `rollback` reason으로 취소하고 late state write가
   없음을 확인한다.
3. pending asset load와 recovery 작업을 abort한다.
4. status/event listener와 animation loop를 해제한다.
5. LDS3D host와 host가 adopt한 GPU resource를 dispose한다.
6. legacy renderer를 canonical camera·selection·layer·pause state로 remount한다.
7. D-1에서 검증된 LDS viewport/status component 또는 제품 composition이
   toolbar·recovery action으로 focus를 복원한다.

rollback 중 저장 데이터, command schema와 product store shape는 변경하지 않는다.

### 10.4 Canary exit threshold

M0에서 더 높은 표본을 요구할 수 있으나 다음 하한보다 낮출 수 없다.

| 구간 | 최소 표본 |
| --- | --- |
| staging replay | pose transform 10,000건, floor-hit projection 500건, command-intent 100건 |
| production shadow | 20 session, floor-hit projection 100건, command-intent 20건 |
| production pose coverage | sampled pose transform 5,000건, 서로 다른 entity pseudonym 2개 이상 |
| asset coverage | 서로 다른 map/asset 조합 2개 이상 |
| camera coverage | home, top, focus 각각 20회 이상 |
| 관찰 기간 | production에서 3~5영업일 |

승인 threshold:

- command payload semantic mismatch 0건
- frame 누락, NaN, 비가역 transform과 network side effect 0건
- position·rotation·pick은 M0에서 필드별로 승인한 tolerance 이내
- command/projection 비교 exception 0건, 기타 shadow error rate 0.1% 미만
- shadow CPU overhead p95 2ms 이하
- 기존 대비 p95 frame time, ready time과 안정 memory 악화 5% 미만
- circuit breaker, runtime/comparator kill과 package rollback drill 성공

C0-08은 기준 legacy commit, LDS3D package SHA, comparator version, effective
mode set, cohort와 모든 denominator가 포함된 `canary-manifest.json` 없이는
승인할 수 없다.
`canary-summary.json`은 최소한 `eligiblePoseCount`, `sampledPoseCount`,
`samplingRate`, `distinctSessionCount`, `distinctEntityCount`와
`distinctMapAssetCount`를 포함한다.

상위 calendar의 W10이 P0 최초 완료 가능 주다. 기술 effort T8이 끝났더라도
Production canary 시작 뒤 product commit,
LDS3D package SHA, comparator version, tolerance 또는 effective mode set이
바뀌면 기존 표본을 새 exit cohort에 합산하지 않는다. 변경된 configuration으로
새 `canary-manifest.json`을 만들고 denominator와 3~5영업일 연속 관찰 기간을
처음부터 다시 충족한다. 이전 attempt의 실패와 중단 기록은 보존하며 일정이
늘어나더라도 gate를 완화하지 않는다.

## 11. P0 evidence bundle

각 gate는 다음 경로 또는 동등한 CI artifact에 증거를 남긴다.

```text
evidence/
├─ lds-audit/
│  ├─ repository-inventory.json
│  ├─ token-inventory.json
│  ├─ storybook-figma-inventory.md
│  ├─ lds-viewport-contract.md
│  └─ gap-register.md
├─ design-direction/
│  ├─ current-baseline/
│  ├─ candidate-comparison/
│  ├─ semantic-state-matrix.json
│  ├─ token-mapping.json
│  └─ evaluation-report.md
├─ m0/
│  ├─ owners.md
│  ├─ transform-ledger.md
│  ├─ benchmark-baseline.json
│  ├─ consumer-pack-smoke/
│  ├─ fixture-provenance.json
│  ├─ flag-mode-contract.json
│  └─ rollback-contract.md
├─ m1/
│  ├─ api-report/
│  ├─ coordinate-contract.json
│  ├─ asset-reports/
│  ├─ prepublish-consumer-smoke/
│  └─ dependency-boundary.json
├─ m2/
│  ├─ browser-smoke/
│  ├─ visual-diff/
│  ├─ renderer-fidelity-report.json
│  ├─ lifecycle-report.json
│  ├─ ownership-and-cancellation-report.json
│  ├─ prepublish-consumer-smoke/
│  └─ bundle-report.json
├─ lds-integration/
│  ├─ supported-version.json
│  ├─ lds-viewport-accessibility-report.json
│  ├─ toolbar-keyboard-focus-report.json
│  └─ blocking-recovery-focus-report.json
├─ web-viz/
│  ├─ consumer-ci.json
│  ├─ fixture-mapping.json
│  └─ adapter-boundary.json
└─ control-shadow/
   ├─ staging-diff.json
   ├─ no-side-effect.json
   ├─ canary-manifest.json
   ├─ canary-summary.json
   ├─ sampling-report.json
   ├─ rollback-drill.md
   └─ exit-review.md
```

Production raw data를 repository에 commit하지 않는다. evidence에는 익명화된
요약, fixture checksum, CI run과 승인 링크만 저장한다.

## 12. P0 완료 기준

- [ ] G-D1에서 실제 LDS version·API와 두 제품 디자인 baseline이 승인됐다.
- [ ] G-D0에서 visual direction, appearance matrix, LDS mapping과 접근성 평가가
      승인됐다.
- [ ] M0-00~08과 G0가 승인됐다.
- [ ] A1-local에서 registry·제품 repository 변경 없이 tarball/local-registry를
      설치한 격리 consumer의 typecheck·contract·ESM runtime smoke가 통과했다.
- [ ] `0.1.0-alpha.1`이 registry에 배포되고 두 제품 consumer CI가 통과했다.
- [ ] pure math round-trip 절대 오차가 `1e-6` 이하다.
- [ ] 신규 GLB fixture는 manifest 없이는 CI를 통과하지 못한다.
- [ ] P0 manifest는 left-handed, invalid axis, non-positive unit과 frame mismatch를
      거부한다.
- [ ] asset load cancellation, progress, single-use ownership token, transfer 뒤
      caller dispose no-op과 token 재사용 거부 test가 통과했다.
- [ ] `core`에 DOM, React, Three, R3F와 제품 dependency가 없다.
- [ ] root API에 raw `THREE.*`가 없고 제품의 `r3f-bridge` 직접 import가
      boundary CI에서 거부된다.
- [ ] G-D0R에서 실제 renderer의 D0 fixture·합성 상태·depth·occlusion·label·
      picking과 접근성 fidelity가 승인됐다.
- [ ] G-L0 뒤 `0.1.0-alpha.2`가 camera, picking과 lifecycle browser gate를
      통과해 G2가 승인됐다.
- [ ] `AssetEntity`의 map placement, layer와 pick identity가 실제 scene fixture로
      검증됐다.
- [ ] camera cancel, supersede, rollback과 dispose 뒤 pending Promise가 typed
      result로 종료되고 late callback·state write가 0건이다.
- [ ] 20회 mount/unmount 후 resource counter가 안정값으로 돌아온다.
- [ ] resize, hidden/visible과 반복 context loss 후 recoverable status와 retry
      또는 host 재생성 경로가 동작한다.
- [ ] 제품 bundle에 Three.js 사본이 하나다.
- [ ] Control shadow path에는 command 전송 능력이 없다.
- [ ] static import 검사와 runtime network·store mutation spy가 command side
      effect 0건을 증명한다.
- [ ] staging·production 최소 denominator를 충족했고 command payload semantic
      mismatch가 0건이다.
- [ ] 위치, 회전과 floor-hit projection 차이가 M0 승인 오차 이내다.
- [ ] shadow CPU overhead p95 2ms 이하이며 frame, ready와 안정 memory 악화가
      5% 미만이다.
- [ ] 최소 2개 map/asset 조합에서 recorded-data shadow가 통과했다.
- [ ] legacy와 shadow 입력은 reference를 공유하지 않고 canonical input hash,
      product store revision과 effective mode set이 모든 diff에 있다.
- [ ] production sampled pose 5,000건, entity pseudonym 2개와 eligible denominator를
      충족했다.
- [ ] circuit breaker, runtime master kill, comparator kill, capability mode와
      package rollback drill이 성공했다.
- [ ] canary 관찰 중 commit, package SHA, comparator, tolerance와 mode set이
      고정됐고 변경 attempt의 denominator가 섞이지 않았다.
- [ ] 검증된 LDS viewport/status component의 toolbar keyboard/focus와 blocking
      recovery 접근성 report가 통과했다.
- [ ] Web Viz가 `alpha.1` consumer CI와 adapter skeleton을 완료했다.
- [ ] G-D0, G1, G-D0R, G2, G-L0, G-C0와 W0-05 evidence를 모든 accountable
      owner가 승인해 G-P0를 통과했다.

P0 완료 후 다음 순서는 다음과 같다.

1. Control visible renderer capability를
   좌표→asset→camera→marker→renderer→picking 순으로 authoritative mode로
   전환한다.
2. Web Viz에서 `PcdMap3DPanel`과 `StructurePreviewViewer`의 foundation shadow를
   시작한다.
3. P1에서 `3d-pointcloud`, `3d-tf`, `3d-markers`, `3d-rerun`을 추가한다.
4. P2에서 `3d-spatial`, `3d-authoring`을 추가한다.
5. 두 제품의 target stack 수렴과 compatibility 제거 후 beta·RC·`1.0.0`으로
   진행한다.
