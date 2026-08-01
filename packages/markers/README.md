# @lk-design-system/lds-3d-markers

Renderer-neutral spatial marker snapshots for LDS3D.

One immutable layer owns markers captured in one frame at one optional timestamp. The caller supplies the frame-to-scene transform, normally from `@lk-design-system/lds-3d-tf`; transport, ROS message actions, product retention policy, and application UI remain outside this package.

The first contract covers arrows, pose axes, line strips, point sets, text, volumes, and referenced meshes. Renderer adapters may require a caller-provided asset renderer for mesh markers rather than inventing a placeholder asset.
