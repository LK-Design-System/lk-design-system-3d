# GltfModel

## Purpose

`GltfModel` places a real glTF/GLB resource in the LK core frame. It keeps each
placement's Object3D lifecycle independent while sharing immutable loader
resources where safe.

## Required input

- The public type requires either a validated asset `manifest` or an explicit
  `sourceConvention`; an omitted coordinate contract is a type error and is
  rejected at runtime before the GLTF loader starts.
- Keep position and orientation in the LK core convention: right-handed,
  `+Z` up, meters, and normalized quaternions.
- Use the manifest for file axes, scale, bounds, integrity, provenance, and
  file-to-core transform. Never infer these from the file name or a Storybook
  fixture.

## Boundaries

`GltfModel` owns loading, placement, selection, and renderer cleanup. It does
not own an asset registry, product storage, product metadata, a selection
inspector, commands, or DOM loading controls.

`onLoadStateChange` is observational. Changing that callback must not release
an already-loaded placement; only placement replacement or unmount disposes its
owned Object3D hierarchy.

## Retry

Use the caller-controlled numeric or string `retryKey` after an error. Changing
it while keeping the same `url` clears that URL's failed R3F loader cache before
the error boundary remounts the placement. It deliberately does not retry on its
own, and changing the URL resets the boundary without clearing the previous URL.

```tsx
const [retryKey, setRetryKey] = useState(0);

<>
  <Button onClick={() => setRetryKey((value) => value + 1)}>Retry asset</Button>
  <GltfModel
    entityId={entityId}
    retryKey={retryKey}
    sourceConvention="gltf"
    url="/assets/robot.glb"
  />
</>;
```

`VisualAlphaModel` is a fixed catalog convenience for the Visual Alpha scenario.
Start a product integration with `GltfModel` and its explicit contract unless
the fixed catalog is exactly the evidence fixture you need.

## Review

Use `LDS 3D/Primitives/GltfModel` to inspect a real AMR GLB through the generic
atom. Verify real asset loading, selection, source convention, cancellation,
same-URL retry, and disposal through package tests before claiming a new asset
type is ready.
