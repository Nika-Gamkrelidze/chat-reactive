const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    '/socket.io',
    createProxyMiddleware({
      target: 'https://chat.communiq.ge',
      changeOrigin: true,
      ws: true,
      secure: false,
      headers: {
        'Origin': 'https://chat.communiq.ge'
      }
    })
  );
}; 