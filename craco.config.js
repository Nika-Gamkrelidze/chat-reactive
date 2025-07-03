const path = require('path');

module.exports = {
  webpack: {
    configure: (webpackConfig, { env, paths }) => {
      // Only modify the configuration for production builds
      if (env === 'production') {
        // Disable code splitting entirely
        webpackConfig.optimization.splitChunks = {
          cacheGroups: {
            default: false,
            vendors: false
          }
        };
        
        // Ensure runtime chunk is merged into main bundle
        webpackConfig.optimization.runtimeChunk = false;
        
        // Configure JS output filename
        webpackConfig.output.filename = 'static/js/cq-pop-up-chat.js';
        webpackConfig.output.chunkFilename = 'static/js/cq-pop-up-chat.[id].js';
        
        // Configure CSS output filename
        const miniCssExtractPlugin = webpackConfig.plugins.find(
          plugin => plugin.constructor.name === 'MiniCssExtractPlugin'
        );
        
        if (miniCssExtractPlugin) {
          miniCssExtractPlugin.options.filename = 'static/css/cq-pop-up-chat.css';
          miniCssExtractPlugin.options.chunkFilename = 'static/css/cq-pop-up-chat.[id].css';
        }
        
        // Disable source maps for cleaner output (optional)
        webpackConfig.devtool = false;
      }
      
      return webpackConfig;
    }
  }
}; 