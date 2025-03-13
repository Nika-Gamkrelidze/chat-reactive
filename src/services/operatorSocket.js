import { io } from 'socket.io-client';
import config from '../config/env';

let socket = null;
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
  storeOperatorCredentials: function(name, number, operatorId = null) {
    this.operator = {
      id: operatorId || '',
      name: name,
      number: number,
      socketId: ''
    };
    this.saveToStorage();
  },
  
  // Get operator credentials
  getOperatorCredentials: function() {
    try {
      const name = sessionStorage.getItem('operatorName');
      const number = sessionStorage.getItem('operatorNumber');
      const operatorId = sessionStorage.getItem('operatorId');
      return { name, number, operatorId };
    } catch (e) {
      console.error('Error getting operator credentials from sessionStorage:', e);
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
    console.log(`Creating socket instance for operator at: ${config.server.namespaceUrl}`);
    
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
        console.groupCollapsed(`%c Operator Socket.IO [${timestamp}] ${type}`, 'color: #e74c3c; font-weight: bold;');
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
      console.log('Operator connected to server with ID:', socket.auth.operatorId);
      
      // Update operator info in storage
      operatorStorage.updateFromSession({
        operator: {
          id: socket.auth.operatorId,
          name: socket.auth.name,
          number: socket.auth.number,
          socketId: socket.id
        }
      });
      
      // Notify session handler if provided
      if (sessionHandler && typeof sessionHandler === 'function') {
        sessionHandler({
          operator: {
            id: socket.auth.operatorId,
            name: socket.auth.name,
            number: socket.auth.number,
            socketId: socket.id
          }
        });
      }
      
      // Request client queue and active clients only once after connection
      // This prevents duplicate requests
      setTimeout(() => {
        if (socket && socket.connected) {
          socket.emit('get-client-queue');
          socket.emit('get-active-clients');
        }
      }, 500);
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

    // Session management
    socket.on('session', (data) => {
      console.log('Operator session established with data:', data);
      
      // Store session data
      if (data.operatorId) {
        // Store operator ID in sessionStorage for reconnection
        sessionStorage.setItem('operatorId', data.operatorId);
        
        // Update operator data in storage
        operatorStorage.operator = {
          id: data.operatorId,
          name: data.name || socket.auth.name,
          number: data.number || socket.auth.number,
          socketId: socket.id
        };
      } else if (data.operator) {
        // Alternative data structure
        sessionStorage.setItem('operatorId', data.operator.id);
        
        // Update operator data in storage
        operatorStorage.operator = {
          id: data.operator.id,
          name: data.operator.name || socket.auth.name,
          number: data.operator.number || socket.auth.number,
          socketId: socket.id
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
    socket.on('receive_message', (message) => {
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
    socket.on('client-typing', (data) => {
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
    socket.on('client-queue', (data) => {
      console.log('Client queue updated:', data);
      
      // Update pending clients in storage
      if (data.pendingClients) {
        operatorStorage.updateFromSession({
          pendingClients: data.pendingClients
        });
      }
    });
    
    // Handle active clients updates
    socket.on('active-clients', (data) => {
      console.log('Active clients updated:', data);
      
      // Update active clients in storage
      if (data.activeClients) {
        operatorStorage.updateFromSession({
          activeClients: data.activeClients
        });
      }
    });

    // Handle room assignment
    socket.on('room_assigned', (data) => {
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
    socket.on('session-reconnect', (data) => {
      console.log('Operator session reconnected:', data);
      
      if (data.operator) {
        // Store operator data
        sessionStorage.setItem('operatorId', data.operator.id);
        
        // Update operator data in storage
        operatorStorage.operator = {
          id: data.operator.id,
          name: data.operator.name,
          number: data.operator.number,
          socketId: socket.id,
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
  }
  
  return socket;
};

// Initialize socket connection with operator credentials
export const initOperatorSocket = (name, number, operatorId = null, msgHandler = null, sessionHandler = null) => {
  // Load any existing data from storage
  operatorStorage.loadFromStorage();
  
  // Create socket instance if not already created
  if (!socket) {
    createOperatorSocket(msgHandler, sessionHandler);
  }
  
  // Get operatorId from storage if not provided
  const storedOperatorId = operatorId || sessionStorage.getItem('operatorId');
  
  // Store operator credentials
  operatorStorage.storeOperatorCredentials(name, number, storedOperatorId);
  
  // Set authentication data
  socket.auth = {
    name: name,
    number: number,
    operatorId: storedOperatorId,
    type: "operator"
  };
  
  console.log(`Connecting to socket server as operator with name: ${name} and number: ${number} and operatorId: ${storedOperatorId}`);
  
  // Connect to the server
  if (!socket.connected) {
    socket.connect();
  }
  
  return socket;
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
  return socket;
};

export const disconnectOperatorSocket = () => {
  if (socket) socket.disconnect();
};

// Accept a client from the queue
export const acceptClient = (clientId, roomId) => {
  if (socket && socket.connected) {
    socket.emit('accept-client', { clientId, roomId });
    return true;
  }
  return false;
};

// Send a message to a client
export const sendMessageToClient = (clientId, roomId, message) => {
  if (socket && socket.connected) {
    const messageData = {
      text: message,
      receiverId: clientId,
      roomId: roomId,
      timestamp: new Date().toISOString()
    };
    
    socket.emit('send_message_to_client', messageData);
    
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
  if (socket && socket.connected) {
    socket.emit('join_room', roomId);
  }
};

// Leave a client's room
export const leaveClientRoom = (roomId) => {
  if (socket && socket.connected) {
    socket.emit('leave_room', roomId);
  }
};

// Send typing indicator to a client
export const sendTypingToClient = (isTyping, roomId, clientId) => {
  if (socket && socket.connected) {
    socket.emit('operator-typing', { isTyping, roomId, clientId });
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
  if (socket && socket.connected) {
    socket.emit('get-client-queue');
  }
};

// Request active clients - only call this when needed, not automatically
export const requestActiveClients = () => {
  if (socket && socket.connected) {
    socket.emit('get-active-clients');
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