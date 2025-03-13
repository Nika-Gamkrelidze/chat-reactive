import { io } from 'socket.io-client';
import config from '../config/env';

let socket = null;
let messageHandler = null;
let sessionHandler = null;

// Add this near the top of your socket.js file
const DEBUG_SOCKET = true;

// Chat storage to maintain state across the application
export const clientStorage = {
  client: null,
  operator: null,
  roomId: null,
  hasOperator: false,
  operatorInfo: null,
  messages: [],
  
  // Initialize or update storage with session data
  updateFromSession: function(sessionData) {
    if (sessionData.client) {
      this.client = sessionData.client;
    }
    if (sessionData.operator) {
      this.operator = sessionData.operator;
      this.hasOperator = true;
      this.operatorInfo = sessionData.operator;
    }
    if (sessionData.roomId) {
      this.roomId = sessionData.roomId;
    }
    
    // Save to sessionStorage for persistence
    this.saveToStorage();
    
    return this;
  },
  
  // Add a message to storage
  addMessage: function(message) {
    if (!message) return this;
    
    // Check if message already exists
    const exists = this.messages.some(m => m.messageId === message.messageId);
    
    if (!exists) {
      this.messages.push(message);
      // Sort messages by timestamp
      this.messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      
      // Save to sessionStorage
      this.saveToStorage();
    }
    
    return this;
  },
  
  // Add multiple messages to storage
  addMessages: function(messages) {
    if (!messages || !Array.isArray(messages)) return this;
    
    let changed = false;
    
    messages.forEach(message => {
      // Check if message already exists
      const exists = this.messages.some(m => m.messageId === message.messageId);
      
      if (!exists) {
        this.messages.push(message);
        changed = true;
      }
    });
    
    if (changed) {
      // Sort messages by timestamp
      this.messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      
      // Save to sessionStorage
      this.saveToStorage();
    }
    
    return this;
  },
  
  // Save data to sessionStorage
  saveToStorage: function() {
    try {
      sessionStorage.setItem('clientData', JSON.stringify(this.client));
      sessionStorage.setItem('clientOperator', JSON.stringify(this.operator));
      sessionStorage.setItem('clientRoomId', this.roomId);
      sessionStorage.setItem('clientHasOperator', JSON.stringify(this.hasOperator));
      sessionStorage.setItem('clientOperatorInfo', JSON.stringify(this.operatorInfo));
      sessionStorage.setItem('clientMessages', JSON.stringify(this.messages));
    } catch (e) {
      console.error('Error saving client data to sessionStorage:', e);
    }
  },
  
  // Load data from sessionStorage
  loadFromStorage: function() {
    try {
      const client = sessionStorage.getItem('clientData');
      const operator = sessionStorage.getItem('clientOperator');
      const roomId = sessionStorage.getItem('clientRoomId');
      const hasOperator = sessionStorage.getItem('clientHasOperator');
      const operatorInfo = sessionStorage.getItem('clientOperatorInfo');
      const messages = sessionStorage.getItem('clientMessages');
      
      if (client) this.client = JSON.parse(client);
      if (operator) this.operator = JSON.parse(operator);
      if (roomId) this.roomId = roomId;
      if (hasOperator) this.hasOperator = JSON.parse(hasOperator);
      if (operatorInfo) this.operatorInfo = JSON.parse(operatorInfo);
      if (messages) this.messages = JSON.parse(messages);
    } catch (e) {
      console.error('Error loading client data from sessionStorage:', e);
    }
    
    return this;
  },
  
  // Store user credentials
  storeUserCredentials: function(name, number) {
    try {
      sessionStorage.setItem('clientName', name);
      sessionStorage.setItem('clientNumber', number);
    } catch (e) {
      console.error('Error storing client credentials:', e);
    }
  },
  
  // Get stored user credentials
  getUserCredentials: function() {
    try {
      const name = sessionStorage.getItem('clientName');
      const number = sessionStorage.getItem('clientNumber');
      return { name, number };
    } catch (e) {
      console.error('Error getting client credentials:', e);
      return { name: null, number: null };
    }
  },
  
  // Clear all data
  clear: function() {
    this.client = null;
    this.operator = null;
    this.roomId = null;
    this.hasOperator = false;
    this.operatorInfo = null;
    this.messages = [];
    
    try {
      sessionStorage.removeItem('clientData');
      sessionStorage.removeItem('clientOperator');
      sessionStorage.removeItem('clientRoomId');
      sessionStorage.removeItem('clientHasOperator');
      sessionStorage.removeItem('clientOperatorInfo');
      sessionStorage.removeItem('clientMessages');
      sessionStorage.removeItem('clientName');
      sessionStorage.removeItem('clientNumber');
    } catch (e) {
      console.error('Error clearing client data from sessionStorage:', e);
    }
    
    return this;
  }
};

