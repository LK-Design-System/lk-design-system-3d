# R3F spatial primitives

## Scope

`Selectable`, `AmrRobot`, `GoalMarker`, `PathRibbon`, and `SceneStateMarker`
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
  Keep `selectable` opt-in because a route is often passive scene context.
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
- `SceneStateMarker`

Do not promote private Visual Alpha label or marker helpers into a public atom
without a written coordinate, depth/occlusion, overlap, scale, accessibility,
and motion contract.
