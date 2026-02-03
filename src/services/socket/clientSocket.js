import { io } from 'socket.io-client';
import config from '../../config/env';

let socket = null;
let messageHandler = null;
let sessionHandler = null;

// Debug flag
const DEBUG_SOCKET = true;
let pendingConnectPayload = null;
let pendingReconnectPayload = null;
let lastReconnectPayload = null;

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
    if ('operator' in sessionData) {
      this.operator = sessionData.operator;
      this.hasOperator = Boolean(sessionData.operator);
      this.operatorInfo = sessionData.operator || null;
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
      this.messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
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
// README: optional query.clientId for reconnection
export const createClientSocket = (clientIdForQuery = null) => {
  if (!socket) {
    console.log(`Creating socket instance for client at: ${config.server.namespaceUrl}`);
    const query = clientIdForQuery ? { clientId: clientIdForQuery } : {};
    socket = io(config.server.namespaceUrl, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      transports: ['websocket', 'polling'],
      ...(Object.keys(query).length > 0 && { query })
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

      if (pendingReconnectPayload) {
        socket.emit('client-reconnect', pendingReconnectPayload);
        pendingReconnectPayload = null;
        return;
      }

      if (pendingConnectPayload) {
        socket.emit('client-connect', pendingConnectPayload);
        pendingConnectPayload = null;
      }
    });

    socket.on('reconnect', () => {
      if (lastReconnectPayload) {
        socket.emit('client-reconnect', lastReconnectPayload);
      }
    });
    
    socket.on('disconnect', (reason) => {
      console.log(`Client disconnected from server: ${reason}`);
    });
    
    socket.on('connect_error', (error) => {
      console.error('Client socket connection error:', error);
    });
    
    socket.on('connection-status', (response) => {
      console.log('Client connection status:', response);

      clientStorage.clear();

      const authName = socket.auth?.name || sessionStorage.getItem('clientName');
      const authNumber = socket.auth?.number || sessionStorage.getItem('clientNumber');
      const authClientId = socket.auth?.userId || sessionStorage.getItem('clientId');

      const operator = response?.data?.operatorId
        ? { id: response.data.operatorId, name: response.data.operatorName }
        : null;

      const roomId = response?.data?.roomId || null;
      const clientId = response?.data?.clientId || authClientId || socket.id || null;

      if (clientId) {
        sessionStorage.setItem('clientId', clientId);
        lastReconnectPayload = { clientId };
      }
      if (authName) sessionStorage.setItem('clientName', authName);
      if (authNumber) sessionStorage.setItem('clientNumber', authNumber);

      const client = clientId ? { id: clientId, name: authName, number: authNumber } : null;

      clientStorage.updateFromSession({
        client,
        operator,
        roomId
      });

      if (sessionHandler && typeof sessionHandler === 'function') {
        sessionHandler({
          status: response.status,
          message: response.message,
          client,
          operator,
          roomId,
          queuePosition: response?.data?.queuePosition ?? null
        });
      }
    });

    // Backward compatibility: some servers still emit `session`
    socket.on('session', (data) => {
      console.log('Client session established with data:', data);

      clientStorage.clear();
      clientStorage.updateFromSession(data);

      if (data?.client?.id) {
        sessionStorage.setItem('clientId', data.client.id);
        lastReconnectPayload = { clientId: data.client.id };
      }

      if (data?.client?.name) sessionStorage.setItem('clientName', data.client.name);
      if (data?.client?.number) sessionStorage.setItem('clientNumber', data.client.number);

      if (sessionHandler && typeof sessionHandler === 'function') {
        sessionHandler({
          client: data.client,
          operator: data.operator || null,
          roomId: data.roomId || null,
          messages: data.messages || []
        });
      }
    });

    // Server sends this on reconnect (e.g. after page refresh) with full session state
    socket.on('session-reconnect', (data) => {
      console.log('Client session-reconnect received:', data);

      clientStorage.updateFromSession(data);
      if (data?.client?.id) {
        sessionStorage.setItem('clientId', data.client.id);
        lastReconnectPayload = { clientId: data.client.id };
      }
      if (data?.client?.name) sessionStorage.setItem('clientName', data.client.name);
      if (data?.client?.number) sessionStorage.setItem('clientNumber', data.client.number);

      if (sessionHandler && typeof sessionHandler === 'function') {
        sessionHandler({
          client: data.client,
          operator: data.operator || null,
          roomId: data.roomId || null,
          hasOperator: data.hasOperator ?? Boolean(data.operator),
          messages: data.messages || []
        });
      }
    });

    socket.on('reconnection-status', (response) => {
      console.log('Client reconnection status:', response);

      if (response?.requiresNewSession) {
        if (sessionHandler && typeof sessionHandler === 'function') {
          sessionHandler({ requiresNewSession: true, status: response.status, message: response.message });
        }
        return;
      }

      const operator = response?.operatorId
        ? { id: response.operatorId, name: response.operatorName }
        : null;
      const roomId = response?.roomId || null;

      if (operator || roomId) {
        clientStorage.updateFromSession({ operator, roomId });
      }

      if (sessionHandler && typeof sessionHandler === 'function') {
        sessionHandler({
          status: response.status,
          message: response.message,
          client: clientStorage.client,
          operator,
          roomId,
          queuePosition: response?.queuePosition ?? null
        });
      }
    });

    socket.on('operator-assigned', (data) => {
      console.log('Operator assigned:', data);

      if (data?.operatorId) {
        const operator = { id: data.operatorId, name: data.operatorName };
        clientStorage.updateFromSession({ operator, roomId: data.roomId });

        if (sessionHandler && typeof sessionHandler === 'function') {
          sessionHandler({ operator, roomId: data.roomId });
        }
      }
    });

    // Backend emits operator_joined / operator_reconnected (underscore), not operator-assigned.
    socket.on('operator_joined', (data) => {
      console.log('Operator joined:', data);
      if (data?.operator?.id) {
        const operator = {
          id: data.operator.id,
          name: data.operator.name,
          departmentId: data.operator.departmentId ?? null,
          status: data.operator.status ?? null
        };
        if (data?.roomId) clientStorage.updateFromSession({ operator, roomId: data.roomId });
        if (sessionHandler && typeof sessionHandler === 'function') {
          sessionHandler({ operator, roomId: data?.roomId });
        }
      }
    });

    socket.on('operator_reconnected', (data) => {
      console.log('Operator reconnected:', data);
      if (data?.operator?.id) {
        const operator = {
          id: data.operator.id,
          name: data.operator.name,
          departmentId: data.operator.departmentId ?? null,
          status: data.operator.status ?? null
        };
        if (data?.roomId) clientStorage.updateFromSession({ operator, roomId: data.roomId });
        if (sessionHandler && typeof sessionHandler === 'function') {
          sessionHandler({ operator, roomId: data?.roomId });
        }
      }
    });

    socket.on('added-to-queue', (data) => {
      console.log('Client added to queue:', data);

      if (sessionHandler && typeof sessionHandler === 'function') {
        sessionHandler({
          status: 'queued',
          queuePosition: data?.position ?? null,
          message: data?.message
        });
      }
    });

    // README: operator-disconnected-temporarily (operator may reconnect within gracePeriod)
    socket.on('operator-disconnected-temporarily', (data) => {
      console.log('Operator temporarily disconnected:', data);
      if (sessionHandler && typeof sessionHandler === 'function') {
        sessionHandler({
          operatorDisconnected: 'temporarily',
          message: data?.message,
          gracePeriod: data?.gracePeriod
        });
      }
    });

    // README: operator-disconnected-permanently
    socket.on('operator-disconnected-permanently', (data) => {
      console.log('Operator permanently disconnected:', data);
      if (sessionHandler && typeof sessionHandler === 'function') {
        sessionHandler({
          operatorDisconnected: 'permanently',
          message: data?.message,
          roomStatus: data?.roomStatus
        });
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
    
    socket.on('message-response', (response) => {
      if (response?.status !== 'ok' || !response?.data) return;
      if (messageHandler && typeof messageHandler === 'function') {
        messageHandler(response.data);
      }
    });

    // Handle typing indicator
    socket.on('typing', (data) => {
      if (data?.from !== 'operator') return;
      if (messageHandler && typeof messageHandler === 'function') {
        messageHandler({
          type: 'typing',
          ...data
        });
      }
    });

    socket.on('chat_ended_ack', (response) => {
      console.log('Client end-chat response:', response);
    });

    socket.on('chat_ended', (data) => {
      console.log('Chat ended:', data);
      if (sessionHandler && typeof sessionHandler === 'function') {
        sessionHandler({ chatEnded: true, ...data });
      }
    });

    // Backend requests feedback with ask_for_feedback and acknowledges submission with feedback_submitted.
    socket.on('ask_for_feedback', (data) => {
      console.log('Feedback requested:', data);
      if (sessionHandler && typeof sessionHandler === 'function') {
        sessionHandler({ chatEnded: true, ...data });
      }
    });

    socket.on('feedback_submitted', (response) => {
      console.log('Feedback submitted:', response);
      if (sessionHandler && typeof sessionHandler === 'function') {
        sessionHandler({ feedbackProcessed: true, success: response?.success === true });
      }
      // Cleanup is handled by ClientChat to also clear AuthContext's sessionStorage.user
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
  
  // Create socket instance if not already created (README: optional query.clientId for reconnection)
  if (!socket) {
    const storedClientId = clientId || sessionStorage.getItem('clientId');
    createClientSocket(storedClientId || undefined);
  } else if (socket.connected) {
    // If already connected, disconnect first to reset state
    socket.disconnect();
  }
  
  // Store user credentials including police
  clientStorage.storeUserCredentials(name, number, police);

  const storedClientId = clientId || sessionStorage.getItem('clientId');

  // Set authentication data
  socket.auth = {
    userId: storedClientId || undefined,
    type: 'client',
    name,
    number
  };

  // README API: client-connect { name (required), number?, userId?, departmentId?, metadata? }
  pendingConnectPayload = {
    name,
    number,
    ...(storedClientId && { userId: storedClientId }),
    ...(police !== undefined && police !== null && { metadata: { police } })
  };

  console.log(`Connecting to socket server as client with name: ${name} and number: ${number} and userId: ${storedClientId || 'null'}`);

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
  if (name && number && police && clientId) {
    // Create socket instance if not already created (README: query.clientId for reconnection)
    if (!socket) {
      createClientSocket(clientId);
    }
    
    // Set authentication data with stored credentials
    socket.auth = {
      userId: clientId || undefined,
      type: "client",
      name,
      number
    };

    pendingReconnectPayload = {
      clientId
    };
    lastReconnectPayload = { clientId };

    console.log(`Reconnecting to socket server as client with name: ${name}, number: ${number}, police: ${police}, and userId: ${clientId || 'null'}`);
    
    // Connect to the server
    if (!socket.connected) {
      socket.connect();
    }
    
    return socket;
  }
  
  return null;
};

export const requestClientReconnect = (clientId) => {
  if (socket && socket.connected) {
    const storedClientId = clientId || sessionStorage.getItem('clientId');
    if (!storedClientId) return false;
    lastReconnectPayload = { clientId: storedClientId };
    socket.emit('client-reconnect', { clientId: storedClientId });
    return true;
  }
  return false;
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
    if (!clientData?.roomId) {
      console.error('Cannot end chat: room ID missing.');
      return;
    }
    const clientId = clientStorage.client?.id || sessionStorage.getItem('clientId');
    socket.emit('end_chat', { 
      roomId: clientData.roomId,
      userId: clientId,
      userType: 'client'
    });
    // Note: We don't disconnect here anymore as we need to wait for feedback submission
  }
};

// Send feedback to server
export const sendClientFeedback = (feedbackData) => {
  if (socket && socket.connected) {
    const currentRoomId = clientStorage.roomId || sessionStorage.getItem('roomId');
    const clientId = clientStorage.client?.id || sessionStorage.getItem('clientId');

    if (!currentRoomId) {
      console.error("Cannot send feedback: Room ID not found.");
      return;
    }
    if (!clientId) {
      console.error("Cannot send feedback: Client ID not found.");
      return;
    }

    // feedbackData should contain { score, comment }
    const payload = {
      roomId: currentRoomId,
      clientId,
      rating: feedbackData.score,
      comment: feedbackData.comment
    };

    // Backend event name: client_feedback
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