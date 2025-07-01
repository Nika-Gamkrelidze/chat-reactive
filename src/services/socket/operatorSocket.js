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
      // Only save operatorId if it's not null
      if (this.operatorId) {
        localStorage.setItem('operatorId', this.operatorId);
      }
      localStorage.setItem('activeClients', JSON.stringify(this.activeClients));
      localStorage.setItem('pendingClients', JSON.stringify(this.pendingClients));
      localStorage.setItem('operatorMessages', JSON.stringify(this.messages));
    } catch (e) {
      console.error('Error saving to localStorage:', e);
    }
  },
  
  // Load data from localStorage
  loadFromStorage: function() {
    try {
      const operatorData = localStorage.getItem('operatorData');
      const storedOperatorId = localStorage.getItem('operatorId');
      const activeClients = localStorage.getItem('activeClients');
      const pendingClients = localStorage.getItem('pendingClients');
      const messages = localStorage.getItem('operatorMessages');
      
      if (operatorData) this.operator = JSON.parse(operatorData);
      // Only set operatorId if it's a valid value (not null, 'null', or 'undefined')
      if (storedOperatorId && storedOperatorId !== 'null' && storedOperatorId !== 'undefined') {
        this.operatorId = storedOperatorId;
      }
      if (activeClients) this.activeClients = JSON.parse(activeClients);
      if (pendingClients) this.pendingClients = JSON.parse(pendingClients);
      if (messages) this.messages = JSON.parse(messages);
    } catch (e) {
      console.error('Error loading from localStorage:', e);
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
    
    // Clear localStorage
    localStorage.removeItem('operatorData');
    localStorage.removeItem('operatorId');
    localStorage.removeItem('activeClients');
    localStorage.removeItem('pendingClients');
    localStorage.removeItem('operatorMessages');
    localStorage.removeItem('operatorName');
    localStorage.removeItem('operatorNumber');
  },
  
  // Clear all operator data including login credentials
  clearAll: function() {
    this.clear();
    
    try {
      localStorage.removeItem('operatorId');
      localStorage.removeItem('operatorName');
      localStorage.removeItem('operatorNumber');
    } catch (error) {
      console.error('Error clearing all operator data from local storage:', error);
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
    });
    
    socket.on('disconnect', (reason) => {
      console.log(`Operator disconnected from server: ${reason}`);
    });
    
    socket.on('connect_error', (error) => {
      console.error('Operator socket connection error:', error);
    });
    
    // Handle session establishment
    socket.on('session', (data) => {
      console.log('Operator session established with data:', data);
      console.log('DEBUG: Checking metadata in session data:', data?.activeRooms?.map(r => r.client?.metadata), data?.activeClients?.map(c => c.metadata));
      
      const { operator, activeRooms, activeClients: sessionActiveClients } = data;

      // Update storage with new session data - handle flattened structure
      operatorStorage.updateFromSession({
        operator: {
          id: operator?.id,
          name: operator?.name,
          number: operator?.number,
          status: operator?.status
        }
      });
      
      // Update socket auth with new operator ID if available
      if (operator?.id) {
        socket.auth.userId = operator.id;
      }
      
      // Call session handler if defined
      if (sessionHandler && typeof sessionHandler === 'function') {
        sessionHandler({ operator, activeRooms, activeClients: sessionActiveClients, pendingClients: data.pendingClients });
      }
    });
    
    // Handle session reconnection
    socket.on('session-reconnect', (data) => {
      console.log('Operator session reconnected with data:', data);
      console.log('DEBUG: Checking metadata in session-reconnect data:', data?.activeRooms?.map(r => r.client?.metadata), data?.activeClients?.map(c => c.metadata));

      const { operator, activeRooms, activeClients: sessionActiveClients } = data;
      
      // Update storage with reconnection data
      operatorStorage.updateFromSession({
        operator: operator ? { id: operator.id, name: operator.name, number: operator.number, status: operator.status } : null,
        operatorId: operator?.id
      });

      // Update socket auth with new operator ID if available
      if (operator?.id) {
        socket.auth.userId = operator.id;
      }
      
      // Call session handler if defined
      if (sessionHandler && typeof sessionHandler === 'function') {
        sessionHandler({ operator, activeRooms, activeClients: sessionActiveClients, pendingClients: data.pendingClients, messages: data.messages });
      }
    });
    
    // Handle room assignment
    socket.on('room_assigned', (data) => {
      console.log('Room assigned to operator:', data);
      console.log('DEBUG: Checking metadata in room_assigned data:', data?.client?.metadata);
      
      if (data && data.client && data.roomId && data.client.id) {
        // Initialize clients object if needed
        if (!operatorStorage.clients) {
          operatorStorage.clients = {};
        }

        const clientId = data.client.id;
        const currentRoomStatus = data.roomStatus || 'active';

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
          // Process each message
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
        
        // Call client list handler with updated active clients
        if (clientListHandler && typeof clientListHandler === 'function') {
          clientListHandler([...operatorStorage.activeClients]); // Send a new array to trigger update
        }
      }
    });
    
    // Handle client list updates
    socket.on('active_clients', (clients) => {
      if (DEBUG_SOCKET) {
        console.log('Operator received active clients update:', clients);
        console.log('DEBUG: Checking metadata in active_clients data:', clients?.map(c => c.metadata));
      }
      
      // Initialize nested clients storage if needed
      if (!operatorStorage.clients) {
        operatorStorage.clients = {};
      }
      
      // Update clients in storage
      clients.forEach(client => {
        if (!client.id) return; // Skip if client has no ID
        const existingClient = operatorStorage.clients[client.id];
        operatorStorage.clients[client.id] = {
          ...client,
          // Ensure roomStatus is consistent, prioritize it, default to 'active'
          roomStatus: client.roomStatus || (existingClient ? existingClient.roomStatus : 'active') 
        };
      });
      
      // Update top-level active clients list, ensuring roomStatus consistency
      operatorStorage.activeClients = clients.map(client => {
        if (!client.id) return null; // Handle potential malformed client data
        const existingClient = operatorStorage.activeClients.find(c => c.id === client.id);
        return {
          ...client,
          // Prioritize roomStatus from incoming data, fallback to existing, default to 'active'
          roomStatus: client.roomStatus || (existingClient ? existingClient.roomStatus : 'active') 
        };
      }).filter(Boolean); // Filter out any null entries from malformed data
      
      operatorStorage.saveToStorage();
      
      // Call client list handler with updated list
      if (clientListHandler && typeof clientListHandler === 'function') {
        clientListHandler([...operatorStorage.activeClients]); // Send a new array to trigger update
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
    
    // Handle client reconnection
    socket.on('client_reconnected', (data) => {
      console.log('Client reconnected:', data);
      console.log('DEBUG: Checking metadata in client_reconnected data:', data?.client?.metadata);
      
      if (data && data.client && data.roomId && data.client.id) {
        // Initialize clients object if needed
        if (!operatorStorage.clients) {
          operatorStorage.clients = {};
        }

        const clientId = data.client.id;
        const currentRoomStatus = 'active'; // Reconnected clients are active

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
                  roomStatus: currentRoomStatus
                }
              : client
          );
        }
        
        // Initialize or get existing messages array for this client
        if (!operatorStorage.messages[clientId]) {
          operatorStorage.messages[clientId] = [];
        }
        
        // Add messages if provided
        if (data.messages && Array.isArray(data.messages)) {
          // Clear existing messages for reconnected client to avoid duplicates
          operatorStorage.messages[clientId] = [];
          
          // Process each message
          data.messages.forEach(message => {
            // Enhance message with clientId for internal routing
            const enhancedMessage = {
              ...message,
              clientId: clientId,
              // For system messages, keep senderId as system
              sentByOperator: message.senderId === operatorStorage.operatorId
            };
            
            operatorStorage.messages[clientId].push(enhancedMessage);
          });
          
          // Sort messages by timestamp
          operatorStorage.messages[clientId].sort(
            (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
          );
          
          // Notify message handler of each message to re-display them
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
        
        // Call client list handler with updated active clients
        if (clientListHandler && typeof clientListHandler === 'function') {
          clientListHandler([...operatorStorage.activeClients]); // Send a new array to trigger update
        }
      }
    });

    // Handle client typing indicator
    socket.on('client_typing', (data) => {
      console.log('Operator received client_typing event:', data);
      if (typingHandler && typeof typingHandler === 'function') {
        // Pass the full data: { roomId, userId, isTyping, timestamp }
        typingHandler(data);
      }
    });

    // Handle chat status updates
    socket.on('chat_status_update', (data) => {
      let storageUpdated = false;
      let listUpdated = false;
      let updatedActiveClientsList = operatorStorage.activeClients; // Start with current list

      if (data && data.clientId && data.roomStatus) {
        // Update client roomStatus in storage
        if (operatorStorage.clients && operatorStorage.clients[data.clientId]) {
          if (operatorStorage.clients[data.clientId].roomStatus !== data.roomStatus) {
            operatorStorage.clients[data.clientId].roomStatus = data.roomStatus;
            storageUpdated = true;
          }
        }
        
        // Update active clients list
        const currentActiveClients = operatorStorage.activeClients;
        const clientIndex = currentActiveClients.findIndex(c => c.id === data.clientId);

        if (clientIndex !== -1 && currentActiveClients[clientIndex].roomStatus !== data.roomStatus) {
          updatedActiveClientsList = currentActiveClients.map((client, index) => 
            index === clientIndex 
              ? { ...client, roomStatus: data.roomStatus } 
              : client
          );
          operatorStorage.activeClients = updatedActiveClientsList;
          listUpdated = true;
        } 

        if (storageUpdated || listUpdated) {
          operatorStorage.saveToStorage();
          // Notify client list handler with the updated list
          if (clientListHandler && typeof clientListHandler === 'function') {
            clientListHandler(updatedActiveClientsList);
          }
        } else {
          console.log(`Chat status update for ${data.clientId} did not change state.`);
        }
      }
    });

    // Handle client disconnection (sets roomStatus to 'closed')
    socket.on('client_disconnected', (data) => {
      if (data && data.clientId) {
        console.log('Client disconnected:', data.clientId);
        let storageUpdated = false;
        let listUpdated = false;
        let updatedActiveClientsList = operatorStorage.activeClients;

        // Update client roomStatus in clients storage
        if (operatorStorage.clients && operatorStorage.clients[data.clientId]) {
          if (operatorStorage.clients[data.clientId].roomStatus !== 'closed') {
            operatorStorage.clients[data.clientId].roomStatus = 'closed';
            storageUpdated = true;
          }
        }

        // Update active clients list
        const currentActiveClients = operatorStorage.activeClients;
        const clientIndex = currentActiveClients.findIndex(c => c.id === data.clientId);

        if (clientIndex !== -1 && currentActiveClients[clientIndex].roomStatus !== 'closed') {
          updatedActiveClientsList = currentActiveClients.map((client, index) => 
            index === clientIndex 
              ? { ...client, roomStatus: 'closed' } 
              : client
          );
          operatorStorage.activeClients = updatedActiveClientsList;
          listUpdated = true;
        }

        if (storageUpdated || listUpdated) {
          operatorStorage.saveToStorage();
          // Notify client list handler
          if (clientListHandler && typeof clientListHandler === 'function') {
            clientListHandler(updatedActiveClientsList);
          }
        } else {
          console.log(`Client disconnect event for ${data.clientId} did not change state.`);
        }
      }
    });

    // Handle client ending chat (sets roomStatus to 'closed')
    socket.on('chat_ended', (data) => {
      if (data && data.clientId) {
        console.log('Client ended chat:', data);

        let storageUpdated = false;
        let listUpdated = false;
        let updatedActiveClientsList = operatorStorage.activeClients; // Start with current

        // Update client roomStatus in clients storage (nested object)
        if (operatorStorage.clients && operatorStorage.clients[data.clientId]) {
          if (operatorStorage.clients[data.clientId].roomStatus !== 'closed') {
             operatorStorage.clients[data.clientId].roomStatus = 'closed';
             storageUpdated = true;
             console.log(`Updated roomStatus in operatorStorage.clients for ${data.clientId}`);
          }
        }

        // Update active clients list (simple array)
        const currentActiveClients = operatorStorage.activeClients; // Get current list reference
        const clientIndex = currentActiveClients.findIndex(c => c.id === data.clientId);

        // Only update if found and not already closed
        if (clientIndex !== -1 && currentActiveClients[clientIndex].roomStatus !== 'closed') {
           console.log(`Found client ${data.clientId} in activeClients at index ${clientIndex}, updating status.`);
           // Create the updated list using map
           updatedActiveClientsList = currentActiveClients.map((client, index) =>
              index === clientIndex
                ? { ...client, roomStatus: 'closed' } // Update the specific client
                : client
           );
           // Reassign the storage list to the new array reference
           operatorStorage.activeClients = updatedActiveClientsList;
           listUpdated = true;
        } else {
          console.log(`Client ${data.clientId} not found in activeClients or already closed.`);
        }

        // If any part of the state actually changed
        if (storageUpdated || listUpdated) {
          console.log('Saving updated storage after client_ended_chat');
          operatorStorage.saveToStorage();

          // Notify the main client list handler with the *explicitly updated* list
          if (clientListHandler && typeof clientListHandler === 'function') {
            console.log('Calling clientListHandler with updated list:', updatedActiveClientsList);
            clientListHandler(updatedActiveClientsList); // Pass the result directly
          }

          // Notify the specific handler for this event
          if (clientChatClosedHandler && typeof clientChatClosedHandler === 'function') {
             console.log('Calling clientChatClosedHandler');
            clientChatClosedHandler(data.clientId);
          }
        } else {
           console.log('No updates made for client_ended_chat event.');
        }
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
  
  // Set authentication data
  socket.auth = {
    name: name,
    number: number,
    userId: operatorId || localStorage.getItem('operatorId'),
    type: "operator"
  };
  
  console.log(`Connecting to socket server as operator with name: ${name} and number: ${number} and userId: ${operatorId || 'null'}`);
  
  // Connect to the server
  socket.connect();
  
  return socket;
};

// Reconnect with stored credentials
export const reconnectOperatorSocket = () => {
  // Clean up any corrupted operatorId data first
  const storedOperatorId = localStorage.getItem('operatorId');
  if (storedOperatorId === 'null' || storedOperatorId === 'undefined') {
    console.log('Cleaning up corrupted operatorId from localStorage');
    localStorage.removeItem('operatorId');
  }
  
  // Load any existing data from storage
  operatorStorage.loadFromStorage();
  
  // Get stored credentials
  const cleanOperatorId = localStorage.getItem('operatorId');
  const name = localStorage.getItem('operatorName');
  const number = localStorage.getItem('operatorNumber');
  
  // Convert string 'null' to actual null, and handle empty strings
  const operatorId = (cleanOperatorId && cleanOperatorId !== 'null' && cleanOperatorId !== 'undefined') 
    ? cleanOperatorId 
    : null;
  
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
      name: name,
      number: number,
      userId: operatorId, // Will be null if not properly stored
      type: "operator"
    };
    
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
    // socket.emit('get_client_queue');
    return true;
  }
  return false;
};

// Request active clients
export const requestActiveClients = () => {
  if (socket && socket.connected) {
    // socket.emit('get_active_clients');
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
  
  const storedOperatorId = operatorStorage.operatorId || localStorage.getItem('operatorId');
  // Convert string 'null' to actual null
  const operatorId = (storedOperatorId && storedOperatorId !== 'null' && storedOperatorId !== 'undefined') 
    ? storedOperatorId 
    : null;
  const operatorName = localStorage.getItem('operatorName');
  
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
    receiverId: clientId,
    senderName: operatorName
  };
  
  // Just emit the message to server - no temporary message creation
  socket.emit('send_message', messageData);
};

// Accept client from queue
export const acceptClient = (clientId) => {
  if (socket && socket.connected) {
    socket.emit('accept_client', { clientId });
    return true;
  }
  return false;
};

// Send typing indicator event to the server
export const sendOperatorTypingEvent = (roomId, isTyping) => {
  if (socket && socket.connected) {
    const storedOperatorId = operatorStorage.operatorId || localStorage.getItem('operatorId');
    // Convert string 'null' to actual null
    const operatorId = (storedOperatorId && storedOperatorId !== 'null' && storedOperatorId !== 'undefined') 
      ? storedOperatorId 
      : null;
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
      userId: operatorId,
      userType: 'operator',
      isTyping
      // Note: Operator typing events do not send inputText
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