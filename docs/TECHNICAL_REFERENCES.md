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
- 현재 Tron GLB의 재질 구조, 물리 외관과 운영 상태의 색상 책임 경계, 보류된
  Blender 제작 파이프라인은
  [`packages/assets/README.md`](../packages/assets/README.md#deferred-tron-material-authoring-plan)에
  기록한다. 이 기록은 구현 승인이 아니며 별도 시각 검토와 자산 release 결정
  전까지 현재 중립 재질을 유지한다.

### Occupancy-grid coordinates and WebGL surface (P1)

[ROS 2 `MapMetaData`](https://github.com/ros2/common_interfaces/blob/rolling/nav_msgs/msg/MapMetaData.msg)
defines resolution in metres per cell and the map origin as the real-world pose
of the lower-left corner of cell `(0, 0)`.
[ROS 2 `OccupancyGrid`](https://github.com/ros2/common_interfaces/blob/rolling/nav_msgs/msg/OccupancyGrid.msg)
stores cells in row-major order, with X increasing fastest. The
[PGM specification](https://netpbm.sourceforge.net/doc/pgm.html) stores image
rows from top to bottom, while
[Nav2 map IO](https://github.com/ros-navigation/navigation2/blob/main/nav2_map_server/src/map_io.cpp)
flips image Y during map conversion and preserves the YAML origin's
`[x, y, yaw]` as a pose. Nav2's
[`Costmap2D::mapToWorld`](https://github.com/ros-navigation/navigation2/blob/main/nav2_costmap_2d/src/costmap_2d.cpp)
adds half a cell to return the cell centre rather than its minimum corner.
[REP-103](https://www.ros.org/reps/rep-0103.html) fixes the right-handed,
metre/radian, Z-up convention and positive counter-clockwise yaw, while
[REP-105](https://www.ros.org/reps/rep-0105.html) defines `map` as a world-fixed
frame rather than permission to infer a transform from a frame name.

Applied decisions:

- `OccupancyGridGeometry` uses positive safe-integer dimensions, positive
  metres-per-cell resolution, and one complete `gridToFrame` rigid transform.
  Its local origin is the minimum corner of cell `(0, 0)`; columns grow along
  local `+X`, rows grow along local `+Y`, and origin yaw is never discarded.
- Grid data uses ROS-compatible `row * width + column` ordering. A top-down
  image pixel `(column, rowFromTop)` maps to grid row
  `height - 1 - rowFromTop`; the PGM-to-grid Y flip is explicit and testable.
- Minimum-corner and centre lookups are separate APIs. A cell centre adds
  `0.5 * resolution` on local X and Y before applying `gridToFrame`. Reverse
  projection uses half-open XY bounds and an explicit grid-plane tolerance, so
  an outside or off-plane point is never coerced into a cell.
- `pickOccupancyGridCell` composes that projection with the canonical image-row
  and row-major conversions. A pick captures revision, state, index, framed hit
  point, and cell centre at event time; R3F converts its world point back to the
  core basis and includes the surface elevation in the plane tolerance.
- `createOccupancyGridCellPicker` performs complete state-buffer validation once
  per immutable snapshot replacement and then provides O(1) pointer-rate picks.
  R3F binds one picker per snapshot rather than rescanning all cells for every
  pointer move.
- `OccupancyGridSnapshot` normalizes product input to categorical
  `unknown=0`, `free=1`, and `occupied=2` states in a caller-retained
  `Uint8Array`, plus an immutable-by-replacement revision. These values are not
  ROS wire probabilities or PGM grayscale values. File decoding, YAML origin
  validation, thresholds, negate policy, and unknown classification remain in
  the product adapter.
- `OccupancyGridSurface` renders one actual WebGL quad with one nearest-filter,
  non-colour state texture. Texture row zero and UV `v=0` both mean grid row
  zero; `flipY=false`, and the mesh receives the full translation and
  quaternion. Cell lines, an unknown checker, and an occupied diagonal pattern
  keep categorical state from relying on colour alone.
- The caller supplies a positive `maxCells`; the adapter also checks the live
  GPU maximum texture dimension. `frame-mismatch`, `budget-exceeded`, and
  `texture-dimension-exceeded` states render no partial raster and are reported
  through caller-owned LDS/product DOM. LDS3D never silently samples, rescales,
  tiles, or chooses a map level.
- The snapshot buffer remains caller-owned. The R3F adapter owns only its
  derived geometry, texture, and shader material and disposes them on input
  replacement or unmount. Caller-controlled cell selection owns one additional
  transformed WebGL line loop, while hover and pick callbacks emit sub-hits and
  never cell entities or product commands. Active hover is cleared on pointer
  exit, invalid hits, non-ready state, snapshot or callback-owner replacement,
  and unmount. `SceneCanvas` retains the shared context-loss and restoration
  lifecycle. PGM/YAML/ROS transport, editing, history, undo, persistence,
  permissions, and map commands stay outside the renderer.

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

### PointCloud layer set and frame binding (P1)

[ROS `sensor_msgs/PointCloud2`](https://docs.ros.org/en/iron/p/sensor_msgs/interfaces/msg/PointCloud2.html)
binds acquisition time and the coordinate-frame ID to point data through its
header. [ROS REP-105](https://www.ros.org/reps/rep-0105.html) defines the mobile
platform frame hierarchy (`map`, `odom`, `base_link`), while
[`tf2_sensor_msgs`](https://docs.ros.org/en/melodic/api/tf2_sensor_msgs/html/tf2__sensor__msgs_8h.html)
exposes PointCloud2 frame/timestamp extraction and an explicit transform step.

적용 결정:

- `PointCloudSnapshot.frame` and optional `timestamp` remain inseparable from
  the caller-retained buffers; a topic name is a `LayerId`, not a frame guess.
- LDS3D does not import ROS messages or resolve TF. A product adapter resolves a
  `RigidTransform3` from the snapshot source frame to the chosen scene frame at
  the relevant timestamp and publishes it as `sourceToScene`.
- A missing or wrong-target transform is explicit `frame-unresolved` or
  `frame-mismatch` state. Valid siblings may remain visible and the set reports
  `degraded`; no identity transform is guessed.
- Freshness compares only timestamps with the same `ClockId`. Stale, future, or
  clock-mismatched data remains visible for operational context but is reported
  as degraded state to caller-owned LDS/product DOM.
- The total point budget is atomic across visible, frame-resolved layers. LDS3D
  never chooses which topic to drop or sample implicitly; that policy remains
  product-owned.

### Timestamped frame tree and Marker layer (P1)

[ROS 2 tf2](https://docs.ros.org/en/jazzy/p/tf2/generated/doxygen/html/index.html)
defines a time-buffered frame tree queried by source frame, target frame, and
time, with intermediate transforms and interpolation handled by the graph.
The official
[ROS 2 frame tutorial](https://docs.ros.org/en/rolling/Tutorials/Intermediate/Tf2/Adding-A-Frame-Py.html)
makes the topology constraint explicit: one parent per frame and no closed
loop. The
[ROS 2 RViz Marker reference](https://docs.ros.org/en/rolling/Tutorials/Intermediate/RViz/Marker-Display-types/Marker-Display-types.html)
defines non-interactive 3D annotations through frame/time, namespace/id,
pose, scale, colour/alpha, local points, text, and mesh resource fields.

Applied decisions:

- `@lk-design-system/lds-3d-tf` uses `RigidTransform3.sourceFrame` as the
  child and `targetFrame` as its single parent. `createFrameGraph` rejects
  multiple parents, duplicate edge timestamps, mixed static/dynamic samples,
  and cycles instead of silently choosing a path.
- Lookup is explicit at one `Timestamp`. Exact and bracketed data produce exact
  or interpolated transforms. A caller-selected bounded hold-last window is
  reported as `held`; before-history, over-limit after-history, stale data,
  missing frames, and clock mismatches are separate outcomes.
- `@lk-design-system/lds-3d-markers` groups immutable markers by one frame
  and optional timestamp. Arrow identity follows local `+X`; line-strip points
  remain ordered local points; pose axes, point sets, view-facing text, volumes,
  and referenced meshes retain distinct semantic shapes.
- `MarkerLayer` renders real WebGL geometry after the caller injects one
  `sourceToScene` transform. A referenced mesh requires a caller-provided asset
  render slot; LDS3D does not invent a placeholder asset or a product registry.
- The golden Storybook fixture resolves `base-link` and `lidar-front` into
  `lk-map` at the same timestamp before composing `PointCloudLayers` and
  `MarkerLayer`. This validates spatial alignment, not ROS transport or product
  topic retention.
- ROS subscription, Marker ADD/MODIFY/DELETE retention, reconnect, permissions,
  topic visibility, and command/workflow policy remain product-owned.

### Point-cloud colour transfer (P1)

[RViz `AxisColorPCTransformer`](https://docs.ros.org/en/humble/p/rviz_default_plugins/generated/program_listing_file_include_rviz_default_plugins_displays_pointcloud_transformers_axis_color_pc_transformer.hpp.html)
exposes X/Y/Z axis selection with automatic or explicit minimum/maximum bounds.
The established implementation maps the chosen axis through a blue-to-red
rainbow transfer function. [ParaView's colour-mapping reference](https://docs.paraview.org/en/latest/ReferenceManual/colorMapping.html)
defines scalar colouring as a data-to-colour transfer function, warns that
different functions for the same variable can cause misinterpretation, and
requires a scalar bar/legend to explain the mapped range.

Applied decisions:

- `source`, `uniform`, and `height` are distinct renderer modes. Supplied RGB is
  not silently preferred when a product explicitly requests uniform or height
  colouring.
- Height means Z in the selected LDS3D scene frame, after the caller-supplied
  `sourceToScene` transform. This keeps a lidar-frame layer comparable with a
  map-frame layer.
- Height colours follow the robotics blue-low/red-high convention. Comparable
  layers accept one explicit `heightRange`; omission computes a range for that
  layer only.
- The generated colour buffer is adapter-owned and disposable. Source position
  and colour arrays remain caller-retained and unchanged.
- Range labels and legends remain caller-owned LDS/product DOM because colour
  alone is not a sufficient explanation of a scalar value.

### Section bounds and spatial edit intent (P1)

[Three.js material clipping](https://threejs.org/docs/pages/Material.html)
defines user clipping planes in world space, clips the negative signed-distance
side, and requires local clipping to be enabled explicitly. The
[Three.js WebGL renderer contract](https://threejs.org/docs/pages/WebGLRenderer.html)
also distinguishes renderer-global planes from object/material-local clipping.
[Open3D point-cloud guidance](https://open3d.org/html/tutorial/t_geometry/pointcloud.html)
uses axis-aligned and oriented bounding boxes as explicit crop volumes, while
its point-cloud API keeps crop and inverse-crop as separate caller choices.
[ROS InteractiveMarkerControl](https://docs.ros.org/en/ros2_packages/rolling/api/visualization_msgs/msg/InteractiveMarkerControl.html)
separates the marker's framed pose and visual representation from explicit
move-axis, move-plane, rotate, and free-3D interaction modes.
[Three.js `OrbitControls`](https://threejs.org/docs/pages/OrbitControls.html)
defines wheel zoom as a camera capability independent from transform mode.
LDS3D's shared `TransformGizmo` follows that interaction boundary: pointer
capture is owned by the active handle, and registered camera controls are
suspended only while that handle is being dragged.

Applied decisions:

- `SectionBox` receives validated scene-frame `Bounds3` and visualizes all six
  limits. It does not mutate points and does not enable global renderer clipping.
- Any material-level clipping adapter must opt in, state whether the kept
  region is the intersection or inverse, and preserve the world/scene-frame
  sign convention instead of inferring it from camera orientation.
- `SpatialEditVolume` is a framed, immutable intent: sphere or box geometry,
  `delete` or `restore` operation, and a stable entity identifier. The box uses
  a full pose plus positive extents; the initial product adapter may supply the
  identity orientation for axis-aligned parity.
- Point inclusion, crop inversion, order of overlapping edit operations,
  counts, undo, and destructive apply remain product policy. Rendering an edit
  volume has no command side effect.
- Selection is persistent and caller-controlled. Hover/selected visuals are
  renderer feedback, while DOM controls and accessible summaries use LDS at the
  composition boundary. The base primitive remains immutable and does not imply
  transform handles. The docs adapter reviews translation and resize as explicit
  modes, maps pointer drag back to fresh sphere/box contracts, and pairs the
  pointer affordance with LDS numeric fields. Sphere resize stays uniform; box
  resize preserves positive independent extents.
- The public LDS `EditorToolbar` owns the side `select / delete` work modes, and
  the public LDS `DropdownMenu` exposes sphere, box, move, and resize as radio
  subtools only while delete mode is active. `EditorToolbar` has no public
  submenu-item slot, so the menu uses a separate contextual trigger in the same
  `CanvasEditorShell.tools` region instead of an internal import or a custom
  floating surface.
- `CameraRig` registers its `OrbitControls` through the React Three Fiber
  controls contract. Edit modes retain wheel zoom and camera navigation while
  idle; the shared `TransformGizmo` suspends the registered camera controls
  only for an active transform-handle drag, and disabled controls do not advance
  their damping update.
- [Open3D point-cloud outlier removal](https://open3d.org/docs/release/tutorial/geometry/pointcloud_outlier_removal.html)
  renders removed candidates in red alongside retained points in gray. The
  spatial-editing Story follows that pre-commit distinction: affected points
  use the scene error material and a larger point size, retained points remain
  present with reduced prominence, and the DOM inspector reports both count and
  percentage.
- [CloudCompare interactive segmentation](https://www.cloudcompare.org/doc/wiki/index.php/Interactive_Segmentation_Tool)
  hides rejected points only inside an explicit keep-visible/delete-hidden
  workflow with a separate validation step. LDS3D therefore does not hide
  candidates while the delete volume is still being positioned; it removes
  them from the rendered snapshot only after confirmation.
- Full triangular wireframes and an always-front four-axis X obscure the point
  sample and do not communicate a crop boundary. The retained geometry is a
  translucent pickable body plus one ground-plane sphere-radius ring or the 12
  box edges. Selection promotes that single outline; operation identity and
  destructive confirmation remain in the LDS inspector rather than as a glyph
  over the point cloud.

## Spatial authoring and exchange

### Spatial structure and transform authoring foundation (P2)

The [buildingSMART IFC spatial-structure
contract](https://standards.buildingsmart.org/IFC/RELEASE/IFC4_3/HTML/concepts/Object_Connectivity/Spatial_Structure/content.html)
uses a hierarchical containment tree for site, building, storey, and contained
physical elements. Its [building-storey
definition](https://standards.buildingsmart.org/IFC/RELEASE/IFC4_3/HTML/lexical/IfcBuildingStorey.htm)
treats a storey as a building-relative spatial container with an explicit
elevation. The [glTF 2.0 node and transformation
specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#nodes-and-hierarchy)
requires disjoint strict node trees and defines local translation, XYZW unit
quaternion rotation, and scale composed in `T * R * S` order. glTF also provides
a portable metallic-roughness PBR material model. [Three.js
`TransformControls`](https://threejs.org/docs/pages/TransformControls.html)
separates translate, rotate, and scale modes; local/world space; axis
visibility; and independent translation, rotation, and scale snapping.
[W3C Pointer Events](https://www.w3.org/TR/pointerevents/#pointer-capture)
defines explicit pointer capture, while its
[`pointercancel`](https://www.w3.org/TR/pointerevents/#the-pointercancel-event)
contract requires an interrupted gesture to terminate without a commit.
[React Three Fiber events](https://r3f.docs.pmnd.rs/api/events) make captured
objects additional hit targets and require propagation to be stopped explicitly.
The installed [Drei `TransformControls`
adapter](https://github.com/pmndrs/drei/blob/master/src/core/TransformControls.tsx)
also establishes the precedent that camera controls are suspended only during
an active manipulation.

Applied decisions:

- The foundation uses one immutable, cycle-free tree. Every node has at most
  one parent, one local frame, and one explicit local-to-parent TRS transform.
  A root targets the scene frame; a child target frame must equal its parent's
  local frame. Product names or array order never imply placement.
- `site`, `building`, and `level` are reusable containers. A level has an
  explicit elevation that must agree with its local Z translation. Product
  zone, stair, lane, permission, revision, and save schemas are excluded.
- Primitive floor, wall, and object evidence uses positive box/cylinder
  dimensions. Asset nodes carry an `AssetId` and optional local-frame bounds;
  loading and URL resolution remain in the existing asset/product boundary.
- Material input is renderer-neutral linear RGBA plus glTF-compatible
  metallic/roughness factors. Optional top and side slots express the product
  evidence without accepting renderer materials, texture URLs, CSS tokens, or
  product presets in core.
- Transform authoring produces serializable before/after change sets. The
  pointer gizmo and LDS numeric/keyboard controls must call the same step
  function, so renderer interaction cannot become the only editing path.
- Translate, rotate, and scale remain distinct modes. Axis, local/target-frame
  space, and positive snapping increments are explicit. The core node contract
  contains only a local-to-target transform, so it does not claim conventional
  scene-world axes without a resolved ancestor transform. Zero or negative
  scale is rejected; target-frame non-uniform scale/shear is not synthesized.
- The R3F gizmo implements continuous translation arrows, rotation rings, and
  local scale handles. Pointer down captures an immutable start transform and
  one stable axis projection; every preview is recomputed from that start and
  symmetrically snapped, so controlled React updates cannot accumulate drift.
  Pointer up emits exactly one commit equal to the last preview.
- Pointer cancellation, lost capture, Escape, unmount, or a transform-policy
  change emits exactly one cancel whose `after` equals `before`. The active
  drag is cleared before capture release, and the exact prior camera-control
  `enabled` value is restored before the terminal callback.
- The renderer-neutral discrete step API and LDS numeric/keyboard controls remain
  equivalent non-drag alternatives for every transform mode. Product undo,
  persistence, multi-selection pivot, marquee selection, conflict handling, and
  final validation remain out of reusable primitive scope.

### Spatial map authoring interaction (P2)

The [RMF Site Editor](https://github.com/open-rmf/rmf_site) is the official but
explicitly experimental Open-RMF editor for large deployment sites and can
generate simulations and navigation graphs through its ROS 2 integration. The official
[Traffic Editor guide](https://osrf.github.io/ros2multirobotbook/traffic-editor.html)
defines each level with its own elevation and annotations. It also defines a
vertex as a shared building block for walls, measurements, floor polygons, and
traffic lanes, while lane edges connect waypoints and carry graph,
directionality, and orientation properties.

[QGIS 3.44 vector editing](https://docs.qgis.org/3.44/en/docs/user_manual/working_with_vector/editing_geometry_attributes.html)
captures a line or polygon through consecutive point clicks, shows a digitizing
rubber band, supports vertex/segment/grid snapping with a visible snap kind,
removes the last point with `Delete` or `Backspace`, and requires an explicit
finish. The official
[ROS 1 Noetic RViz 2D Nav Goal tool](https://docs.ros.org/en/noetic/api/rviz/html/user_guide)
uses a ground-plane click for position and the subsequent drag for orientation.
Unreal's official
[actor-placement guide](https://dev.epicgames.com/documentation/unreal-engine/placing-actors-in-unreal-engine?lang=en-US)
places an instance only after the asset is dragged to a desired viewport
location. Its
[snapping guide](https://dev.epicgames.com/documentation/unreal-engine/actor-snapping-in-unreal-engine?lang=en-US)
separates surface, grid, and vertex snapping, and the official
[`AActor` API](https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Runtime/Engine/AActor)
distinguishes a transient editor-preview actor and exposes a
collision-on-placement policy.

Applied decisions:

- The docs authoring model stores routes, areas, goals, primitives, and assets
  as separate entity kinds with an explicit `levelId`. Switching floors filters
  both completed geometry and snap targets; a frame or display name never
  implies level ownership.
- A route is an ordered point sequence with traversal and width metadata. An
  area is an ordered polygon boundary with category metadata and no repeated
  closing vertex. Shared coordinates may be snapped to an existing vertex, but
  the document does not silently merge independent entity identity.
- `SpatialPointDraftSession` separates committed draft points from one cursor
  preview. A click appends only the candidate point; it never synthesizes a
  second endpoint, rectangle, or fixed-size block. Route and area previews use
  actual WebGL line/polygon geometry plus a rubber-band cursor segment.
- Grid and existing-vertex snap results retain raw and snapped coordinates,
  snap kind, and target identity. The R3F layer renders a snap cue, while the
  LDS inspector and status regions provide the non-colour explanation.
- `Backspace` removes only the last draft point. `Enter` or the LDS completion
  action validates the minimum point count, duplicate/near points, and polygon
  area before one atomic commit. Escape cancels preview state without changing
  the document or consuming an undo entry.
- Completed routes are continuous route geometry, not a chain of blocks.
  Completed areas are planar boundaries and fills, not extruded
  `SpatialStructure` boxes. `PathRibbon` continues to represent runtime path
  status and is not reused as the route-draft state machine.
- Goal authoring stores pointer-down position as the origin and derives yaw from
  the live drag vector. A drag shorter than the declared heading tolerance is
  invalid and does not silently commit an identity heading. Pointer cancellation
  terminates the draft with no goal entity.
- Primitive and asset placement keeps one non-persistent WebGL ghost under the
  cursor. The ghost shows raw/snapped position and validity before commit;
  pointer up creates exactly one entity only when the gesture and candidate are
  valid. The GLB fixture persists its manifest bounds with the committed node,
  so a placed asset participates in subsequent overlap validation instead of
  becoming an unbounded visual-only object.
- Draft previews never mark the document dirty, allocate a permanent ID, or
  create history. One completed route, area, goal, primitive, or asset gesture
  emits one immutable commit boundary. The Story may map that boundary to one
  local history entry; production history and Undo policy remain product-owned.
- Camera navigation and authoring have exclusive ownership of the primary
  pointer while a gesture is active. Camera drags, secondary pointers, lost
  capture, cancelled gestures, and invalid finishes cannot place an entity.
- LDS owns all DOM tools, completion/cancel actions, numeric alternatives,
  inspector feedback, focus, and narrow-region navigation. LDS3D core/R3F owns
  renderer-neutral draft validation, snap semantics, pointer lifecycle, and
  real WebGL feedback. Persistence, permissions, topology validation, and robot
  commands remain product-owned.

### Map document and external scene exchange (P2)

[OpenUSD](https://openusd.org/release/intro.html) is designed for scalable scene
interchange and non-destructive composition through layers, references and
overrides. It also does not supply a universal GUID contract for application
entities. The official
[referencing and flattening tutorial](https://openusd.org/release/tut_referencing_layers.html)
explains that flattening resolves the composed result and removes the original
composition operators. This makes USD suitable as the preferred authoring scene
interchange, but requires LK-owned stable bindings and prohibits flattening as
the normal edit round-trip path.

[Khronos glTF](https://www.khronos.org/gltf/) defines glTF as a runtime 3D asset
delivery format. The
[glTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)
defines a right-handed, Y-up, meter-based scene and permits application data in
`extras`, but it does not define LK levels, navigation graphs, door/lift
relationships, source revisions or merge semantics. GLB therefore remains the
browser/runtime asset and preview format rather than the complete authoring
document.

Isaac Sim uses USD as its standard scene format and can convert FBX, OBJ and
glTF assets to USD according to its official
[supported formats](https://docs.isaacsim.omniverse.nvidia.com/latest/importer_exporter/formats.html).
Its [environment setup](https://docs.isaacsim.omniverse.nvidia.com/latest/robot_setup_tutorials/tutorial_intro_environment_setup.html)
uses a Z-up USD stage and explicit linear units. The
[occupancy map generator](https://docs.isaacsim.omniverse.nvidia.com/latest/py/source/extensions/isaacsim.asset.gen.omap/docs/index.html)
derives occupancy from USD collision geometry. These contracts make
Isaac/OpenUSD the first reference import fixture while proving that occupancy is
a generated navigation output, not a lossless scene source.

Unreal's
[USD stage prim workflow](https://dev.epicgames.com/documentation/en-us/unreal-engine/working-with-usd-stage-prims-in-unreal-engine)
supports editing prims, transforms, references and composed stages. Its
[glTF exporter](https://dev.epicgames.com/documentation/unreal-engine/exporting-unreal-engine-content-to-gltf?lang=en-US)
can export a level or selected actors for runtime delivery, while the official
[content support reference](https://dev.epicgames.com/documentation/en-us/unreal-engine/how-the-gltf-exporter-handles-unreal-engine-content)
documents conversion limits. Unreal therefore follows the USD authoring path;
its GLB is a derived preview rather than the semantic map source.

Unity's official
[USD package documentation](https://docs.unity.cn/Packages/com.unity.formats.usd%403.0/manual/index.html)
labels the available 3.0 package experimental and documents unsupported custom
prim behavior and conversion limitations. The released
[FBX Exporter](https://docs.unity3d.com/Packages/com.unity.formats.fbx%40latest/)
is oriented to Unity/DCC content round-trip, not LK robot-map semantics. Unity
support therefore follows the common schema through an explicit exporter or
adapter and does not make an experimental Unity package the production source
of truth.

Applied decisions:

- Native Builder and External Scene Import produce one proposed renderer-neutral
  `LK Map Document`; the current Story-local `MapEditorDocument` V2 is a fixture
  precursor and is not wire-compatible by declaration.
- The logical `LK Map Bundle` separates `map.json` semantics and editable common
  structure, an optional USD authoring scene/override, and derived GLB/occupancy.
  It is a file bundle, not an npm package or an existing public export.
- Every external binding records source tool/version/document/hash, LK
  `EntityId` and, when available, a durable engine entity ID. Prim-path-only
  bindings are explicitly weak; rename/reparent yields `remap-required` rather
  than an automatic delete.
- Imported source geometry is locked by default. Web-authored semantics remain
  in a sidecar or sparse USD override, unknown source data is preserved, and
  reimport compares a saved normalized base, per-field ownership/fingerprint
  and tombstones with the new source and web edit. It yields explicit
  add/change/delete/conflict/remap results rather than overwriting files.
- Bundle save/reload, source reimport and external source write-back are separate
  capabilities. Every adapter declares them independently and may be read-only;
  writing an LK sidecar does not prove that an engine reads it.
- Coordinate conversion occurs exactly once in an importer/adapter. The
  canonical result remains right-handed, Z-up, meters, radians and normalized
  `[x, y, z, w]` quaternions regardless of the source engine convention.
- Supported round-trip covers the approved common level/floor/wall/door/asset
  transform subset, stable identity and robot semantics. Engine-native shader,
  Blueprint, `MonoBehaviour`, physics and sensor fidelity are explicitly
  excluded.
- `AssetManifestV1` and the current GLTF loader continue to describe GLB/glTF
  runtime assets only. USD support must not be added to that V1 contract merely
  to satisfy map import.
- Derived GLB/occupancy is a non-canonical cache. Its provenance records source
  artifact hash, adapter/generator version and export profile; occupancy also
  records resolution, origin, level/Z range, collision source and thresholds.
  Reproduction is guaranteed only when those declared inputs and toolchain are
  available.
- Engine SDKs stay outside core/assets/three/r3f. A separate adapter, CLI,
  plugin or product integration consumes the common schema and conformance
  fixtures.
- Native wall and route editing use polyline/graph contracts. A route width may
  render as a translucent corridor, but repeated boxes are neither its identity
  nor its serialization.

## WebGL context loss

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
