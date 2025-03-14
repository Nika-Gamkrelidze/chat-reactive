import io from 'socket.io-client';
import config from '../../config/env';

let operatorSocket = null;
let messageHandler = null;
let sessionHandler = null;

// Add this near the top of your socket.js file
const DEBUG_SOCKET = true;

// Operator storage to maintain state across the application
export const operatorStorage = {
  operator: null,
  activeClients: [],
  pendingClients: [],
  clientMessages: {}, // Map of clientId -> messages array
  activeRooms: [],
  
  // Initialize or update storage with session data
  updateFromSession: function(sessionData) {
    if (sessionData.operator) {
      this.operator = sessionData.operator;
    }
    if (sessionData.activeClients) {
      this.activeClients = sessionData.activeClients;
    }
    if (sessionData.pendingClients) {
      this.pendingClients = sessionData.pendingClients;
    }
    
    // Save to sessionStorage for persistence
    this.saveToStorage();
    
    return this;
  },
  
  // Add messages for a specific client
  addClientMessage: function(clientId, message) {
    if (!clientId || !message) return this;
    
    if (!this.clientMessages[clientId]) {
      this.clientMessages[clientId] = [];
    }
    
    // Check if message already exists
    const exists = this.clientMessages[clientId].some(m => m.messageId === message.messageId);
    
    if (!exists) {
      this.clientMessages[clientId].push(message);
      // Sort messages by timestamp
      this.clientMessages[clientId].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      
      // Save to sessionStorage
      this.saveToStorage();
    }
    
    return this;
  },
  
  // Get messages for a specific client
  getClientMessages: function(clientId) {
    return this.clientMessages[clientId] || [];
  },
  
  // Save data to sessionStorage
  saveToStorage: function() {
    try {
      sessionStorage.setItem('operatorData', JSON.stringify(this.operator));
      sessionStorage.setItem('operatorActiveClients', JSON.stringify(this.activeClients));
      sessionStorage.setItem('operatorPendingClients', JSON.stringify(this.pendingClients));
      sessionStorage.setItem('operatorClientMessages', JSON.stringify(this.clientMessages));
      sessionStorage.setItem('operatorActiveRooms', JSON.stringify(this.activeRooms));
    } catch (e) {
      console.error('Error saving operator data to sessionStorage:', e);
    }
  },
  
  // Load data from sessionStorage
  loadFromStorage: function() {
    try {
      const operatorData = sessionStorage.getItem('operatorData');
      const activeClients = sessionStorage.getItem('operatorActiveClients');
      const pendingClients = sessionStorage.getItem('operatorPendingClients');
      const clientMessages = sessionStorage.getItem('operatorClientMessages');
      const activeRooms = sessionStorage.getItem('operatorActiveRooms');
      
      if (operatorData) {
        this.operator = JSON.parse(operatorData);
      }
      
      if (activeClients) {
        this.activeClients = JSON.parse(activeClients);
      }
      
      if (pendingClients) {
        this.pendingClients = JSON.parse(pendingClients);
      }
      
      if (clientMessages) {
        this.clientMessages = JSON.parse(clientMessages);
      }
      
      if (activeRooms) {
        this.activeRooms = JSON.parse(activeRooms);
      }
    } catch (e) {
      console.error('Error loading operator data from sessionStorage:', e);
    }
    
    return this;
  },
  
  // Store operator credentials
  storeOperatorCredentials: function(name, number) {
    try {
      sessionStorage.setItem('operatorName', name);
      sessionStorage.setItem('operatorNumber', number);
    } catch (e) {
      console.error('Error storing operator credentials:', e);
    }
  },
  
  // Get stored operator credentials
  getOperatorCredentials: function() {
    try {
      const name = sessionStorage.getItem('operatorName');
      const number = sessionStorage.getItem('operatorNumber');
      return { name, number };
    } catch (e) {
      console.error('Error getting operator credentials:', e);
      return { name: null, number: null };
    }
  },
  
  // Clear all data
  clear: function() {
    this.operator = null;
    this.activeClients = [];
    this.pendingClients = [];
    this.clientMessages = {};
    this.activeRooms = [];
    
    try {
      sessionStorage.removeItem('operatorData');
      sessionStorage.removeItem('operatorActiveClients');
      sessionStorage.removeItem('operatorPendingClients');
      sessionStorage.removeItem('operatorClientMessages');
      sessionStorage.removeItem('operatorActiveRooms');
      sessionStorage.removeItem('operatorId');
      sessionStorage.removeItem('operatorName');
      sessionStorage.removeItem('operatorNumber');
    } catch (e) {
      console.error('Error clearing operator data from sessionStorage:', e);
    }
    
    return this;
  }
};

