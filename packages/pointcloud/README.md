# `@lk-robotics/lds-3d-pointcloud`

Renderer-neutral, immutable-by-replacement point-cloud snapshot contracts for
LK Design System 3D.

Snapshots use LK core coordinates: right-handed, `+Z` up, metres. A snapshot
always has a frame and holds caller-retained `Float32Array` buffers. Callers
publish a new snapshot when the source buffer changes; renderer adapters own
and dispose only their GPU resources.

Use `resolvePointCloudRenderState(snapshot, sceneFrame, maxPoints)` before
adapter creation when a caller needs a DOM summary. Its `acceptedPointCount`
means frame-and-budget eligibility only; it is not a measured GPU upload or
draw result. Frame-mismatched and over-budget snapshots are rejected rather
than transformed or silently sampled.

For multiple topics, use `createPointCloudLayerSet` and give each layer a unique
`LayerId`. A layer may carry a caller-resolved `sourceToScene` rigid transform;
the package validates its source frame and reports missing or wrong-target
bindings without inventing TF. `resolvePointCloudLayerSetRenderState` applies
one atomic budget across every visible, frame-resolved layer and can report
fresh/stale/future/clock-mismatched timestamp state without hiding stale data.

This package intentionally does not include ROS transport, PointCloud2/PCD
parsing, TF graph resolution/interpolation, streaming backpressure, LOD, point
picking, or product
viewer UI. Those belong to adapters or products.
