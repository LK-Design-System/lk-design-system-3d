# @lk-robotics/design-system-3d-core

Renderer-neutral spatial contracts for LK Design System 3D. The package uses a
right-handed, Z-up, +X-forward coordinate system measured in meters. It has no
renderer, React, Three.js, browser, or product dependency.

All spatial values crossing a package or product boundary carry an explicit
frame. Runtime operations reject non-finite coordinates, invalid unit
quaternions, and incompatible frames.
