# @lk-robotics/design-system-3d-tf

Renderer-neutral, timestamped frame-tree contracts for LDS3D.

The package owns frame topology validation and deterministic lookup at a caller-selected timestamp. A transform sample uses `sourceFrame` as the child and `targetFrame` as its single parent. It does not subscribe to ROS topics, choose a product clock, or own renderer/UI state.

Lookup results distinguish exact, interpolated, and bounded hold-last transforms from missing frames, clock mismatches, stale data, and extrapolation. Consumers decide whether a non-ready result should hide, freeze, or annotate spatial content.
