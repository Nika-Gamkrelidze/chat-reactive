module.exports = {
  webpack: {
    configure: (webpackConfig, { env, paths }) => {
      // Configure JavaScript output filename
      webpackConfig.output.filename = 'static/js/main.js';
      webpackConfig.output.chunkFilename = 'static/js/[name].chunk.js'; // Keep chunk names somewhat standard if needed

      // Configure CSS output filename
      const miniCssExtractPlugin = webpackConfig.plugins.find(
        (plugin) => plugin.constructor.name === 'MiniCssExtractPlugin'
      );
      if (miniCssExtractPlugin) {
        miniCssExtractPlugin.options.filename = 'static/css/main.css';
        miniCssExtractPlugin.options.chunkFilename = 'static/css/[name].chunk.css';
      }

      // Configure media/asset output filenames (optional, but good for consistency)
      // Find the rule for images/assets
      const assetRule = webpackConfig.module.rules.find(rule => 
        rule.oneOf && rule.oneOf.find(oneOfRule => 
          oneOfRule.options && oneOfRule.options.name && oneOfRule.options.name.includes('static/media')
        )
      );

      if (assetRule) {
        const oneOfAssetRule = assetRule.oneOf.find(oneOfRule => 
          oneOfRule.options && oneOfRule.options.name && oneOfRule.options.name.includes('static/media')
        );
        if (oneOfAssetRule) {
          oneOfAssetRule.options.name = 'static/media/[name].[ext]';
        }
      }
      
      return webpackConfig;
    },
  },
}; 