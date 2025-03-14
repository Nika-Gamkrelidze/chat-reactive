import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  initClientSocket, 
  setClientMessageHandler, 
  setClientSessionHandler,
  sendClientMessage, 
  sendClientTypingStatus,
  clientStorage,
  getClientSocket
} from '../../services/socket/clientSocket';

function ClientChat() {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [hasOperator, setHasOperator] = useState(false);
  const [operatorInfo, setOperatorInfo] = useState(null);
  const [operatorTyping, setOperatorTyping] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const socketInitializedRef = useRef(false);
  const navigate = useNavigate();
  
  // Get client info from session storage
  const clientName = sessionStorage.getItem('clientName');
  const clientNumber = sessionStorage.getItem('clientNumber');
  const clientId = sessionStorage.getItem('clientId');
  
  useEffect(() => {
    // Redirect to login if no client info
    if (!clientName || !clientNumber) {
      navigate('/client/login');
      return;
    }

    if (socketInitializedRef.current) return;
    socketInitializedRef.current = true;

    // Define message handler function
    const handleNewMessage = (message) => {
      console.log('New message received in chat component:', message);
      
      // Handle typing indicator
      if (message.type === 'typing') {
        setOperatorTyping(message.isTyping);
        return;
      }
      
      // Add message to state
      setMessages(prevMessages => {
        // Check if message already exists
        const exists = prevMessages.some(m => m.messageId === message.messageId);
        if (exists) return prevMessages;
        
        return [...prevMessages, message];
      });
    };
    
    // Define session handler function
    const handleSessionUpdate = (sessionData) => {
      console.log('Session update received in ClientChat:', sessionData);
      setIsLoading(false);
      
      // Handle operator assignment
      if (sessionData.operator) {
        setHasOperator(true);
        setOperatorInfo(sessionData.operator);
      }
      
      // Update room ID if available
      if (sessionData.roomId) {
        // Room ID is already stored in sessionStorage by the socket service
      }
      
      // Load messages if available
      if (sessionData.messages && Array.isArray(sessionData.messages)) {
        setMessages(sessionData.messages);
      }
      
      setIsConnected(true);
    };
    
    // Set message and session handlers
    setClientMessageHandler(handleNewMessage);
    setClientSessionHandler(handleSessionUpdate);
    
    // Initialize socket connection
    console.log('Initializing client socket with:', { clientName, clientNumber, clientId });
    const socket = initClientSocket(clientName, clientNumber, clientId);
    
    // Handle connection events
    socket.on('connect', () => {
      console.log('Socket connected in ClientChat component');
      setIsConnected(true);
    });
    
    socket.on('disconnect', () => {
      console.log('Socket disconnected in ClientChat component');
      setIsConnected(false);
    });
    
    socket.on('connect_error', (error) => {
      console.error('Connection error in ClientChat:', error);
      setIsLoading(false);
    });
    
    // Load existing messages from storage
    const storedMessages = clientStorage.messages || [];
    if (storedMessages.length > 0) {
      setMessages(storedMessages);
    }
    
    // Update operator info if available
    if (clientStorage.hasOperator && clientStorage.operatorInfo) {
      setHasOperator(true);
      setOperatorInfo(clientStorage.operatorInfo);
    }
    
    // Set a timeout to check connection status
    const connectionTimeout = setTimeout(() => {
      if (!socket.connected) {
        console.log('Socket connection timed out, redirecting to login');
        navigate('/client/login');
      }
    }, 5000);
    
    // Clean up on unmount
    return () => {
      clearTimeout(connectionTimeout);
      
      // Don't disconnect the socket, just remove the handlers
      const currentSocket = getClientSocket();
      if (currentSocket) {
        currentSocket.off('connect');
        currentSocket.off('disconnect');
        currentSocket.off('connect_error');
      }
    };
  }, [clientName, clientNumber, clientId, navigate]);
  
  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);
  
  // Handle sending a message
  const handleSendMessage = (e) => {
    e.preventDefault();
    
    if (!inputMessage.trim() || !isConnected) return;
    
    // Send message to server
    const success = sendClientMessage(inputMessage);
    
    if (success) {
      // Add message to local state
      const newMessage = {
        messageId: `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        text: inputMessage,
        sender: 'client',
        timestamp: new Date().toISOString()
      };
      
      setMessages(prevMessages => [...prevMessages, newMessage]);
      setInputMessage('');
      
      // Clear typing indicator
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        sendClientTypingStatus(false);
      }
    }
  };
  
  // Handle input change and typing indicator
  const handleInputChange = (e) => {
    setInputMessage(e.target.value);
    
    if (!isConnected) return;
    
    // Send typing indicator
    sendClientTypingStatus(true);
    
    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Set timeout to clear typing indicator
    typingTimeoutRef.current = setTimeout(() => {
      sendClientTypingStatus(false);
    }, 2000);
  };
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 to-secondary-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-soft text-center">
          <div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold text-gray-800">Connecting to chat...</h2>
          <p className="text-gray-500 mt-2">Please wait while we establish your connection</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-secondary-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-soft overflow-hidden flex flex-col h-[80vh]">
        {/* Chat Header */}
        <div className="bg-gradient-to-r from-primary-500 to-primary-600 text-white p-4">
          <h2 className="text-xl font-semibold">
            {hasOperator 
              ? `Chatting with ${operatorInfo?.name || 'Support Agent'}`
              : 'Waiting for an operator...'}
          </h2>
          <p className="text-sm text-primary-100">
            {!isConnected && <span className="text-red-200">⚠️ Reconnecting...</span>}
            {isConnected && (hasOperator 
              ? 'You are now connected with a support agent'
              : 'You have been placed in a queue')}
          </p>
        </div>
        
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`flex ${msg.sender === 'client' ? 'justify-end' : 'justify-start'} mb-3`}
            >
              <div
                className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                  msg.sender === 'client'
                    ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white'
                    : 'bg-white border border-gray-200 text-gray-800'
                }`}
              >
                <p className="text-sm">{msg.text}</p>
                <p className={`text-xs mt-1 ${
                  msg.sender === 'client' ? 'text-primary-100' : 'text-gray-400'
                }`}>
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}
          {operatorTyping && (
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="bg-white border-t p-4">
          <form onSubmit={handleSendMessage} className="flex space-x-4">
            <input
              type="text"
              value={inputMessage}
              onChange={handleInputChange}
              className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-all outline-none"
              placeholder="Type your message..."
              disabled={!isConnected}
            />
            <button
              type="submit"
              className={`px-6 py-2 font-medium rounded-lg transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] shadow-sm ${
                isConnected 
                  ? 'bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
              disabled={!isConnected}
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default ClientChat; 