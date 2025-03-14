import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  reconnectClientSocket, 
  setClientMessageHandler, 
  sendClientMessage, 
  sendClientTypingStatus,
  clientStorage,
  disconnectClientSocket
} from '../../services/socket/clientSocket';

function ClientChat() {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [hasOperator, setHasOperator] = useState(false);
  const [operatorInfo, setOperatorInfo] = useState(null);
  const [operatorTyping, setOperatorTyping] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const navigate = useNavigate();
  
  // Get client info from session storage
  const clientName = sessionStorage.getItem('clientName');
  const clientNumber = sessionStorage.getItem('clientNumber');
  
  useEffect(() => {
    // Redirect to login if no client info
    if (!clientName || !clientNumber) {
      navigate('/client/login');
      return;
    }

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
    
    // Try to reconnect with stored credentials
    const socket = reconnectClientSocket();
    
    if (socket) {
      setIsConnected(true);
      
      // Set message handler
      setClientMessageHandler(handleNewMessage);
      
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
    }
    
    // Clean up on unmount
    return () => {
      disconnectClientSocket();
    };
  }, [clientName, clientNumber, navigate]);
  
  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  // Handle sending a message
  const handleSendMessage = (e) => {
    e.preventDefault();
    
    if (!inputMessage.trim()) return;
    
    // Send message to server
    if (sendClientMessage(inputMessage)) {
      // Add message to local state
      const newMessage = {
        messageId: `client_${Date.now()}`,
        text: inputMessage,
        sender: 'client',
        timestamp: new Date().toISOString()
      };
      
      setMessages(prev => [...prev, newMessage]);
      setInputMessage('');
      
      // Clear typing indicator
      clearTimeout(typingTimeoutRef.current);
      sendClientTypingStatus(false);
    }
  };
  
  // Handle input change and typing indicator
  const handleInputChange = (e) => {
    setInputMessage(e.target.value);
    
    // Send typing indicator
    clearTimeout(typingTimeoutRef.current);
    sendClientTypingStatus(true);
    
    // Clear typing indicator after delay
    typingTimeoutRef.current = setTimeout(() => {
      sendClientTypingStatus(false);
    }, 2000);
  };
  
  // Handle logout
  const handleLogout = () => {
    disconnectClientSocket();
    clientStorage.clear();
    navigate('/client/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-md flex flex-col h-[600px]">
        {/* Header */}
        <div className="p-4 border-b flex justify-between items-center">
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
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
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