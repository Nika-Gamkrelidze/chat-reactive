// Environment configuration
const config = {
  // Server connection settings
  server: {
    protocol: 'https',
    // host: '192.168.14.56',
    host: 'chat.communiq.ge',
    port: '', // Empty string for default port
    namespace: 'DEMO',
    get url() {
      return `${this.protocol}://${this.host}${this.port ? ':' + this.port : ''}`;
    },
    get namespaceUrl() {
      return `${this.url}/${this.namespace}`;
    }
  },
  
  // API settings
  api: {
    baseUrl: 'https://contact.communiq.ge/rest',
    barrierToken: 'RSmbFJ84sVDphWIcUb1pqPmcFfqJGf9LT9gMlS1LsjW6Era2U73jVmzoY1IbhV76DkC1W4FgtovKiMlqIa7UvdvkAm34DBVSdGcRhJkCkswZlP3e4CfKzoJdAliF3aXsqYUY5hvruPYJWqufkiuQS7FwCBZUtpXKx0ZxhQH', // Replace with actual token
    endpoints: {
      startChat: '/?r=v1/chat/cb-start',
      question: '/?r=v1/chat/cb-question'
    }
  },
  
  // Application settings
  app: {
    name: 'Chat Application',
    version: '1.0.0',
    debug: true
  }
};

// Override with localStorage settings if they exist
if (typeof window !== 'undefined' && window.localStorage) {
  const savedHost = localStorage.getItem('serverHost');
  const savedPort = localStorage.getItem('serverPort');
  const savedNamespace = localStorage.getItem('serverNamespace');
  const savedBarrierToken = localStorage.getItem('apiBarrierToken');
  
  // Only apply saved settings if they exist and are not empty
  if (savedHost && savedHost.trim()) config.server.host = savedHost;
  if (savedPort && savedPort.trim()) config.server.port = savedPort;
  if (savedNamespace && savedNamespace.trim()) config.server.namespace = savedNamespace;
  if (savedBarrierToken && savedBarrierToken.trim()) config.api.barrierToken = savedBarrierToken;
}

export default config; 