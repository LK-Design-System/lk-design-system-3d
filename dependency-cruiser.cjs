// LDS DOM UI packages a renderer package must never depend on (AGENTS.md
// "LDS Public API And Dependency Boundary"). Until the scope rename only the
// legacy design-system-core facade was listed, so the rule allowed every
// current LDS package. Matched by package name anywhere in the resolved path,
// so it holds through pnpm's node_modules/.pnpm/<id>/node_modules/ layout.
const LDS_DOM_PACKAGES =
  "@lk-design-system/(design-system-core|lds-(core|theme|product|robotics-ui))($|/)";

module.exports = {
  forbidden: [
    {
      name: "renderer-packages-do-not-depend-on-lds-dom-ui",
      severity: "error",
      from: { path: "^packages/" },
      to: { path: LDS_DOM_PACKAGES },
    },
    {
      name: "core-has-no-runtime-dependencies",
      severity: "error",
      from: { path: "^packages/core/src" },
      to: { pathNot: "^packages/core/src" },
    },
    {
      name: "assets-only-depends-on-core",
      severity: "error",
      from: { path: "^packages/assets/src" },
      to: {
        path: "^(packages/(?!core)|apps)/|node_modules/(react|three|@react-three|@lk-design-system/(design-system-core|lds-(core|theme|product|robotics-ui)))",
      },
    },
    {
      name: "testing-only-depends-on-alpha1",
      severity: "error",
      from: { path: "^packages/testing/src" },
      to: { path: "^(packages/(?!core|assets|testing)|apps)/" },
    },
    {
      name: "three-only-depends-on-foundation-and-three-peer",
      severity: "error",
      from: { path: "^packages/three/src" },
      to: {
        path: "^packages/(?!core(?:/|$)|assets(?:/|$)|three(?:/|$))|^apps/|^node_modules/(?:react|@react-three|@rerun-io|@lk-design-system/(design-system-core|lds-(core|theme|product|robotics-ui)))",
      },
    },
    {
      name: "pointcloud-only-depends-on-core",
      severity: "error",
      from: { path: "^packages/pointcloud/src" },
      to: {
        path: "^packages/(?!core(?:/|$)|pointcloud(?:/|$))|^apps/|^node_modules/(?:react|three|@react-three|@lk-design-system/(design-system-core|lds-(core|theme|product|robotics-ui)))",
      },
    },
    {
      name: "tf-only-depends-on-core",
      severity: "error",
      from: { path: "^packages/tf/src" },
      to: {
        path: "^packages/(?!core(?:/|$)|tf(?:/|$))|^apps/|^node_modules/(?:react|three|@react-three|@lk-design-system/(design-system-core|lds-(core|theme|product|robotics-ui)))",
      },
    },
    {
      name: "markers-only-depends-on-core",
      severity: "error",
      from: { path: "^packages/markers/src" },
      to: {
        path: "^packages/(?!core(?:/|$)|markers(?:/|$))|^apps/|^node_modules/(?:react|three|@react-three|@lk-design-system/(design-system-core|lds-(core|theme|product|robotics-ui)))",
      },
    },
    {
      name: "r3f-only-depends-on-foundation-three-and-renderer-peers",
      severity: "error",
      from: { path: "^packages/r3f/src" },
      to: {
        path: "^packages/(?!core(?:/|$)|assets(?:/|$)|markers(?:/|$)|pointcloud(?:/|$)|three(?:/|$)|r3f(?:/|$))|^apps/|^node_modules/(?:@rerun-io|@lk-design-system/(design-system-core|lds-(core|theme|product|robotics-ui)))",
      },
    },
    {
      name: "no-package-source-imports-from-apps",
      severity: "error",
      from: { path: "^apps/" },
      to: { path: "^packages/.+/src" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.base.json" },
    enhancedResolveOptions: { exportsFields: ["exports"] },
    reporterOptions: { dot: { collapsePattern: "node_modules/[^/]+" } },
  },
};
