const config = {
  server: {
    protocol: 'http',
    host: '127.0.0.1',
    port: '4000', 
    namespace: 'DEMO',
    get url() {
      return `${this.protocol}://${this.host}${this.port ? ':' + this.port : ''}`;
    },
    get namespaceUrl() {
      return `${this.url}/${this.namespace}`;
    }
  },
  
  app: {
    name: 'Chat Application',
    version: '1.0.0',
    debug: true
  }
};

if (typeof window !== 'undefined' && window.localStorage) {
  const savedHost = localStorage.getItem('serverHost');
  const savedPort = localStorage.getItem('serverPort');
  const savedNamespace = localStorage.getItem('serverNamespace');
  
  if (savedHost && savedHost.trim()) config.server.host = savedHost;
  if (savedPort && savedPort.trim()) config.server.port = savedPort;
  if (savedNamespace && savedNamespace.trim()) config.server.namespace = savedNamespace;
}

export default config; 