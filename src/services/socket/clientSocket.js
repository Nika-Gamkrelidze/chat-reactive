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
let visibilityReconnectListener = null;
let hadDisconnect = false;

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
    
    // Emit client-reconnect so backend notifies operator (client-reconnected). Call this whenever client "returns" to the page.
    const emitClientReconnectIfNeeded = () => {
      const cid = lastReconnectPayload?.clientId || (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('clientId') : null);
      if (socket && socket.connected && cid) {
        console.log('[clientSocket] Emitting client-reconnect so operator receives client-reconnected:', cid);
        socket.emit('client-reconnect', { clientId: cid });
        if (!lastReconnectPayload) lastReconnectPayload = { clientId: cid };
        hadDisconnect = false;
      }
    };

    // Handle connection events (connect fires on both initial connection and Socket.IO reconnection)
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
        return;
      }

      // Socket.IO reconnection (e.g. user returned to tab): emit client-reconnect so operator receives client-reconnected
      emitClientReconnectIfNeeded();
    });

    socket.on('reconnect', () => {
      emitClientReconnectIfNeeded();
    });

    // When user returns to tab (visibility change), emit client-reconnect so operator sees client back (handles mobile/tab switch)
    if (typeof document !== 'undefined' && document.addEventListener) {
      if (visibilityReconnectListener) {
        document.removeEventListener('visibilitychange', visibilityReconnectListener);
      }
      visibilityReconnectListener = () => {
        if (document.visibilityState === 'visible' && socket && socket.connected && hadDisconnect) {
          emitClientReconnectIfNeeded();
          hadDisconnect = false;
        }
      };
      document.addEventListener('visibilitychange', visibilityReconnectListener);
    }

    socket.on('disconnect', (reason) => {
      console.log(`Client disconnected from server: ${reason}`);
      hadDisconnect = true;
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
      
      // Use backend's clientId if sent; otherwise use the userId we sent in client-connect (so send-message is accepted)
      let clientId = response?.data?.clientId || authClientId;
      if (!clientId && socket.id) {
        clientId = socket.id;
      }

      // Store clientId and set lastReconnectPayload so when socket fires 'reconnect' (e.g. user returns to tab) we emit client-reconnect and operator receives client-reconnected
      if (clientId) {
        sessionStorage.setItem('clientId', clientId);
        lastReconnectPayload = { clientId };
      }
      
      if (authName) sessionStorage.setItem('clientName', authName);
      if (authNumber) sessionStorage.setItem('clientNumber', authNumber);

      // Create client object - ensure we create it if we have name/number
      // Use socket.id as fallback clientId if we don't have one yet
      // This ensures the session handler always receives a client object for queued/connected status
      // The backend generates its own clientId, but we use socket.id temporarily until we get it
      const finalClientId = clientId || socket.id;
      
      // Always create client object if we have name (required for login)
      // This ensures queued/connected status always has a client object
      const client = (finalClientId && authName) ? { 
        id: finalClientId, 
        name: authName, 
        number: authNumber || null
      } : null;
      
      // Log for debugging
      if (!client && (response.status === 'queued' || response.status === 'connected')) {
        console.warn('Connection-status received but could not create client object:', {
          finalClientId,
          authName,
          authNumber,
          socketId: socket.id,
          socketAuth: socket.auth
        });
      }

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

      // Persist session to localStorage so re-opening browser can restore and backend can notify operator (client-reconnected)
      if (clientId && authName && authNumber) {
        try {
          const police = sessionStorage.getItem('clientPolice') || '';
          const session = { clientId, clientName: authName, clientNumber: authNumber, clientPolice: police };
          localStorage.setItem('clientSession', JSON.stringify(session));
          localStorage.setItem('clientUser', JSON.stringify({ id: clientId, name: authName, number: authNumber, police, role: 'client' }));
        } catch (e) {
          console.warn('Could not persist client session to localStorage', e);
        }
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

      // Persist session so re-opening browser can reconnect (operator receives client-reconnected)
      const cid = clientStorage.client?.id || sessionStorage.getItem('clientId');
      const cname = sessionStorage.getItem('clientName');
      const cnum = sessionStorage.getItem('clientNumber');
      const cpol = sessionStorage.getItem('clientPolice');
      if (cid && cname && cnum) {
        try {
          const session = { clientId: cid, clientName: cname, clientNumber: cnum, clientPolice: cpol || '' };
          localStorage.setItem('clientSession', JSON.stringify(session));
          localStorage.setItem('clientUser', JSON.stringify({ id: cid, name: cname, number: cnum, police: cpol || '', role: 'client' }));
        } catch (e) {
          console.warn('Could not persist client session to localStorage', e);
        }
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

    // Learn real clientId from incoming messages (backend doesn't send it in connection-status)
    // - In "message" event we are the receiver → use receiverId
    // - In "message-response" we are the sender → use senderId
    const maybeUpdateClientIdFromMessage = (payload, useSenderId = false) => {
      if (!socket || !socket.id) return;
      const currentId = sessionStorage.getItem('clientId');
      if (currentId && currentId !== socket.id) return; // already have a non-socket.id clientId
      const id = useSenderId ? payload?.senderId : payload?.receiverId;
      if (!id) return;
      sessionStorage.setItem('clientId', id);
      const name = sessionStorage.getItem('clientName');
      const number = sessionStorage.getItem('clientNumber');
      if (name) {
        clientStorage.updateFromSession({
          client: { id, name, number },
          operator: clientStorage.operator,
          roomId: clientStorage.roomId
        });
      }
      console.log('[clientSocket] Updated clientId from message:', id);
    };

    // Learn roomId from message payload so client can send before operator messages (if backend sent roomId only with first message)
    const maybeUpdateRoomIdFromMessage = (payload) => {
      const msgRoomId = payload?.roomId || payload?.room_id;
      if (!msgRoomId || clientStorage.roomId === msgRoomId) return;
      clientStorage.updateFromSession({ roomId: msgRoomId });
      if (sessionHandler && typeof sessionHandler === 'function') {
        sessionHandler({ roomId: msgRoomId });
      }
      console.log('[clientSocket] Updated roomId from message:', msgRoomId);
    };

    // Handle incoming messages
    socket.on('message', (data) => {
      console.log('Client received message:', data);
      
      // Learn real clientId from first message (receiverId is us when we receive)
      if (Array.isArray(data) && data.length > 0) {
        maybeUpdateClientIdFromMessage(data[0]);
        maybeUpdateRoomIdFromMessage(data[0]);
      } else if (data && typeof data === 'object' && !Array.isArray(data)) {
        if (data.receiverId) maybeUpdateClientIdFromMessage(data);
        else if (data.messages?.[0]) maybeUpdateClientIdFromMessage(data.messages[0]);
        maybeUpdateRoomIdFromMessage(data);
        if (data.messages?.[0]) maybeUpdateRoomIdFromMessage(data.messages[0]);
      }
      
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
      // Learn real clientId from response (senderId is us when we sent the message)
      const data = response.data;
      maybeUpdateClientIdFromMessage(data, true);
      maybeUpdateRoomIdFromMessage(data);
      if (messageHandler && typeof messageHandler === 'function') {
        messageHandler(data);
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

    // Backend sends: end-chat-response (with hyphen)
    socket.on('end-chat-response', (response) => {
      console.log('Client end-chat response:', response);
    });

    // Backend sends: chat-ended (with hyphen)
    socket.on('chat-ended', (data) => {
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

    // Backend sends: feedback-received (with hyphen)
    socket.on('feedback-received', (response) => {
      console.log('Feedback received:', response);
      if (sessionHandler && typeof sessionHandler === 'function') {
        sessionHandler({ feedbackProcessed: true, success: response?.status === 'ok' });
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
  
  // Also store in sessionStorage immediately so connection-status handler can access them
  sessionStorage.setItem('clientName', name);
  sessionStorage.setItem('clientNumber', number);
  if (police !== undefined && police !== null) {
    sessionStorage.setItem('clientPolice', police);
  }

  // Use existing clientId when re-opening browser so backend runs handleClientReconnect and operator receives client-reconnected
  let storedClientId = clientId || sessionStorage.getItem('clientId');
  if (!storedClientId) {
    try {
      const saved = localStorage.getItem('clientSession');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.clientId && parsed.clientName === name && parsed.clientNumber === number) {
          storedClientId = parsed.clientId;
          sessionStorage.setItem('clientId', storedClientId);
        }
      }
    } catch (e) {
      console.warn('Could not restore client session from localStorage', e);
    }
  }
  if (!storedClientId) {
    storedClientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem('clientId', storedClientId);
  }

  // Set authentication data
  socket.auth = {
    userId: storedClientId,
    type: 'client',
    name,
    number
  };

  // README API: client-connect { name (required), number?, userId?, departmentId?, metadata? }
  pendingConnectPayload = {
    name,
    number,
    userId: storedClientId,
    ...(police !== undefined && police !== null && { metadata: { police } })
  };

  console.log(`Connecting to socket server as client with name: ${name} and number: ${number} and userId: ${storedClientId}`);

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
  
  // If we have stored credentials, reconnect (police optional for reconnection)
  if (name && number && clientId) {
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
    
    // Don't reconnect if clientId is socket.id - backend doesn't recognize it
    // Only reconnect with clientIds we got from backend (session/session-reconnect events)
    // Socket.id is a temporary fallback and shouldn't be used for reconnection
    if (storedClientId === socket.id) {
      console.warn('Cannot reconnect with socket.id - backend requires valid clientId from session');
      return false;
    }
    
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

// Send message to operator (backend requires roomId, senderId, text)
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
  
  socket.emit('send-message', {
    text,
    roomId,
    senderId: clientId
  });
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
    // Backend expects: end-chat (with hyphen) and only roomId
    socket.emit('end-chat', { 
      roomId: clientData.roomId
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
    // Backend expects: submit-feedback (with hyphen) and only roomId, rating, comment
    const payload = {
      roomId: currentRoomId,
      rating: feedbackData.score,
      comment: feedbackData.comment
    };

    socket.emit('submit-feedback', payload);
  }
};

// Add this new function
export const cleanupClientSocket = () => {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
    messageHandler = null;
    sessionHandler = null;
  }
  clientStorage.clear();
  if (visibilityReconnectListener && typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', visibilityReconnectListener);
    visibilityReconnectListener = null;
  }
  try {
    localStorage.removeItem('clientSession');
    localStorage.removeItem('clientUser');
  } catch (e) {
    console.warn('Could not remove client session from localStorage', e);
  }
};