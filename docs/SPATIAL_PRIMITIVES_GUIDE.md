# Spatial primitive guide

## Purpose

LK Design System 3D owns reusable spatial and renderer behavior. It does not
create a second DOM UI system: LDS remains the owner of page shells, brand,
buttons, toolbars, drawers, panels, focus treatment, and DOM status grammar.

The public primitive catalog is reviewed in Storybook under
`LDS 3D/Primitives`. Each entry runs a real WebGL canvas. The `Visual Alpha`
stories under `LDS 3D/Scenes` are integration scenarios that prove the atoms
working together; they are not the source of truth for a new atom.

## Use the smallest semantic atom

| Atom | Use it for | Do not use it for | Review story |
| --- | --- | --- | --- |
| `SceneCanvas` + `CameraRig` | One WebGL host, camera modes, hit testing, lifecycle, and caller-owned overlay slots | Branded headers, camera DOM controls, drawers, retry buttons, or a product shell | `lds-3d-primitives--scene-canvas` |
| `CoreSpace` | The one fixed LK-core-to-Three basis below `SceneCanvas` | A second nested basis, a product coordinate transform, or a per-asset axis guess | `lds-3d-primitives--scene-canvas` |
| `SceneEnvironment` / `GroundPlane` / `GroundGrid` | The one floor, grid, lights, background, fog, and optional diagnostic axes for a scene | A second overlapping world surface; configure it through `SceneCanvas.environment` in normal R3F composition | `lds-3d-primitives--scene-canvas` |
| `Selectable` | Hover and one persistent selected spatial entity | Product commands, permission checks, DOM focus, or an invented selection visual language | `lds-3d-primitives--selection` |
| `AmrRobot` | A semantic fallback AMR representation and its spatial state treatment | A product-specific task card or robot command control | `lds-3d-primitives--amr-robot` |
| `GoalMarker` | Valid, preview, and invalid spatial intent | Product confirmation UI; use LDS actions outside the canvas to commit | `lds-3d-primitives--goal-marker` |
| `PathRibbon` | Actual, planned, executing, and blocked path geometry | A navigation list, route editor, or task workflow | `lds-3d-primitives--path-ribbon` |
| `PointCloudLayer` | One validated, core-frame XYZ or linear-RGB `Float32Array` snapshot rendered as actual WebGL points | ROS/PointCloud2/PCD parsing, TF resolution, streaming, implicit sampling/LOD, point picking, or a product viewer | `lds-3d-primitives--point-cloud-layer` |
| `SceneStateMarker` | Real WebGL loading, empty, and error geometry driven by `SceneCanvas.renderState` | A page-level error treatment or a replacement retry policy | `lds-3d-primitives--runtime-states` |
| `GltfModel` | A real glTF/GLB placement with explicit source convention or manifest | An undocumented file transform, product asset registry, or a generic domain asset abstraction | `lds-3d-primitives--gltf-model` |

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
   rather than silently sampling it. Its layer eligibility summary reports
   requested/accepted input only; physical GPU/context state belongs to runtime
   QA rather than this atom.
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
- Ambient animation must respect `prefers-reduced-motion`. Static review
  stories should use `frameLoop="demand"`, `devicePixelRatio={1}`, a deliberate
  shadow budget, and `animated={false}` unless motion itself is under review.

## State grammar

Spatial state is not color-only.

- `AmrRobot` changes status geometry/material treatment and adds selected or
  hover rings when appropriate.
- `GoalMarker` uses solid, wireframe, and invalid-cross geometry as well as
  tone.
- `PathRibbon` uses route line treatment, execution beacon, and blocked marks
  as well as tone.
- `PointCloudLayer` is either actual point geometry or no geometry. Empty,
  frame-mismatched, and over-budget snapshots report a caller-owned render
  state; they must not be disguised as transformed or truncated data.
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
  Visual Alpha are scenario-local evidence, not an API to copy. A proposal for
  one of these must first define its frame, depth/occlusion, overlap, scale,
  selection, accessibility, and reduced-motion contract.

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

## Storybook review evidence contract

The seven existing primitive URLs are the primary overview stories. Do not add
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

| Overview story | Covered public spatial atoms | Scenario evidence |
| --- | --- | --- |
| `lds-3d-primitives--scene-canvas` | `SceneCanvas`, `CameraRig`, `CoreSpace`, `SceneEnvironment`, `GroundPlane`, `GroundGrid` | `visual-alpha--actual-lds-composition` |
| `lds-3d-primitives--selection` | `Selectable` | `visual-alpha--actual-lds-composition` |
| `lds-3d-primitives--amr-robot` | `AmrRobot` | `visual-alpha--actual-lds-composition` |
| `lds-3d-primitives--goal-marker` | `GoalMarker` | `visual-alpha--actual-lds-composition` |
| `lds-3d-primitives--path-ribbon` | `PathRibbon` | `visual-alpha--actual-lds-composition` |
| `lds-3d-primitives--point-cloud-layer` | `PointCloudLayer` | `lds-3d-scenes-point-cloud-foundation--lds-integration` |
| `lds-3d-primitives--runtime-states` | `SceneStateMarker` | `visual-alpha--loading-error-empty` |
| `lds-3d-primitives--gltf-model` | `GltfModel` | `visual-alpha--actual-lds-composition` |

For constrained-width review, resize each technical story between a normal
width and 320 CSS px. Spatial atoms remain inside the single `SceneCanvas`; they
do not create a parallel page grid, inspector, or drawer. Their caller-owned
DOM summary can wrap through public LDS layout components. The linked Visual
Alpha scenario is the separate evidence for LDS shell, viewport frame, and
narrow inspector behavior.
