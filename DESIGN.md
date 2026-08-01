# Design

## Source of truth

- Status: Active
- Last refreshed: 2026-07-21
- Primary product surfaces: robotics 3D viewer, focused point-cloud viewer,
  spatial authoring editor, renderer lifecycle review, and technical primitive
  stories.
- Evidence reviewed:
  - `README.md`, `docs/README.md`, `docs/ARCHITECTURE.md`,
    `docs/PRODUCT_EVIDENCE.md`, `docs/DESIGN_AND_LDS_INTEGRATION_PLAN.md`,
    `docs/VISUAL_ALPHA_REFERENCE_RESEARCH.md`, and
    `docs/SPATIAL_PRIMITIVES_GUIDE.md`.
  - Current LDS3D baseline: `a781e0f1925285d635107f9e0abbe13674815a9e`,
    `lk-design-system-3d@0.1.0-alpha.1`, clean `main` at refresh time.
  - Current LDS baseline: `a38b9b12f74a7166b2c7c6baff9882f7d99ff58a`,
    `@lk-design-system/lds-workspace@0.1.0-rc.0`, `main`; unrelated local
    communication-component edits were present and are not design evidence for
    this work.
  - Current Robotics UI baseline:
    `5fc67797fbad7dd137f5785288990d4b760bcde3`,
    `@lk-design-system/lds-robotics-ui@0.1.0-rc.1`, pre-existing
    `nav-expression-overhaul` branch.
  - Representative Storybook surfaces at port 6007 were reviewed at 1280x720
    and 390x844, including Operational Neutral, Diagnostic Technical, spatial
    authoring, focused point cloud, renderer lifecycle, and SceneCanvas.
  - Category references that materially influence this contract:
    [Blender viewport gizmos](https://docs.blender.org/manual/en/4.5/editors/3dview/display/gizmo.html),
    [Blender transform orientation](https://docs.blender.org/manual/en/5.0/editors/3dview/controls/orientation.html),
    [Autodesk Fusion interface](https://help.autodesk.com/view/fusion360/ENU/?contextId=LP-STEPS-P13N-SNP-GS-OTH-CRD-1),
    [Unity scene navigation](https://docs.unity3d.com/Manual/SceneViewNavigation.html),
    [Unreal interface and navigation](https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-interface-and-navigation),
    [WAI-ARIA Tree View](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/),
    [WAI-ARIA Toolbar](https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/), and
    [WCAG 2.2 Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html).
- Evidence boundary: repository evidence supports a strong platform and
  category-conventional interaction contract. It does not yet prove superiority
  over current Control or Web Viz through task-level user testing, and the dirty
  live LDS checkout prevents a new visual-parity claim by itself.

## Brand

- Personality: calm, precise, trustworthy, operational, and technically
  literate without looking like a debug console by default.
- Trust signals: continuously visible frame/orientation context, explicit
  active tool and transform space, stable selection, deterministic recovery,
  metric values with units, and restrained state hierarchy.
- Avoid: decorative photorealism that obscures state, neon cyberpunk styling,
  duplicated LDS chrome, hidden coordinate assumptions, color-only state,
  pointer-only essential actions, and dense CAD controls that do not serve a
  robotics task.

## Product goals

- Goals:
  - Make position, orientation, active tool, transform space, selection, intent,
    and renderer state continuously legible.
  - Keep canvas, hierarchy, inspector, toolbar, and passive status synchronized
    through one controlled state contract.
  - Provide keyboard and numeric alternatives for essential camera, selection,
    placement, and transform actions.
  - Reuse LDS public DOM components while keeping renderer packages independent
    of LDS and product workflow code.
  - Make loading, empty, error, retry, and recovery demonstrably coherent in
    Storybook.
- Non-goals:
  - A complete CAD/GIS/digital-twin editor, photorealistic renderer, product
    route, persistence layer, permission model, transport, or robot command UI.
  - Marquee/multi-selection, measurement history, configurable docking, and
    full visibility/lock policy in the current correction pass.
- Success signals:
  - A user can identify axes, camera view, active transform space, selected
    entity, and renderer state without inferring them from code or color.
  - Canvas-origin selection is revealed, selected, and focused in the hierarchy.
  - Every pointer drag needed for the audited flows has a keyboard or numeric
    alternative.
  - Automated interaction/accessibility checks pass, and representative wide
    and narrow Storybook views keep the viewport dominant.

## Personas and jobs

- Primary personas: robot operator, mapping/commissioning engineer, spatial
  author, visualization/debug engineer, and product integrator reviewing LDS3D
  contracts.
- User jobs:
  - Inspect robot, map, path, goal, point-cloud, and facility state.
  - Select the same entity from a viewport or hierarchy and inspect exact data.
  - Navigate, orient, place, move, rotate, scale, preview, confirm, cancel, and
    recover without losing context.
  - Diagnose frame, freshness, lifecycle, and geometry failures while preserving
    the last trustworthy evidence.
- Key contexts of use: desktop operations and engineering workstations,
  constrained laptop/browser viewports, Storybook review, keyboard-only use,
  high-density diagnostic scenes, and reduced-motion environments.

## Information architecture

- Primary navigation: Storybook remains grouped as `LDS 3D/Foundations`,
  `Assets`, `Primitives`, `States`, `Scenes`, and `LDS Integration`. This task
  does not rename or restructure public stories.
- Core routes/screens:
  - Focused viewer: minimal page/fixture identity -> dominant `Scene3DFrame` ->
    viewport toolbar -> optional inspector -> passive status.
  - Spatial editor: document identity -> work/transform tools -> controlled
    hierarchy -> dominant viewport -> selected/draft properties -> passive
    status.
  - Renderer lifecycle: stable frame -> one authoritative blocking/edge state ->
    recovery action -> restored viewport.
  - Technical primitive: documentation identity -> actual WebGL contract ->
    concise DOM summary; no imitation product chrome.
- Content hierarchy: critical/recovery -> active interaction -> intent -> live
  state -> context -> environment.
- Reading and keyboard order: identity, tools, hierarchy, viewport, properties,
  status. Focus and selection are separate; selection may move focus only when
  the caller explicitly requests canvas-to-tree reveal.
- Wide page anatomy: viewport is the largest region; hierarchy and properties
  are supporting regions with LDS-owned surfaces. The focused viewer must begin
  above the fold at 1280x720 rather than appearing below a tall review preamble.
- Narrow page anatomy: exactly one primary editor region is visible at a time
  through `CanvasEditorShell.mobileActiveRegion`; all critical tools and
  summaries remain reachable.

## Design principles

- Persistent spatial context: a camera-fixed, labelled XYZ orientation triad,
  camera preset state, frame, unit, and active transform space remain visible.
  World-origin axes may supplement but never replace the camera-fixed aid.
- One state, many views: canvas, tree, inspector, toolbar, and status consume the
  same controlled IDs and modes. Text such as “selected” is not a substitute for
  `aria-selected` or selected styling.
- Direct manipulation plus precision: drag handles are efficient, while numeric
  fields, buttons, and keyboard camera commands provide an equivalent path.
- Calm default, disclosed diagnostics: Operational Neutral suppresses context
  noise; Diagnostic Technical reveals frames and provenance progressively while
  preserving identical entity and event meaning.
- One owner per concern: LDS owns DOM chrome/focus/status; LDS3D owns spatial
  math, WebGL, picking, and lifecycle; product/docs composition owns workflow
  and state mapping.
- Tradeoffs: the current pass favors explicit, deterministic single-selection
  and fixed transform-space semantics over full CAD configurability. A small
  persistent orientation triad plus existing preset controls is preferred to a
  new DOM ViewCube component.

## Visual language

- Color: consume LDS semantic tokens at the composition boundary and resolved
  scene roles inside the renderer. X/Y/Z use conventional differentiated colors
  plus visible letter labels; state never relies on hue alone.
- Typography: LDS typography for all DOM chrome and summaries; short
  screen-aligned labels for axes, selected/error entities, and critical cues.
- Spacing/layout rhythm: LDS shell and component spacing first. Viewport-local
  WebGL aids use screen-stable margins and must not collide with toolbars,
  inspectors, or safe areas.
- Shape/radius/elevation: LDS-owned components retain their public treatment.
  The orientation triad uses simple axis shafts, arrowheads, and `X/Y/Z` labels;
  selected state uses a persistent background/outline distinct from the focus
  ring.
- Motion: camera steps and lifecycle transitions are brief and interruptible;
  reduced motion makes them immediate. No repeated pulse is required to retain
  meaning.
- Imagery/iconography: real WebGL geometry and approved assets only. Spatial
  state uses geometry, line pattern, glyph, label, and DOM summary in addition
  to color.
- Visual-delta inventory for this correction:
  - Add one renderer-owned orientation triad; no new branded DOM surface.
  - Add persistent selected treatment to LDS `Tree`, aligned with existing LDS
    selected-row tokens while retaining the existing focus ring.
  - Add opaque token-backed label/help surfaces wherever gradient backgrounds
    prevent reliable contrast evaluation.
  - Change layout only enough to preserve viewport dominance at 1280x720 and
    the existing single-region narrow behavior.
  - Do not change shared token values, branding, typography, radii, elevation,
    or Storybook information architecture.

## Components

- Existing components to reuse:
  - LDS: `CanvasEditorShell`, `Scene3DFrame`, `ViewerToolbar`,
    `ViewerToolbarButton`, `Tree`, `SelectionInspector`, `DockPanel`,
    `ViewportStatusBar`, `SegmentedControl`, `DropdownMenu`, `FormField`,
    `NumberField`, `Button`, `ConfirmDialog`, and normalized resource/viewer
    states.
  - LDS3D: `SceneCanvas`, `CameraRig`, `CoreSpace`, `Selectable`,
    `TransformGizmo`, `PointCloudLayers`, `EditVolume`, and scene state
    primitives.
- New/changed components:
  - Extend LDS `Tree` with backward-compatible controlled/default single
    selection, `aria-selected`, persistent selected styling, and an imperative
    `focusItem(id, { reveal: true })` handle for caller-directed synchronization.
  - Add a renderer-only, camera-fixed orientation triad to `SceneCanvas`; it may
    use WebGL pointer interaction but must not import LDS or render product DOM.
  - Add an opt-in/focused SceneCanvas keyboard camera contract and caller-owned
    accessible instruction/summary wiring. Preset, orbit/pan, and zoom commands
    must be documented and must ignore editable fields/IME composition.
  - Keep `TransformGizmo` space explicit; the composed toolbar/status displays
    `Target` for translate/rotate and `Local` for scale unless the contract is
    later made configurable.
  - Selecting a point-cloud sphere/box placement tool creates and selects a
    deterministic draft at the scene origin/current target so numeric fields are
    immediately available; pointer placement can reposition it.
  - Consolidate live-region ownership so transient announcements are live once
    and persistent HUD values remain passive.
- Variants and states: hover, DOM focus, selected, active command target,
  disabled, loading, empty, error, retrying, ready, stale/degraded, and reduced
  motion must remain distinguishable and independently testable.
- Token/component ownership:

  | Surface                                   | Owner                    | Contract                                                 |
  | ----------------------------------------- | ------------------------ | -------------------------------------------------------- |
  | Page/editor/viewer chrome                 | LDS                      | Public exports and official CSS only                     |
  | Tree focus/selection semantics            | LDS                      | DOM focus remains distinct from controlled selection     |
  | Canvas, camera, axes, picking, gizmo      | LDS3D R3F                | Headless with respect to application chrome              |
  | Camera/help controls and status wording   | LDS/docs composition     | LDS controls wired to LDS3D commands                     |
  | Retry timing, draft workflow, selected ID | Docs/product composition | No transport, persistence, or permission policy in LDS3D |

## Accessibility

- Target standard: WCAG 2.2 AA and WAI-ARIA Authoring Practices for toolbar,
  tree, dialog, and status patterns.
- Keyboard/focus behavior:
  - The interactive scene has an accessible name, one intentional tab stop, a
    visible focus indicator, and documented camera keys.
  - Essential camera and selection actions are reachable through both the scene
    contract and LDS DOM controls/tree. Transform and edit-volume values remain
    editable through numeric fields.
  - `Tree` uses roving focus separately from `aria-selected`, standard arrow,
    Home/End, Enter/Space behavior, and caller-directed reveal/focus.
  - Camera preset buttons are controlled toggles with `aria-pressed`.
- Contrast/readability: text and controls sit on deterministic token-backed
  surfaces; critical non-text cues target at least 3:1 against adjacent scene
  colors. Gradients do not serve as the sole backing for required text.
- Screen-reader semantics:
  - Canvas selection has a synchronized DOM tree/list and selected-object
    summary.
  - `aria-controls` references an existing controlled element whenever present.
  - Persistent status values are named groups; only transient state changes use
    live regions. Nested `role=status` regions are prohibited.
- Reduced motion and sensory considerations: camera movement becomes immediate,
  no required information depends on animation, and color is always paired with
  label, pattern, geometry, or DOM text.

## Responsive behavior

- Supported breakpoints/devices: desktop/laptop browsers with a 1280x720 review
  baseline, wide engineering workstations, and narrow touch/keyboard layouts at
  approximately 390x844.
- Layout adaptations:
  - Focused viewer canvas stories remove tall preambles from the primary canvas
    path and keep the application viewport above the fold at 1280x720.
  - Wide editors show hierarchy, viewport, and properties with viewport
    dominance. Narrow editors switch among canvas/layers/properties using the
    existing LDS responsive navigation.
  - Orientation, recovery state, current camera, and numeric edit access remain
    reachable at every supported width.
- Touch/hover differences: hover is optional preview only. Tap/click commits
  selection. Drag-only placement is never required; numeric creation/editing and
  action controls remain available.

## Interaction states

- Loading: one authoritative state object drives frame, progress, busy state,
  and message. No second generic layer hides more specific progress.
- Empty: means renderer ready with no spatial entities. Selection count is zero,
  stale entity details are absent, and the next valid action is stated.
- Error: preserves actionable diagnostic text and failure evidence, exposes
  Retry only when recoverable, and does not silently relabel programming faults
  as geometry validation.
- Success: retry follows `error -> retrying/loading -> ready` and communicates
  completion without moving focus unexpectedly.
- Disabled: controls expose the reason in DOM text; disabled entities do not
  retain misleading pick/transform affordances.
- Offline/slow network, if applicable: product-owned. LDS3D exposes lifecycle and
  progress/failure data without inventing transport policy.

## Content voice

- Tone: concise, factual, calm, and recovery-oriented.
- Terminology: use `World`, `Target`, `Local`, `Home`, `Top`, `Focus`, metric
  units, stable entity names/IDs, and normalized lifecycle names consistently.
- Microcopy rules: state what happened, whether the last snapshot is usable,
  and what action is available. Do not show a selected count or entity summary
  when the scene is empty. Do not mask unexpected exceptions with generic
  “invalid geometry” copy.

## Implementation constraints

- Framework/styling system: React 19 reference stack, R3F 9.6.1, Three 0.185.1,
  Storybook 9.1.10 for LDS3D, and real LDS public packages/CSS in docs
  composition.
- Design-token constraints: no copied LDS token values, no shared token-value
  changes, no LDS imports in renderer packages, and no custom replacement for
  an existing LDS DOM component.
- Performance constraints: orientation and selection aids must be bounded,
  screen-stable, and not add per-entity animation or duplicate render loops.
  Point-cloud source buffers remain immutable and budget behavior unchanged.
- Compatibility constraints: changes are backward-compatible additions;
  preserve right-handed Z-up meters/radians contracts, existing public exports,
  current Storybook IA, and unrelated changes/branches in sibling repositories.
- Test/screenshot expectations:
  - Focused package tests, typecheck, lint, and public API checks for changed
    packages.
  - Storybook build before runtime QA.
  - Browser interaction and accessibility checks for tree synchronization,
    scene keyboard input/help, point-cloud numeric creation, lifecycle retry,
    camera toggles, and live-region structure.
  - Visual review at 1280x720 and 390x844 in light/dark representative stories,
    recording software WebGL vs physical GPU evidence accurately.

## Open questions

- [ ] Should the orientation triad become a fully interactive ViewCube with all
      orthographic faces after Alpha, or remain a compact axis aid beside the
      existing LDS camera presets? Owner: LDS3D design; impact: public camera
      command surface.
- [ ] Should transform space become user-configurable beyond the current
      deterministic Target/Local mapping? Owner: spatial authoring product +
      LDS3D; impact: gizmo API, snapping, and toolbar controls.
- [ ] Which current-product task benchmark will approve “better than Control/Web
      Viz” after this contract correction? Owner: product/design research;
      impact: G-D0 claim only, not the implementation corrections above.
