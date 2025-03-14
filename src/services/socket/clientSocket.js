import { io } from 'socket.io-client';
import config from '../../config/env';

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
    // Ensure message has all required fields
    const processedMessage = {
      messageId: message.messageId,
      text: message.text,
      timestamp: message.timestamp,
      type: message.type || (message.senderId === 'system' ? 'system' : 'message'),
      senderId: message.senderId,
      receiverId: message.receiverId || 'all',
      read: message.read || false,
      readTimestamp: message.readTimestamp,
      metadata: message.metadata || {},
      roomId: message.roomId,
      senderName: message.senderName
    };

    // Determine message type and add appropriate flags
    if (message.senderId === 'system') {
      processedMessage.isSystem = true;
    } else if (message.senderId === this.client?.id) {
      processedMessage.isClient = true;
      processedMessage.senderName = this.client.name;
    } else if (message.sentByOperator) {
      processedMessage.isOperator = true;
    }

    // Check if message already exists
    const existingIndex = this.messages.findIndex(msg => msg.messageId === message.messageId);
    if (existingIndex === -1) {
      this.messages.push(processedMessage);
      // Sort messages by timestamp
      this.messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      this.saveToStorage();
      return true;
    }
    return false;
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
      localStorage.setItem('clientData', JSON.stringify(this.client));
      localStorage.setItem('clientMessages', JSON.stringify(this.messages));
      localStorage.setItem('clientRoomId', this.roomId);
      localStorage.setItem('clientHasOperator', JSON.stringify(this.hasOperator));
    } catch (e) {
      console.error('Error saving client data to localStorage:', e);
    }
  },
  
  // Load data from sessionStorage
  loadFromStorage: function() {
    try {
      const clientData = localStorage.getItem('clientData');
      const messages = localStorage.getItem('clientMessages');
      const roomId = localStorage.getItem('clientRoomId');
      const hasOperator = localStorage.getItem('clientHasOperator');

      if (clientData) this.client = JSON.parse(clientData);
      if (messages) this.messages = JSON.parse(messages);
      if (roomId) this.roomId = roomId;
      if (hasOperator) this.hasOperator = JSON.parse(hasOperator);
    } catch (error) {
      console.error('Error loading client storage:', error);
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
      localStorage.removeItem('clientData');
      localStorage.removeItem('clientMessages');
      localStorage.removeItem('clientRoomId');
      localStorage.removeItem('clientHasOperator');
      sessionStorage.removeItem('clientId');
      sessionStorage.removeItem('clientName');
      sessionStorage.removeItem('clientNumber');
      sessionStorage.removeItem('roomId');
    } catch (e) {
      console.error('Error clearing client data from localStorage:', e);
    }
    
    return this;
  },

  // Get system messages
  getSystemMessages() {
    return this.messages.filter(msg => msg.type === 'system');
  },

  // Get client messages
  getClientMessages() {
    return this.messages.filter(msg => msg.isClient);
  },

  // Get operator messages
  getOperatorMessages() {
    return this.messages.filter(msg => msg.isOperator);
  },

  // Get all messages for a specific room
  getRoomMessages(roomId) {
    return this.messages.filter(msg => msg.roomId === roomId);
  },

  // Get messages in a specific time range
  getMessagesByTimeRange(startTime, endTime) {
    return this.messages.filter(msg => {
      const msgTime = new Date(msg.timestamp);
      return msgTime >= startTime && msgTime <= endTime;
    });
  },

  // Get unread messages
  getUnreadMessages() {
    return this.messages.filter(msg => !msg.read);
  },

  // Mark message as read
  markMessageAsRead(messageId) {
    const message = this.messages.find(msg => msg.messageId === messageId);
    if (message) {
      message.read = true;
      message.readTimestamp = new Date().toISOString();
      this.saveToStorage();
    }
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
    socket.on('session-reconnect', (data) => {
      console.log('Client session reconnected:', data);
      
      if (data.client) {
        // Store client data
        sessionStorage.setItem('clientId', data.client.id);
        
        // Update client data in storage
        clientStorage.client = {
          id: data.client.id,
          name: data.client.name,
          number: data.client.number,
          socketId: socket.id,
          status: data.client.status,
          departmentId: data.client.departmentId
        };
        
        // Store room information
        if (data.roomId) {
          clientStorage.roomId = data.roomId;
          sessionStorage.setItem('roomId', data.roomId);
        }
        
        // Store operator status
        clientStorage.hasOperator = data.hasOperator || false;
        
        // Save to storage
        clientStorage.saveToStorage();
        
        // Notify through session handler if provided
        if (sessionHandler && typeof sessionHandler === 'function') {
          sessionHandler({
            type: 'session-reconnect',
            client: data.client,
            roomId: data.roomId,
            hasOperator: data.hasOperator
          });
        }
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

    // Inside createClientSocket function, update the message_history handler
    socket.on('message_history', (data) => {
      console.log('Received message history:', data);
      
      if (data.messages && Array.isArray(data.messages)) {
        // Store the room ID
        clientStorage.roomId = data.roomId;
        sessionStorage.setItem('roomId', data.roomId);
        
        // Clear existing messages before adding history
        clientStorage.messages = [];
        
        // Create a Map to track unique messages by messageId
        const uniqueMessages = new Map();
        
        // Process each message
        data.messages.forEach(message => {
          // Skip if we already have this message ID (prevents duplicates)
          if (uniqueMessages.has(message.messageId)) {
            return;
          }
          
          const processedMessage = {
            messageId: message.messageId,
            text: message.text,
            timestamp: message.timestamp,
            type: message.type || (message.senderId === 'system' ? 'system' : 'message'),
            senderId: message.senderId,
            receiverId: message.receiverId,
            read: message.read || false,
            readTimestamp: message.readTimestamp,
            metadata: message.metadata || {},
            roomId: message.roomId,
            senderName: message.senderName
          };

          // Determine message type and add appropriate flags
          if (message.senderId === 'system') {
            processedMessage.isSystem = true;
          } else if (message.senderId === clientStorage.client?.id) {
            processedMessage.isClient = true;
            processedMessage.senderName = clientStorage.client.name;
          } else if (message.sentByOperator) {
            processedMessage.isOperator = true;
          }

          // Add to unique messages map
          uniqueMessages.set(message.messageId, processedMessage);
        });
        
        // Convert map values to array and sort by timestamp
        clientStorage.messages = Array.from(uniqueMessages.values())
          .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        // Save to storage
        clientStorage.saveToStorage();
        
        console.log('Processed messages:', clientStorage.messages);
        
        // Notify through message handler
        if (messageHandler && typeof messageHandler === 'function') {
          messageHandler({
            type: 'history',
            messages: clientStorage.messages,
            roomId: data.roomId
          });
        }
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
  
  console.log(`Connecting to socket server as client with name: ${name} and number: ${number} and clientId: ${clientId}`);
  
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