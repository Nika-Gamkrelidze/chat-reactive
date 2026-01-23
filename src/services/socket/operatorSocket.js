import { io } from 'socket.io-client';
import config from '../../config/env';

let socket = null;
let messageHandler = null;
let sessionHandler = null;
let clientListHandler = null;
let clientQueueHandler = null;
let clientChatClosedHandler = null;
let typingHandler = null;

// Debug flag
const DEBUG_SOCKET = true;
let pendingOperatorJoinPayload = null;
let lastOperatorJoinPayload = null;

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
  },
  
  // Clear all operator data including login credentials
  clearAll: function() {
    this.clear();
    
    try {
      sessionStorage.removeItem('operatorId');
      sessionStorage.removeItem('operatorName');
      sessionStorage.removeItem('operatorNumber');
    } catch (error) {
      console.error('Error clearing all operator data from session storage:', error);
    }
  }
};

// Create socket instance without connecting
export const createOperatorSocket = () => {
  if (!socket) {
    console.log(`Creating socket instance for operator at: ${config.server.namespaceUrl}`);
    
    socket = io(config.server.namespaceUrl, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      transports: ['websocket', 'polling'] // Add polling as fallback
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
      if (pendingOperatorJoinPayload) {
        lastOperatorJoinPayload = pendingOperatorJoinPayload;
        pendingOperatorJoinPayload = null;
      }
      if (lastOperatorJoinPayload) {
        socket.emit('operator-join', lastOperatorJoinPayload);
      }
    });
    
    socket.on('disconnect', (reason) => {
      console.log(`Operator disconnected from server: ${reason}`);
    });
    
    socket.on('connect_error', (error) => {
      console.error('Operator socket connection error:', error);
    });
    
    socket.on('operator-join-response', (response) => {
      console.log('Operator join response:', response);

      if (response?.status === 'success' && response?.data) {
        operatorStorage.updateFromSession({
          operator: {
            id: response.data.operatorId,
            name: response.data.operatorName,
            number: sessionStorage.getItem('operatorNumber'),
            status: response.data?.status
          },
          operatorId: response.data.operatorId
        });
      }

      if (sessionHandler && typeof sessionHandler === 'function') {
        sessionHandler({
          status: response?.status,
          message: response?.message,
          operator: response?.data
            ? {
                id: response.data.operatorId,
                name: response.data.operatorName,
                number: sessionStorage.getItem('operatorNumber'),
                status: response.data?.status
              }
            : null
        });
      }
    });

    socket.on('client-connected', (data) => {
      console.log('Client connected:', data);
      
      if (data && data.client && data.roomId && data.client.id) {
        // Initialize clients object if needed
        if (!operatorStorage.clients) {
          operatorStorage.clients = {};
        }

        const clientId = data.client.id;
        const currentRoomStatus = data.room?.status || data.roomStatus || 'active';

        // Add or update client in clients storage
        operatorStorage.clients[clientId] = {
          ...data.client,
          roomId: data.roomId,
          roomStatus: currentRoomStatus
        };

        // Check if client exists in active clients
        const clientIndex = operatorStorage.activeClients.findIndex(c => c.id === clientId);
        
        if (clientIndex === -1) {
          // Add new client to active clients
          operatorStorage.activeClients.push({
            ...data.client,
            roomId: data.roomId,
            roomStatus: currentRoomStatus
          });
        } else {
          // Update existing client
          operatorStorage.activeClients = operatorStorage.activeClients.map(client => 
            client.id === clientId 
              ? {
                  ...client,
                  ...data.client, // Update any changed client info
                  roomId: data.roomId,
                  roomStatus: currentRoomStatus // Use the status from the event
                }
              : client
          );
        }
        
        // Initialize or get existing messages array for this client
        if (!operatorStorage.messages[clientId]) {
          operatorStorage.messages[clientId] = [];
        }
        
        // Add initial messages if provided
        if (data.messages && Array.isArray(data.messages)) {
          // Add only messages that don't already exist
          data.messages.forEach(message => {
            // Enhance message with clientId for internal routing
            const enhancedMessage = {
              ...message,
              clientId: clientId,
              // For system messages, keep senderId as system
              sentByOperator: message.senderId === operatorStorage.operatorId
            };
            
            // Check if message already exists
            const exists = operatorStorage.messages[clientId].some(
              m => m.messageId === message.messageId
            );
            
            if (!exists) {
              operatorStorage.messages[clientId].push(enhancedMessage);
            }
          });
          
          // Sort messages by timestamp
          operatorStorage.messages[clientId].sort(
            (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
          );
          
          // Notify message handler of each message
          if (messageHandler && typeof messageHandler === 'function') {
            data.messages.forEach(message => {
              messageHandler({
                ...message,
                clientId: clientId,
                sentByOperator: message.senderId === operatorStorage.operatorId
              });
            });
          }
        }
        
        operatorStorage.saveToStorage();
        
        // Call client list handler if defined
        if (clientListHandler && typeof clientListHandler === 'function') {
          clientListHandler(operatorStorage.activeClients);
        }
      }
    });
    
    socket.on('queue-status', (response) => {
      console.log('Received queue status:', response);

      if (response?.data?.clients) {
        operatorStorage.pendingClients = response.data.clients;
        operatorStorage.saveToStorage();

        if (clientQueueHandler && typeof clientQueueHandler === 'function') {
          clientQueueHandler(response.data.clients);
        }
      }
    });

    socket.on('my-rooms-response', (response) => {
      console.log('Received my rooms response:', response);

      if (response?.status !== 'success' || !Array.isArray(response?.data?.rooms)) return;

      const rooms = response.data.rooms;
      const activeClients = rooms
        .filter(room => room.client)
        .map(room => ({
          ...room.client,
          roomId: room.id,
          roomStatus: room.status || 'active'
        }));

      operatorStorage.activeClients = activeClients;
      operatorStorage.messages = rooms.reduce((acc, room) => {
        if (room.client && room.client.id && Array.isArray(room.messages)) {
          acc[room.client.id] = room.messages;
        }
        return acc;
      }, {});
      operatorStorage.saveToStorage();

      if (clientListHandler && typeof clientListHandler === 'function') {
        clientListHandler(activeClients);
      }

      if (sessionHandler && typeof sessionHandler === 'function') {
        sessionHandler({ activeRooms: rooms, activeClients });
      }
    });
    
    // Handle incoming messages
    socket.on('message', (data) => {
      console.log('Operator received message:', data);
      
      if (Array.isArray(data)) {
        // Process each message in the array
        data.forEach(message => {
          if (message.roomId && (message.text || message.messageId)) {
            // Add clientId to the message object for internal routing
            const enhancedMessage = {
              ...message,
              clientId: message.senderId !== operatorStorage.operatorId ? message.senderId : message.receiverId
            };
            
            // Call message handler if defined
            if (messageHandler && typeof messageHandler === 'function') {
              messageHandler(enhancedMessage);
            }
          }
        });
      } else if (data.roomId && (data.text || data.messageId)) {
        // Add clientId to the single message object
        const enhancedMessage = {
          ...data,
          clientId: data.senderId !== operatorStorage.operatorId ? data.senderId : data.receiverId
        };
        
        // Call message handler if defined
        if (messageHandler && typeof messageHandler === 'function') {
          messageHandler(enhancedMessage);
        }
      }
    });
    
    socket.on('message-response', (response) => {
      if (response?.status !== 'ok' || !response?.data) return;
      if (messageHandler && typeof messageHandler === 'function') {
        messageHandler(response.data);
      }
    });

    // Handle typing indicator
    socket.on('typing', (data) => {
      if (data?.from !== 'client') return;

      const clientId = Object.values(operatorStorage.clients || {}).find(
        client => client.roomId === data.roomId
      )?.id;

      if (typingHandler && typeof typingHandler === 'function' && clientId) {
        typingHandler({
          roomId: data.roomId,
          userId: clientId,
          isTyping: data.isTyping
        });
      }
    });

    const updateClientRoomStatus = (clientId, roomStatus) => {
      if (!clientId) return;

      let storageUpdated = false;
      let listUpdated = false;
      let updatedActiveClientsList = operatorStorage.activeClients;

      if (operatorStorage.clients && operatorStorage.clients[clientId]) {
        if (operatorStorage.clients[clientId].roomStatus !== roomStatus) {
          operatorStorage.clients[clientId].roomStatus = roomStatus;
          storageUpdated = true;
        }
      }

      const currentActiveClients = operatorStorage.activeClients;
      const clientIndex = currentActiveClients.findIndex(c => c.id === clientId);

      if (clientIndex !== -1 && currentActiveClients[clientIndex].roomStatus !== roomStatus) {
        updatedActiveClientsList = currentActiveClients.map((client, index) =>
          index === clientIndex ? { ...client, roomStatus } : client
        );
        operatorStorage.activeClients = updatedActiveClientsList;
        listUpdated = true;
      }

      if (storageUpdated || listUpdated) {
        operatorStorage.saveToStorage();
        if (clientListHandler && typeof clientListHandler === 'function') {
          clientListHandler(updatedActiveClientsList);
        }
      }
    };

    socket.on('client-disconnected-temporarily', (data) => {
      console.log('Client temporarily disconnected:', data);
      const clientId = data?.clientId;
      updateClientRoomStatus(clientId, 'paused');
    });

    socket.on('client-disconnected-permanently', (data) => {
      console.log('Client permanently disconnected:', data);
      const clientId = data?.clientId;
      updateClientRoomStatus(clientId, data?.roomStatus || 'paused');
    });

    socket.on('client-reconnected', (data) => {
      console.log('Client reconnected:', data);
      const clientId = data?.clientId;
      updateClientRoomStatus(clientId, 'active');
    });

    socket.on('chat-ended', (data) => {
      const clientId = Object.values(operatorStorage.clients || {}).find(
        client => client.roomId === data?.roomId
      )?.id;

      updateClientRoomStatus(clientId, 'closed');

      if (clientChatClosedHandler && typeof clientChatClosedHandler === 'function' && clientId) {
        clientChatClosedHandler(clientId);
      }
    });

    socket.on('status-update-response', (response) => {
      if (response?.status !== 'success') return;
      if (sessionHandler && typeof sessionHandler === 'function') {
        sessionHandler({
          operator: {
            ...operatorStorage.operator,
            status: response?.data?.newStatus
          }
        });
      }
    });
  }
  
  return socket;
};