// Create socket instance without connecting
export const createClientSocket = (msgHandler = null, sessionHandler = null) => {
  // Set message handler if provided
  if (msgHandler && typeof msgHandler === 'function') {
    messageHandler = msgHandler;
  }
  
  // Set session handler if provided
  if (sessionHandler && typeof sessionHandler === 'function') {
    sessionHandler = sessionHandler;
  }
  
  // Create socket instance if not already created
  if (!socket) {
    console.log(`Creating socket instance for client at: ${config.server.namespaceUrl}`);
    
    socket = io(config.server.namespaceUrl, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      transports: ['websocket'], // Force WebSocket transport only
      path: '/socket.io/', // Explicitly set the socket.io path
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
        console.groupCollapsed(`%c Client Socket.IO [${timestamp}] ${type}`, 'color: #3498db; font-weight: bold;');
        console.log('Event:', ...args);
        console.groupEnd();
      };

      // Log all incoming events
      socket.onAny((event, ...args) => {
        socketLogger('RECEIVE', event, ...args);
      });
    }

    // Connection events
    socket.on('connect', () => {
      console.log('Client connected to server with ID:', socket.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('Client disconnected from server:', reason);
    });

    socket.on('connect_error', (error) => {
      console.error('Client connection error:', error.message);
    });

    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });

    // Handle session establishment
    socket.on('session', (data) => {
      console.log('Client session established with data:', data);
      
      // Store session data
      if (data.client) {
        clientStorage.client = data.client;
        
        // Store client ID in sessionStorage for reconnection
        sessionStorage.setItem('clientId', data.client.id);
        sessionStorage.setItem('clientName', data.client.name);
        sessionStorage.setItem('clientNumber', data.client.number);
      }
      
      // Handle operator assignment
      if (data.operator) {
        console.log('Operator assigned to client:', data.operator);
        clientStorage.hasOperator = true;
        clientStorage.operatorInfo = data.operator;
        
        // Notify through session handler if provided
        if (sessionHandler && typeof sessionHandler === 'function') {
          sessionHandler({
            type: 'operator_assigned',
            operator: data.operator
          });
        }
      }
      
      // Store room ID if available
      if (data.roomId) {
        clientStorage.roomId = data.roomId;
      }
      
      // Save to storage
      clientStorage.saveToStorage();
      
      // Notify through session handler if provided
      if (sessionHandler && typeof sessionHandler === 'function') {
        sessionHandler(data);
      }
    });
    
    // Handle session reconnect (includes message history)
    socket.on('session-reconnect', (sessionData) => {
      console.log('Client session reconnected with data:', sessionData);
      
      // Update chat storage with session data
      clientStorage.updateFromSession(sessionData);
      
      // Add messages from session-reconnect to storage
      if (sessionData.messages && Array.isArray(sessionData.messages)) {
        clientStorage.addMessages(sessionData.messages);
        
        // Process each message for the UI
        if (messageHandler && typeof messageHandler === 'function') {
          sessionData.messages.forEach(message => {
            messageHandler(message);
          });
        }
      }
      
      // Call the session handler if provided
      if (sessionHandler && typeof sessionHandler === 'function') {
        sessionHandler(sessionData);
      }
    });

    // Handle incoming messages, including system messages
    socket.on('message', (data) => {
      console.log('Client received message:', data);
      
      // Check if data contains messages array
      if (data && data.messages && Array.isArray(data.messages)) {
        // Add messages to storage
        clientStorage.addMessages(data.messages);
        
        // Process each message in the array
        if (messageHandler && typeof messageHandler === 'function') {
          data.messages.forEach(message => {
            messageHandler(message);
          });
        }
      } else {
        // Handle single message
        if (data) {
          clientStorage.addMessage(data);
        }
        
        if (messageHandler && typeof messageHandler === 'function') {
          messageHandler(data);
        }
      }
    });
    
    // Handle operator assignment
    socket.on('operator-assigned', (operatorData) => {
      console.log('Operator assigned to client:', operatorData);
      
      clientStorage.hasOperator = true;
      clientStorage.operatorInfo = operatorData;
      clientStorage.saveToStorage();
      
      // Notify through message handler
      if (messageHandler && typeof messageHandler === 'function') {
        messageHandler({
          type: 'system',
          text: `Operator ${operatorData.name} has joined the chat.`,
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Handle operator unassignment
    socket.on('operator-unassigned', () => {
      console.log('Operator unassigned from client');
      
      const operatorName = clientStorage.operatorInfo?.name || 'The operator';
      
      clientStorage.hasOperator = false;
      clientStorage.operatorInfo = null;
      clientStorage.saveToStorage();
      
      // Notify through message handler
      if (messageHandler && typeof messageHandler === 'function') {
        messageHandler({
          type: 'system',
          text: `${operatorName} has left the chat.`,
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Handle operator typing indicator
    socket.on('operator-typing', (typingData) => {
      console.log('Operator typing status:', typingData);
      
      // Call the message handler if provided
      if (messageHandler && typeof messageHandler === 'function') {
        messageHandler({ type: 'typing', ...typingData });
      }
    });
  }
  
  return socket;
};

// Initialize socket connection with user credentials
export const initClientSocket = (name, number, clientId = null, msgHandler = null, sessionHandler = null) => {
  // Load any existing data from storage
  clientStorage.loadFromStorage();
  
  // Create socket instance if not already created
  if (!socket) {
    createClientSocket(msgHandler, sessionHandler);
  }
  
  // Store user credentials
  clientStorage.storeUserCredentials(name, number);
  
  // Set authentication data
  socket.auth = {
    name: name,
    number: number,
    clientId: clientId, // Include clientId if available
    type: "client"
  };
  
  console.log(`Connecting to socket server as client with name: ${name} and number: ${number}`);
  
  // Connect to the server
  if (!socket.connected) {
    socket.connect();
  }
  
  return socket;
};

// Check if we have stored credentials and reconnect if available
export const reconnectClientSocket = (msgHandler = null, sessionHandler = null) => {
  // Load any existing data from storage
  clientStorage.loadFromStorage();
  
  // Get stored credentials
  const clientId = sessionStorage.getItem('clientId');
  const name = sessionStorage.getItem('clientName');
  const number = sessionStorage.getItem('clientNumber');
  
  // If we have stored credentials, reconnect
  if (name && number && clientId) {
    return initClientSocket(name, number, clientId, msgHandler, sessionHandler);
  }
  
  return null;
};

// Set a message handler after initialization
export const setClientMessageHandler = (handler) => {
  if (handler && typeof handler === 'function') {
    messageHandler = handler;
  } else {
    console.error('Invalid message handler provided:', handler);
  }
};

// Set a session handler after initialization
export const setClientSessionHandler = (handler) => {
  if (handler && typeof handler === 'function') {
    sessionHandler = handler;
  } else {
    console.error('Invalid session handler provided:', handler);
  }
};

export const getClientSocket = () => {
  return socket;
};

export const disconnectClientSocket = () => {
  if (socket) socket.disconnect();
};

// Send a message to the operator
export const sendClientMessage = (message) => {
  if (socket && socket.connected) {
    const messageData = {
      text: message,
      timestamp: new Date().toISOString()
    };
    
    socket.emit('send_message', messageData);
    
    // Create a local copy of the message for storage
    const localMessage = {
      messageId: `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      text: message,
      senderId: clientStorage.client?.id,
      senderName: clientStorage.client?.name,
      timestamp: new Date().toISOString(),
      isClient: true
    };
    
    // Add to local storage
    clientStorage.addMessage(localMessage);
    
    return true;
  }
  return false;
};

// Join a room
export const joinClientRoom = (roomId) => {
  if (socket && socket.connected) {
    socket.emit('join_room', roomId);
  }
};

// Send typing indicator to the operator
export const sendClientTypingStatus = (isTyping) => {
  if (socket && socket.connected) {
    socket.emit('client-typing', { isTyping });
  }
};

// Get all stored messages
export const getClientStoredMessages = () => {
  return clientStorage.messages;
};

// Clear client data
export const clearClientData = () => {
  clientStorage.clear();
};

// Check if client is already registered
export const isClientRegistered = () => {
  const { name, number } = clientStorage.getUserCredentials();
  return !!(name && number);
}; 