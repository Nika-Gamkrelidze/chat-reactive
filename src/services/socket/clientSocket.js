import { io } from 'socket.io-client';
import config from '../../config/env';


let socket = null;
let messageHandler = null;
let sessionHandler = null;

// Debug flag
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
    if (!message.messageId) return false;
    
    // Check if message already exists
    const existingIndex = this.messages.findIndex(msg => msg.messageId === message.messageId);
    if (existingIndex === -1) {
      this.messages.push(message);
      // Sort messages by timestamp
      this.saveToStorage();
      return true;
    }
    return false;
  },
  
  // Add multiple messages to storage
  addMessages: function(messages) {
    if (!Array.isArray(messages)) return false;
    
    let added = false;
    messages.forEach(message => {
      const wasAdded = this.addMessage(message);
      if (wasAdded) added = true;
    });
    
    return added;
  },
  
  // Save data to sessionStorage
  saveToStorage: function() {
    try {
      sessionStorage.setItem('clientData', JSON.stringify(this.client));
      sessionStorage.setItem('operatorData', JSON.stringify(this.operatorInfo));
      sessionStorage.setItem('roomId', this.roomId);
      sessionStorage.setItem('hasOperator', this.hasOperator);
      sessionStorage.setItem('messages', JSON.stringify(this.messages));
    } catch (e) {
      console.error('Error saving to sessionStorage:', e);
    }
  },
  
  // Load data from sessionStorage
  loadFromStorage: function() {
    try {
      const clientData = sessionStorage.getItem('clientData');
      const operatorData = sessionStorage.getItem('operatorData');
      const roomId = sessionStorage.getItem('roomId');
      const hasOperator = sessionStorage.getItem('hasOperator');
      const messages = sessionStorage.getItem('messages');
      
      if (clientData) this.client = JSON.parse(clientData);
      if (operatorData) this.operatorInfo = JSON.parse(operatorData);
      if (roomId) this.roomId = roomId;
      if (hasOperator) this.hasOperator = hasOperator === 'true';
      if (messages) this.messages = JSON.parse(messages);
    } catch (e) {
      console.error('Error loading from sessionStorage:', e);
    }
    
    return this;
  },
  
  // Get user credentials from storage
  getUserCredentials: function() {
    return {
      name: sessionStorage.getItem('clientName'),
      number: sessionStorage.getItem('clientNumber'),
      clientId: sessionStorage.getItem('clientId')
    };
  },
  
  // Store user credentials
  storeUserCredentials: function(name, number, police) {
    sessionStorage.setItem('clientName', name);
    sessionStorage.setItem('clientNumber', number);
    sessionStorage.setItem('clientPolice', police);
  },
  
  // Clear all data
  clear: function() {
    this.client = null;
    this.operator = null;
    this.roomId = null;
    this.hasOperator = false;
    this.operatorInfo = null;
    this.messages = [];
    
    // Clear sessionStorage
    sessionStorage.removeItem('clientData');
    sessionStorage.removeItem('operatorData');
    sessionStorage.removeItem('roomId');
    sessionStorage.removeItem('hasOperator');
    sessionStorage.removeItem('messages');
    sessionStorage.removeItem('clientName');
    sessionStorage.removeItem('clientNumber');
    sessionStorage.removeItem('clientPolice');
    sessionStorage.removeItem('clientId');
  }
};