// Initialize socket connection with user credentials
export const initOperatorSocket = (name, number, operatorId = null) => {
  // Create socket instance if not already created
  if (!socket) {
    createOperatorSocket();
  } else if (socket.connected) {
    // If already connected, disconnect first to reset state
    socket.disconnect();
  }
  
  const storedOperatorId = operatorId || sessionStorage.getItem('operatorId');

  // Set authentication data
  socket.auth = {
    userId: storedOperatorId || undefined,
    type: "operator",
    name,
    number
  };

  pendingOperatorJoinPayload = {
    operatorId: storedOperatorId || undefined,
    operatorName: name,
    operatorNumber: number
  };
  lastOperatorJoinPayload = pendingOperatorJoinPayload;

  console.log(`Connecting to socket server as operator with name: ${name} and number: ${number} and userId: ${storedOperatorId || 'null'}`);

  // Connect to the server
  socket.connect();
  
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
  
  console.log('Attempting to reconnect with stored operator credentials:', { operatorId, name, number });
  
  // If we have stored credentials, reconnect
  if (name && number) {
    // Create socket instance if not already created
    if (!socket) {
      createOperatorSocket();
    } else if (socket.connected) {
      // If already connected, disconnect first to reset state
      socket.disconnect();
    }
    
    // Set authentication data with stored credentials
    socket.auth = {
      userId: operatorId || undefined,
      type: "operator",
      name,
      number
    };

    pendingOperatorJoinPayload = {
      operatorId: operatorId || undefined,
      operatorName: name,
      operatorNumber: number
    };
  lastOperatorJoinPayload = pendingOperatorJoinPayload;

    console.log(`Reconnecting to socket server as operator with name: ${name}, number: ${number}, and userId: ${operatorId || 'null'}`);

    // Connect to the server
    socket.connect();
    
    return socket;
  }
  
  return null;
};

