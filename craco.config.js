module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // Remove hash from JS files
      webpackConfig.output.filename = 'static/js/main.js';
      webpackConfig.output.chunkFilename = 'static/js/[name].js';

      // Remove hash from CSS files
      const miniCssExtractPlugin = webpackConfig.plugins.find(
        plugin => plugin.constructor.name === 'MiniCssExtractPlugin'
      );
      if (miniCssExtractPlugin) {
        miniCssExtractPlugin.options.filename = 'static/css/main.css';
        miniCssExtractPlugin.options.chunkFilename = 'static/css/[name].css';
      }

      return webpackConfig;
    },
  },
};
