# @lk-robotics/lds-3d-r3f

React Three Fiber renderer for LK Design System 3D Visual Alpha. It renders a
real WebGL scene while keeping public spatial data in the LK core convention:
right-handed, metres, `+X` forward and `+Z` up. `SceneCanvas` applies the fixed
core-to-Three basis once; descendants must not rotate the world again.

## Quick start

```tsx
import { AmrRobot, GoalMarker, PathRibbon, SceneCanvas } from "@lk-robotics/lds-3d-r3f";
import { frameId } from "@lk-robotics/lds-3d-core";

<SceneCanvas
  frame={frameId("lk-map")}
  profile="operational-neutral"
  focusTarget={robot.pose.position}
  onRetry={retryScene}
  overlay={({ clearSelection, requestCameraMode, retry, selectedEntityId }) => (
    <YourLdsViewportChrome
      clearSelection={clearSelection}
      requestCameraMode={requestCameraMode}
      retry={retry}
      selectedEntityId={selectedEntityId}
    />
  )}
>
  <AmrRobot entity={robot} />
  <GoalMarker entity={goal} />
  <PathRibbon entity={path} />
</SceneCanvas>;
```

`SceneCanvas` is headless with respect to application chrome. By default it
renders no camera toolbar, selection panel, or retry button. The overlay is a
caller-owned composition slot; its context exposes camera, selection, and retry
commands so an application can connect actual LDS controls without coupling the
renderer package to LDS or to one product shell. `showStatusOverlay` is an
opt-in, non-interactive renderer diagnostic for loading, empty, and error
states; it defaults to `false`.

The scene host is intentionally focusable and shows its own focus outline.
Focused camera keys are `Home` (home), `T` (top), `F` (focus), arrows (orbit),
`Shift` + arrows (pan), and `+`/`-` or `Page Up`/`Page Down` (zoom). The host
handles keys only while it (or its WebGL canvas) actually owns focus; editable
and interactive descendants retain their own keys, as do already-handled events
and IME composition. With `enableOrbit={false}`, only the three preset keys are
advertised and handled. Connect `ariaDescribedBy` to caller-owned help or scene
summaries when more context is needed. A camera-fixed labelled XYZ
triad is rendered in WebGL by default for both visual profiles; optional
world-origin axes supplement rather than replace it.

Start with the smallest semantic spatial atoms. `AmrOperationalScene` and
`VisualAlphaModel` are fixed Visual Alpha scenario helpers, not the default
product composition starting point. See the repository's
[spatial primitive guide](../../docs/SPATIAL_PRIMITIVES_GUIDE.md) and the
`LDS 3D/Primitives` Storybook group for ownership, state, motion, and review
contracts.

## Point clouds

`PointCloudLayer` is a headless adapter for one immutable, caller-retained
core-frame snapshot. The `SceneCanvas.frame`, snapshot frame, and bounds must
agree; it never applies TF/origin conversion or implicit sampling. Pass an
explicit `maxPoints` and let the caller render the resulting eligibility state
in LDS/product DOM.

```tsx
import { PointCloudLayer, SceneCanvas } from "@lk-robotics/lds-3d-r3f";

<SceneCanvas frame={snapshot.frame} frameLoop="demand">
  <PointCloudLayer maxPoints={50_000} snapshot={snapshot} />
</SceneCanvas>;
```

`PointCloudLayers` accepts a duplicate-free renderer-neutral layer set and
applies each supplied `sourceToScene` transform to its Three object without
rewriting point buffers. Its `maxPoints` is one atomic budget across all visible,
frame-resolved layers. ROS subscription, TF lookup/interpolation, topic
selection, and sampling remain caller-owned.

Use `colorMode="source"` for supplied linear RGB, `colorMode="uniform"` to
force a fallback colour, or `colorMode="height"` for a blue-low/red-high
scene-frame Z transfer function. Pass the same explicit `heightRange` to layers
that must be compared; an omitted range is auto-computed per layer. Height
colours are adapter-owned GPU input and never mutate the caller's positions or
source colours. A product-owned LDS legend should state the mapped range.

Pass `clipBounds` to `PointCloudLayer` or `PointCloudLayers` to keep one
scene-frame XYZ intersection through opt-in GPU material clipping. The adapter
enables local WebGL clipping only while clipped layers are mounted and preserves
the caller's point arrays. Pair the clipped view with `SectionBox` when the
bounds themselves must be visible. `EditVolume` renders framed sphere/box
delete or restore intent with a translucent pick body, sparse sphere rings or
box edges, compact minus/plus operation cues, and a separate selection halo. It
never decides inclusion, orders overlapping edits, mutates points, or commits a
product action. Continuous placement/manipulation remains a caller adapter; it
must map back to a fresh immutable volume contract and provide an LDS DOM
alternative for exact values.

The adapter owns and disposes its Three geometry and material on replacement or
unmount; it never takes ownership of the snapshot buffers. Default point size
is a fixed screen-space density control. Opaque snapshots write depth, while
partial-opacity point clouds use transparent, non-depth-writing material.
`SceneCanvas` prevents default WebGL context loss, resets renderer state, and
invalidates a demand-driven frame after context restoration.

## Occupancy grids

