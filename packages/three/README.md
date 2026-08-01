# @lk-design-system/lds-3d-three

The imperative Three.js adapter for LK Design System 3D. It owns the core-to-
Three basis, a canvas-bound scene host, GLB ownership, resize and context-loss
lifecycle, and renderer-side picking. Its root API deliberately does not expose
raw `THREE.Scene`, `Object3D`, or `WebGLRenderer` objects to product code.

`@lk-design-system/lds-3d-three/r3f-bridge` is an implementation-only
bridge used by the sibling R3F package. Products should consume the root API and
renderer-neutral core contracts instead.
