// Environment configuration
const config = {
  // Server connection settings
  server: {
    protocol: 'https',
    // host: '192.168.14.56',
    host: 'chat.communiq.ge',
    port: '', // Empty string for default port
    namespace: 'namespace1',
    get url() {
      return `${this.protocol}://${this.host}${this.port ? ':' + this.port : ''}`;
    },
    get namespaceUrl() {
      return `${this.url}/${this.namespace}`;
    }
  },
  
  // Application settings
  app: {
    name: 'CQ Chat Application',
    version: '1.0.0',
    debug: true
  }
};

// Override with localStorage settings if they exist
if (typeof window !== 'undefined' && window.localStorage) {
  const savedHost = localStorage.getItem('serverHost');
  const savedPort = localStorage.getItem('serverPort');
  const savedNamespace = localStorage.getItem('serverNamespace');
  
  // Only apply saved settings if they exist and are not empty
  if (savedHost && savedHost.trim()) config.server.host = savedHost;
  if (savedPort && savedPort.trim()) config.server.port = savedPort;
  if (savedNamespace && savedNamespace.trim()) config.server.namespace = savedNamespace;
}

export default config; 