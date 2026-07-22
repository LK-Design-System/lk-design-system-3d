# `@lk-robotics/lds-3d-assets`

Renderer-neutral glTF/GLB asset metadata, validation, coordinate normalization,
loading, cancellation, progress, and single-owner lifecycle contracts.

The root entry point accepts only explicitly declared right-handed coordinates.
Migration-only coordinate inference is isolated in the deprecated `./legacy`
entry point.

## Packaged robot assets

The `./robots/catalog.json` public subpath lists reusable robot GLBs that have
an explicit asset manifest, integrity digest, and provenance record. The Tron
robot is published through:

- `./robots/tron/tron.glb`
- `./robots/tron/tron.asset-manifest.json`
- `./robots/tron/provenance.json`

The packaged Tron file is a runtime derivative of the creator-authorized source
asset. Its provenance record preserves the immutable source repository revision,
source and derivative SHA-256 digests, coordinate evidence, and the reproducible
gltfpack command used to reduce the WebGL triangle and transfer budget.

## Deferred Tron material authoring plan

Material authoring is intentionally deferred as of 2026-07-18. The current
runtime derivative remains the accepted neutral baseline; this note records the
next authoring path without changing the GLB, renderer API, or Storybook contract.

### Current asset evidence

The packaged `tron.glb` contains one mesh, one primitive, and one material named
`TRON_47494A`. Its only vertex attributes are `POSITION` and `NORMAL`; it has no
images, textures, `TEXCOORD_0`, or `COLOR_0`. The material currently uses base
color `#47494A`, metallic factor `0.05`, and roughness factor `0.75`.

Consequences:

- A whole-robot runtime tint can be prototyped by cloning the loaded material and
  changing its PBR base color.
- Body, frame, wheels, sensors, and accents cannot receive independent solid
  colors until faces or parts are assigned to separate authored material slots.
- Logos, decals, wear, or other painted detail require UV authoring before a
  base-color texture can be used.

### Ownership decision

The asset and renderer keep two different color layers:

1. **Authored physical appearance** belongs to the GLB: neutral body coating,
   frame, wheels, sensors, and approved decorative accents.
2. **Operational semantics** belong to LDS3D runtime presentation: live,
   warning, error, hover, focus, and persistent selection remain geometry,
   outline, pattern, label, and renderer-theme concerns. They are not baked into
   the robot material and must not rely on color alone.

LDS remains the authority for brand sources and DOM semantic tokens. A future
asset palette must use an approved brand reference; it must not copy or infer LDS
token values into renderer code. Product-specific fleet livery remains a product
asset or product composition decision.

### Recommended authoring pipeline

1. Import the immutable high-detail source GLB into Blender and save a `.blend`
   master. Do not edit the optimized runtime derivative as the source of truth.
2. Classify faces or disconnected parts and assign stable material slots such as
   `Tron.Body`, `Tron.Frame`, `Tron.Wheels`, `Tron.Sensor`, and `Tron.Accent`.
3. Use solid Principled BSDF PBR factors when independent flat colors are enough;
   this path does not require UVs.
4. If logos, decals, or surface detail are approved, unwrap UVs and add a
   base-color texture. Add metallic/roughness or normal textures only when they
   materially improve spatial legibility at the reviewed camera distance.
5. Export an unoptimized glTF 2.0 binary, validate it, and generate a runtime GLB
   with the recorded optimization command.
6. Recompute the derivative SHA-256, bounds, triangle count, required extensions,
   manifest version, and provenance. Update the catalog and asset tests together.
7. Review the final GLB in actual WebGL at normal and constrained widths, with
   neutral, selected, warning, and error states. Confirm that authored materials
   do not obscure status geometry or selection treatment.

The relevant public standards and tool contracts are:

- [glTF 2.0 materials](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#materials)
  for `baseColorFactor`, `baseColorTexture`, and metallic-roughness PBR.
- [Blender material assignment](https://docs.blender.org/manual/en/latest/render/materials/assignment.html)
  for assigning multiple material slots to selected mesh faces.
- [Blender glTF export](https://docs.blender.org/manual/en/4.5/addons/import_export/scene_gltf2.html)
  for Principled BSDF, texture, vertex-color, and GLB export behavior.
- [Three.js `MeshStandardMaterial`](https://threejs.org/docs/pages/MeshStandardMaterial.html)
  for a future non-destructive whole-instance tint prototype.
- [`KHR_materials_variants`](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_variants/README.md)
  for finite authored colorways. This is not the first implementation target
  because [Three.js `GLTFLoader`](https://threejs.org/docs/pages/GLTFLoader.html)
  currently lists it as an external-plugin integration.

### Deferred scope

No material slots, UVs, textures, runtime `tint` prop, material-variant loader,
new GLB derivative, or asset version change is part of the current work. Those
changes require a separate visual review and asset release decision.
