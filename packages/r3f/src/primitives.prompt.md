# R3F spatial primitives

## Scope

`Selectable`, `AmrRobot`, `GoalMarker`, `PathRibbon`, `SectionBox`, `EditVolume`, `SpatialStructure`, `TransformGizmo`, and `SceneStateMarker`
are reusable spatial atoms. They receive framed core data and draw real WebGL
geometry. They do not create DOM application chrome or product workflows.

## Usage rules

- Use `Selectable` for renderer-side hover and persistent selection only. Its
  output is an entity identifier and pointer detail; command dispatch stays in
  the product.
- Use `AmrRobot` as a semantic fallback AMR visual or supply a real model to
  its model slot. Do not turn it into a task card or control surface.
- Use `GoalMarker` for valid, preview, and invalid intent. Product confirmation
  and validation messaging belong in LDS DOM UI.
- Use `PathRibbon` for actual, planned, executing, and blocked route geometry.
  Keep `selectable` opt-in because a route is often passive scene context. The
  path surface is a flat width-bearing strip: planned state segments the strip,
  executing state adds a low, extruded 3D arrow aligned to the path tangent,
  and blocked state adds tangent-aligned raised barriers. Interaction uses a
  separate outline and never replaces the route status pattern.
- Use `SectionBox` for passive scene-frame XYZ range evidence. Point material
  clipping is a separate opt-in adapter concern.
- Use `EditVolume` for selectable delete/restore intent only. Point inclusion,
  mutation, undo, and apply remain product-owned. Keep the pickable translucent
  body visually quiet: a sphere uses one ground-plane radius ring and a box uses
  its actual edges. Selection promotes that single outline; it does not stack
  duplicate rings, triangular wireframes, or an in-scene delete/restore glyph.
  The caller-owned inspector names the operation and carries the destructive
  action.
- Use `SpatialStructure` for one validated Site/Building/Level tree with framed
  local TRS and primitive or caller-rendered asset leaves. Product wall curves,
  topology, revision, and persistence stay outside the renderer.
- Use `TransformGizmo` for one start-relative snapped translate, rotate, or
  local-scale gesture with a single commit/cancel terminal. LDS numeric and
  keyboard controls must be able to create the same core change; the gizmo does
  not own history, validation, save, or conflict policy. `target` is the node's
  declared target-frame space, not an ancestor-resolved scene-world alias.
- Drive `SceneStateMarker` through `SceneCanvas.renderState`; do not mount a
  second page-level copy of the same renderer state.

## State and motion

Each primitive must communicate state with geometry, line treatment, glyph,
outline, or material as well as tone. Ambient motion is optional and respects
`prefers-reduced-motion`. Set `animated={false}` for a static or demand-rendered
review unless motion itself is the behavior being reviewed.

## Storybook

The real-WebGL atom stories are under `LDS 3D/Primitives`:

- `Selectable`
- `AmrRobot`
- `GoalMarker`
- `PathRibbon`
- `SectionBox`
- `EditVolume`
- `SpatialStructure`
- `TransformGizmo`
- `SceneStateMarker`

Do not promote private Visual Alpha label or marker helpers into a public atom
without a written coordinate, depth/occlusion, overlap, scale, accessibility,
and motion contract.
