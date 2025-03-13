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
  
  useEffect(() => {
    if (selectedClient?.id && selectedClient?.roomId) {
      socket.emit('get-chat-history', {
        clientId: selectedClient.id,
        roomId: selectedClient.roomId
      });
    }
  }, [selectedClient?.id, selectedClient?.roomId]);
  
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
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <div className="w-80 bg-white border-r flex flex-col">
        {/* Operator Info */}
        <div className="p-4 border-b">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-full bg-gradient-to-r from-secondary-500 to-secondary-600 flex items-center justify-center text-white font-medium">
              {operatorName?.[0]?.toUpperCase()}
            </div>
            <div>
              <h3 className="font-semibold text-gray-800">{operatorName}</h3>
              <p className="text-sm text-gray-500">Online</p>
            </div>
          </div>
        </div>

        {/* Client List */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-2">
            {filteredPendingClients.map((client) => (
              <div
                key={client.id}
                onClick={() => handleAcceptClient(client)}
                className={`p-3 rounded-lg cursor-pointer transition-all ${
                  selectedClient?.id === client.id
                    ? 'bg-primary-50 border-l-4 border-primary-500'
                    : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-medium">
                    {client.name[0].toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-800">{client.name}</h4>
                    <p className="text-sm text-gray-500">Waiting for assistance</p>
                  </div>
                  <div className="accept-badge">
                    <FiAlertCircle />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {selectedClient ? (
          <>
            {/* Chat Header */}
            <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-medium">
                  {selectedClient.name[0].toUpperCase()}
                </div>
                <div>
                  <h2 className="font-semibold text-gray-800">{selectedClient.name}</h2>
                  <p className="text-sm text-gray-500">{selectedClient.number}</p>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
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
                        className={`flex ${isSystem ? 'justify-end' : isOperator ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                            isSystem ? 'bg-gradient-to-r from-secondary-500 to-secondary-600 text-white' : isOperator ? 'bg-gradient-to-r from-secondary-500 to-secondary-600 text-white' : 'bg-white border border-gray-200 text-gray-800'
                          }`}
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
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Input */}
            <div className="bg-white border-t p-4">
              <form onSubmit={handleSendMessage} className="flex space-x-4">
                <input
                  type="text"
                  value={inputMessage}
                  onChange={handleInputChange}
                  className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-secondary-400 focus:border-transparent transition-all outline-none"
                  placeholder="Type your message..."
                />
                <button
                  type="submit"
                  className="px-6 py-2 bg-gradient-to-r from-secondary-500 to-secondary-600 hover:from-secondary-600 hover:to-secondary-700 text-white font-medium rounded-lg transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] shadow-sm"
                >
                  Send
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900">No chat selected</h3>
              <p className="mt-1 text-sm text-gray-500">Select a conversation to start messaging</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default OperatorDashboard; 