// Create socket instance without connecting
export const createClientSocket = () => {
  if (!socket) {
    console.log(`Creating socket instance for client at: ${config.server.namespaceUrl}`);
    
    socket = io(config.server.namespaceUrl, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      transports: ['websocket', 'polling']
    });
    
    // Add logging for socket events if debug is enabled
    if (DEBUG_SOCKET) {
      // Log all incoming events
      socket.onAny((event, ...args) => {
        console.groupCollapsed(`%c Client Socket.IO RECEIVE`, 'color: #3498db; font-weight: bold;');
        console.log('Event:', event, ...args);
        console.groupEnd();
      });

      // Add outgoing event logging
      const originalEmit = socket.emit;

      socket.emit = function(event, ...args) {
        console.groupCollapsed(`%c Client Socket.IO SEND`, 'color: #e74c3c; font-weight: bold;');
        console.log('Event:', event, ...args);
        console.groupEnd();
        return originalEmit.apply(this, [event, ...args]);
      };
    }
    
    // Handle connection events
    socket.on('connect', () => {
      console.log(`Client connected to server with ID: ${socket.id}`);
    });
    
    socket.on('disconnect', (reason) => {
      console.log(`Client disconnected from server: ${reason}`);
    });
    
    socket.on('connect_error', (error) => {
      console.error('Client socket connection error:', error);
    });
    
    // Add this new event handler before the session event
    socket.on('operator_joined', (data) => {
      console.log('Operator joined:', data);
      if (data.operator) {
        clientStorage.updateFromSession({
          operator: data.operator,
          roomId: data.roomId
        });
        
        // Call session handler if defined
        if (sessionHandler && typeof sessionHandler === 'function') {
          sessionHandler({
            operator: data.operator,
            roomId: data.roomId
          });
        }
      }
    });
    
    // Handle session establishment
    socket.on('session', (data) => {
      console.log('Client session established with data:', data);
      
      // Clear existing data first
      clientStorage.clear();
      
      // Update storage with new session data
      clientStorage.updateFromSession(data);
      
      // Update socket auth with new client ID if available
      if (data.client && data.client.id) {
        socket.auth.clientId = data.client.id;
        sessionStorage.setItem('clientId', data.client.id);
      }
      
      // Store client name and number
      if (socket.auth.name && socket.auth.number) {
        sessionStorage.setItem('clientName', socket.auth.name);
        sessionStorage.setItem('clientNumber', socket.auth.number);
      }
      
      // Call session handler if defined
      if (sessionHandler && typeof sessionHandler === 'function') {
        sessionHandler(data);
      }
    });
    
    // Handle incoming messages
    socket.on('message', (data) => {
      console.log('Client received message:', data);
      
      // Skip if no message handler
      if (!messageHandler || typeof messageHandler !== 'function') return;
      
      // Process messages
      if (Array.isArray(data)) {
        // Handle array of messages - send as single update
        messageHandler(data);
      } else if (data.messages && Array.isArray(data.messages)) {
        // Handle message object with messages array - send as single update
        messageHandler(data.messages);
      } else if (data.text || data.messageId) {
        // Single message object
        messageHandler(data);
      }
    });
    
    // Handle typing indicator
    socket.on('operator_typing', (data) => {
      if (messageHandler && typeof messageHandler === 'function') {
        // Pass the full data object including roomId, userId, isTyping
        messageHandler({
          type: 'typing',
          ...data // Contains isTyping, roomId, userId
        });
      }
    });

    socket.on('session-reconnect', (data) => {
      console.log('Client session reconnected with data:', data);
      
      // Update storage with reconnected session data
      clientStorage.updateFromSession(data);
      
      // Call session handler if defined
      if (sessionHandler && typeof sessionHandler === 'function') {
        sessionHandler(data);
      }
    });

    socket.on('ask_for_feedback', () => {
      // Use the existing session handler to communicate back to the component
      if (sessionHandler && typeof sessionHandler === 'function') {
        sessionHandler({ showFeedback: true });
      }
    });

    socket.on('feedback_submitted', (data) => {
      console.log('Received feedback_submitted event:', data);
      // Use the session handler to notify the component
      if (sessionHandler && typeof sessionHandler === 'function') {
        // Notify component *before* cleanup
        sessionHandler({ feedbackProcessed: true, success: data.success });

        // Cleanup socket regardless of success
        cleanupClientSocket();
      }
    });
  }
  
  return socket;
};

// Add this function to check if socket exists and is connected
export const isSocketConnected = () => {
  return socket && socket.connected;
};

// Modify initClientSocket to accept police value and include it in metadata
export const initClientSocket = (name, number, police, clientId = null) => {
  // If socket exists and is connected, just return it
  if (isSocketConnected()) {
    console.log('Socket already connected, reusing existing connection');
    return socket;
  }
  
  // Create socket instance if not already created
  if (!socket) {
    createClientSocket();
  } else if (socket.connected) {
    // If already connected, disconnect first to reset state
    socket.disconnect();
  }
  
  // Store user credentials including police
  clientStorage.storeUserCredentials(name, number, police);
  
  // Set authentication data
  socket.auth = {
    name: name,
    number: number,
    userId: clientId || sessionStorage.getItem('clientId'),
    type: 'client',
    metadata: {
      police: police
    }
  };
  
  console.log(`Connecting to socket server as client with name: ${name} and number: ${number} and userId: ${clientId || 'null'}`);
  
  // Connect to the server
  socket.connect();
  
  return socket;
};

