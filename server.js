const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Enable CORS for all routes
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));

// Proxy requests to the chat server
app.use('/socket.io', createProxyMiddleware({
  target: 'https://chat.communiq.ge',
  changeOrigin: true,
  ws: true,
  secure: false,
  onProxyReq: (proxyReq, req, res) => {
    // Add any necessary headers
    proxyReq.setHeader('Origin', 'https://chat.communiq.ge');
  }
}));

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
}); 