// Create socket instance without connecting
export const createOperatorSocket = (msgHandler = null, sessionHandler = null) => {
  // Create socket instance
  operatorSocket = io(config.server.namespaceUrl, {
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    // Remove query and use socket.auth instead
    auth: {
      type: 'operator'
    }
  });

  // Set message and session handlers
  messageHandler = msgHandler;
  sessionHandler = sessionHandler;

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
      console.groupCollapsed(`%c Operator Socket.IO [${timestamp}] ${type}`, 'color: #e74c3c; font-weight: bold;');
      console.log('Event:', ...args);
      console.groupEnd();
    };

    // Log all incoming events
    operatorSocket.onAny((event, ...args) => {
      socketLogger('RECEIVE', event, ...args);
    });
  }

  // Connection events
  operatorSocket.on('connect', () => {
    console.log('Operator connected to server with ID:', operatorSocket.auth.operatorId);
    
    // Update operator info in storage
    operatorStorage.updateFromSession({
      operator: {
        id: operatorSocket.auth.operatorId,
        name: operatorSocket.auth.name,
        number: operatorSocket.auth.number,
        socketId: operatorSocket.id
      }
    });
    
    // Notify session handler if provided
    if (sessionHandler && typeof sessionHandler === 'function') {
      sessionHandler({
        operator: {
          id: operatorSocket.auth.operatorId,
          name: operatorSocket.auth.name,
          number: operatorSocket.auth.number,
          socketId: operatorSocket.id
        }
      });
    }
    
    // Request client queue and active clients only once after connection
    // This prevents duplicate requests
    setTimeout(() => {
      if (operatorSocket && operatorSocket.connected) {
        operatorSocket.emit('get-client-queue');
        operatorSocket.emit('get-active-clients');
      }
    }, 500);
  });

  operatorSocket.on('disconnect', (reason) => {
    console.log('Operator disconnected from server:', reason);
  });

  operatorSocket.on('connect_error', (error) => {
    console.error('Operator connection error:', error.message);
  });

  operatorSocket.on('error', (error) => {
    console.error('Socket error:', error);
  });

  // Session management
  operatorSocket.on('session', (data) => {
    console.log('Operator session established with data:', data);
    
    // Store session data
    if (data.operatorId) {
      // Store operator ID in sessionStorage for reconnection
      sessionStorage.setItem('operatorId', data.operatorId);
      
      // Update operator data in storage
      operatorStorage.operator = {
        id: data.operatorId,
        name: data.name || operatorSocket.auth.name,
        number: data.number || operatorSocket.auth.number,
        socketId: operatorSocket.id
      };
    } else if (data.operator) {
      // Alternative data structure
      sessionStorage.setItem('operatorId', data.operator.id);
      
      // Update operator data in storage
      operatorStorage.operator = {
        id: data.operator.id,
        name: data.operator.name || operatorSocket.auth.name,
        number: data.operator.number || operatorSocket.auth.number,
        socketId: operatorSocket.id
      };
    }
    
    // Save to storage
    operatorStorage.saveToStorage();
    
    // Notify through session handler if provided
    if (sessionHandler && typeof sessionHandler === 'function') {
      sessionHandler(data);
    }
  });

  // Handle incoming messages
  operatorSocket.on('receive_message', (message) => {
    console.log('Operator received message:', message);
    
    // Add message to storage
    const clientId = message.senderId;
    if (clientId) {
      operatorStorage.addClientMessage(clientId, message);
    }
    
    // Notify message handler if provided
    if (messageHandler && typeof messageHandler === 'function') {
      messageHandler(message);
    }
  });
  
  // Handle client typing indicator
  operatorSocket.on('client-typing', (data) => {
    console.log('Client typing status:', data);
    
    // Notify message handler with typing indicator
    if (messageHandler && typeof messageHandler === 'function') {
      messageHandler({
        type: 'typing',
        isTyping: data.isTyping,
        senderId: data.clientId,
        roomId: data.roomId
      });
    }
  });
  
  // Handle client queue updates
  operatorSocket.on('client-queue', (data) => {
    console.log('Client queue updated:', data);
    
    // Update pending clients in storage
    if (data.pendingClients) {
      operatorStorage.updateFromSession({
        pendingClients: data.pendingClients
      });
    }
  });
  
  // Handle active clients updates
  operatorSocket.on('active-clients', (data) => {
    console.log('Active clients updated:', data);
    
    // Update active clients in storage
    if (data.activeClients) {
      operatorStorage.updateFromSession({
        activeClients: data.activeClients
      });
    }
  });

  // Handle room assignment
  operatorSocket.on('room_assigned', (data) => {
    console.log('Room assigned to operator:', data);
    
    // Extract data
    const { roomId, client, messages = [] } = data;
    
    if (!roomId || !client) {
      console.error('Invalid room assignment data:', data);
      return;
    }
    
    // Add client to active clients if not already there
    const clientExists = operatorStorage.activeClients.some(c => c.id === client.id);
    if (!clientExists) {
      operatorStorage.activeClients.push(client);
      operatorStorage.saveToStorage();
    }
    
    // Store messages for this client
    if (messages && messages.length > 0) {
      messages.forEach(message => {
        operatorStorage.addClientMessage(client.id, message);
      });
    }
    
    // Join the room
    joinClientRoom(roomId);
    
    // Notify through message handler if provided
    if (messageHandler && typeof messageHandler === 'function') {
      messageHandler({
        type: 'room_assigned',
        roomId,
        client,
        messages
      });
    }
    
    // Notify through session handler if provided
    if (sessionHandler && typeof sessionHandler === 'function') {
      sessionHandler({
        type: 'room_assigned',
        roomId,
        client,
        activeClients: operatorStorage.activeClients
      });
    }
  });

  // Inside createOperatorSocket function, add the session-reconnect handler
  operatorSocket.on('session-reconnect', (data) => {
    console.log('Operator session reconnected:', data);
    
    if (data.operator) {
      // Store operator data
      sessionStorage.setItem('operatorId', data.operator.id);
      
      // Update operator data in storage
      operatorStorage.operator = {
        id: data.operator.id,
        name: data.operator.name,
        number: data.operator.number,
        socketId: operatorSocket.id,
        status: data.operator.status,
        departmentId: data.operator.departmentId
      };
      
      // Update active rooms if provided
      if (data.activeRooms) {
        operatorStorage.activeRooms = data.activeRooms;
      }
      
      // Save to storage
      operatorStorage.saveToStorage();
      
      // Notify through session handler if provided
      if (sessionHandler && typeof sessionHandler === 'function') {
        sessionHandler({
          type: 'session-reconnect',
          operator: data.operator,
          activeRooms: data.activeRooms
        });
      }
    }
  });

  return operatorSocket;
};

