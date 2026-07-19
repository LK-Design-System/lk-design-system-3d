# Spatial primitive guide

## Purpose

LK Design System 3D owns reusable spatial and renderer behavior. It does not
create a second DOM UI system: LDS remains the owner of page shells, brand,
buttons, toolbars, drawers, panels, focus treatment, and DOM status grammar.

The public primitive catalog is reviewed in Storybook under
`LDS 3D/Primitives`, with one owner page per public API or explicit primitive
group. Each entry runs a real WebGL canvas. Stories under `States`, `Scenes`,
and `LDS Integration` prove the atoms working together; they are not the source
of truth for a new atom.

## Use the smallest semantic atom

| Atom                                              | Use it for                                                                                                                                                                        | Do not use it for                                                                                                                    | Review story                                     |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `SceneCanvas` + `CameraRig`                       | One WebGL host, camera modes, hit testing, lifecycle, and caller-owned overlay slots                                                                                              | Branded headers, camera DOM controls, drawers, retry buttons, or a product shell                                                     | `lds-3d-primitives--scene-canvas`                |
| `CoreSpace`                                       | The one fixed LK-core-to-Three basis below `SceneCanvas`                                                                                                                          | A second nested basis, a product coordinate transform, or a per-asset axis guess                                                     | `lds-3d-primitives--scene-canvas`                |
| `SceneEnvironment` / `GroundPlane` / `GroundGrid` | The one floor, grid, lights, background, fog, and optional diagnostic axes for a scene                                                                                            | A second overlapping world surface; configure it through `SceneCanvas.environment` in normal R3F composition                         | `lds-3d-primitives--scene-canvas`                |
| `Selectable`                                      | Hover and one persistent selected spatial entity                                                                                                                                  | Product commands, permission checks, DOM focus, or an invented selection visual language                                             | `lds-3d-primitives-selectable--overview`         |
| `AmrRobot`                                        | A semantic fallback AMR representation and its spatial state treatment                                                                                                            | A product-specific task card or robot command control                                                                                | `lds-3d-primitives-amr-robot--overview`          |
| `GoalMarker`                                      | Valid, preview, and invalid spatial intent                                                                                                                                        | Product confirmation UI; use LDS actions outside the canvas to commit                                                                | `lds-3d-primitives-goal-marker--overview`        |
| `PathRibbon`                                      | Actual, planned, executing, and blocked path geometry                                                                                                                             | A navigation list, route editor, or task workflow                                                                                    | `lds-3d-primitives-path-ribbon--overview`        |
| `PointCloudLayer` / `PointCloudLayers`            | One validated snapshot, or a duplicate-free set of visible snapshots with caller-resolved source-to-scene transforms and one atomic point budget, rendered as actual WebGL points | ROS/PointCloud2/PCD parsing, TF graph resolution/interpolation, streaming, implicit sampling/LOD, point picking, or a product viewer | `lds-3d-primitives-point-cloud-layer--overview`  |
| `OccupancyGridSurface`                            | One normalized trinary occupancy snapshot rendered as a framed, patterned WebGL raster                                                                                            | PGM/YAML/ROS parsing, threshold policy, raster editing, history, persistence, map commands, or product chrome                        | `lds-3d-primitives-occupancy-grid-surface--overview` |
| `MarkerLayer`                                     | One frame-scoped immutable marker snapshot rendered as actual arrow, pose, line, point, text, volume, or caller-provided mesh WebGL geometry                                      | ROS subscription/action retention, TF lookup, product topic visibility, commands, or a placeholder mesh registry                     | `lds-3d-primitives-marker-layer--overview`       |
| `SectionBox` / `EditVolume`                       | One validated scene-frame XYZ section and selectable sphere/box delete-or-restore intent                                                                                          | Point mutation, overlap ordering, preview counts, undo, permission checks, or destructive apply                                      | `lds-3d-primitives-spatial-editing--overview`    |
| `SpatialStructure` / `TransformGizmo`             | One validated Site/Building/Level tree with primitive/asset leaves, portable material slots, and snapped direct translate/rotate/scale intent                                     | Product wall schema, curve tessellation, marquee/multi-selection pivot, history, validation, save, or conflict policy                | `lds-3d-primitives-spatial-authoring--overview`  |
| `SceneStateMarker`                                | Real WebGL loading, empty, and error geometry driven by `SceneCanvas.renderState`                                                                                                 | A page-level error treatment or a replacement retry policy                                                                           | `lds-3d-primitives-scene-state-marker--overview` |
| `GltfModel`                                       | A real glTF/GLB placement with explicit source convention or manifest                                                                                                             | An undocumented file transform, product asset registry, or a generic domain asset abstraction                                        | `lds-3d-primitives-gltf-model--overview`         |

`AmrOperationalScene` and `VisualAlphaModel` are deliberate fixture assemblies.
They are appropriate for the Visual Alpha scenario and asset evidence, not the
default starting point for a product composition.

## Required composition sequence

1. Normalize product data into the public core frame: right-handed, `+Z` up,
   meters, radians, and normalized `[x, y, z, w]` quaternions.
2. Create one `SceneCanvas` for one spatial viewport and configure camera,
   lifecycle, and `environment` there.
3. Add the smallest semantic primitives for robots, goals, paths, and real
   assets. Keep selection controlled when the surrounding DOM needs to describe
   it.
   A point cloud begins with `createPointCloudSnapshot`: provide a required
   core frame, packed XYZ (and optional linear RGB) `Float32Array` data, and a
   new revision whenever its caller-retained buffer changes. Give
   `PointCloudLayer` an explicit `maxPoints`; it rejects an over-budget input
   rather than silently sampling it. For multiple topics, create a
   `PointCloudLayerSet` with unique `LayerId` values. A product adapter resolves
   each optional `sourceToScene` transform at the snapshot timestamp before the
   LDS3D boundary; `PointCloudLayers` applies that transform to the Three object
   without rewriting caller-retained point buffers. One set-level `maxPoints`
   budget is atomic: an over-budget eligible set renders none of its layers
   until the caller explicitly hides, samples, or replaces input. Eligibility
   reports requested/accepted input only; physical GPU/context state belongs to
   runtime QA rather than these atoms.
   Select `colorMode="source"` to preserve supplied linear RGB,
   `colorMode="uniform"` to force the layer fallback colour, or
   `colorMode="height"` to derive a blue-low/red-high transfer function from
   scene-frame Z. Pass one explicit `heightRange` to comparable layers so the
   same colour retains the same height meaning; when omitted, the adapter
   computes that layer's range without changing caller-owned position buffers.
   A marker layer begins with `createMarkerLayerSnapshot`: group markers that
   share one source frame and optional timestamp, resolve that frame into the
   scene through `@lk-robotics/design-system-3d-tf`, and pass the resulting
   `sourceToScene` transform explicitly. `MarkerLayer` requires `maxMarkers`,
   renders only `ready` layers, and reports hidden, empty, budget, unresolved,
   mismatch, future, stale, and clock-mismatch conditions without guessing an
   identity transform. Mesh markers require the caller's `renderMesh` slot.
   An occupancy raster begins with `occupancyGridGeometry` and
   `createOccupancyGridSnapshot`. Grid cell `(0, 0)` starts at the local
   minimum-X/minimum-Y corner, columns grow along local `+X`, rows grow along
   local `+Y`, and `gridToFrame` preserves the complete translation and
   quaternion into the scene frame. The snapshot contains caller-retained
   row-major trinary states (`unknown=0`, `free=1`, `occupied=2`) and a new
   revision whenever that buffer changes. Top-down image rows must cross the
   explicit image-pixel conversion instead of being treated as grid rows.
   `OccupancyGridSurface` requires `maxCells` and rejects a frame mismatch,
   cell-budget overflow, or GPU texture-dimension overflow without silently
   sampling or resizing the raster. Optional hover/pick callbacks reuse the
   core point projection to return a revision-bound cell sub-hit; persistent
   selection remains caller-controlled through `selectedCell`.
