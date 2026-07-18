# SceneCanvas

## Purpose

`SceneCanvas` is the headless R3F scene host. It owns one WebGL canvas, the
fixed LK core-to-Three conversion, `CameraRig`, `SceneEnvironment`, scene
lifecycle, hit testing, hover, and persistent selection state.

It is not an application shell and must never own brand, page headings, DOM
toolbar controls, drawers, panels, product actions, or a product retry policy.

## Use

```tsx
<SceneCanvas
  ariaLabel="Warehouse spatial map"
  frame={frameId("lk-map")}
  renderQuality="balanced"
  onSelectionChange={({ entityId }) => setSelectedEntityId(entityId)}
>
  <AmrRobot entity={robot} />
  <PathRibbon entity={path} />
</SceneCanvas>
```

Keep one host and one environment per spatial viewport. Configure floor, grid,
lights, axes, and shadow budget through `environment`; do not mount a second
world surface on top of the host's own `SceneEnvironment`.

## Contract

- Input spatial data stays right-handed, `+Z` up, in meters.
- `frame` is required. Every child, `focusBounds`, and `topBounds` uses that
  LK-core frame; transform inputs before they reach the host.
- `overlay` is caller-owned composition. Render LDS DOM controls beside or in
  that slot from the docs/product layer; the R3F package does not import LDS.
- `renderState` selects real WebGL state geometry. `showStatusOverlay` adds an
  opt-in, non-interactive DOM summary only.
- Use an accessible `ariaLabel` and expose critical selection in DOM outside the
  canvas.
- `renderQuality="balanced"` is the default: `frameLoop="demand"`, DPR
  `[1, 1.5]`, browser-default GPU selection, and a 1024px shadow map. A static
  review can retain that default or deliberately choose `performance`.
- `performance` uses DPR 1, no shadows, and a low-power GPU preference.
  `high` uses DPR `[1, 2]`, 2048px shadows, and a high-performance GPU
  preference. All three profiles remain demand-driven.
- `frameLoop="always"` is an explicit opt-in only for caller-owned continuous
  animation. `devicePixelRatio` and `environment.shadowMapSize` deliberately
  override the selected quality profile when a scene has measured evidence for
  a different budget.

## Review

Review `LDS 3D/Primitives/SceneCanvas & CameraRig` before changing host or
camera behavior. Review wide and constrained composition with the owning LDS
`Scene3DFrame` or shell separately; `SceneCanvas` itself does not define DOM
layout or chrome.
