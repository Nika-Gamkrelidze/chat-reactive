const config = {
  socketUrl: process.env.REACT_APP_SOCKET_URL || 'https://chatnew.communiq.ge',
  socketNamespace: process.env.REACT_APP_SOCKET_NAMESPACE || '/nikoloz',
  socketTransport: process.env.REACT_APP_SOCKET_TRANSPORT || 'websocket',
  
  // You can add more environment variables here as needed
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
};

export default config; 