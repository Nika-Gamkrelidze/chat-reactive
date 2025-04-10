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
  const [operatorStatus, setOperatorStatus] = useState('active');
  
  // Refs to prevent multiple effect runs
  const socketInitializedRef = useRef(false);
  const messageHandlerRef = useRef(null);
  const clientListHandlerRef = useRef(null);
  const clientQueueHandlerRef = useRef(null);
  const sessionHandlerRef = useRef(null);
  const messagesContainerRef = useRef(null);

  // Function to scroll to bottom of messages
  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  };

  // Effect to scroll when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
          
          // Scroll to bottom after state update
          setTimeout(scrollToBottom, 0);
          
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
        // Update operator status if provided
        if (sessionData.operator.status) {
          setOperatorStatus(sessionData.operator.status);
        }
      }
      
      let clientsToSet = [];
      let messagesToSet = messages; // Start with existing messages

      // Handle active rooms first as they contain specific status and messages
      if (sessionData.activeRooms && Array.isArray(sessionData.activeRooms)) {
        clientsToSet = sessionData.activeRooms
          .filter(room => room.client) // Ensure room has a client object
          .map(room => ({
            ...room.client, // Spread client details
            status: room.status || 'active', // Use room status, default to active
            roomId: room.roomId, // Ensure roomId is included
            // Add roomStatus for consistency with other parts of the code using this field
            roomStatus: room.status || 'active' 
          }));

        // Initialize or update messages from active rooms
        const messagesMap = { ...messagesToSet }; // Start with existing messages
        sessionData.activeRooms.forEach(room => {
          if (room.client && room.messages && room.client.id) {
            // Ensure messages are mapped correctly with sentByOperator flag
            messagesMap[room.client.id] = room.messages.map(msg => ({
              ...msg,
              sentByOperator: msg.senderId === sessionData.operator?.id, // Use optional chaining for safety
              clientId: room.client.id // Ensure clientId is present
            })).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
          }
        });
        messagesToSet = messagesMap; // Update the messages to be set
      } 
      // Fallback: If activeRooms are not present or empty, try using activeClients
      else if (sessionData.activeClients && Array.isArray(sessionData.activeClients)) {
        console.log("Using sessionData.activeClients as fallback.");
        // Map activeClients, ensuring a default status if missing
        clientsToSet = sessionData.activeClients.map(client => ({
           ...client,
           // Ensure roomStatus exists, default to 'active' if not provided
           roomStatus: client.roomStatus || client.status || 'active' 
        }));
      }
      
      // Update the state only if we have clients to set
      if (clientsToSet.length > 0) {
        setActiveClients(clientsToSet);
      }

      // Update messages state
      setMessages(messagesToSet);
      
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
  }, [navigate]);
  
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

    // Scroll to bottom when selecting a client
    setTimeout(scrollToBottom, 0);
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
  
  // Add handler for status toggle
  const handleStatusToggle = () => {
    // Cycle through states: active -> paused -> inactive -> active
    const statusMap = {
      'active': 'paused',
      'paused': 'inactive',
      'inactive': 'active'
    };
    
    const newStatus = statusMap[operatorStatus] || 'active';
    const socket = getOperatorSocket();
    
    if (socket && socket.connected) {
      socket.emit('change_status', { 
        id: operatorStorage.operatorId,
        status: newStatus
      });
      setOperatorStatus(newStatus);
    }
  };
  
  // Handle ending a chat
  const handleEndChat = () => {
    if (!selectedClient || !isConnected) return;
    
    // Get room ID from the selected client or from the messages
    let roomId = selectedClient.roomId;
    
    // If roomId is not directly available in the client object, try to find it in messages
    if (!roomId && messages[selectedClient.id] && messages[selectedClient.id].length > 0) {
      roomId = messages[selectedClient.id][0].roomId;
    }
    
    // If still no roomId, try to get it from operatorStorage
    if (!roomId && operatorStorage.clients && operatorStorage.clients[selectedClient.id]) {
      roomId = operatorStorage.clients[selectedClient.id].roomId;
    }
    
    if (!roomId) {
      console.error('Cannot end chat: room ID not available for client', selectedClient.id);
      alert('Cannot end chat: connection issue. Please try again later.');
      return;
    }
    
    const socket = getOperatorSocket();
    if (socket && socket.connected) {
      // Send end_chat event
      socket.emit('end_chat', {
        roomId,
        userId: operatorStorage.operatorId,
        userType: 'operator'
      });
      
      // Update client roomStatus in active clients list
      setActiveClients(prev => prev.map(client => 
        client.id === selectedClient.id 
          ? { ...client, roomStatus: 'closed' }
          : client
      ));
      
      // Update client roomStatus in operator storage
      if (operatorStorage.clients && operatorStorage.clients[selectedClient.id]) {
        operatorStorage.clients[selectedClient.id].roomStatus = 'closed';
      }
      
      // Update selected client roomStatus
      setSelectedClient(prev => prev ? { ...prev, roomStatus: 'closed' } : null);
      
      operatorStorage.saveToStorage();
    }
  };
  
  // Render dashboard
  return (
    <div className="h-screen bg-gray-100 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-white shadow-sm p-4 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">ოპერატორის პანელი</h1>
          <div className="text-sm text-gray-500">
            {isConnected ? (
              <span className={`flex items-center ${
                operatorStatus === 'active' ? 'text-green-500' :
                operatorStatus === 'paused' ? 'text-yellow-500' :
                operatorStatus === 'inactive' ? 'text-red-500' :
                'text-gray-500'
              }`}>
                <span className={`w-2 h-2 rounded-full mr-2 ${
                  operatorStatus === 'active' ? 'bg-green-500' :
                  operatorStatus === 'paused' ? 'bg-yellow-500' :
                  operatorStatus === 'inactive' ? 'bg-red-500' :
                  'bg-gray-500'
                }`}></span>
                {operatorStatus === 'active' ? 'აქტიური' :
                 operatorStatus === 'paused' ? 'პაუზაზე' :
                 operatorStatus === 'inactive' ? 'არააქტიური' :
                 'უცნობი სტატუსი'}
              </span>
            ) : (
              <span className="text-red-500 flex items-center">
                <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span>
                კავშირი გაწყვეტილია
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleStatusToggle}
            className={`px-4 py-2 rounded text-white ${
              operatorStatus === 'active' ? 'bg-yellow-500 hover:bg-yellow-600' :
              operatorStatus === 'paused' ? 'bg-red-500 hover:bg-red-600' :
              'bg-green-500 hover:bg-green-600'
            }`}
          >
            {operatorStatus === 'active' ? 'პაუზაზე გადასვლა' :
             operatorStatus === 'paused' ? 'გათიშვა' :
             'გააქტიურება'}
          </button>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
          >
            გასვლა
          </button>
        </div>
      </header>
      
      {/* Loading state */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-600">სერვერთან დაკავშირება...</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          <div className="w-64 bg-white border-r flex-shrink-0">
            <div className="h-full overflow-y-auto p-4">
              <h2 className="text-lg font-medium text-gray-700 mb-2">მომხმარებლები</h2>
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
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{client.name}</div>
                          <div className="text-sm text-gray-500">{client.number}</div>
                        </div>
                        <div className="flex items-center">
                          <span className="text-xs text-gray-500 mr-2">
                            {client.roomStatus === 'active' ? 'აქტიური' : 'დასრულებული'}
                          </span>
                          <span className={`w-2 h-2 rounded-full ${
                            client.roomStatus === 'active' 
                              ? 'bg-green-500' 
                              : client.roomStatus === 'closed'
                                ? 'bg-red-500'
                                : 'bg-yellow-500'
                          }`}></span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-500 text-sm">აქტიური მომხმარებლები ვერ მოიძებნა</p>
              )}
            </div>
          </div>
          
          {/* Chat area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {selectedClient ? (
              <>
                {/* Chat header */}
                <div className="bg-white border-b p-4 flex-shrink-0 flex justify-between items-center">
                  <div>
                    <h2 className="font-medium">{selectedClient.name}</h2>
                    <p className="text-sm text-gray-500">{selectedClient.number}</p>
                  </div>
                  <button
                    onClick={handleEndChat}
                    className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                    disabled={!isConnected}
                  >
                    ჩათის დასრულება
                  </button>
                </div>
                
                {/* Messages */}
                <div 
                  ref={messagesContainerRef}
                  className="flex-1 overflow-y-auto p-4 bg-gray-50"
                >
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
                      შეტყობინებები არ არის
                    </div>
                  )}
                </div>

                {/* Message input */}
                <div className="bg-white border-t p-4 flex-shrink-0">
                  <form onSubmit={handleSendMessage} className="flex space-x-4">
                    <input 
                      type="text"
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      placeholder={selectedClient.roomStatus === 'closed' ? "ჩათი დასრულებულია" : "შეიყვანეთ შეტყობინება..."}
                      className="flex-1 p-2 border rounded-l-lg"
                      disabled={!isConnected || selectedClient.roomStatus === 'closed'}
                    />
                    <button 
                      type="submit" 
                      className={`px-6 py-2 rounded-r-lg ${
                        isConnected && selectedClient.roomStatus !== 'closed'
                          ? 'bg-blue-500 text-white hover:bg-blue-600' 
                          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      }`}
                      disabled={!isConnected || selectedClient.roomStatus === 'closed'}
                    >
                      გაგზავნა
                    </button>
                  </form>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-500">
                აირჩიეთ მომხმარებელი ჩათის დასაწყებად
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default OperatorDashboard;