import { io } from 'socket.io-client';
import config from '../../config/env';

let socket = null;
let messageHandler = null;
let sessionHandler = null;
let clientListHandler = null;
let clientQueueHandler = null;

// Debug flag
const DEBUG_SOCKET = true;

// Operator storage to maintain state across the application
export const operatorStorage = {
  operator: null,
  operatorId: null,
  activeClients: [],
  pendingClients: [],
  messages: {},
  
  // Initialize or update storage with session data
  updateFromSession: function(sessionData) {
    if (sessionData.operator) {
      this.operator = sessionData.operator;
    }
    if (sessionData.operatorId) {
      this.operatorId = sessionData.operatorId;
    }
    
    // Save to sessionStorage for persistence
    this.saveToStorage();
    
    return this;
  },
  
  // Add a message to storage
  addMessage: function(message) {
    if (!message || !message.clientId) return false;
    
    // Initialize client messages array if it doesn't exist
    if (!this.messages[message.clientId]) {
      this.messages[message.clientId] = [];
    }
    
    // Check if message already exists
    const existingIndex = this.messages[message.clientId].findIndex(
      msg => msg.messageId === message.messageId
    );
    
    if (existingIndex === -1) {
      this.messages[message.clientId].push(message);
      // Sort messages by timestamp
      this.messages[message.clientId].sort(
        (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
      );
      this.saveToStorage();
      return true;
    }
    return false;
  },
  
  // Save data to sessionStorage
  saveToStorage: function() {
    try {
      sessionStorage.setItem('operatorData', JSON.stringify(this.operator));
      sessionStorage.setItem('operatorId', this.operatorId);
      sessionStorage.setItem('activeClients', JSON.stringify(this.activeClients));
      sessionStorage.setItem('pendingClients', JSON.stringify(this.pendingClients));
      sessionStorage.setItem('operatorMessages', JSON.stringify(this.messages));
    } catch (e) {
      console.error('Error saving to sessionStorage:', e);
    }
  },
  
  // Load data from sessionStorage
  loadFromStorage: function() {
    try {
      const operatorData = sessionStorage.getItem('operatorData');
      const operatorId = sessionStorage.getItem('operatorId');
      const activeClients = sessionStorage.getItem('activeClients');
      const pendingClients = sessionStorage.getItem('pendingClients');
      const messages = sessionStorage.getItem('operatorMessages');
      
      if (operatorData) this.operator = JSON.parse(operatorData);
      if (operatorId) this.operatorId = operatorId;
      if (activeClients) this.activeClients = JSON.parse(activeClients);
      if (pendingClients) this.pendingClients = JSON.parse(pendingClients);
      if (messages) this.messages = JSON.parse(messages);
    } catch (e) {
      console.error('Error loading from sessionStorage:', e);
    }
    
    return this;
  },
  
  // Clear all data
  clear: function() {
    this.operator = null;
    this.operatorId = null;
    this.activeClients = [];
    this.pendingClients = [];
    this.messages = {};
    
    // Clear sessionStorage
    sessionStorage.removeItem('operatorData');
    sessionStorage.removeItem('operatorId');
    sessionStorage.removeItem('activeClients');
    sessionStorage.removeItem('pendingClients');
    sessionStorage.removeItem('operatorMessages');
    sessionStorage.removeItem('operatorName');
    sessionStorage.removeItem('operatorNumber');
  }
};

// Create socket instance without connecting
export const createOperatorSocket = () => {
  if (!socket) {
    console.log(`Creating socket instance for operator at: ${config.server.namespaceUrl}`);
    
    socket = io(config.server.namespaceUrl, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      transports: ['websocket']
    });
    
    // Add logging for socket events if debug is enabled
    if (DEBUG_SOCKET) {
      // Log all incoming events
      socket.onAny((event, ...args) => {
        console.groupCollapsed(`%c Operator Socket.IO RECEIVE`, 'color: #2ecc71; font-weight: bold;');
        console.log('Event:', event, ...args);
        console.groupEnd();
      });

      // Add outgoing event logging
      const originalEmit = socket.emit;
      socket.emit = function(event, ...args) {
        console.groupCollapsed(`%c Operator Socket.IO SEND`, 'color: #e74c3c; font-weight: bold;');
        console.log('Event:', event, ...args);
        console.groupEnd();
        return originalEmit.apply(this, [event, ...args]);
      };
    }
    
    // Handle connection events
    socket.on('connect', () => {
      console.log(`Operator connected to server with ID: ${socket.id}`);
    });
    
    socket.on('disconnect', (reason) => {
      console.log(`Operator disconnected from server: ${reason}`);
    });
    
    // Handle session establishment
    socket.on('session', (data) => {
      console.log('Operator session established with data:', data);
      
      // Update operator storage with session data
      operatorStorage.updateFromSession(data);
      
      // Store operator ID in session storage
      if (data.operatorId) {
        sessionStorage.setItem('operatorId', data.operatorId);
      }
      
      // Call session handler if defined
      if (sessionHandler && typeof sessionHandler === 'function') {
        sessionHandler(data);
      }
    });
    
    // Handle client list updates
    socket.on('active_clients', (data) => {
      console.log('Received active clients:', data);
      
      if (data && data.clients) {
        operatorStorage.activeClients = data.clients;
        operatorStorage.saveToStorage();
        
        if (clientListHandler && typeof clientListHandler === 'function') {
          clientListHandler(data.clients);
        }
      }
    });
    
    // Handle client queue updates
    socket.on('client_queue', (data) => {
      console.log('Received client queue:', data);
      
      if (data && data.queue) {
        operatorStorage.pendingClients = data.queue;
        operatorStorage.saveToStorage();
        
        if (clientQueueHandler && typeof clientQueueHandler === 'function') {
          clientQueueHandler(data.queue);
        }
      }
    });
    
    // Handle incoming messages
    socket.on('message_from_client', (data) => {
      console.log('Received message from client:', data);
      
      if (data && data.clientId && data.message) {
        const messageObj = {
          messageId: data.message.messageId || `client_${Date.now()}`,
          clientId: data.clientId,
          text: data.message.text,
          timestamp: data.message.timestamp || new Date().toISOString(),
          sentByOperator: false
        };
        
        operatorStorage.addMessage(messageObj);
        
        if (messageHandler && typeof messageHandler === 'function') {
          messageHandler(messageObj);
        }
      }
    });
    
    // Handle client typing indicator
    socket.on('client-typing', (data) => {
      if (messageHandler && typeof messageHandler === 'function') {
        messageHandler({
          type: 'typing',
          clientId: data.clientId,
          isTyping: data.isTyping
        });
      }
    });
  }
  
  return socket;
};

