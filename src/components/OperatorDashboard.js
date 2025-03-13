import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  initOperatorSocket, 
  setOperatorMessageHandler, 
  sendMessageToClient, 
  getOperatorSocket, 
  sendTypingToClient,
  joinClientRoom,
  leaveClientRoom,
  acceptClient,
  requestClientQueue,
  requestActiveClients,
  operatorStorage,
  getClientStoredMessages
} from '../services/operatorSocket';
import { FiSend, FiUser, FiMessageSquare, FiUsers, FiSearch, FiClock, FiAlertCircle } from 'react-icons/fi';
import './OperatorDashboard.css';

function OperatorDashboard({ operatorName, operatorNumber, operatorId = '' }) {
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
  const typingTimeoutRef = useRef(null);
  
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
    const socket = getOperatorSocket() || initOperatorSocket(operatorName, operatorNumber, operatorId, handleNewMessage, handleSessionUpdate);
    
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
    
    function handleSessionUpdate(sessionData) {
      console.log('Session update received:', sessionData);
      
      // Update active clients if provided
      if (sessionData.activeClients) {
        setActiveClients(sessionData.activeClients);
      }
      
      // Update pending clients if provided
      if (sessionData.pendingClients) {
        setPendingClients(sessionData.pendingClients);
      }
      
      // Handle room assignment
      if (sessionData.type === 'room_assigned') {
        // Update active clients
        setActiveClients(prev => {
          const exists = prev.some(c => c.id === sessionData.client.id);
          if (exists) return prev;
          return [...prev, sessionData.client];
        });
      }
    }
    
    setOperatorMessageHandler(handleNewMessage);
    
    // Request initial client lists
    requestClientQueue();
    requestActiveClients();
    
    // Handle client queue updates
    socket.on('client-queue', (data) => {
      console.log('Client queue updated:', data);
      if (data.pendingClients) {
        setPendingClients(data.pendingClients);
      }
    });
    
    // Handle active clients updates
    socket.on('active-clients', (data) => {
      console.log('Active clients updated:', data);
      if (data.activeClients) {
        setActiveClients(data.activeClients);
      }
    });
    
    // Handle client typing indicator
    socket.on('client-typing', (typingData) => {
      console.log('Client typing status:', typingData);
      
      const { isTyping, clientId, roomId } = typingData;
      const clientKey = clientId || roomId;
      
      if (clientKey) {
        setClientTyping(prev => ({
          ...prev,
          [clientKey]: isTyping
        }));
      }
    });
    
    // Load stored messages
    const storedMessages = operatorStorage.clientMessages || {};
    if (Object.keys(storedMessages).length > 0) {
      setMessages(storedMessages);
    }
    
    // Clean up on unmount
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [operatorName, operatorNumber, operatorId]);
  
  const handleInputChange = (e) => {
    setInputMessage(e.target.value);
    
    // Handle typing indicator
    if (!isTyping && selectedClient) {
      setIsTyping(true);
      sendTypingToClient(true, selectedClient.roomId, selectedClient.id);
    }
    
    // Reset typing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Set timeout to stop typing indicator
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      if (selectedClient) {
        sendTypingToClient(false, selectedClient.roomId, selectedClient.id);
      }
    }, 2000);
  };
  
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (inputMessage.trim() && selectedClient) {
      sendMessageToClient(
        selectedClient.id,
        selectedClient.roomId,
        inputMessage
      );
      setInputMessage('');
      setIsTyping(false);
      if (selectedClient) {
        sendTypingToClient(false, selectedClient.roomId, selectedClient.id);
      }
      
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    }
  };
  
  const handleClientSelect = (client) => {
    // Leave current room if any
    if (selectedClient && selectedClient.roomId) {
      leaveClientRoom(selectedClient.roomId);
    }
    
    // Join new client's room
    joinClientRoom(client.roomId);
    
    // Set selected client
    setSelectedClient(client);
    
    // Reset unread count for this client
    setUnreadMessages(prev => ({
      ...prev,
      [client.id || client.roomId]: 0
    }));
  };
  
  const handleAcceptClient = (client) => {
    acceptClient(client.id, client.roomId);
    
    // Add client to active list
    setActiveClients(prev => [...prev, client]);
    
    // Remove from pending list
    setPendingClients(prev => prev.filter(c => c.id !== client.id));
    
    // Select the client
    handleClientSelect(client);
  };
  
  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  
  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    
    const date = new Date(timestamp);
    return date.toLocaleDateString();
  };
  
  const groupMessagesByDate = (clientKey) => {
    if (!clientKey || !messages[clientKey]) return [];
    
    const clientMessages = messages[clientKey];
    const groupedMessages = [];
    let currentDate = '';
    let currentGroup = null;
    
    clientMessages.forEach(message => {
      const messageDate = formatDate(message.timestamp);
      
      if (messageDate !== currentDate) {
        currentDate = messageDate;
        currentGroup = { date: messageDate, messages: [] };
        groupedMessages.push(currentGroup);
      }
      
      currentGroup.messages.push(message);
    });
    
    return groupedMessages;
  };
  
  const filteredActiveClients = activeClients.filter(client => 
    client.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  const filteredPendingClients = pendingClients.filter(client => 
    client.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  const getClientKey = (client) => {
    return client?.id || client?.roomId;
  };
  
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
            className="search-input"
            placeholder="Search clients..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="client-lists">
          {filteredPendingClients.length > 0 && (
            <div className="client-section">
              <div className="section-header">
                <FiClock />
                <span>Waiting ({filteredPendingClients.length})</span>
              </div>
              
              {filteredPendingClients.map(client => (
                <div 
                  key={client.id || client.roomId} 
                  className="client-item pending"
                  onClick={() => handleAcceptClient(client)}
                >
                  <div className="client-avatar">
                    {client.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="client-info">
                    <div className="client-name">{client.name}</div>
                    <div className="client-status">Waiting for assistance</div>
                  </div>
                  <div className="accept-badge">
                    <FiAlertCircle />
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {filteredActiveClients.length > 0 && (
            <div className="client-section">
              <div className="section-header">
                <FiUsers />
                <span>Active Clients ({filteredActiveClients.length})</span>
              </div>
              
              {filteredActiveClients.map(client => {
                const clientKey = getClientKey(client);
                const hasUnread = unreadMessages[clientKey] > 0;
                
                return (
                  <div 
                    key={clientKey} 
                    className={`client-item ${selectedClient && getClientKey(selectedClient) === clientKey ? 'selected' : ''}`}
                    onClick={() => handleClientSelect(client)}
                  >
                    <div className="client-avatar">
                      {client.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="client-info">
                      <div className="client-name">{client.name}</div>
                      <div className="client-status">
                        {clientTyping[clientKey] ? 'Typing...' : 'Online'}
                      </div>
                    </div>
                    {hasUnread && (
                      <div className="unread-badge">
                        {unreadMessages[clientKey]}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          
          {filteredActiveClients.length === 0 && filteredPendingClients.length === 0 && (
            <div className="no-clients-message">
              <FiUser />
              <p>No clients available</p>
            </div>
          )}
        </div>
      </div>
      
      <div className="chat-area">
        {selectedClient ? (
          <>
            <div className="chat-header">
              <div className="client-info">
                <div className="client-avatar">
                  {selectedClient.name.charAt(0).toUpperCase()}
                </div>
                <div className="client-details">
                  <h3>{selectedClient.name}</h3>
                  <span className="client-number">{selectedClient.number}</span>
                  <span className="status online">
                    {clientTyping[getClientKey(selectedClient)] ? 'Typing...' : 'Online'}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="messages-container" ref={chatContainerRef}>
              {groupMessagesByDate(getClientKey(selectedClient)).map((group, groupIndex) => (
                <div key={groupIndex} className="message-group">
                  <div className="date-divider">
                    <span>{group.date}</span>
                  </div>
                  
                  {group.messages.map((message, messageIndex) => {
                    const isOperator = message.sentByOperator;
                    const isSystem = message.type === 'system';
                    
                    return (
                      <div 
                        key={message.messageId || messageIndex} 
                        className={`message-wrapper ${isSystem ? 'system' : isOperator ? 'operator' : 'client'}`}
                      >
                        {isSystem ? (
                          <div className="system-message">
                            {message.text}
                          </div>
                        ) : (
                          <div className={`message ${isOperator ? 'operator-message' : 'client-message'}`}>
                            {!isOperator && (
                              <div className="avatar client-avatar">
                                {selectedClient.name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            
                            <div className="message-bubble">
                              {!isOperator && (
                                <div className="message-sender">
                                  {selectedClient.name}
                                </div>
                              )}
                              
                              <div className="message-text">
                                {message.text}
                              </div>
                              
                              <div className="message-timestamp">
                                {formatTime(message.timestamp)}
                              </div>
                            </div>
                            
                            {isOperator && (
                              <div className="avatar operator-avatar">
                                {operatorName.charAt(0).toUpperCase()}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
              
              {clientTyping[getClientKey(selectedClient)] && (
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

export default OperatorDashboard; 