# `@lk-robotics/design-system-3d-assets`

Renderer-neutral glTF/GLB asset metadata, validation, coordinate normalization,
loading, cancellation, progress, and single-owner lifecycle contracts.

The root entry point accepts only explicitly declared right-handed coordinates.
Migration-only coordinate inference is isolated in the deprecated `./legacy`
entry point.
