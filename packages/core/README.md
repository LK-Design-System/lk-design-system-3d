# @lk-design-system/lds-3d-core

Renderer-neutral spatial contracts for LK Design System 3D. The package uses a
right-handed, Z-up, +X-forward coordinate system measured in meters. It has no
renderer, React, Three.js, browser, or product dependency.

All spatial values crossing a package or product boundary carry an explicit
frame. Runtime operations reject non-finite coordinates, invalid unit
quaternions, and incompatible frames.

## Occupancy grids

`occupancyGridGeometry` defines a planar raster whose local origin is the
minimum corner of cell `(0, 0)`. Columns grow along local `+X`, rows grow along
local `+Y`, resolution is metres per cell, and the complete `gridToFrame`
translation and quaternion place the raster in its target frame. Cell data is
ROS-compatible row-major (`row * width + column`); top-down image rows cross an
explicit Y-flipping image-pixel conversion instead of being treated as grid
rows. Minimum-corner and centre queries are separate, and reverse projection
uses half-open XY bounds plus an explicit plane tolerance.

`pickOccupancyGridCell` composes that projection with the same row and image
conversion contract. An accepted hit captures the snapshot revision, cell,
top-down image pixel, row-major data index, normalized state, framed hit point,
and framed cell centre without mutating the caller-owned state buffer.
For pointer-rate queries, `createOccupancyGridCellPicker` validates the complete
snapshot once and binds a stable wrapper and revision; each subsequent `pick`
is O(1). The caller must still honor immutable-by-replacement buffer ownership.

`createOccupancyGridSnapshot` validates normalized trinary state values
(`unknown=0`, `free=1`, `occupied=2`) and retains the caller-owned `Uint8Array`.
Callers replace the snapshot and revision when that buffer's content changes.
These states are not a PGM or ROS-message parser: file decoding, grayscale or
probability thresholds, YAML origin policy, transport, editing, history,
persistence, and map commands remain product-adapter concerns.

`createSpatialEditSphere` and `createSpatialEditBox` create immutable,
serializable delete/restore intents with a stable entity ID and framed pose.
They deliberately contain no point data, crop ordering, undo state,
permissions, or commit action; those remain product workflow concerns.

`createSpatialStructure` validates and detaches one immutable Site/Building/Level
tree. Every node has a unique local frame and explicit local-to-parent TRS;
levels declare elevation, primitive leaves use positive box/cylinder geometry
and portable linear-RGBA metallic/roughness material slots, and asset leaves
reuse the existing `AssetId` boundary. Cycles, missing parents, guessed frames,
invalid scale, and mismatched local bounds are rejected.

`stepSpatialNodeTransform` and `createSpatialTransformChangeSet` provide the
renderer-neutral authoring seam. Translate, rotate, and scale modes carry an
explicit axis, local/target-frame space, positive snap increments, and
serializable before/after transforms. Target-frame space names the node's
declared `targetFrame`; it is not an ancestor-resolved scene-world frame. They
do not own multi-selection pivot policy, history, validation, persistence,
revision, permissions, or product save commands.
