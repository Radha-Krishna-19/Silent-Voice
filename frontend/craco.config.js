// craco.config.js
const path = require("path");

/**
 * react-scripts 5 still hands webpack-dev-server the deprecated
 * onBeforeSetupMiddleware / onAfterSetupMiddleware / https options, which
 * print deprecation warnings on every start. Fold them into the current
 * setupMiddlewares / server options instead.
 */
function modernizeDevServer(devServerConfig) {
  const {
    https,
    onAfterSetupMiddleware,
    onBeforeSetupMiddleware,
    setupMiddlewares,
    ...config
  } = devServerConfig;

  config.server =
    typeof https === "object"
      ? { type: "https", options: https }
      : https
        ? "https"
        : "http";

  config.setupMiddlewares = (middlewares, devServer) => {
    if (onBeforeSetupMiddleware) onBeforeSetupMiddleware(devServer);
    if (setupMiddlewares) middlewares = setupMiddlewares(middlewares, devServer);
    if (onAfterSetupMiddleware) onAfterSetupMiddleware(devServer);
    return middlewares;
  };

  return config;
}

module.exports = {
  eslint: {
    configure: {
      extends: ["plugin:react-hooks/recommended"],
      rules: {
        "react-hooks/rules-of-hooks": "error",
        "react-hooks/exhaustive-deps": "warn",
      },
    },
  },
  webpack: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
    configure: (webpackConfig) => {
      // Fewer watched directories -> faster rebuilds, especially on OneDrive.
      webpackConfig.watchOptions = {
        ...webpackConfig.watchOptions,
        ignored: [
          "**/node_modules/**",
          "**/.git/**",
          "**/build/**",
          "**/dist/**",
          "**/coverage/**",
          "**/public/**",
        ],
      };
      return webpackConfig;
    },
  },
  devServer: modernizeDevServer,
};
