# @lk-robotics/design-system-3d-r3f

React Three Fiber renderer for LK Design System 3D Visual Alpha. It renders a
real WebGL scene while keeping public spatial data in the LK core convention:
right-handed, metres, `+X` forward and `+Z` up. `SceneCanvas` applies the fixed
core-to-Three basis once; descendants must not rotate the world again.

## Quick start

```tsx
import { AmrRobot, GoalMarker, PathRibbon, SceneCanvas } from "@lk-robotics/design-system-3d-r3f";
import { frameId } from "@lk-robotics/design-system-3d-core";

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
import { PointCloudLayer, SceneCanvas } from "@lk-robotics/design-system-3d-r3f";

<SceneCanvas frame={snapshot.frame} frameLoop="demand">
  <PointCloudLayer maxPoints={50_000} snapshot={snapshot} />
</SceneCanvas>;
```

The adapter owns and disposes its Three geometry and material on replacement or
unmount; it never takes ownership of the snapshot buffers. Default point size
is a fixed screen-space density control. Opaque snapshots write depth, while
partial-opacity point clouds use transparent, non-depth-writing material.
`SceneCanvas` prevents default WebGL context loss, resets renderer state, and
invalidates a demand-driven frame after context restoration.

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