// Initialize socket connection with operator credentials
export const initOperatorSocket = (name, number, operatorId = null) => {
  // Load any existing data from storage
  operatorStorage.loadFromStorage();
  
  // Create socket instance if not already created
  if (!operatorSocket) {
    createOperatorSocket(messageHandler, sessionHandler);
  }
  
  // Store operator credentials
  operatorStorage.storeOperatorCredentials(name, number);
  
  // Set authentication data
  operatorSocket.auth = {
    name: name,
    number: number,
    operatorId: operatorId, // Include operatorId if available
    type: "operator"
  };
  
  console.log(`Connecting to socket server as operator with name: ${name} and number: ${number} and operatorId: ${operatorId}`);
  
  // Connect to the server
  if (!operatorSocket.connected) {
    operatorSocket.connect();
  }
  
  return operatorSocket;
};

// Set a message handler after initialization
export const setOperatorMessageHandler = (handler) => {
  messageHandler = handler;
};

// Set a session handler after initialization
export const setOperatorSessionHandler = (handler) => {
  sessionHandler = handler;
};

export const getOperatorSocket = () => {
  return operatorSocket;
};

export const disconnectOperatorSocket = () => {
  if (operatorSocket) {
    operatorSocket.disconnect();
    operatorSocket = null;
  }
};

