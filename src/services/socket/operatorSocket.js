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
    
    // Save to localStorage for persistence
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
  
  // Save data to localStorage
  saveToStorage: function() {
    try {
      localStorage.setItem('operatorData', JSON.stringify(this.operator));
      localStorage.setItem('operatorId', this.operatorId);
      localStorage.setItem('operatorMessages', JSON.stringify(this.messages));
      localStorage.setItem('operatorActiveClients', JSON.stringify(this.activeClients));
      localStorage.setItem('operatorPendingClients', JSON.stringify(this.pendingClients));
    } catch (e) {
      console.error('Error saving operator data to localStorage:', e);
    }
  },
  
  // Load data from localStorage
  loadFromStorage: function() {
    try {
      const operatorData = localStorage.getItem('operatorData');
      const operatorId = localStorage.getItem('operatorId');
      const messages = localStorage.getItem('operatorMessages');
      const activeClients = localStorage.getItem('operatorActiveClients');
      const pendingClients = localStorage.getItem('operatorPendingClients');

      if (operatorData) this.operator = JSON.parse(operatorData);
      if (operatorId) this.operatorId = operatorId;
      if (messages) this.messages = JSON.parse(messages);
      if (activeClients) this.activeClients = JSON.parse(activeClients);
      if (pendingClients) this.pendingClients = JSON.parse(pendingClients);
    } catch (error) {
      console.error('Error loading operator storage:', error);
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
    
    try {
      localStorage.removeItem('operatorData');
      localStorage.removeItem('operatorId');
      localStorage.removeItem('operatorMessages');
      localStorage.removeItem('operatorActiveClients');
      localStorage.removeItem('operatorPendingClients');
      sessionStorage.removeItem('operatorName');
      sessionStorage.removeItem('operatorNumber');
      sessionStorage.removeItem('operatorId');
    } catch (e) {
      console.error('Error clearing operator data from localStorage:', e);
    }
    
    return this;
  }
};

// Create socket instance without connecting
export const createOperatorSocket = (msgHandler = null, sessionHandler = null, clientListHandler = null, clientQueueHandler = null) => {
  // Set handlers if provided
  if (msgHandler && typeof msgHandler === 'function') {
    messageHandler = msgHandler;
  }
  
  if (sessionHandler && typeof sessionHandler === 'function') {
    sessionHandler = sessionHandler;
  }
  
  if (clientListHandler && typeof clientListHandler === 'function') {
    clientListHandler = clientListHandler;
  }
  
  if (clientQueueHandler && typeof clientQueueHandler === 'function') {
    clientQueueHandler = clientQueueHandler;
  }
  
  // Create socket instance if not already created
  if (!socket) {
    console.log(`Creating socket instance for operator at: ${config.server.namespaceUrl}`);
    
    socket = io(config.server.namespaceUrl, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      transports: ['websocket'],
      path: '/socket.io/',
    });
    
    // Enable Socket.IO debugging if needed
    if (DEBUG_SOCKET) {
      // Only enable socket.io debug in development
      if (process.env.NODE_ENV !== 'production') {
        sessionStorage.setItem('debug', 'socket.io-client:*');
      }
    }
    
    // Add a custom logger for all socket events
    if (DEBUG_SOCKET) {
      // Create a dedicated logger for socket events
      const socketLogger = (type, ...args) => {
        const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
        console.groupCollapsed(`%c Operator Socket.IO [${timestamp}] ${type}`, 'color: #2980b9; font-weight: bold;');
        console.log('Event:', ...args);
        console.groupEnd();
      };

      // Log all incoming events
      socket.onAny((event, ...args) => {
        socketLogger('RECEIVE', event, ...args);
      });
      
      // Add outgoing event logging
      const originalEmit = socket.emit;
      socket.emit = function(event, ...args) {
        socketLogger('SEND', event, ...args);
        return originalEmit.apply(this, [event, ...args]);
      };
    }

    // Connection events
    socket.on('connect', () => {
      console.log('Operator connected to server with ID:', socket.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('Operator disconnected from server:', reason);
    });

    socket.on('connect_error', (error) => {
      console.error('Operator connection error:', error.message);
    });

    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });

    // Handle session establishment
    socket.on('session', (data) => {
      console.log('Operator session established with data:', data);
      
      // Store session data
      if (data.operator) {
        operatorStorage.operator = data.operator;
      }
      
      if (data.operatorId) {
        operatorStorage.operatorId = data.operatorId;
        sessionStorage.setItem('operatorId', data.operatorId);
      }
      
      // Save to storage
      operatorStorage.saveToStorage();
      
      // Notify through session handler if provided
      if (sessionHandler && typeof sessionHandler === 'function') {
        sessionHandler(data);
      }
    });
    
    // Handle client list updates
    socket.on('client_list', (data) => {
      console.log('Received client list:', data);
      
      if (data && Array.isArray(data)) {
        operatorStorage.activeClients = data;
        operatorStorage.saveToStorage();
        
        if (clientListHandler && typeof clientListHandler === 'function') {
          clientListHandler(data);
        }
      }
    });
    
    // Handle client queue updates
    socket.on('client_queue', (data) => {
      console.log('Received client queue:', data);
      
      if (data && data.pendingClients) {
        operatorStorage.pendingClients = data.pendingClients;
        operatorStorage.saveToStorage();
        
        if (clientQueueHandler && typeof clientQueueHandler === 'function') {
          clientQueueHandler(data);
        }
      }
    });
    
    // Handle incoming messages
    socket.on('message', (data) => {
      console.log('Operator received message:', data);
      
      if (data) {
        operatorStorage.addMessage(data);
        
        if (messageHandler && typeof messageHandler === 'function') {
          messageHandler(data);
        }
      }
    });
  }
  
  return socket;
};

// Initialize socket connection with operator credentials
export const initOperatorSocket = (name, number, operatorId = null) => {
  // Load any existing data from storage
  operatorStorage.loadFromStorage();
  
  // Create socket instance if not already created
  if (!socket) {
    createOperatorSocket();
  }
  
  // Set authentication data
  socket.auth = {
    name: name,
    number: number,
    operatorId: operatorId, // Include operatorId if available
    type: "operator"
  };
  
  console.log(`Connecting to socket server as operator with name: ${name} and number: ${number}`);
  
  // Connect to the server
  if (!socket.connected) {
    socket.connect();
  }
  
  return socket;
};

// Check if we have stored credentials and reconnect if available
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

// Set handlers after initialization
export const setMessageHandler = (handler) => {
  if (handler && typeof handler === 'function') {
    messageHandler = handler;
  }
};

export const setSessionHandler = (handler) => {
  if (handler && typeof handler === 'function') {
    sessionHandler = handler;
  }
};

export const setClientListHandler = (handler) => {
  if (handler && typeof handler === 'function') {
    clientListHandler = handler;
  }
};

export const setClientQueueHandler = (handler) => {
  if (handler && typeof handler === 'function') {
    clientQueueHandler = handler;
  }
};

// Utility functions
export const getOperatorSocket = () => {
  return socket;
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
    return true;
  }
  return false;
};