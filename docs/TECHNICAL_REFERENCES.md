# 기술 기준 자료

이 문서는 공간·asset·renderer의 기술 규격을 다룬다. 제품 디자인, 공간 UX와
LDS 정합성의 공식 reference program은
[DESIGN_AND_LDS_INTEGRATION_PLAN.md](DESIGN_AND_LDS_INTEGRATION_PLAN.md)를
따른다.

LK Design System 3D의 contract와 검증기는 제품의 현재 구현만으로 결정하지
않는다. 아래 공식 규약과 도구를 구현 기준으로 사용한다.

## 좌표와 단위

### ROS REP-103

[ROS REP-103](https://www.ros.org/reps/rep-0103.html)은 ROS 좌표를
right-handed, `x` forward, `y` left, `z` up으로 정의하고 길이는 meter, 각도는
radian을 사용한다. 큰 `float32` 좌표의 정밀도 문제를 피하기 위해 가까운
origin을 선택할 것도 권고한다.

적용 결정:

- `RosFrame`의 기본 단위와 축은 REP-103을 따른다.
- 다른 convention은 이름 있는 frame과 명시적 transform으로만 허용한다.
- `origin` 보정을 휴리스틱으로 숨기지 않고 contract data로 전달한다.
- Euler angle보다 quaternion 또는 rotation matrix를 public transform의
  기준 표현으로 사용한다.

### glTF 2.0

[Khronos glTF 2.0 Specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)은
right-handed 좌표계, `+Y` up, `+Z` forward, meter와 radian을 정의한다.

적용 결정:

- 모든 GLB/GLTF asset은 glTF convention을 충족한 상태로 등록한다.
- 제품 runtime에서 bounding-box 비율로 up-axis를 추정하는 방식은 호환
  adapter에만 두고 신규 asset 계약으로 허용하지 않는다.
- asset manifest에 source frame, authored unit, canonical transform과 bounds를
  기록한다.
- CI에서 [Khronos glTF Validator](https://github.khronos.org/glTF-Validator/)를
  사용한다.

### Three.js

[Three.js Object3D documentation](https://threejs.org/docs/pages/Object3D.html)은
기본 up direction을 `(0, 1, 0)`으로 정의한다.

적용 결정:

- Three adapter의 render space는 Three/glTF와 같은 Y-up을 기본값으로
  사용한다.
- ROS Z-up 데이터는 scene root에서 한 번만 변환한다.
- 개별 marker, mesh 또는 camera가 각각 축을 보정하지 못하게 한다.
- Z-up 편집 경험이 필요한 화면도 data frame과 render frame을 분리하고,
  camera preset을 통해 표현한다.

## 성능과 renderer 수명주기

### React Three Fiber

[React Three Fiber performance guidance](https://r3f.docs.pmnd.rs/advanced/scaling-performance)는
on-demand rendering, resource reuse, instancing과 interaction 중 성능 저하
전략을 제공한다.

적용 결정:

- 정적인 장면은 continuous loop를 기본값으로 두지 않는다.
- 반복 marker와 robot instance는 draw-call 예산을 검토한다.
- DPR, frame loop와 quality fallback은 adapter capability로 노출한다.
- 성능 기준은 단일 FPS 숫자가 아니라 fixture, point/instance 수, DPR,
  device class와 함께 기록한다.

### PointCloud Foundation 0 (P1)

[Three.js `BufferAttribute`](https://threejs.org/docs/pages/BufferAttribute.html)는
typed-array attribute의 item-size/count 일치, initial use 전 usage 설정, update가
GPU upload를 유발한다는 점을 명시한다. [Three.js
`PointsMaterial`](https://threejs.org/docs/pages/PointsMaterial.html)은 실제
WebGL point geometry의 material contract를 제공한다. [React Three Fiber scaling
guidance](https://r3f.docs.pmnd.rs/advanced/scaling-performance)는 static scene의
on-demand frame loop와 resource reuse를 권고한다.

적용 결정:

- P1 Foundation 0은 제품 parser가 아니라 renderer-neutral
  `PointCloudSnapshot`으로 시작한다. 입력은 required LK-core frame, XYZ
  `Float32Array`, optional linear-RGB `Float32Array`, revision으로 한정한다.
- Snapshot CPU buffer는 caller-retained다. 변경은 in-place update가 아니라 새
  snapshot replacement로 전달하고, R3F adapter는 자신이 만든
  `BufferGeometry`/attribute만 dispose한다.
- R3F adapter는 initial use 전 `StaticDrawUsage`을 설정하고, static review는
  demand frame loop와 resource replacement lifecycle을 사용한다. 이 결과는
  WebGL correctness evidence이지 물리 GPU throughput claim이 아니다.
- `PointsMaterial`은 fixed screen-space dot size로 사용한다. 따라서 Foundation
  review에서 point size는 camera distance에 따라 의미가 바뀌는 world-scale
  measurement가 아니라 읽기 가능한 pixel-scale density control이다.
- Opaque snapshots write depth; partial-opacity snapshots use a transparent,
  non-depth-writing material. This preserves ordinary spatial occlusion without
  pretending that translucent points can provide an unambiguous depth surface.
- Layer eligibility is frame-and-budget validation only. `acceptedPointCount`
  is a planned adapter input, not measured GPU upload, draw, or hardware state.
- [PointCloud runtime QA evidence](../evidence/pointcloud-runtime-qa.json)
  records the physical-GPU WebGL review, narrow composition, rejection states,
  and context restore. It is functional evidence, not a throughput claim.
- `SceneCanvas.frame`과 snapshot frame이 다르거나 explicit `maxPoints`를
  넘으면 geometry를 만들지 않는다. TF, origin shift, LOD, or silent sampling은
  후속 adapter/product decision이며 P1 Foundation 0에서 추정하지 않는다.
- ROS/PointCloud2/PCD parsing, transport, TF graph/time interpolation,
  point picking, intensity/classification, and product viewer chrome remain
  outside this foundation.

### WebGL context loss

[Khronos context-loss guidance](https://wikis.khronos.org/webgl/HandlingContextLost)와
[WEBGL_lose_context extension](https://registry.khronos.org/webgl/extensions/WEBGL_lose_context/)은
context loss에서 기본 동작을 막고 animation loop를 중지한 뒤, 복구 시 GPU
resource와 state를 다시 생성할 것을 요구한다.

적용 결정:

- mount, resize, pause, dispose, lost, restoring, restored 상태를 공통 lifecycle로
  정의한다.
- geometry, material, texture, listener와 animation frame 해제를 검증한다.
- CI 또는 browser test에서 context loss와 restoration을 강제로 발생시킨다.
- context가 복구되기 전 stale scene을 정상 장면으로 표시하지 않는다.

## 대체 renderer

[Rerun Viewer overview](https://rerun.io/docs/reference/viewer/overview)는 viewport,
blueprint, selection과 timeline을 자체적으로 소유하는 완성 viewer 구조를
설명한다. 따라서 Rerun은 R3F primitive 구현으로 흡수하지 않고 별도 renderer
adapter로 취급한다.

적용 결정:

- 공통 패키지는 Rerun의 panel과 timeline UI를 재구현하지 않는다.
- 공통 영역은 source identity, coordinate contract, viewer state와 product
  chrome 연결로 제한한다.
- Rerun version과 WebGPU/WebGL backend 선택은 optional adapter가 소유한다.
