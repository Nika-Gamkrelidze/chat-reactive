import React, { useEffect, useState, useRef } from 'react';
import { 
  initSocket, 
  setMessageHandler, 
  sendMessage, 
  getSocket, 
  sendTypingStatus, 
  getStoredMessages,
  chatStorage 
} from '../services/socket';
import { FiSend, FiUser, FiMessageSquare } from 'react-icons/fi';
import './Chat.css';

function ChatComponent({ userName = '', userNumber = '' }) {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [operatorTyping, setOperatorTyping] = useState(false);
  const [hasOperator, setHasOperator] = useState(chatStorage.hasOperator);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  
  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  
  useEffect(() => {
    // Load stored messages first
    const storedMessages = getStoredMessages();
    if (storedMessages && storedMessages.length > 0) {
      setMessages(storedMessages);
    }
    
    // Initialize socket if not already done
    const socket = getSocket() || initSocket(userName, userNumber, null, handleNewMessage);
    
    // Set up message handler
    function handleNewMessage(message) {
      console.log('New message received in component:', message);
      setMessages(prevMessages => {
        // Check if message already exists in the array
        const exists = prevMessages.some(m => m.messageId === message.messageId);
        if (exists) return prevMessages;
        return [...prevMessages, message];
      });
    }
    
    setMessageHandler(handleNewMessage);
    
    // Handle typing indicator from operator
    socket.on('typing', (isTyping) => {
      setOperatorTyping(isTyping);
    });
    
    // Handle operator assignment
    socket.on('operator-assigned', () => {
      setHasOperator(true);
    });
    
    // Handle operator unassignment
    socket.on('operator-unassigned', () => {
      setHasOperator(false);
    });
    
    // Clean up on unmount
    return () => {
      setMessageHandler(null);
      socket.off('typing');
      socket.off('operator-assigned');
      socket.off('operator-unassigned');
    };
  }, [userName, userNumber]);
  
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (inputMessage.trim()) {
      sendMessage(inputMessage);
      setInputMessage('');
      setIsTyping(false);
      sendTypingStatus(false);
    }
  };
  
  const handleInputChange = (e) => {
    const value = e.target.value;
    setInputMessage(value);
    
    // Handle typing indicator
    const isCurrentlyTyping = value.length > 0;
    if (isCurrentlyTyping !== isTyping) {
      setIsTyping(isCurrentlyTyping);
      sendTypingStatus(isCurrentlyTyping);
    }
  };
  
  // Group messages by date
  const groupedMessages = messages.reduce((groups, message) => {
    const date = new Date(message.timestamp).toLocaleDateString();
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(message);
    return groups;
  }, {});
  
  // Get display name for user avatar
  const displayName = userName || (chatStorage.client?.name || '');
  const userInitial = displayName ? displayName.charAt(0).toUpperCase() : '?';
  
  return (
    <div className="chat-container">
      <div className="chat-header">
        <div className="chat-title">
          <FiMessageSquare className="chat-icon" />
          <h2>Support Chat</h2>
        </div>
        <div className="user-info">
          <FiUser className="user-icon" />
          <span>{displayName || 'Guest'}</span>
        </div>
      </div>
      
      <div className="messages-container" ref={messagesContainerRef}>
        {Object.entries(groupedMessages).map(([date, dateMessages]) => (
          <div key={date} className="message-group">
            <div className="date-divider">
              <span>{date}</span>
            </div>
            
            {dateMessages.map((message, index) => {
              const isSystem = message.type === 'system';
              // Check if the message was sent by the current user
              const isCurrentUser = message.senderId === chatStorage.client?.id;
              // Check if the message was sent by an operator
              const isOperator = message.sentByOperator === true;
              
              return (
                <div 
                  key={message.messageId || index} 
                  className={`message-wrapper ${isSystem ? 'system' : isCurrentUser ? 'user' : isOperator ? 'operator' : 'other'}`}
                >
                  <div className={`message ${isSystem ? 'system-message' : isCurrentUser ? 'user-message' : isOperator ? 'operator-message' : 'other-message'}`}>
                    {isOperator && <div className="avatar operator-avatar">OP</div>}
                    {isCurrentUser && <div className="avatar user-avatar">{userInitial}</div>}
                    {!isSystem && !isCurrentUser && !isOperator && <div className="avatar other-avatar">?</div>}
                    
                    <div className="message-bubble">
                      {isSystem && <div className="message-sender">System</div>}
                      {isOperator && <div className="message-sender">Support Agent</div>}
                      {!isSystem && !isCurrentUser && !isOperator && <div className="message-sender">Other</div>}
                      
                      <div className="message-text">{message.text}</div>
                      
                      <div className="message-timestamp">
                        {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        
        {!hasOperator && (
          <div className="queue-status">
            <div className="queue-icon">🔄</div>
            <div className="queue-text">Waiting for an available support agent...</div>
          </div>
        )}
        
        {operatorTyping && (
          <div className="typing-indicator">
            <div className="typing-bubble">
              <span className="dot"></span>
              <span className="dot"></span>
              <span className="dot"></span>
            </div>
            <div className="typing-text">Support agent is typing...</div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>
      
      <form onSubmit={handleSendMessage} className="message-input-form">
        <input
          type="text"
          value={inputMessage}
          onChange={handleInputChange}
          placeholder="Type a message..."
          className="message-input"
        />
        <button 
          type="submit" 
          className={`send-button ${inputMessage.trim() ? 'active' : ''}`}
          disabled={!inputMessage.trim()}
        >
          <FiSend />
        </button>
      </form>
    </div>
  );
}

export default ChatComponent;