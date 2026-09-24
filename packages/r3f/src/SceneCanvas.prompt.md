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
- The host is one intentional tab stop. While it owns focus, `Home` restores the
  home pose, `T` selects Top, `F` selects Focus, arrows orbit,
  `Shift` + arrows pan, and `+`/`-` or `Page Up`/`Page Down` zoom. The host or
  its canvas must actually own focus. Interactive descendants, already-handled
  events, and IME composition are ignored. With `enableOrbit={false}`, only the
  three preset keys remain advertised and handled. Set `ariaDescribedBy` to
  caller-owned detailed help; `enableKeyboardCameraControls={false}` is
  available for a caller that supplies a different complete camera input
  contract.
- The camera-fixed labelled XYZ triad is WebGL-only and enabled by default in
  every visual profile. It uses the LK core `+Z`-up basis. World-origin axes do
  not replace it.
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

## Follow, constraints and layers (2026-09)

- `cameraMode="follow"` tracks `followSubject` (the rendered pose, third or
  first person). Entry is a 0.8 s eased transition; reduced motion jumps.
  After entry the eye copies the subject every frame, so the product's own
  smoothing is the only smoothing. `followObstacles` pulls the eye in front of
  objects flagged `userData.lds3dCameraObstacle`; occluders are not faded.
- `cameraConstraints` + `groundHeightAt` apply core `applyCameraConstraints`
  after every camera update. Site polygons and clearances stay in the product.
- `onContextLost` / `onContextRestored` report WebGL context loss so the caller
  can show a paused state with LDS status components. Wrap independent layers
  in `SceneLayer` and roll them up with `useSceneLayerRegistry`; only a required
  layer failure should become `renderState.kind === "error"`.
- Evidence: Gungneung `feat/3d-map` bc83977d (docs/GUNGNEUNG_3D_GAP_PLAN.md);
  category references in docs/SPATIAL_PRIMITIVES_GUIDE.md.

## Review

Review `LDS 3D/Primitives/SceneCanvas & CameraRig` before changing host or
camera behavior. Review wide and constrained composition with the owning LDS
`Scene3DFrame` or shell separately; `SceneCanvas` itself does not define DOM
layout or chrome.