// Initialize socket connection with operator credentials
export const initOperatorSocket = (username, number, operatorId = null) => {
  // Create socket instance if not already created
  if (!socket) {
    createOperatorSocket();
  }
  
  // Store operator credentials
  sessionStorage.setItem('operatorName', username);
  sessionStorage.setItem('operatorNumber', number);
  
  // Set authentication data
  socket.auth = {
    name: username,
    number: number,
    operatorId: operatorId || sessionStorage.getItem('operatorId'),
    type: "operator"
  };
  
  console.log(`Connecting to socket server as operator with name: ${username} and number: ${number} and operatorId: ${operatorId || 'null'}`);
  
  // Connect to the server
  if (!socket.connected) {
    socket.connect();
  }
  
  return socket;
};

// Reconnect with stored credentials
export const reconnectOperatorSocket = () => {
  // Load any existing data from storage
  operatorStorage.loadFromStorage();
  
  // Get stored credentials
  const operatorId = sessionStorage.getItem('operatorId');
  const name = sessionStorage.getItem('operatorName');
  const number = sessionStorage.getItem('operatorNumber');
  
  // If we have stored credentials, reconnect
  if (name && number) {
    return initOperatorSocket(name, number, operatorId);
  }
  
  return null;
};

// Set handlers
export const setSessionHandler = (handler) => {
  if (handler && typeof handler === 'function') {
    console.log('Setting operator session handler');
    sessionHandler = handler;
  } else {
    console.error('Invalid session handler provided:', handler);
  }
};

export const setMessageHandler = (handler) => {
  if (handler && typeof handler === 'function') {
    messageHandler = handler;
  } else {
    console.error('Invalid message handler provided:', handler);
  }
};

export const setClientListHandler = (handler) => {
  if (handler && typeof handler === 'function') {
    clientListHandler = handler;
  } else {
    console.error('Invalid client list handler provided:', handler);
  }
};

export const setClientQueueHandler = (handler) => {
  if (handler && typeof handler === 'function') {
    clientQueueHandler = handler;
  } else {
    console.error('Invalid client queue handler provided:', handler);
  }
};

export const disconnectOperatorSocket = () => {
  if (socket) socket.disconnect();
};

// Request client queue
export const requestClientQueue = () => {
  if (socket && socket.connected) {
    socket.emit('get_client_queue');
    return true;
  }
  return false;
};

// Request active clients
export const requestActiveClients = () => {
  if (socket && socket.connected) {
    socket.emit('get_active_clients');
    return true;
  }
  return false;
};

// Send message to client
export const sendMessageToClient = (clientId, message) => {
  if (socket && socket.connected) {
    socket.emit('send_message_to_client', {
      clientId,
      message
    });
    return true;
  }
  return false;
};

// Accept client from queue
export const acceptClient = (clientId) => {
  if (socket && socket.connected) {
    socket.emit('accept_client', { clientId });
    return true;
  }
  return false;
};

// Send typing indicator to client
export const sendTypingStatus = (clientId, isTyping) => {
  if (socket && socket.connected) {
    socket.emit('operator-typing', { clientId, isTyping });
  }
};