// Reconnect with stored credentials
export const reconnectClientSocket = () => {
  // Load any existing data from storage
  clientStorage.loadFromStorage();
  
  // Get stored credentials
  const clientId = sessionStorage.getItem('clientId');
  const name = sessionStorage.getItem('clientName');
  const number = sessionStorage.getItem('clientNumber');
  // Get police from storage
  const police = sessionStorage.getItem('clientPolice');
  
  console.log('Attempting to reconnect with stored credentials:', { clientId, name, number, police });
  
  // If we have stored credentials, reconnect
  if (name && number && police) {
    // Create socket instance if not already created
    if (!socket) {
      createClientSocket();
    }
    
    // Set authentication data with stored credentials
    socket.auth = {
      name: name,
      number: number,
      userId: clientId, // Include clientId if available
      type: "client",
      metadata: {
        police: police
      }
    };
    
    console.log(`Reconnecting to socket server as client with name: ${name}, number: ${number}, police: ${police}, and userId: ${clientId || 'null'}`);
    
    // Connect to the server
    if (!socket.connected) {
      socket.connect();
    }
    
    return socket;
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
    console.log('Setting client session handler');
    sessionHandler = handler;
  } else {
    console.error('Invalid session handler provided:', handler);
  }
};

// Disconnect client socket
export const disconnectClientSocket = () => {
  if (socket && socket.connected) {
    console.log('Disconnecting client socket');
    socket.disconnect();
  }
};

// Get client socket instance
export const getClientSocket = () => {
  return socket;
};

// Send message to operator
export const sendClientMessage = (text, roomId) => {
  if (!socket || !socket.connected) {
    console.error('Cannot send message: socket not connected');
    return false;
  }
  
  const clientId = clientStorage.client?.id || sessionStorage.getItem('clientId');
  
  if (!clientId) {
    console.error('Cannot send message: client ID not available');
    return false;
  }
  
  if (!roomId) {
    console.error('Cannot send message: room ID not provided');
    return false;
  }
  
  const messageData = {
    text,
    roomId,
    senderId: clientId
  };
  
  // Just emit the message to server - no temporary message creation
  socket.emit('send_message', messageData);
};

// Send typing indicator event to the server
export const sendTypingEvent = (isTyping) => {
  if (socket && socket.connected) {
    const roomId = clientStorage.roomId || sessionStorage.getItem('roomId');
    const clientId = clientStorage.client?.id || sessionStorage.getItem('clientId');

    if (!roomId || !clientId) {
      console.error("Cannot send typing event: roomId or clientId missing.");
      return;
    }

    socket.emit('typing', {
      roomId,
      userId: clientId,
      userType: 'client',
      isTyping
    });
  }
};

// Check if client is already registered
export const isClientRegistered = () => {
  const { name, number } = clientStorage.getUserCredentials();
  return !!(name && number);
};

// Clear all client data
export const clearClientData = () => {
  clientStorage.clear();
};

// Send end chat notification to server
export const sendClientEndChat = (clientData) => {
  if (socket && socket.connected) {
    socket.emit('end_chat', clientData);
    // Note: We don't disconnect here anymore as we need to wait for feedback submission
  }
};

// Send feedback to server
export const sendClientFeedback = (feedbackData) => {
  if (socket && socket.connected) {
    const currentRoomId = clientStorage.roomId || sessionStorage.getItem('roomId');
    const currentClientId = clientStorage.client?.id || sessionStorage.getItem('clientId');

    if (!currentRoomId) {
      console.error("Cannot send feedback: Room ID not found.");
      return;
    }
    if (!currentClientId) {
        console.error("Cannot send feedback: Client ID not found.");
        return;
    }

    // feedbackData should contain { score, comment }
    const payload = {
        // Rename score to rating
        rating: feedbackData.score, 
        comment: feedbackData.comment,
        roomId: currentRoomId,
        // Add clientId
        clientId: currentClientId
    };

    socket.emit('client_feedback', payload);
  }
};

// Add this new function
export const cleanupClientSocket = () => {
  if (socket) {
    // Remove all listeners
    socket.removeAllListeners();
    // Disconnect socket
    socket.disconnect();
    // Reset socket instance
    socket = null;
    // Reset handlers
    messageHandler = null;
    sessionHandler = null;
  }
  
  // Clear storage
  clientStorage.clear();
};

// Send callback request to server
export const sendClientCallbackRequest = (callbackData) => {
  if (socket && socket.connected) {
    socket.emit('submit_callback', callbackData);
    // Cleanup after sending callback request
    cleanupClientSocket();
  }
};