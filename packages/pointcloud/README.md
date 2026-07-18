# `@lk-robotics/design-system-3d-pointcloud`

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

This package intentionally does not include ROS transport, PointCloud2/PCD
parsing, TF resolution, streaming backpressure, LOD, point picking, or product
viewer UI. Those belong to adapters or products.