// Set handlers
export const setSessionHandler = (handler) => {
  if (handler && typeof handler === 'function') {
    console.log('Setting operator session handler');
    sessionHandler = handler;
  } else if (handler === null) {
    // Allow null to clear the handler
    sessionHandler = null;
  } else {
    console.error('Invalid session handler provided:', handler);
  }
};

export const setMessageHandler = (handler) => {
  if (handler && typeof handler === 'function') {
    messageHandler = handler;
  } else if (handler === null) {
    // Allow null to clear the handler
    messageHandler = null;
  } else {
    console.error('Invalid message handler provided:', handler);
  }
};

export const setClientListHandler = (handler) => {
  if (handler && typeof handler === 'function') {
    clientListHandler = handler;
  } else if (handler === null) {
    // Allow null to clear the handler
    clientListHandler = null;
  } else {
    console.error('Invalid client list handler provided:', handler);
  }
};

export const setClientQueueHandler = (handler) => {
  if (handler && typeof handler === 'function') {
    clientQueueHandler = handler;
  } else if (handler === null) {
    // Allow null to clear the handler
    clientQueueHandler = null;
  } else {
    console.error('Invalid client queue handler provided:', handler);
  }
};

export const setClientChatClosedHandler = (handler) => {
  if (handler && typeof handler === 'function') {
    clientChatClosedHandler = handler;
  } else if (handler === null) {
    clientChatClosedHandler = null;
  } else {
    console.error('Invalid client chat closed handler provided:', handler);
  }
};