4. Render LDS-owned camera controls, viewport frame, DOM status, inspector, and
   actions at the docs/product composition boundary. Pass only renderer events
   and commands across the boundary.
5. Assemble representative atoms into a scenario only after their own stories
   and contracts are independently reviewable.

## Interaction and accessibility contract

- Canvas hover is transient; selection is persistent. Do not make hover the
  sole disclosure of critical state.
- Every interactive `SceneCanvas` needs an accessible name and a DOM summary of
  selected or critical spatial information. The summary complements real WebGL;
  it must not be a DOM substitute for geometry, depth, picking, or occlusion.
- Use LDS buttons, segmented controls, toolbar controls, status badges, and
  inspector patterns outside the renderer. Never add raw canvas-adjacent
  buttons or hand-built drawers from an R3F package.
- Spatial selection must not create robot commands or other product side
  effects. Products interpret the selected identifier after it crosses the
  explicit boundary.
- Occupancy cells are sub-hits of one raster, not synthesized scene entities.
  Hover is cleared independently, a pick captures revision/index/state, and a
  caller-controlled selected cell adds one WebGL outline plus a DOM summary.
- Ambient animation must respect `prefers-reduced-motion`. Static review
  stories should use `frameLoop="demand"`, `devicePixelRatio={1}`, a deliberate
  shadow budget, and `animated={false}` unless motion itself is under review.

## State grammar

Spatial state is not color-only.

- `AmrRobot` changes status geometry/material treatment and adds selected or
  hover rings when appropriate.
