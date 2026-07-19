import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  staticDirs: [
    {
      from: "./public",
      to: "/",
    },
    {
      from: "../../../packages/assets/visual-alpha",
      to: "/visual-alpha",
    },
    {
      from: "../../../packages/assets/robots",
      to: "/robots",
    },
    {
      from: "../node_modules/@lk-robotics/design-system-core/assets",
      to: "/assets",
    },
  ],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  core: {
    disableTelemetry: true,
  },
  docs: {
    defaultName: "Docs",
  },
  viteFinal: (viteConfig) => {
    const allowedHosts =
      viteConfig.server?.allowedHosts === true
        ? true
        : [
            ...new Set([
              ...(viteConfig.server?.allowedHosts ?? []),
              "localhost",
              "127.0.0.1",
            ]),
          ];

    return {
      ...viteConfig,
      server: {
        ...viteConfig.server,
        allowedHosts,
      },
      build: {
        ...viteConfig.build,
        assetsDir: "_sb-vite-assets",
        chunkSizeWarningLimit: 1200,
      },
      resolve: {
        ...viteConfig.resolve,
        dedupe: [
          ...new Set([...(viteConfig.resolve?.dedupe ?? []), "react", "react-dom"]),
        ],
      },
    };
  },
};

export default config;
