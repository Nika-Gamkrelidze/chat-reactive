import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  initClientSocket, 
  setClientMessageHandler, 
  sendClientMessage, 
  getClientSocket, 
  sendClientTypingStatus,
  clientStorage,
  joinClientRoom,
  reconnectClientSocket,
  isClientRegistered
} from '../services/clientSocket';
import { FiSend, FiUser } from 'react-icons/fi';
import './ClientChat.css';

function ClientChat() {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [hasOperator, setHasOperator] = useState(false);
  const [operatorInfo, setOperatorInfo] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [operatorTyping, setOperatorTyping] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const socketInitializedRef = useRef(false);
  const navigate = useNavigate();
  const clientName = sessionStorage.getItem('clientName');
  const clientNumber = sessionStorage.getItem('clientNumber');
  
  useEffect(() => {
    if (!clientName || !clientNumber) {
      navigate('/client/login');
      return;
    }

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
      console.log('Session update received:', sessionData);
      
      // Handle operator assignment
      if (sessionData.type === 'operator_assigned' && sessionData.operator) {
        setHasOperator(true);
        setOperatorInfo(sessionData.operator);
      } else if (sessionData.operator) {
        setHasOperator(true);
        setOperatorInfo(sessionData.operator);
      }
    };
    
    // Try to reconnect with stored credentials first
    let socket = reconnectClientSocket(handleNewMessage, handleSessionUpdate);
    
    // If no stored credentials or reconnection failed, initialize with provided credentials
    if (!socket) {
      socket = initClientSocket(clientName, clientNumber, handleNewMessage, handleSessionUpdate);
    }
    
    if (socket) {
      setIsConnected(true);
      
      // Set message handler explicitly
      setClientMessageHandler(handleNewMessage);
      
      // Load existing messages from storage
      const storedMessages = clientStorage.messages || [];
      if (storedMessages.length > 0) {
        setMessages(storedMessages);
      }
      
      // Join room if available
      if (clientStorage.roomId) {
        console.log('Joining room:', clientStorage.roomId);
        joinClientRoom(clientStorage.roomId);
      }
      
      // Update operator info if available
      if (clientStorage.hasOperator && clientStorage.operatorInfo) {
        setHasOperator(true);
        setOperatorInfo(clientStorage.operatorInfo);
      }
    }
    
    // Clean up on unmount
    return () => {
      socket.disconnect();
    };
  }, [clientName, clientNumber, navigate]);
  
  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  const handleInputChange = (e) => {
    setInputMessage(e.target.value);
    
    // Handle typing indicator
    if (!isTyping) {
      setIsTyping(true);
      sendClientTypingStatus(true);
    }
    
    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Set new timeout to stop typing indicator after 2 seconds
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      sendClientTypingStatus(false);
    }, 2000);
  };
  
  const handleSendMessage = (e) => {
    e.preventDefault();
    
    if (!inputMessage.trim()) return;
    
    console.log('Sending message:', inputMessage);
    
    // Send message through socket
    const sent = sendClientMessage(inputMessage);
    
    if (sent) {
      console.log('Message sent successfully');
      // Clear input
      setInputMessage('');
      // Reset typing indicator
      setIsTyping(false);
      clearTimeout(typingTimeoutRef.current);
    } else {
      console.error('Failed to send message');
      // You might want to show an error to the user here
    }
  };

  const handleLogout = () => {
    // Clear session storage
    sessionStorage.removeItem('clientName');
    sessionStorage.removeItem('clientNumber');
    
    // Disconnect socket if needed
    const socket = getClientSocket();
    if (socket) {
      socket.disconnect();
    }
    
    // Navigate to login
    navigate('/client/login');
  };
  
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto h-screen flex flex-col">
        {/* Header */}
        <div className="bg-white border-b px-6 py-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-full bg-gradient-to-r from-primary-500 to-primary-600 flex items-center justify-center text-white font-medium">
              {clientName?.[0]?.toUpperCase()}
            </div>
            <div>
              <h2 className="font-semibold text-gray-800">{clientName}</h2>
              <p className="text-sm text-gray-500">{clientNumber}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            Logout
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4" ref={messagesEndRef}>
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`flex ${msg.sender === 'client' ? 'justify-end' : 'justify-start'}`}
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
          {isTyping && (
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div>
            </div>
          )}
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
            />
            <button
              type="submit"
              className="px-6 py-2 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-medium rounded-lg transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] shadow-sm"
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