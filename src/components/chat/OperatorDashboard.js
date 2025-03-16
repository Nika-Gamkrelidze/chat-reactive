import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { 
  initOperatorSocket,
  reconnectOperatorSocket,
  sendMessageToClient, 
  requestClientQueue,
  requestActiveClients,
  setMessageHandler,
  setClientListHandler,
  setClientQueueHandler,
  setSessionHandler,
  disconnectOperatorSocket,
  operatorStorage,
  getOperatorSocket,
  acceptClient
} from '../../services/socket/operatorSocket';

function OperatorDashboard() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  
  // State for managing dashboard data
  const [activeClients, setActiveClients] = useState([]);
  const [pendingClients, setPendingClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [messages, setMessages] = useState({});
  const [inputMessage, setInputMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  
  // Refs to prevent multiple effect runs
  const socketInitializedRef = useRef(false);
  const messageHandlerRef = useRef(null);
  const clientListHandlerRef = useRef(null);
  const clientQueueHandlerRef = useRef(null);
  const sessionHandlerRef = useRef(null);

  // Initialize socket and set up event handlers
  useEffect(() => {
    // Get stored credentials
    const operatorName = sessionStorage.getItem('operatorName');
    const operatorNumber = sessionStorage.getItem('operatorNumber');
    const operatorId = sessionStorage.getItem('operatorId');
    const storedUser = sessionStorage.getItem('user');

    // Check if we have the necessary credentials
    if (!operatorName || !operatorNumber) {
      console.log('No stored operator credentials found, redirecting to login');
      navigate('/operator/login');
      return;
    }

    // Check if user is authenticated as operator
    if (!storedUser) {
      console.log('No stored user found, redirecting to login');
      navigate('/operator/login');
      return;
    }

    try {
      const parsedUser = JSON.parse(storedUser);
      if (!parsedUser || parsedUser.role !== 'operator') {
        console.log('User is not authenticated as operator, redirecting to login');
        navigate('/operator/login');
        return;
      }
    } catch (error) {
      console.error('Error parsing stored user:', error);
      navigate('/operator/login');
      return;
    }

    // Define message handler
    messageHandlerRef.current = (message) => {
      console.log('Message received in dashboard:', message);
      
      // Handle typing indicator
      if (message.type === 'typing') {
        // Handle typing indicator if needed
        return;
      }
      
      setMessages(prevMessages => {
        const clientId = message.clientId;
        
        // Skip if we don't have a clientId
        if (!clientId) return prevMessages;
        
        // Initialize or get existing messages for this client
        const clientMessages = prevMessages[clientId] || [];
        
        // Check if message already exists
        const messageExists = clientMessages.some(msg => msg.messageId === message.messageId);
        
        if (!messageExists) {
          // Add new message
          const updatedClientMessages = [...clientMessages, {
            ...message,
            sentByOperator: message.senderId === operatorStorage.operatorId
          }].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
          
          return {
            ...prevMessages,
            [clientId]: updatedClientMessages
          };
        }
        
        return prevMessages;
      });
    };
    
    // Define client list handler
    clientListHandlerRef.current = (clients) => {
      console.log('Active clients updated:', clients);
      setActiveClients(clients);
      
      // If we have a selected client that's no longer active, deselect it
      if (selectedClient && !clients.some(c => c.id === selectedClient.id)) {
        setSelectedClient(null);
      }
    };
    
    // Define client queue handler
    clientQueueHandlerRef.current = (queue) => {
      console.log('Client queue updated:', queue);
      setPendingClients(queue);
    };
    
    // Define session handler
    sessionHandlerRef.current = (sessionData) => {
      console.log('Session update received in OperatorDashboard:', sessionData);
      setIsLoading(false);
      setIsConnected(true);
      
      // Handle operator data
      if (sessionData.operator) {
        // Update operator info if needed
      }
      
      // Handle active rooms from reconnection
      if (sessionData.activeRooms && Array.isArray(sessionData.activeRooms)) {
        const clients = sessionData.activeRooms
          .filter(room => room.client)
          .map(room => room.client);
          
        if (clients.length > 0) {
          setActiveClients(clients);
        }
        
        // Initialize messages from active rooms
        const messagesMap = {};
        sessionData.activeRooms.forEach(room => {
          if (room.client && room.messages) {
            messagesMap[room.client.id] = room.messages.map(msg => ({
              ...msg,
              sentByOperator: msg.senderId === sessionData.operator.id
            }));
          }
        });
        
        if (Object.keys(messagesMap).length > 0) {
          setMessages(messagesMap);
        }
      }
      
      // If we have active clients in the session data, update the state
      if (sessionData.activeClients && Array.isArray(sessionData.activeClients)) {
        setActiveClients(sessionData.activeClients);
      }
      
      // If we have pending clients in the session data, update the state
      if (sessionData.pendingClients && Array.isArray(sessionData.pendingClients)) {
        setPendingClients(sessionData.pendingClients);
      }
    };
    
    // Set up handlers
    setMessageHandler(messageHandlerRef.current);
    setClientListHandler(clientListHandlerRef.current);
    setClientQueueHandler(clientQueueHandlerRef.current);
    setSessionHandler(sessionHandlerRef.current);
    
    // Attempt to reconnect with stored credentials
    console.log('Attempting to reconnect operator with stored credentials:', { operatorName, operatorNumber, operatorId });
    
    // Use reconnectOperatorSocket instead of initOperatorSocket for existing sessions
    reconnectOperatorSocket();
    
    // Request initial data
    setTimeout(() => {
      requestActiveClients();
      requestClientQueue();
    }, 1000);
    
    // Cleanup function
    return () => {
      // Clear handlers to prevent errors on unmount
      setMessageHandler(null);
      setClientListHandler(null);
      setClientQueueHandler(null);
      setSessionHandler(null);
    };
  }, [navigate, selectedClient]);
  
  // Handle client selection
  const handleClientSelect = (client) => {
    console.log('Selected client:', client);
    setSelectedClient(client);
    
    // Mark client as read when selected
    setActiveClients(prevClients => 
      prevClients.map(c => 
        c.id === client.id ? { ...c, hasUnread: false } : c
      )
    );
    
    // Request latest messages for this client if needed
    if (!messages[client.id] || messages[client.id].length === 0) {
      console.log('Requesting messages for client:', client.id);
      // You might want to add a function to request messages for a specific client
    }
  };
  
  // Handle accepting a client from the queue
  const handleAcceptClient = (clientId) => {
    acceptClient(clientId);
  };
  
  // Handle sending a message
  const handleSendMessage = (e) => {
    e.preventDefault();
    
    if (!inputMessage.trim() || !selectedClient || !isConnected) {
      return;
    }
    
    // Get room ID from the selected client or from the messages
    let roomId = selectedClient.roomId;
    
    // If roomId is not directly available in the client object, try to find it in messages
    if (!roomId && messages[selectedClient.id] && messages[selectedClient.id].length > 0) {
      // Get roomId from the first message for this client
      roomId = messages[selectedClient.id][0].roomId;
      console.log('Found room ID in messages:', roomId);
    }
    
    // If still no roomId, try to get it from operatorStorage
    if (!roomId && operatorStorage.clients && operatorStorage.clients[selectedClient.id]) {
      roomId = operatorStorage.clients[selectedClient.id].roomId;
      console.log('Found room ID in operator storage:', roomId);
    }
    
    if (!roomId) {
      console.error('Cannot send message: room ID not available for client', selectedClient.id);
      // Show error to user
      alert('Cannot send message: connection issue. Please try again later.');
      return;
    }
    
    console.log('Sending message to client', selectedClient.id, 'in room', roomId);
    
    // Just send the message - no temporary message creation
    sendMessageToClient(selectedClient.id, inputMessage.trim(), roomId);
    
    // Clear input
    setInputMessage('');
  };
  
  // Handle logout
  const handleLogout = () => {
    disconnectOperatorSocket();
    logout();
    navigate('/operator/login');
  };
  
  // Render dashboard
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm p-4 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">Operator Dashboard</h1>
          <div className="text-sm text-gray-500">
            {isConnected ? (
              <span className="text-green-500 flex items-center">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                Connected
              </span>
            ) : (
              <span className="text-red-500 flex items-center">
                <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span>
                Disconnected
              </span>
            )}
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
        >
          Logout
        </button>
      </header>
      
      {/* Loading state */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-600">Connecting to server...</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex">
          {/* Sidebar */}
          <div className="w-64 bg-white border-r flex flex-col">
            {/* Active clients */}
            <div className="p-4 flex-1 overflow-y-auto border-b">
              <h2 className="text-lg font-medium text-gray-700 mb-2">Active Clients</h2>
              {activeClients.length > 0 ? (
                <ul className="space-y-2">
                  {activeClients.map(client => (
                    <li 
                      key={client.id}
                      onClick={() => handleClientSelect(client)}
                      className={`p-2 border rounded cursor-pointer ${
                        selectedClient && selectedClient.id === client.id
                          ? 'bg-blue-50 border-blue-200'
                          : 'bg-white hover:bg-gray-50'
                      }`}
                    >
                      <div className="font-medium">{client.name}</div>
                      <div className="text-sm text-gray-500">{client.number}</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-500 text-sm">No active clients</p>
              )}
            </div>
            
            {/* Pending clients */}
            <div className="p-4 flex-1 overflow-y-auto">
              <h2 className="text-lg font-medium text-gray-700 mb-2">Pending Clients</h2>
              {pendingClients.length > 0 ? (
                <ul className="space-y-2">
                  {pendingClients.map(client => (
                    <li key={client.id} className="p-2 border rounded bg-gray-50">
                      <div className="font-medium">{client.name}</div>
                      <div className="text-sm text-gray-500 mb-2">{client.number}</div>
                      <button
                        onClick={() => handleAcceptClient(client.id)}
                        className="w-full px-3 py-1 bg-green-500 text-white text-sm rounded hover:bg-green-600"
                        disabled={!isConnected}
                      >
                        Accept
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-500 text-sm">No pending clients</p>
              )}
            </div>
          </div>
          
          {/* Chat area */}
          <div className="flex-1 flex flex-col">
            {selectedClient ? (
              <>
                {/* Chat header */}
                <div className="p-4 bg-white border-b flex items-center">
                  <div>
                    <h2 className="font-medium">{selectedClient.name}</h2>
                    <p className="text-sm text-gray-500">{selectedClient.number}</p>
                  </div>
                </div>
                
                {/* Messages */}
                <div className="flex-1 p-4 overflow-y-auto bg-gray-50">
                  {messages[selectedClient.id] && messages[selectedClient.id].length > 0 ? (
                    messages[selectedClient.id].map((message, index) => (
                      <div 
                        key={message.messageId || index}
                        className={`flex mb-4 ${
                          message.sentByOperator ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        <span className={`px-4 py-2 rounded-lg max-w-xs ${
                          message.sentByOperator 
                            ? 'bg-blue-500 text-white' 
                            : 'bg-gray-200 text-gray-800'
                        }`}>
                          {message.text}
                          <div className="text-xs mt-1 opacity-75">
                            {new Date(message.timestamp).toLocaleTimeString()}
                          </div>
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="text-center text-gray-500 mt-4">
                      No messages yet
                    </div>
                  )}
                </div>

                {/* Message Input */}
                <form 
                  onSubmit={handleSendMessage} 
                  className="p-4 bg-white border-t flex"
                >
                  <input 
                    type="text"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 p-2 border rounded-l-lg"
                    disabled={!isConnected}
                  />
                  <button 
                    type="submit" 
                    className={`p-2 rounded-r-lg ${
                      isConnected 
                        ? 'bg-blue-500 text-white hover:bg-blue-600' 
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                    disabled={!isConnected}
                  >
                    Send
                  </button>
                </form>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-500">
                Select a client to start chatting
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default OperatorDashboard;