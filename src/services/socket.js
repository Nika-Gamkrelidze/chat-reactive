import { io } from 'socket.io-client';
import config from '../config/env';

let socket;

export const initSocket = (name, number) => {
  // Use the exact URL format from your example
  const socketUrl = 'http://chatnew.communiq.ge'; // Changed to HTTP instead of HTTPS
  const namespace = '/nikoloz'; // or '/namespace1' based on your logs
  
  console.log('Connecting to socket server at:', socketUrl + namespace);
  
  socket = io(socketUrl + namespace, {
    // Try polling first, then websocket if available
    transports: ['polling', 'websocket'],
    auth: {
      name,
      number
    },
    autoConnect: false,
    forceNew: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 20000,
    // Try with explicit path
    path: '/socket.io/',
    // Add query parameters if needed
    query: {
      transport: 'polling,websocket'
    }
  });

  // Now manually connect
  socket.connect();

  // Connection events
  socket.on('connect', () => {
    console.log('Connected to server with ID:', socket.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('Disconnected from server:', reason);
  });

  socket.on('connect_error', (error) => {
    console.error('Connection error:', error.message);
    
    // If we get a certificate error, try connecting with HTTP instead
    if (error.message.includes('certificate') && socketUrl.startsWith('https')) {
      console.log('Attempting to connect using HTTP instead of HTTPS...');
      disconnectSocket();
      const httpUrl = socketUrl.replace('https', 'http');
      socket = io(httpUrl + namespace, {
        transports: ['polling', 'websocket'],
        auth: { name, number },
        autoConnect: true
      });
    }
  });

  // Session management
  socket.on('session', ({ userId }) => {
    console.log('Session established with user ID:', userId);
    localStorage.setItem('userId', userId);
    
    // Reconnect with auth including userId
    socket.auth = { ...socket.auth, userId };
    socket.connect();
  });

  return socket;
};

export const getSocket = () => {
  return socket;
};

export const disconnectSocket = () => {
  if (socket) socket.disconnect();
};

// Send a message
export const sendMessage = (message) => {
  if (socket && socket.connected) {
    socket.emit('message', {
      text: message,
      timestamp: new Date().toISOString()
    });
    return true;
  }
  return false;
};

// Join a chat room
export const joinRoom = (roomId) => {
  if (socket && socket.connected) {
    socket.emit('join_room', roomId);
  }
};

// Leave a chat room
export const leaveRoom = (roomId) => {
  if (socket && socket.connected) {
    socket.emit('leave_room', roomId);
  }
};

// Send typing indicator
export const sendTypingStatus = (isTyping) => {
  if (socket && socket.connected) {
    socket.emit('typing', isTyping);
  }
};

// Request user list
export const requestUserList = () => {
  if (socket && socket.connected) {
    socket.emit('get_users');
  }
};