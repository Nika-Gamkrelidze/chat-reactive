import React, { useEffect, useState, useRef } from 'react';
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

function ClientChat({ userName, userNumber }) {
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
  
  useEffect(() => {
    // Only connect if we have a username and number and haven't initialized yet
    if (!userName || !userNumber || socketInitializedRef.current) {
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
      socket = initClientSocket(userName, userNumber, handleNewMessage, handleSessionUpdate);
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
      // Nothing to clean up here as we want to keep the socket connection
    };
  }, [userName, userNumber]);
  
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
  
  return (
    <div className="chat-container">
      <div className="chat-header">
        <div className="chat-title">
          <FiUser className="user-icon" />
          <h2>Chat with Support</h2>
        </div>
        {hasOperator && operatorInfo && (
          <div className="operator-info">
            <span>Operator: {operatorInfo.name}</span>
          </div>
        )}
      </div>
      
      <div className="messages-container">
        {messages.map((msg, index) => (
          <div 
            key={msg.messageId || index} 
            className={`message ${msg.isClient || msg.senderId === clientStorage.client?.id ? 'client-message' : 'operator-message'}`}
          >
            <div className="message-content">
              <p>{msg.text}</p>
              <span className="message-time">
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        ))}
        
        {operatorTyping && (
          <div className="typing-indicator">
            <span>Operator is typing...</span>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>
      
      <form className="message-input-container" onSubmit={handleSendMessage}>
        <input
          type="text"
          value={inputMessage}
          onChange={handleInputChange}
          placeholder="Type your message here..."
          className="message-input"
        />
        <button 
          type="submit" 
          className="send-button"
          disabled={!inputMessage.trim()}
        >
          <FiSend />
        </button>
      </form>
    </div>
  );
}

export default ClientChat; 