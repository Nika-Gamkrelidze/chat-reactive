import React, { useEffect, useState, useRef } from 'react';
import { 
  initSocket, 
  setMessageHandler, 
  sendMessage, 
  getSocket, 
  sendTypingStatus,
  joinRoom,
  leaveRoom,
  chatStorage
} from '../services/socket';
import { FiSend, FiUser, FiMessageSquare, FiUsers, FiSearch, FiClock, FiAlertCircle } from 'react-icons/fi';
import './Operator.css';

function OperatorComponent({ operatorName, operatorNumber, operatorId = '' }) {
  const [activeClients, setActiveClients] = useState([]);
  const [pendingClients, setPendingClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [messages, setMessages] = useState({});
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [clientTyping, setClientTyping] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [unreadMessages, setUnreadMessages] = useState({});
  
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  
  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  useEffect(() => {
    if (selectedClient) {
      scrollToBottom();
    }
  }, [selectedClient, messages]);
  
  useEffect(() => {
    // Initialize socket as operator
    const socket = getSocket() || initSocket(operatorName, '', operatorId, handleNewMessage, null, 'operator');
    
    // Set up message handler
    function handleNewMessage(message) {
      console.log('New message received in operator component:', message);
      
      // Update messages for the specific client
      setMessages(prevMessages => {
        const clientId = message.senderId;
        const roomId = message.roomId;
        const clientKey = clientId || roomId;
        
        if (!clientKey) return prevMessages;
        
        const clientMessages = prevMessages[clientKey] || [];
        
        // Check if message already exists
        const exists = clientMessages.some(m => m.messageId === message.messageId);
        if (exists) return prevMessages;
        
        // Add message to client's messages
        const updatedClientMessages = [...clientMessages, message];
        
        // Update unread count if this client is not selected
        if (selectedClient?.id !== clientId && selectedClient?.roomId !== roomId) {
          setUnreadMessages(prev => ({
            ...prev,
            [clientKey]: (prev[clientKey] || 0) + 1
          }));
        }
        
        return {
          ...prevMessages,
          [clientKey]: updatedClientMessages
        };
      });
    }
    
    setMessageHandler(handleNewMessage);
    
    // Listen for client queue updates
    socket.on('client-queue', (queueData) => {
      console.log('Client queue updated:', queueData);
      setPendingClients(queueData.pendingClients || []);
    });
    
    // Listen for active clients updates
    socket.on('active-clients', (clientsData) => {
      console.log('Active clients updated:', clientsData);
      setActiveClients(clientsData.activeClients || []);
    });
    
    // Listen for typing indicators from clients
    socket.on('client-typing', (typingData) => {
      const { clientId, isTyping } = typingData;
      setClientTyping(prev => ({
        ...prev,
        [clientId]: isTyping
      }));
    });
    
    // Request initial client lists
    socket.emit('get-client-queue');
    socket.emit('get-active-clients');
    
    // Clean up on unmount
    return () => {
      setMessageHandler(null);
      socket.off('client-queue');
      socket.off('active-clients');
      socket.off('client-typing');
    };
  }, [operatorName, operatorId]);
  
  // Handle client selection
  const selectClient = (client) => {
    // Leave current room if any
    if (selectedClient && selectedClient.roomId) {
      leaveRoom(selectedClient.roomId);
    }
    
    setSelectedClient(client);
    
    // Join the new client's room
    if (client && client.roomId) {
      joinRoom(client.roomId);
      
      // Clear unread count for this client
      setUnreadMessages(prev => ({
        ...prev,
        [client.id]: 0,
        [client.roomId]: 0
      }));
    }
  };
  
  // Handle accepting a client from the queue
  const acceptClient = (client) => {
    const socket = getSocket();
    if (socket && socket.connected) {
      socket.emit('accept-client', { clientId: client.id, roomId: client.roomId });
      
      // Move client from pending to active
      setPendingClients(prev => prev.filter(c => c.id !== client.id));
      setActiveClients(prev => [...prev, client]);
      
      // Select the client automatically
      selectClient(client);
    }
  };
  
  // Handle sending a message
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (inputMessage.trim() && selectedClient) {
      const messageData = {
        text: inputMessage,
        roomId: selectedClient.roomId,
        receiverId: selectedClient.id
      };
      
      sendMessage(messageData);
      setInputMessage('');
      setIsTyping(false);
      sendTypingStatus(false);
    }
  };
  
  // Handle input change and typing indicator
  const handleInputChange = (e) => {
    const value = e.target.value;
    setInputMessage(value);
    
    // Handle typing indicator
    const isCurrentlyTyping = value.length > 0;
    if (isCurrentlyTyping !== isTyping && selectedClient) {
      setIsTyping(isCurrentlyTyping);
      sendTypingStatus(isCurrentlyTyping, selectedClient.roomId);
    }
  };
  
  // Filter clients based on search term
  const filteredActiveClients = activeClients.filter(client => 
    client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.number.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  const filteredPendingClients = pendingClients.filter(client => 
    client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.number.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  // Group messages by date for the selected client
  const groupedMessages = selectedClient ? 
    (messages[selectedClient.id] || messages[selectedClient.roomId] || []).reduce((groups, message) => {
      const date = new Date(message.timestamp).toLocaleDateString();
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(message);
      return groups;
    }, {}) : {};
  
  return (
    <div className="operator-container">
      <div className="sidebar">
        <div className="operator-info">
          <div className="operator-avatar">
            {operatorName.charAt(0).toUpperCase()}
          </div>
          <div className="operator-details">
            <h3>{operatorName}</h3>
            <span className="operator-number">{operatorNumber}</span>
            <span className="status online">Online</span>
          </div>
        </div>
        
        <div className="search-container">
          <FiSearch className="search-icon" />
          <input 
            type="text" 
            placeholder="Search clients..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
        
        <div className="client-lists">
          {pendingClients.length > 0 && (
            <div className="client-section">
              <h4 className="section-title">
                <FiClock className="section-icon" />
                Waiting Clients ({pendingClients.length})
              </h4>
              <div className="client-list pending-list">
                {filteredPendingClients.map(client => (
                  <div 
                    key={client.id} 
                    className="client-item pending"
                    onClick={() => acceptClient(client)}
                  >
                    <div className="client-avatar pending">
                      {client.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="client-info">
                      <div className="client-name">{client.name}</div>
                      <div className="client-number">{client.number}</div>
                    </div>
                    <div className="client-action">
                      <button className="accept-btn">Accept</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <div className="client-section">
            <h4 className="section-title">
              <FiUsers className="section-icon" />
              Active Clients ({activeClients.length})
            </h4>
            <div className="client-list active-list">
              {filteredActiveClients.map(client => {
                const clientKey = client.id || client.roomId;
                const hasUnread = unreadMessages[clientKey] > 0;
                
                return (
                  <div 
                    key={client.id} 
                    className={`client-item ${selectedClient?.id === client.id ? 'selected' : ''} ${hasUnread ? 'unread' : ''}`}
                    onClick={() => selectClient(client)}
                  >
                    <div className="client-avatar">
                      {client.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="client-info">
                      <div className="client-name">{client.name}</div>
                      <div className="client-number">{client.number}</div>
                    </div>
                    {hasUnread && (
                      <div className="unread-badge">
                        {unreadMessages[clientKey]}
                      </div>
                    )}
                    {clientTyping[client.id] && (
                      <div className="typing-indicator-dot">
                        <span className="dot"></span>
                        <span className="dot"></span>
                        <span className="dot"></span>
                      </div>
                    )}
                  </div>
                );
              })}
              
              {filteredActiveClients.length === 0 && (
                <div className="no-clients-message">
                  No active clients match your search
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      <div className="chat-area">
        {selectedClient ? (
          <>
            <div className="chat-header">
              <div className="client-info-header">
                <div className="client-avatar header-avatar">
                  {selectedClient.name.charAt(0).toUpperCase()}
                </div>
                <div className="client-details">
                  <h3>{selectedClient.name}</h3>
                  <span className="client-number">{selectedClient.number}</span>
                </div>
              </div>
              <div className="chat-actions">
                <button className="action-btn">
                  <FiAlertCircle />
                  <span>End Chat</span>
                </button>
              </div>
            </div>
            
            <div className="messages-container" ref={chatContainerRef}>
              {Object.entries(groupedMessages).map(([date, dateMessages]) => (
                <div key={date} className="message-group">
                  <div className="date-divider">
                    <span>{date}</span>
                  </div>
                  
                  {dateMessages.map((message, index) => {
                    const isSystem = message.type === 'system';
                    const isOperator = message.senderId === operatorId || message.sentByOperator;
                    const isClient = !isSystem && !isOperator;
                    
                    return (
                      <div 
                        key={message.messageId || index} 
                        className={`message-wrapper ${isSystem ? 'system' : isOperator ? 'operator' : 'client'}`}
                      >
                        <div className={`message ${isSystem ? 'system-message' : isOperator ? 'operator-message' : 'client-message'}`}>
                          {isClient && (
                            <div className="avatar client-avatar">
                              {selectedClient.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          {isOperator && (
                            <div className="avatar operator-avatar">
                              {operatorName.charAt(0).toUpperCase()}
                            </div>
                          )}
                          
                          <div className="message-bubble">
                            {isSystem && <div className="message-sender">System</div>}
                            
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
              
              {clientTyping[selectedClient.id] && (
                <div className="typing-indicator">
                  <div className="typing-bubble">
                    <span className="dot"></span>
                    <span className="dot"></span>
                    <span className="dot"></span>
                  </div>
                  <div className="typing-text">Client is typing...</div>
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
          </>
        ) : (
          <div className="no-client-selected">
            <div className="no-client-icon">
              <FiMessageSquare />
            </div>
            <h2>Select a client to start chatting</h2>
            <p>Or accept a client from the waiting queue</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default OperatorComponent; 