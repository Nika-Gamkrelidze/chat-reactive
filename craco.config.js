module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // Customize the output filenames
      webpackConfig.output.filename = 'static/js/cq-chat-main.js';
      webpackConfig.output.chunkFilename = 'static/js/cq-chat-main.chunk.js';

      // Find the CSS plugin and modify its options
      const cssPlugin = webpackConfig.plugins.find(
        (plugin) => plugin.constructor.name === 'MiniCssExtractPlugin'
      );
      if (cssPlugin) {
        cssPlugin.options.filename = 'static/css/cq-chat-main.css';
        cssPlugin.options.chunkFilename = 'static/css/cq-chat-main.chunk.css';
      }

      return webpackConfig;
    },
  },
}; 