module.exports = {
  forbidden: [
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
        path: "^(packages/(?!core)|apps)/|node_modules/(react|three|@react-three|@lk-robotics/design-system-core)",
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
        path: "^packages/(?!core(?:/|$)|assets(?:/|$)|three(?:/|$))|^apps/|^node_modules/(?:react|@react-three|@rerun-io|@lk-robotics/design-system-core)",
      },
    },
    {
      name: "pointcloud-only-depends-on-core",
      severity: "error",
      from: { path: "^packages/pointcloud/src" },
      to: {
        path: "^packages/(?!core(?:/|$)|pointcloud(?:/|$))|^apps/|^node_modules/(?:react|three|@react-three|@lk-robotics/design-system-core)",
      },
    },
    {
      name: "r3f-only-depends-on-foundation-three-and-renderer-peers",
      severity: "error",
      from: { path: "^packages/r3f/src" },
      to: {
        path: "^packages/(?!core(?:/|$)|assets(?:/|$)|pointcloud(?:/|$)|three(?:/|$)|r3f(?:/|$))|^apps/|^node_modules/(?:@rerun-io|@lk-robotics/design-system-core)",
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