- `GoalMarker` assigns one invariant geometry channel to each meaning:
  physical radius uses a solid or segmented ring; orientation always uses the
  same full arrow at the ring edge; invalidity adds a central cross; and hover
  or selection uses an independent outer outline. Validity must never change
  the direction glyph, geometry, or placement.
  The [RViz goal tool contract](https://docs.ros.org/en/noetic/api/rviz/html/user_guide)
  made pose orientation explicit. The W3C guidance for
  [use of color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color) and
  [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast)
  replaced color/wireframe-only differences with stable, sufficiently thick
  unlit geometry. LDS `StatusBadge` remains the DOM label and tone owner.
- `PathRibbon` is a sampled, width-bearing planar strip rather than a circular
  tube. Actual and executing paths are continuous; executing adds a low,
  extruded 3D arrow aligned to the local path tangent; planned paths
  use dash and gap lengths of `3x` and `1.5x` the path width; blocked paths add
  two raised barriers oriented perpendicular to the local curve tangent. Hover
  and selection add a wider underlay without replacing status colour or pattern.
  [ROS 2 RViz `LINE_STRIP`](https://docs.ros.org/en/jazzy/Tutorials/Intermediate/RViz/Marker-Display-types/Marker-Display-types.html#line-strip-line-strip-4)
  changed the base geometry from a volumetric tube to a point-sequence path
  with one explicit width. The
  [Mapbox line-layer contract](https://docs.mapbox.com/style-spec/reference/layers/#paint-line-line-dasharray)
  changed planned state from triangle wireframe to dash/gap lengths expressed
  in line-width units. Mapbox `line-progress` keeps the execution indicator
  attached to an arc-length-relative path position, while
  [ROS 2 RViz `ARROW`](https://docs.ros.org/en/rolling/Tutorials/Intermediate/RViz/Marker-Display-types/Marker-Display-types.html#arrow-arrow-0)
  made its direction follow the local path tangent. LDS `StatusBadge` and product
  workflow remain the DOM owners of route status labels and commands.
- `PointCloudLayer` is either actual point geometry or no geometry. Empty,
  frame-mismatched, and over-budget snapshots report a caller-owned render
  state; they must not be disguised as transformed or truncated data.
- `PointCloudLayers` reports `degraded` while rendering valid siblings when a
  visible layer lacks a scene transform, targets the wrong scene frame, or has
  stale/future/clock-mismatched freshness. A set-level budget violation remains
  atomic and renders no eligible siblings.
- `MarkerLayer` preserves shape semantics: arrows point along local `+X`, pose
  axes retain three directional arrows, line strips preserve ordered segments,
  points remain discrete spheres, text is a WebGL sprite, and volumes remain
  real depth-tested geometry. Persistent selection adds an independent outline
  ring, so marker kind and selection never rely on colour alone.
- `OccupancyGridSurface` preserves categorical meaning with cell boundaries,
  a checker treatment for unknown cells, and a diagonal treatment for occupied
  cells in addition to palette differences. It renders either the complete
  accepted raster or no raster; frame, cell-budget, and texture-dimension
  failures are exposed to caller-owned LDS/product DOM through
  `onRenderStateChange`. `onCellHoverChange` and `onCellPick` expose the same
  immutable core cell result, while `selectedCell` adds a separate line-loop
  geometry so persistent selection is not a palette change alone.
- `SceneStateMarker` is real scene geometry. If a DOM status is needed, enable
  `showStatusOverlay` and let the owning LDS composition present recovery
  actions.

## Asset and coordinate boundary

- `GltfModel` requires either an explicit `sourceConvention` or a validated
  manifest. Never infer axes, scale, bounds, or a core transform from a
  filename.
- A product owns its asset registry, workflow state, transport, permissions,
  and command policy. LDS3D owns placement, lifecycle, spatial interaction, and
  renderer adaptation.
- New domain-level atoms such as `AssetInstance`, `Landmark`, or
  `SpatialLabel` are not public yet. `WorldLabel` and related helpers inside
  Visual Alpha are scenario-local evidence, not an API to copy. Its DOM content
  uses public LDS `ContentBadge` for the spatial label and `StatusBadge` for
  runtime/phase text; the `Html` wrapper only anchors that composition to real
  geometry. A proposal for a reusable label must first define its frame,
  depth/occlusion, overlap, scale, selection, accessibility, and reduced-motion
  contract.

### 2D reference and occupancy raster coordinate semantics

This subsection is the authoritative statement of raster-to-level coordinate
mapping for both the 2D reference image a user traces over and the derived ROS
occupancy raster. ADR-0002 (`공통 맵 의미`) and IMPLEMENTATION_PLAN (M5-A/M5-C)
reference this subsection instead of restating these rules.

- A source raster (2D reference image or occupancy PNG) addresses pixels with
  pixel `(0, 0)` at the top-left of the image and `rowFromTop` growing
  downward (`OccupancyGridImagePixel`, `packages/core/src/occupancy-grid.ts`).
- Grid/level space is Y-up in-plane: occupancy cell `row 0` is the grid's
  minimum-Y row, columns grow along local `+X`, and rows grow along local
  `+Y`. Image space and grid space therefore differ by a vertical row flip,
  `cell.row = heightCells - 1 - pixel.rowFromTop` (`occupancyImagePixelToCell`),
  and `occupancyCellToImagePixel` is its exact inverse.
- A calibrated anchor pixel maps to a metric level-frame pose by flipping the
  pixel to its cell, scaling by `resolutionMeters` (meters-per-pixel), and
  applying the grid's `gridToFrame` rigid transform, which carries the level
  origin, yaw, and elevation. The anchor pixel plus meters-per-pixel, origin,
  and yaw fully determine the pose; no axis, scale, or origin is inferred from
  the file.
- ROS occupancy YAML uses a lower-left origin: `origin` is the metric position
  of the bottom-left cell and `data` is row-major from that bottom-left row
  (`occupancyCellDataIndex = row * width + column`). This is consistent with
  grid `row 0` = minimum-Y, which is exactly why the top-left image row is
  flipped on import and export.
- Every adapter and the Native Builder reference calibration must ship an
  `image -> level -> image` round-trip fixture proving the anchor pixel is
  restored (image pixel -> level pose -> image pixel), alongside the ROS
  `cell <-> dataIndex` round-trip.

## Occupancy-grid LDS composition audit

Baseline: the current sibling LDS checkout is commit
`f0da24fbeac95a96c793851673aca9e2bc31cc60`, package
`@lk-robotics/design-system-core@0.1.0`, with a dirty worktree. The closest
public evidence is `Scene3DFrame`, `ViewportStatusBar`, `ViewerToolbar`, the
public viewer stories, and the LDS StoryGuide decorator in Storybook `10.4.6`.
This technical story uses those inspected public contracts, but LDS visual
parity is unverified while the live baseline contains uncommitted changes.

| Reading/anatomy region                                                | Owner and mapping                                                                                                      |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Technical identity, review evidence, accessible raster summary, and keyboard selection proof | Existing docs composition using public LDS `DescriptionList`, `StatusBadge`, and `Button`; no product application routing or document commands |
| Viewport identity, state, status, and any camera controls             | Public LDS `Scene3DFrame`, `ViewportStatusBar`, and `ViewerToolbar`                                                    |
| WebGL host, fixed core/render basis, and context lifecycle            | LDS3D `SceneCanvas` / `CoreSpace`                                                                                      |
| Framed occupancy texture, depth, origin yaw, and categorical patterns | LDS3D `OccupancyGridSurface`                                                                                           |
| PGM/YAML/ROS loading, thresholding, editing, history, save, and retry | Product adapters and workflow; intentionally absent from the primitive Story                                          |

The reading order is technical identity -> dominant viewport -> passive
coordinate and render-state summary. At constrained widths the same single
viewport remains primary and the LDS summary wraps below it; no editor shell,
drawer, inspector, raw button, or custom status surface is introduced. The
retained visual delta is spatial only: one actual WebGL raster is rotated by
its full `gridToFrame` transform, with cell lines and categorical patterns that
do not rely on colour alone. The renderer owns no DOM focus, action, threshold,
editing, or persistence behavior. The Story's LDS buttons advance and clear the
same controlled selection as pointer picking, and a polite DOM announcement
reports the selected cell without making the headless renderer own keyboard UI.

The raster's pixel-to-cell row flip, anchor-pixel-to-level-pose mapping, and
ROS occupancy YAML lower-left origin are not redefined here; they follow the
`2D reference and occupancy raster coordinate semantics` rules under
[Asset and coordinate boundary](#asset-and-coordinate-boundary) above.

## Point-cloud layer-set LDS composition audit

Baseline: LDS commit `f0da24fbeac95a96c793851673aca9e2bc31cc60`, package
`@lk-robotics/design-system-core@0.1.0`, dirty worktree. The closest public
contracts are `Scene3DFrame`, `ViewerFrame`, `ViewerToolbar`, `StatusBadge`,
`DescriptionList`, `CanvasEditorShell`, `SelectionInspector`, and
`ViewportStatusBar`. LDS Storybook `10.4.6` and LDS3D Storybook `9.1.10` both use
docs/a11y addons, the same Base/Card/Navy/Dark backgrounds, LDS theme decorators,
and audience-first story ordering; the major-version difference is not changed
as part of this capability. LDS visual parity remains unverified against the
dirty live checkout.

| Reading/anatomy region                                                            | Owner and mapping                                                                                                                      |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Page identity and review metadata                                                 | Existing docs composition using LDS `Container`, `StatusBadge`, and `DescriptionList`; no product application routing or command bar                 |
| Wide workspace and narrow transition                                              | Existing `CanvasEditorShell`; narrow mode preserves the viewer first and uses the existing LDS `Drawer` for optional selection details |
| Viewport identity, state, HUD, and camera controls                                | LDS `Scene3DFrame`, `ViewportStatusBar`, `ViewerToolbar`, and `ViewerToolbarButton`                                                    |
| WebGL host and core/render basis                                                  | LDS3D `SceneCanvas` / `CoreSpace`                                                                                                      |
| Multi-topic point geometry and supplied frame bindings                            | LDS3D `PointCloudLayers` composed from renderer-neutral `PointCloudLayerSet`                                                           |
| ROS subscriptions, TF lookup/interpolation, sampling, recording, mapping commands | Product-owned and intentionally absent from Storybook                                                                                  |

Visual-delta inventory: no new DOM surface, spacing, typography, radius, border,
elevation, icon, focus, or responsive rule is introduced. The only visual delta
is WebGL content: two point clusters share one explicit scene-Z transfer
function, one cluster receives an explicit rigid transform, and the existing LDS status
summary reports ready/degraded/budget state. Keyboard order remains page
identity → review fixture control → viewer controls → optional inspector, matching
the existing composition. The scene remains the dominant region at wide and
narrow widths.

## MapConvert3D spatial-editing audit

Product evidence: read-only `lk_web_viz` checkout
`a984def117c05acd213f494cbb8a42e990595505`, specifically
`MapConvert3DScreen` and `PointCloudViewer`. The representative task is to
preview a PCD, constrain its XYZ range, place and revise sphere/box edit
volumes, inspect the affected sample, and only then ask the product service to
apply or extract data. The following acceptance boundary is fixed before the
reusable primitives are implemented:

The workflow-comprehension revision was re-audited on 2026-07-19 against the
sibling LDS package `@lk-robotics/design-system-core@0.1.0`. The live sibling
checkout is `f0da24fbeac95a96c793851673aca9e2bc31cc60` with a dirty worktree.
The closest public contracts are `CanvasEditorShell`, `EditorToolbar`,
`Scene3DFrame`, `SelectionInspector`, `FormField`, `NumberField`, `Button`,
`ConfirmDialog`, `SegmentedControl`, and `ViewportStatusBar`. LDS Storybook
remains 10.4.6 with docs and accessibility addons, background-driven
appearance, and the overview/usage/variants/interaction/responsive/scenario
ordering contract. The composition mapping is reviewed, but visual parity is
unverified until it is compared against a clean pinned LDS baseline.

The revised page anatomy is document identity -> side work-mode rail ->
contextual delete-tool menu -> dominant viewport -> selected-object inspector
-> passive status. The Story starts in `선택` mode with no deletion volume,
operation glyph, or selected object. The public LDS `EditorToolbar` owns the
side `선택 / 영역 삭제` modes. Entering `영역 삭제` opens the public LDS
`DropdownMenu`, whose named trigger is `삭제 도구 · <현재 도구>`. Its radio
items contain the subordinate `구 범위 배치`, `축 정렬 상자 범위 배치`, `삭제
영역 이동`, and `삭제 영역 크기 조절` tools. A public LDS `Divider` separates
that contextual trigger from the parent toolbar. This avoids presenting
workflow, shape, and manipulation choices as five peer tools. Only after a
placement item is active and the user clicks the WebGL ground plane does the
Story create and select a transient volume. Returning to `선택` preserves the
draft and keeps it available for later manipulation. Wheel zoom and camera
navigation remain available while a placement, move, or resize mode is idle;
camera input is suspended only for the duration of an actual transform-handle
drag. Only `배치 취소` or Escape discards the draft.

While the delete volume is still a draft, the Story partitions the caller-owned
fixture into retained and affected snapshots without mutating the source. The
retained points use a low-prominence neutral material; affected points remain
visible in the scene theme's error color and at a larger point size. The
inspector mirrors this with the expected point count and percentage, so the
preview does not depend on color alone. Confirming the preview is the only
transition that hides the affected snapshot. Snapped transform changes
repartition the 5,000-point review fixture during direct manipulation; this is
Story-owned CPU evidence rather than a large-cloud renderer masking contract.

Pinned `lk_web_viz` evidence at
`a984def117c05acd213f494cbb8a42e990595505` already exposes sphere and box
delete volumes. It places or repositions a selected volume by clicking the
viewer, moves X/Y/Z in 0.2 m hold-repeat steps, resizes radius or box extents in
0.1 m steps, previews the removed sample, and applies the full PCD mutation only
on Save. It does not provide direct transform handles. LDS3D preserves that
sphere/box and delayed-apply capability while making the spatial gap directly
reviewable: the shared LDS3D `TransformGizmo` is used through a scene-local
adapter for drag translation and uniform-sphere/non-uniform-box resize, while
LDS `FormField`/`NumberField` provide exact keyboard-operable values. The
adapter maps the already core-frame volume pose into a same-frame transform and
maps each snapped gesture result back into a fresh immutable volume contract.
This does not add a mutable transform API to the headless `EditVolume`
primitive. The shared gizmo owns pointer capture and suspends camera controls
only during an active handle drag; committed positions remain Z-up core-frame
values. Metric input and drag results are normalized to millimetre precision.

This technical Story intentionally reviews one transient draft at a time. The
product's multi-volume chip list, ordered delete/restore composition, hold-repeat
buttons, and persistence remain product workflow rather than reusable LDS3D
primitive behavior.

The inspector's public LDS `actions` slot owns `배치 취소` and the danger
`선택 영역 삭제` button. The destructive action opens the public LDS
`ConfirmDialog`; confirmation derives a fresh PointCloud snapshot with the
enclosed sphere or oriented-box points omitted and removes the transient volume,
while the shell's document-level undo restores the caller-retained snapshot. On a narrow surface,
`CanvasEditorShell.mobileActiveRegion` and `SegmentedControl` switch between the
canvas and properties regions without inventing a second drawer or toolbar.

Ownership is explicit: LDS owns the editor shell, tool controls, viewport frame,
status, inspector, numeric fields, buttons, and confirmation behavior. LDS3D
owns the actual PointCloud, edit-volume geometry, depth, picking, and renderer
coordinate conversion. The docs Story owns only the local transform adapter,
fixture state, and derived in-memory preview; the product still owns production
hit calculation, persistence, permissions, command dispatch, and undo history.
The retained visual delta is spatial only: a draft WebGL volume and selected
transform handles appear after placement. No custom DOM surface, button,
typography, radius, elevation, focus rule, or responsive rule is introduced;
the small inspector field grid is layout-only composition of public LDS fields.

| Reading/anatomy region                                                                                      | Owner and mapping                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Route identity, source browser, conversion method, parameters, progress, save/apply actions, and errors     | Product workflow composed from public LDS DOM components; absent from a technical primitive Story                                        |
| Story document identity, parent work modes, contextual delete-tool menu, and local preview undo             | LDS `CanvasEditorShell`, `EditorToolbar`, `DropdownMenu`, `Divider`, and `CanvasEditorCommandBar`; the Story supplies only fixture state |
| Spatial viewport frame, camera controls, status, selection summary, and inspector                           | LDS `Scene3DFrame`, `ViewerToolbar`, `ViewportStatusBar`, `DockPanel`, and `SelectionInspector` at the docs/product composition boundary |
| Narrow canvas/properties navigation                                                                         | LDS `SegmentedControl` driving `CanvasEditorShell.mobileActiveRegion`; no custom drawer or breakpoint-only hidden action                 |
| Actual PCD, XYZ section bounds, edit-volume geometry, depth/occlusion, picking, selected outline, and drag  | LDS3D WebGL content inside one `SceneCanvas`; a scene-local shared `TransformGizmo` adapter maps immutable volume contracts             |
| Point inclusion, preview counts, undo history, server request payloads, permissions, and destructive commit | Product-owned; an LDS3D edit volume describes intent and never mutates point data or dispatches a command                                |

Wide reading order is document identity -> side work-mode rail -> contextual
delete-tool menu -> dominant viewport -> persistent inspector -> passive
status. Narrow order preserves one primary region at a time and uses the
approved LDS canvas/properties region switch. The technical Story omits product
routing and service commands while retaining the complete editor interaction
fixture.

Visual-delta inventory: the new content is spatial only. A section box uses six
explicit bounds faces/edges; edit intent uses a translucent sphere with three
sparse great-circle rings or an oriented box with its 12 actual edges. A single
subtle selection halo replaces the previous doubled full-triangle wireframe.
Delete and restore differ by tone and a compact top-mounted minus/plus cue, not
color alone; the former oversized four-axis X is removed. No new DOM surface,
button, slider, typography, radius, elevation, focus rule, or responsive grid is
introduced. Sectioning is a declarative visualization
contract; renderer/material clipping remains an opt-in adapter concern and may
not silently alter caller geometry. Axis-aligned bounds are the initial product
parity target; the edit-volume box retains a full `Pose3` so later oriented
placement does not require a breaking contract.

## MapEdit ownership and composition audit

Product evidence: read-only `lk_web_viz` checkout
`a984def117c05acd213f494cbb8a42e990595505`, specifically `MapEditScreen`,
`ZoneEditor`, `PgmEditor`, and `PcdMap3DPanel`. The representative task switches
between object and PGM editing, selects one mutually exclusive tool, edits the
dominant 2D map, revises product properties, and saves the active document.
`PcdMap3DPanel` is an optional second view of the same product-owned zone data;
it does not turn the whole workflow into an LDS3D surface.

The LDS baseline is commit `f0da24fbeac95a96c793851673aca9e2bc31cc60`,
package `@lk-robotics/design-system-core@0.1.0`, with a dirty worktree. The closest public
contracts and stories are `CanvasEditorShell`, `CanvasEditorCommandBar`,
`EditorToolbar`, `HistoryToolbar`, `LayerPanel`, `SelectionInspector`,
`ViewportStatusBar`, and the public LDS form/actions. Their existing editor
stories already exercise a dominant map canvas, document commands, a tool rail,
docked properties, and one-active-region narrow navigation. No new LDS or
LDS3D DOM primitive is required for this screen. This is a component and anatomy
mapping only; LDS visual parity is unverified against the dirty live baseline.

| Reading/anatomy region                                                                                                | Owner and mapping                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Map identity, active-document description, back navigation, undo/redo, and active-mode save                           | LDS `CanvasEditorShell` header and `CanvasEditorCommandBar`; the product supplies history stacks, dirty state, handlers, and labels                                                                                    |
| Object/PGM mode switch                                                                                                | LDS `Tabs` or `SegmentedControl` in the shell `subheader`; the product owns which tool set, canvas, property form, and save path each mode activates                                                                   |
| Select/polygon/line/landmark and brush/line/rectangle/polygon tools                                                   | LDS `EditorToolbar`; the product owns tool semantics and edit transactions                                                                                                                                             |
| PGM raster, map image, zones, lines, landmarks, handles, pixel algorithms, zoom/pan state, and gesture interpretation | Product-owned 2D canvas implementation; neither LDS nor LDS3D owns Konva, raster mutation, domain geometry, or its persistence model                                                                                   |
| Selected object and mode settings                                                                                     | LDS `SelectionInspector` plus public LDS `Input`, `NumberField`, `Select`, `Slider`, `RadioGroup`, `Button`, and `IconButton`; the product owns validation, field schema, delete/complete actions, and selection state |
| Object/layer list when retained as a real display hierarchy                                                           | LDS `LayerPanel`; do not duplicate the same selection list inside a second custom inspector surface                                                                                                                    |
| Loading, unavailable, empty, dirty, tool, zoom, map size, and save feedback                                           | LDS `ResourceState`, `EmptyState`, `StatusBadge`, and `ViewportStatusBar`; the product owns async requests and error/retry policy                                                                                      |
| Optional PCD view: actual points, camera, depth, zone overlay, spatial selection, and accessible spatial summary      | LDS3D `SceneCanvas`, `PointCloudLayers`, and controlled spatial selection inside an LDS `Scene3DFrame`; the product resolves PCD/TF data and owns all zone mutations                                                   |

Wide reading order is document identity and commands -> mode -> tools -> dominant
2D map -> persistent properties -> passive status. The optional PCD view is a
secondary product composition and must not take equal-card priority over the 2D
editor. On narrow widths, `CanvasEditorShell.mobileActiveRegion` and
`responsiveNavigation` expose one of canvas, hierarchy, or properties at a
time. The PCD view becomes a deliberate viewport mode or secondary task; it may
not disappear behind a desktop-only breakpoint without another reachable path.

Visual-delta inventory: migration removes the handwritten header, tab strip,
tool rail, floating forms, side sheet, close button, sliders, status text, and
action styling in favor of the public LDS owners above. It introduces no new
LDS3D DOM surface, typography, spacing, radius, elevation, focus behavior, or
responsive grid. The retained visual differences are content-owned: grayscale
PGM pixels, map annotations, domain handles, and real WebGL point/zone geometry.
PGM color values `0`, `205`, and `254`, brush rasterization, two independent
history stacks, object schemas, save encoding/upload, and PCD sampling remain
product contracts. LDS3D must not absorb them merely to claim screen coverage.

Acceptance is therefore split. The LDS composition can cover the complete
application chrome once the product migrates to public LDS components. LDS3D
already covers the optional PCD host and point rendering foundation, while 3D
zone-vertex drag and stair-control editing remain an unimplemented spatial
authoring gap. That gap requires a frame-aware manipulation contract and may not
be filled by exposing `lk_web_viz` callbacks or copying its raw R3F handles.

## Building and SiteAuthoring foundation audit

Product evidence: read-only `lk_web_viz` checkout
`a984def117c05acd213f494cbb8a42e990595505`, specifically
`BuildingTopology3DView`, `FloorScene3D`, `SiteStructurePreview3D`, and
`SiteAuthoringScreen`. The reusable slice is a framed Site/Building/Level tree,
floor elevation, primitive floor/wall/object geometry, portable material
parameters, selection, and transform change intent. Building graph routing,
PGM/PCD generation, zone/stair semantics, asset presets, history, save/revision,
and screen composition remain product-owned.

The LDS DOM audit began against sibling commit
`f0da24fbeac95a96c793851673aca9e2bc31cc60` with a dirty worktree. The final
read-only recheck used commit `679859bc8b5126bcff7146eaedd871bbe9e62891`,
package `@lk-robotics/design-system-core@0.1.0`, with no tracked changes and one
unrelated untracked reference artifact. The relevant public component
implementations, type declarations, exports, Storybook configuration, and
closest stories did not change between those commits. LDS Storybook remains
`10.4.6`; the LDS3D docs app remains on `9.1.10`, so equivalent behavior is
audited rather than claiming major-version equality or visual parity. Visual
parity remains unverified because a complete side-by-side review against a
pinned LDS build was not performed. The closest public contracts and stories
are `CanvasEditorShell`, `CanvasEditorCommandBar`, `EditorToolbar`, `Tree`,
`FloorSelector`, `SelectionInspector`, `NumberField`, `Select`,
`ConfirmDialog`, `Modal`, `ViewportStatusBar`, and `Scene3DFrame`. The docs app
continues to consume only public LDS exports and the official CSS entry. Its
local `link:` dependency is suitable for this review but is not release
portability evidence.

| Reading/anatomy region                                                                                                                                                           | Owner and mapping                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Document/site identity, import/generate/save, dirty state, undo/redo, permissions, errors, and revision conflict                                                                 | Product workflow composed with LDS `CanvasEditorShell` and `CanvasEditorCommandBar`                                                    |
| Level/object hierarchy, floor navigation, and active selection                                                                                                                   | `FloorSelector` covers level switching, but the current public shell/`Tree` contract does not cover a controlled selectable structure tree; this is an LDS gap, not an LDS3D custom-panel opportunity |
| Translate/rotate/scale mode, snap values, material/property fields, delete/duplicate, and keyboard alternative                                                                   | LDS `EditorToolbar` and public form/actions create the same renderer-neutral change intent; `SelectionInspector` applies only when an entity is selected |
| Site/Building/Level placement, floor elevation, primitive/asset nodes, PBR factors, depth, picking, selected outline, and transform handles                                      | LDS3D core contracts and actual WebGL primitives inside one `SceneCanvas`                                                              |
| Wall curves, navigation graph, PGM floor texture mapping, product asset presets, marquee/multi-selection pivot, and final validation | Unimplemented in this audited foundation. ADR-0002/M5 promotes the common wall/graph subset to a later LDS3D capability review; product-specific policy and workflow remain product-owned |

Wide reading order is document commands -> transform tools -> hierarchy ->
dominant viewport -> properties -> passive status. Narrow composition exposes
one main editor region through `CanvasEditorShell.mobileActiveRegion`; it keeps
the same document identity and provides numeric/keyboard transform access when
the canvas handles are not practical. The Storybook technical primitive omits
product chrome. Its linked integration scenario uses the actual LDS shell and
keeps the viewport dominant.

Visual-delta inventory: new visuals are limited to real spatial content: stacked
levels, floor/wall/object geometry, top/side material slots, selection outline,
and axis/ring transform handles. Axis identity uses X/Y/Z geometry and labels in
addition to colour. No DOM toolbar, panel, field, button, status, typography,
radius, border, elevation, or responsive layout is introduced by LDS3D.
Translation arrows, rotation rings, and scale handles now emit start-relative
snapped previews followed by one commit, or restore the pointer-down transform
through one cancel on lost capture, pointer cancellation, Escape, unmount, or
policy change. Camera controls recover their exact prior enabled state. LDS
numeric and keyboard controls remain equivalent non-drag alternatives; marquee
selection remains out of scope. This closes the reusable manipulation gap
without copying the product's bespoke overlay UI.

The table above records the narrower foundation audit at the time it was made.
It is not a rejection of ADR-0002's later polyline-wall and waypoint-edge graph
direction. Those capabilities require new contracts and evidence; the existing
box-wall fixture and product topology code are not sufficient implementation
proof.

### Map-building editor implementation decision

The integration Story is a bounded, executable map-authoring composition, not a
second product application. It demonstrates reusable authoring gestures without
taking ownership of backend storage, route execution, permissions, revision
conflicts, or product validation. The Story may own one in-memory document and
bounded undo/redo history for interaction evidence; it must not add local-save,
import/export, snapshot, transport, or command semantics.

That Storybook exclusion applies to product workflow and external side effects,
not to the common exchange direction. [ADR-0002](ADR-0002-DUAL-PATH-MAP-AUTHORING.md)
adopts Native 2.5D Builder and External Scene Import as two entries into one
proposed map contract. Storybook may later review deterministic normalization,
source-lock and diff fixtures, but it must not imitate a file wizard, engine
session, revision approval screen or production save flow.

The page anatomy and keyboard/reading order are fixed before implementation:

1. `CanvasEditorShell` header: fixture identity and scope only; product document
   commands are intentionally absent.
2. `EditorToolbar`: selection, transform, route, area, goal, primitive, and asset
   tools.
3. Left shell region: `FloorSelector` plus a real display-layer tree only when
   one exists. A selectable level/object structure tree is currently an LDS
   ownership gap and is not fabricated in LDS3D.
4. Dominant center: one embedded `Scene3DFrame` containing the actual WebGL
   `SceneCanvas`, completed spatial entities, the active draft, snap cues, ghost
   placement, and transform handles.
5. Docked right region: `SelectionInspector` only for a selected entity. Active
   tool/draft options and import mapping use a product-owned composition of
   public LDS fields/actions inside the shell-owned panel surface.
6. Passive footer: `ViewportStatusBar` for frame, unit, tool, active level, and
   draft state; it does not duplicate commands or selection details.

`LayerPanel` is deliberately not used as the object hierarchy. Its public prompt
defines `activeLayerId` as a display-layer key rather than a canvas-object
selection. The current public `Tree` lacks controlled selection, selected state,
lock/visibility, import mapping, diff/validation status and row actions; the
current Story mounting it in `CanvasEditorShell.layers` is provisional
composition debt, not an approved reusable pattern. Before a production
structure panel is implemented, choose explicitly between an additive LDS
structure slot/richer tree contract and a product-owned structure composition.
That scope decision is not approved by this LDS3D documentation change. Until
then the integration Story must omit the structure panel or use `LayerPanel`
only for genuine display layers.

On wide surfaces, the viewport remains the dominant region beside only the
approved supporting panels. On narrow surfaces,
`CanvasEditorShell.mobileActiveRegion` plus its public responsive navigation
exposes exactly one of scene, an approved hierarchy/layer region, or properties.
`CanvasEditorCommandBar` has no automatic overflow contract, so a narrow product
command bar reaches lower-priority document commands by composing the public LDS
`DropdownMenu` and an LDS action trigger into `CanvasEditorCommandBar.children`; a
custom overflow menu is forbidden. A reusable automatic-overflow behavior that
detects width and collapses commands is a separate additive LDS gap and is not
owned or built by LDS3D here. Finishing a canvas
gesture does not force an unexpected switch to the properties region. Every
declared shortcut must be backed by a handler that ignores editable fields and
IME composition.

| Surface or behavior | Owner |
| --- | --- |
| Shell, tools, floor navigation, fields, actions, status, focus, display layers, and responsive region switching | LDS public components; selectable structure hierarchy remains an unresolved LDS/product ownership decision |
| Frames, draft validation, snap results, transform preview/commit/cancel, picking, GLB normalization, and actual WebGL route/area/goal/ghost geometry | LDS3D core/assets/R3F |
| In-memory document reducer, ID allocation, active level/tool/selection, bounded undo/redo, one-gesture transactions, and keyboard routing | Docs Story composition (product-boundary example) |
| Persistence, transport, authentication, permissions, conflict resolution, domain schemas, generated topology, and production validation | Product; intentionally absent |

#### Dual-path authoring scope

The current `apps/docs/src/map-editor-model.ts` schema is a Story-local fixture,
not `LK Map Document v1`. Its boxes, columns, asset placement, route polylines,
areas and goals prove interaction and serialization behavior only. It has no
source binding, reimport hash/diff, door/lift/charger/dock or shared
waypoint-edge graph, so it is not wire-compatible with the future exchange
contract by declaration.

Native Builder is a robot-map-focused 2.5D authoring surface rather than a
browser replacement for Blender, Unity or Unreal. Its target spatial tools are:

- level/elevation and a locked 2D reference;
- polygon floor boundaries and continuous wall centerlines with
  thickness/height;
- wall-attached openings/doors and explicit level transitions;
- waypoint-edge route graphs, areas, goals, chargers and docks;
- catalog asset instances with ghost placement, bounds and snap validation.

A wall gesture captures a polyline and derives wall geometry from its declared
properties. A route gesture captures a centerline or graph and carries width,
direction and traversal constraints as data. Width may appear as a translucent
selected/validation corridor, but neither wall nor route is authored,
serialized or installed as repeated blocks.

External Import uses the same frames, level ownership, stable `EntityId`,
selection and semantic overlays. Imported source geometry is locked by default;
only a recognized common primitive may be converted to editable structure after
an explicit product decision. The V1 Isaac/OpenUSD golden fixture takes as input
a versioned LK mapping manifest plus namespaced, durable (`lk:`-prefixed) entity
metadata, not arbitrary mesh geometry or prim-name inference; a common primitive
is recognized from that manifest and metadata, never inferred from mesh shape or
scene-graph names. Reimport uses durable source IDs when available
and a saved normalized base/per-field ownership for 3-way diff. Path-only
bindings are weak and become `remap-required` after rename/reparent instead of
being auto-deleted. File selection, source registry, merge choice, overwrite,
revision and persistence remain product-owned.

The integration page anatomy does not grow a second import shell. In a product,
import/reimport/export/save/history are document commands in the LDS
`CanvasEditorShell` header, while camera controls stay in `Scene3DFrame`.
Structured importer and validator results map through LDS forms,
`ValidationSummary`, `ResourceState` or `EmptyState`; LDS3D supplies data and
WebGL evidence, not custom DOM presentation.

The right panel changes owner by task rather than forcing every state into
`SelectionInspector`:

| Editor context | Panel content |
| --- | --- |
| selected entity | LDS `SelectionInspector` with entity-scoped fields/actions |
| active draw/placement draft | Product composition of LDS fields/actions; no fake selected item |
| import calibration or level mapping | Product review form using LDS fields, actions and issue links |
| no selection in selection mode | `SelectionInspector` empty state |
| document validation or reimport conflicts | Product-owned review composition; `ValidationSummary` only for user-correctable blocking fields |

Importer/validator issues are renderer-neutral records with stable `id` and
`code`, `severity`, `scope`, optional `levelId`/`entityId`/`fieldPath`, optional
scene-frame bounds and deterministic order. Severity describes the finding; the
product separately decides whether it blocks save/export. Unmapped entities,
spatial warnings and diff states synchronize a non-colour viewport cue, the
available hierarchy/list and a DOM summary. `ResourceState` owns asynchronous
resource failure, `Scene3DFrame` owns renderer availability, and
`ValidationSummary` is not used as a generic diagnostic log.

The pure import-review sequence is fixed as parsing → axis/unit/origin review →
level mapping and unmapped review → locked-source preview with semantic overlay
→ ready or invalid. Reimport ends in a review-only diff until the product applies
it. A 2D reference additionally records source hash, active `levelId`,
meters-per-pixel, origin, yaw, opacity and lock state before tracing can start.
Storybook seeds each state from fixtures instead of performing real file I/O.

Current visual/model debt is explicit. The current Story renders opaque corridor
planes for every route segment and represents fixture walls as independent
boxes. The replacement acceptance is default centerline+vertices+direction,
conditional translucent corridor only for selection/validation, and one
polyline-wall identity that generates its mesh. Current screenshots cannot be
used as completion evidence for that target grammar.

The spatial authoring contract is influenced by the following official category
references, not cloned from their UI:

- The [RMF Site Editor](https://github.com/open-rmf/rmf_site) treats a site as a
  level-aware editable deployment model. The official
  [Traffic Editor guide](https://osrf.github.io/ros2multirobotbook/traffic-editor.html)
  defines vertices as shared inputs to walls, floor polygons, measurements, and
  lanes; levels own elevation and annotations; and navigation lanes connect
  waypoints with direction and graph semantics. Therefore every route, area,
  goal, primitive, and asset in the Story has an explicit `levelId`; a route is
  ordered vertices plus traversal metadata, and an area is a polygon, not a
  renamed structure box.
- [QGIS 3.44 editing](https://docs.qgis.org/3.44/en/docs/user_manual/working_with_vector/editing_geometry_attributes.html)
  uses repeated point capture for lines and polygons, a rubber-band preview,
  snapping cues and tolerance, last-node removal, and an explicit finish. The
  Story therefore keeps route/area geometry in a draft session: pointer hover
  previews only, each click appends one point, `Backspace` removes the last
  point, and `Enter` or an LDS `Complete` action validates and commits. Escape
  cancels the draft without adding history. The first click never invents a
  second route point or expands into a rectangular area.
- The official [ROS 1 Noetic RViz 2D Nav Goal tool](https://docs.ros.org/en/noetic/api/rviz/html/user_guide)
  sets position with a ground-plane press and heading with the drag direction.
  Goal authoring follows the same position-plus-heading gesture and rejects a
  heading drag shorter than the declared tolerance instead of committing yaw
  zero silently.
- Unreal's official [actor placement](https://dev.epicgames.com/documentation/unreal-engine/placing-actors-in-unreal-engine?lang=en-US),
  [surface/grid/vertex snapping](https://dev.epicgames.com/documentation/unreal-engine/actor-snapping-in-unreal-engine?lang=en-US),
  and [`AActor` preview contract](https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Runtime/Engine/AActor)
  distinguish a dragged editor-preview actor from the committed instance and
  expose collision-on-placement policy. Object and asset tools therefore render
  a non-persistent ghost at the raw or snapped candidate, identify the snap kind,
  and add an explicit validity result before one pointer-up/click commit.

Draft and committed geometry remain different contracts. A route draft is a
continuous line with a cursor segment and vertex/snap markers; a completed route
uses route geometry and may expose directionality. `PathRibbon` remains a
runtime path-status primitive, not the editor's draft model. An area draft and
completed area are planar polygons with boundary and fill; they are never
installed as extruded floor blocks. Preview state never mutates the document,
marks it dirty, or consumes undo history. A valid finish or placement emits one
immutable commit boundary. The Story maps it to one local history entry;
production history and Undo policy remain product-owned.

Core draft validation, the Story-local document model, and the WebGL polygon
adapter share the same linear and area tolerances. A polygon that is too small,
non-planar, self-intersecting, or contains indistinguishable vertices is rejected
before document commit and cannot disappear only at render time. The fixture's
bounded placement policy requires the complete object footprint to stay inside
the active floor and not overlap an existing wall, object, or asset. That guard
drives both the ghost state and commit availability; production collision and
clearance policy remains product-owned. The TRON fixture derives its asymmetric
footprint from the approved manifest bounds, persists those bounds on the asset
node, and uses the same center offset for the ghost and later collision checks.

Pointer down/move/up, cancellation, and camera ownership are explicit. A camera
drag, multi-pointer gesture, lost capture, or invalid finish cannot create an
entity. While a left-button authoring gesture owns the ground plane, orbit input
is suspended; it resumes after commit or cancellation. Between point commits,
wheel and secondary-button camera navigation remain available without clearing
the draft. Snap targets come only from the active level and preserve whether the
result came from the metric grid or an existing vertex. Numeric point/heading
fields and LDS actions provide the non-dragging alternative required by
[WCAG 2.2 Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html).

The visual-delta inventory is spatial only: route lines, polygon boundaries and
fills, heading arrows, snap markers, and translucent placement ghosts. No
custom DOM button, panel, header, radius, border, elevation, typography, focus
rule, or alternate responsive grid is introduced. Product `lk_web_viz` remains
gap evidence only; its bespoke callbacks, history behavior, and UI are not
copied. The final LDS recheck found no tracked changes to the mapped public
components, but a complete pinned-build side-by-side was not performed, so LDS
visual parity remains unverified.

## Storybook review sequence

For every reusable spatial primitive, keep this review order:

1. Overview and ownership.
2. Minimal usage in actual WebGL.
3. Variants and state grammar.
4. Hover, selection, keyboard/DOM summary, and reduced motion where applicable.
5. Narrow or constrained-width behavior at the composition boundary.
6. A real scenario that combines already-approved atoms.

The primitive story must remain a technical contract, not a custom product page.
Visual parity for DOM chrome is reviewed against the closest LDS public
component separately from spatial-rendering correctness.

## Storybook information architecture and naming

The public navigation follows ownership rather than implementation phase:

1. `Foundations` — coordinates, frames, renderer hosts, and contract fixtures.
2. `Assets` — manifest and validation contracts.
3. `Primitives` — one page per public spatial API or explicit API pair.
4. `States` — cross-primitive runtime and semantic states.
5. `Scenes` — reusable spatial review scenarios without product workflow ownership.
6. `LDS Integration` — compositions that consume real LDS public components and CSS.

Every public page includes a first story named `개요`. Additional stories use
the LDS role vocabulary `참조`, `사용법`, `변형·상태`, `상호작용`, `반응형`, or
`시나리오`, followed by `·` and an observable result. Development-stage labels
such as `Visual Alpha`, `Foundation 0`, `Actual`, `Raw`, and direction letters do
not appear in public navigation. The explicit redirect table in
`apps/docs/.storybook/public/story-id-redirects.mjs` preserves links to Story IDs
that moved during the ownership split.

## Storybook review evidence contract

The primitive overview URLs below are the primary review stories. Do not add
one Storybook entry per review stage: that would turn the sidebar into a
coverage dashboard and make the atom harder to inspect. Instead, each overview
story starts with its ownership and live WebGL use, then renders an LDS
`DescriptionList` containing the ordered evidence below:

1. Overview and ownership.
2. Minimal usage in actual WebGL.
3. Variants and states.
4. Interaction.
5. Accessibility and motion.
6. Constrained-width behavior.
7. A linked real scenario.

The machine-readable
[primitive review contract](../apps/docs/src/primitive-review-contract.json)
is imported into those stories as the `lds3dReview` parameter and drives the
rendered evidence list. `pnpm build-storybook` runs
`scripts/storybook-contract.mjs`, which fails when a primitive story is absent,
is not bound to that contract, lacks actual-WebGL evidence, leaves a required
stage empty, points to a missing scenario, or leaves a public spatial atom
uncovered.

This review contract covers the public spatial atoms below. Runtime providers,
hooks, coordinate helpers, and fixed `VisualAlphaModel`/
`AmrOperationalScene` fixtures are public support APIs or scenario assemblies,
not new spatial atoms; their behavior is reviewed through the listed host or
scenario rather than by a separate product-like Storybook page.

| Overview story                                   | Covered public spatial atoms                                                             | Scenario evidence                                             |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `lds-3d-primitives--scene-canvas`                | `SceneCanvas`, `CameraRig`, `CoreSpace`, `SceneEnvironment`, `GroundPlane`, `GroundGrid` | `lds-3d-lds-integration-operations-viewer--overview`          |
| `lds-3d-primitives-selectable--overview`         | `Selectable`                                                                             | `lds-3d-lds-integration-operations-viewer--overview`          |
| `lds-3d-primitives-amr-robot--overview`          | `AmrRobot`                                                                               | `lds-3d-lds-integration-operations-viewer--overview`          |
| `lds-3d-primitives-goal-marker--overview`        | `GoalMarker`                                                                             | `lds-3d-lds-integration-operations-viewer--overview`          |
| `lds-3d-primitives-path-ribbon--overview`        | `PathRibbon`                                                                             | `lds-3d-lds-integration-operations-viewer--overview`          |
| `lds-3d-primitives-point-cloud-layer--overview`  | `PointCloudLayer`, `PointCloudLayers`                                                    | `lds-3d-scenes-point-cloud-foundation--lds-integration`       |
| `lds-3d-primitives-occupancy-grid-surface--overview` | `OccupancyGridSurface`                                                                | `lds-3d-scenes-occupancy-grid--overview`                      |
| `lds-3d-primitives-marker-layer--overview`       | `MarkerLayer`                                                                            | `lds-3d-scenes-tf-marker--overview`                           |
| `lds-3d-primitives-spatial-editing--overview`    | `SectionBox`, `EditVolume`                                                               | `lds-3d-scenes-spatial-editing--overview`                     |
| `lds-3d-primitives-spatial-authoring--overview`  | `SpatialStructure`, `TransformGizmo`                                                     | `lds-3d-scenes-spatial-authoring-foundation--lds-integration` |
| `lds-3d-primitives-scene-state-marker--overview` | `SceneStateMarker`                                                                       | `lds-3d-states-renderer-lifecycle--overview`                  |
| `lds-3d-primitives-gltf-model--overview`         | `GltfModel`                                                                              | `lds-3d-lds-integration-operations-viewer--overview`          |

For constrained-width review, resize each technical story between a normal
width and 320 CSS px. Spatial atoms remain inside the single `SceneCanvas`; they
do not create a parallel page grid, inspector, or drawer. Their caller-owned
DOM summary can wrap through public LDS layout components. The linked LDS
integration scenario is the separate evidence for shell, viewport frame, and
narrow inspector behavior.