export const setTypingHandler = (handler) => {
  if (handler && typeof handler === 'function') {
    console.log('Setting operator typing handler');
    typingHandler = handler;
  } else if (handler === null) {
    typingHandler = null;
  } else {
    console.error('Invalid typing handler provided:', handler);
  }
};

export const disconnectOperatorSocket = () => {
  if (socket) socket.disconnect();
};

// Request client queue
export const requestClientQueue = () => {
  if (socket && socket.connected) {
    socket.emit('get-queue-status');
    return true;
  }
  return false;
};

// Request active clients
export const requestActiveClients = () => {
  if (socket && socket.connected) {
    const operatorId = operatorStorage.operatorId || sessionStorage.getItem('operatorId');
    if (operatorId) {
      socket.emit('get-my-rooms', { operatorId });
    } else {
      socket.emit('get-my-rooms', {});
    }
    return true;
  }
  return false;
};

// Send message to client
export const sendMessageToClient = (clientId, text, roomId) => {
  if (!socket || !socket.connected) {
    console.error('Cannot send message: socket not connected');
    return false;
  }
  
  const operatorId = operatorStorage.operatorId || sessionStorage.getItem('operatorId');
  
  if (!operatorId) {
    console.error('Cannot send message: operator ID not available');
    return false;
  }
  
  if (!clientId) {
    console.error('Cannot send message: client ID not provided');
    return false;
  }
  
  if (!roomId) {
    console.error('Cannot send message: room ID not provided');
    return false;
  }
  
  const messageData = {
    text,
    roomId,
    senderId: operatorId,
    receiverId: clientId
  };
  
  // Just emit the message to server - no temporary message creation
  socket.emit('send-message', messageData);
};

// Accept client from queue
export const acceptClient = (clientId) => {
  console.warn('acceptClient is not supported by the current backend API.', clientId);
  return false;
};

// Send typing indicator event to the server
export const sendOperatorTypingEvent = (roomId, isTyping) => {
  if (socket && socket.connected) {
    const operatorId = operatorStorage.operatorId || sessionStorage.getItem('operatorId');
    if (!operatorId) {
        console.error("Cannot send typing event: operatorId missing.");
        return;
    }
    if (!roomId) {
        console.error("Cannot send typing event: roomId missing.");
        return;
    }

    socket.emit('typing', {
      roomId,
      isTyping
    });
  }
};

// Clear all operator data
export const clearOperatorData = () => {
  operatorStorage.clearAll();
};

// Get operator socket instance
export const getOperatorSocket = () => {
  return socket;
};