`OccupancyGridSurface` renders one normalized core occupancy snapshot as an
actual WebGL quad and nearest-filter categorical texture. It applies the
snapshot's complete `gridToFrame` translation and quaternion, keeps grid row
zero at texture `v=0`, and combines cell lines with an unknown checker and
occupied diagonal pattern so state is not colour-only.

```tsx
import { OccupancyGridSurface, SceneCanvas } from "@lk-robotics/lds-3d-r3f";

<SceneCanvas frame={snapshot.geometry.gridToFrame.targetFrame} frameLoop="demand">
  <OccupancyGridSurface
    maxCells={262_144}
    snapshot={snapshot}
    selectedCell={selectedCell}
    onCellHoverChange={setHoveredCell}
    onCellPick={({ cell }) => setSelectedCell(cell)}
    onRenderStateChange={setOccupancyRenderState}
  />
</SceneCanvas>;
```

`maxCells` is required, and the adapter also checks the live GPU maximum texture
dimension. A frame mismatch, cell-budget overflow, or texture-dimension
overflow renders no partial raster and is reported through
`onRenderStateChange` for caller-owned LDS/product DOM. The adapter never
samples, rescales, or tiles implicitly. It owns and disposes only its derived
geometry, texture, and shader material on replacement or unmount; the snapshot
`Uint8Array` remains caller-owned, and `SceneCanvas` owns context loss and
restoration. Optional hover and pick callbacks expose the immutable core cell
sub-hit, while caller-controlled `selectedCell` adds one transformed WebGL line
outline; none of these paths mutate the snapshot or synthesize product
commands. PGM/YAML/ROS parsing, thresholds, editing, history, persistence,
permissions, actions, and product chrome stay outside this headless renderer.
The adapter binds one validated core cell picker per snapshot, so pointer-rate
hover and selection are O(1) after snapshot validation. Active hover is cleared
exactly once when the raster becomes non-ready, its snapshot or callback owner
changes, pointer-out occurs, or the surface unmounts.

## Spatial structure and authoring

`SpatialStructure` renders one validated Site/Building/Level hierarchy inside
the `SceneCanvas` core frame. Container transforms remain local to their parent;
primitive floor, wall, and object leaves use portable default/top/side PBR
material slots. Asset leaves are caller-rendered through `renderAsset`, so the
renderer does not resolve product URLs or registries. Picking produces only the
shared selected entity identifier.

Pass `activeTransform` to attach `TransformGizmo` to a primitive or asset leaf.
Translation arrows, rotation rings, and local scale handles use pointer capture
and emit start-relative snapped `preview` change sets followed by exactly one
matching `commit`, or one `cancel` that restores the pointer-down transform.
Pointer cancellation, lost capture, Escape, unmount, and policy changes all
terminate the gesture while camera controls recover their prior enabled state.
The core `stepSpatialNodeTransform` contract and LDS numeric/keyboard controls
remain equivalent alternatives. `target` means the node's declared target-frame
axes, not an ancestor-resolved scene-world frame; target-frame non-uniform scale
is rejected. Marquee and multi-selection pivot policy, undo, validation, save,
and revision conflict handling remain outside this package.

## Rendering budget

`SceneCanvas` defaults to `renderQuality="balanced"`: demand-driven rendering,
a DPR range of `[1, 1.5]`, and a 1024px shadow map. Built-in camera transitions
and active scene animations continue to request frames until they settle. The
three explicit budgets are:

- `performance`: DPR 1, no shadows, and low-power rendering.
- `balanced`: the default review and product starting point.
- `high`: DPR up to 2 and 2048px shadows, while still demand-driven.

Use `frameLoop="always"` only for caller-owned continuous animation. To let a
scene become idle, disable ambient animations such as `GoalMarker`'s `animated`
prop and set an executing `PathRibbon`'s `animated` prop to `false`; its beacon
remains visible at a deterministic midpoint. `devicePixelRatio` and
`environment.shadowMapSize` remain explicit per-canvas overrides.

```tsx
<SceneCanvas frame={frameId("lk-map")} renderQuality="performance">
  <YourStaticScene />
</SceneCanvas>
```

## Visual profiles

- `operational-neutral` is the default low-chroma operating view.
- `diagnostic-technical` is an advanced view with dark surfaces, stronger grid
  hierarchy and axes.

Hover, selection, live status, intent, warning and error are separate semantic
channels in both profiles. `GoalMarker` distinguishes valid, preview and
invalid goals. `PathRibbon` distinguishes actual, planned, executing and
blocked paths using both colour and geometry/motion cues. Path selection remains
opt-in with `selectable`, preserving the non-selectable default. All ambient
animation respects `prefers-reduced-motion`.

## Model assets

`createVisualAlphaModelUrls("/visual-alpha")` resolves the stable six-model
catalog: AMR, rack, pallet, cargo bin, charging station and safety cone. Visual
Alpha GLBs are authored directly in LK core coordinates, so use
`sourceConvention="core"`. A generic `GltfModel` must supply either an explicit
`sourceConvention` or a validated asset manifest; it never guesses coordinate
evidence from a file name. After a same-URL load failure, increment the
caller-owned `retryKey` to clear the failed loader cache and retry once:

```tsx
<GltfModel
  entityId={assetId}
  retryKey={retryAttempt}
  sourceConvention="gltf"
  url={assetUrl}
  onLoadStateChange={setAssetLoadState}
/>
```