// Accept a client from the queue
export const acceptClient = (clientId, roomId) => {
  if (operatorSocket && operatorSocket.connected) {
    operatorSocket.emit('accept-client', { clientId, roomId });
    return true;
  }
  return false;
};

// Send a message to a client
export const sendMessageToClient = (clientId, roomId, message) => {
  if (operatorSocket && operatorSocket.connected) {
    const messageData = {
      text: message,
      receiverId: clientId,
      roomId: roomId,
      timestamp: new Date().toISOString()
    };
    
    operatorSocket.emit('send_message_to_client', messageData);
    
    // Create a local copy of the message for storage
    const localMessage = {
      messageId: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      text: message,
      senderId: operatorStorage.operator?.id,
      senderName: operatorStorage.operator?.name,
      receiverId: clientId,
      roomId: roomId,
      timestamp: new Date().toISOString(),
      isOperator: true
    };
    
    // Add to local storage
    operatorStorage.addClientMessage(clientId, localMessage);
    
    return true;
  }
  return false;
};

// Join a client's room
export const joinClientRoom = (roomId) => {
  if (operatorSocket && operatorSocket.connected) {
    operatorSocket.emit('join_room', roomId);
  }
};

// Leave a client's room
export const leaveClientRoom = (roomId) => {
  if (operatorSocket && operatorSocket.connected) {
    operatorSocket.emit('leave_room', roomId);
  }
};

// Send typing indicator to a client
export const sendTypingToClient = (isTyping, roomId, clientId) => {
  if (operatorSocket && operatorSocket.connected) {
    operatorSocket.emit('operator-typing', { isTyping, roomId, clientId });
  }
};

// Get all stored messages for a client
export const getClientStoredMessages = (clientId) => {
  return operatorStorage.getClientMessages(clientId);
};

// Clear operator data
export const clearOperatorData = () => {
  operatorStorage.clear();
};

// Request client queue - only call this when needed, not automatically
export const requestClientQueue = () => {
  if (operatorSocket && operatorSocket.connected) {
    operatorSocket.emit('get-client-queue');
  }
};

// Request active clients - only call this when needed, not automatically
export const requestActiveClients = () => {
  if (operatorSocket && operatorSocket.connected) {
    operatorSocket.emit('get-active-clients');
  }
};

// Check if operator is already registered
export const isOperatorRegistered = () => {
  try {
    const credentials = operatorStorage.getOperatorCredentials();
    return !!(credentials && credentials.name && credentials.number && credentials.operatorId);
  } catch (error) {
    console.error('Error checking operator registration:', error);
    return false;
  }
};

// Add this function to handle reconnection
export const reconnectOperatorSocket = (msgHandler = null, sessionHandler = null) => {
  // Load any existing data from storage
  operatorStorage.loadFromStorage();
  
  // Get stored credentials
  const operatorId = sessionStorage.getItem('operatorId');
  const name = sessionStorage.getItem('operatorName');
  const number = sessionStorage.getItem('operatorNumber');
  
  // If we have stored credentials, reconnect
  if (name && number && operatorId) {
    return initOperatorSocket(name, number, operatorId, msgHandler, sessionHandler);
  }
  
  return null;
};