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
  acceptClient,
  setClientChatClosedHandler,
  sendOperatorTypingEvent,
  setTypingHandler
} from '../../services/socket/operatorSocket';
import ClientInfoSidebar from './ClientInfoSidebar';

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
  
  // State to track client typing status { clientId: timeoutId | null }
  const [clientTypingStatus, setClientTypingStatus] = useState({});
  
  // Refs to prevent multiple effect runs
  const socketInitializedRef = useRef(false);
  const messageHandlerRef = useRef(null);
  const clientListHandlerRef = useRef(null);
  const clientQueueHandlerRef = useRef(null);
  const sessionHandlerRef = useRef(null);
  const clientChatClosedHandlerRef = useRef(null);
  const typingHandlerRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const selectedClientRef = useRef(null);

  useEffect(() => {
    selectedClientRef.current = selectedClient;
  }, [selectedClient]);

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
      
      const clientId = message.clientId;
      // Skip if we don't have a clientId
      if (!clientId) return;

      const isFromOperator = message.senderId === operatorStorage.operatorId;

      setMessages(prevMessages => {
        // Initialize or get existing messages for this client
        const clientMessages = prevMessages[clientId] || [];
        
        // Check if message already exists
        const messageExists = clientMessages.some(msg => msg.messageId === message.messageId);
        
        if (!messageExists) {
          // Add new message
          const updatedClientMessages = [...clientMessages, {
            ...message,
            sentByOperator: isFromOperator
          }].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
          
          return {
            ...prevMessages,
            [clientId]: updatedClientMessages
          };
        }
        
        return prevMessages;
      });

      // --- Add logic to update unread count ---
      // Increment unread count only for messages from the client
      // and only if the client is not currently selected
      if (!isFromOperator) {
         setActiveClients(prevClients => 
           prevClients.map(client => {
             const selected = selectedClientRef.current;
             if (client.id === clientId && (!selected || selected.id !== clientId)) {
               // Increment unread count, initializing if it doesn't exist
               const newUnreadCount = (client.unreadCount || 0) + 1;
               return { ...client, unreadCount: newUnreadCount };
             }
             return client;
           })
         );
      }
      // --- End unread count logic ---
    };
    
    // Define client list handler
    clientListHandlerRef.current = (clientsFromServer) => {
      console.log('Active clients updated:', clientsFromServer);
      
      setActiveClients(prevClients => {
        // Create a map of existing clients for quick lookup of unread counts
        const existingClientMap = new Map(prevClients.map(c => [c.id, c.unreadCount || 0]));
        
        // Map the new list, preserving existing unread counts
        const updatedClients = clientsFromServer.map(newClient => ({
          ...newClient,
          unreadCount: existingClientMap.get(newClient.id) || 0 // Keep existing count or default to 0
        }));

        // If the currently selected client is no longer in the active list, deselect it
        const selected = selectedClientRef.current;
        if (selected && !updatedClients.some(c => c.id === selected.id)) {
          setSelectedClient(null);
        }
        
        return updatedClients;
      });
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
        if (sessionData.operator?.status) {
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
            roomId: room.roomId, // Ensure roomId is included
            roomStatus: room.status || 'active', // Add roomStatus for consistency
            unreadCount: 0 // Initialize unread count
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
           roomStatus: client.roomStatus || client.status || 'active', 
           unreadCount: client.unreadCount || 0 // Preserve existing or default to 0
        }));
      }
      
      // Update the state only if we have clients to set
      // Merge with existing clients to preserve unread counts if possible
      if (clientsToSet.length > 0) {
        setActiveClients(prevClients => {
            const existingClientMap = new Map(prevClients.map(c => [c.id, c.unreadCount || 0]));
            return clientsToSet.map(newClient => ({
                ...newClient,
                // Prioritize unread count from new data if available (e.g., from fallback), 
                // otherwise keep existing count or default to 0
                unreadCount: newClient.unreadCount || existingClientMap.get(newClient.id) || 0 
            }));
        });
      }

      // Log the final clientsToSet before updating state
      console.log('Clients derived from session data:', clientsToSet);

      // Update messages state
      setMessages(messagesToSet);
      
      // If we have pending clients in the session data, update the state
      if (sessionData.pendingClients && Array.isArray(sessionData.pendingClients)) {
        setPendingClients(sessionData.pendingClients);
      }
    };
    
    // Define handler for client ending chat
    clientChatClosedHandlerRef.current = (closedClientId) => {
      console.log('Handling client_ended_chat for client ID:', closedClientId);
      // If the closed client is currently selected, clear the chat view so old messages don't linger
      const selected = selectedClientRef.current;
      if (selected && selected.id === closedClientId) {
        setInputMessage('');
        setSelectedClient(null);

        // Remove messages for this client from UI state (optional but matches expected "clear")
        setMessages(prev => {
          const next = { ...prev };
          delete next[closedClientId];
          return next;
        });

        // Also remove from operatorStorage to prevent restoring old messages on refresh
        try {
          if (operatorStorage.messages && operatorStorage.messages[closedClientId]) {
            delete operatorStorage.messages[closedClientId];
            operatorStorage.saveToStorage();
          }
        } catch (e) {
          // non-fatal
        }
      }
    };
    
    // Define typing handler
    typingHandlerRef.current = (typingData) => {
      const { userId, isTyping } = typingData; // userId here is the clientId
      console.log(`Client typing update: ${userId} is typing: ${isTyping}`);

      setClientTypingStatus(prevStatus => {
        const existingTimeoutId = prevStatus[userId];

        // Clear existing timeout if there is one
        if (existingTimeoutId) {
          clearTimeout(existingTimeoutId);
        }

        if (isTyping) {
          // Set a new timeout to automatically clear the status
          const newTimeoutId = setTimeout(() => {
            setClientTypingStatus(prev => ({ ...prev, [userId]: null }));
          }, 2500); // Adjust timeout duration as needed (e.g., 2.5 seconds)

          // Return new state with the timeout ID
          return { ...prevStatus, [userId]: newTimeoutId };
        } else {
          // If isTyping is false, just clear the status
          return { ...prevStatus, [userId]: null };
        }
      });
    };
    
    // Set up handlers
    setMessageHandler(messageHandlerRef.current);
    setClientListHandler(clientListHandlerRef.current);
    setClientQueueHandler(clientQueueHandlerRef.current);
    setSessionHandler(sessionHandlerRef.current);
    setClientChatClosedHandler(clientChatClosedHandlerRef.current);
    setTypingHandler(typingHandlerRef.current);
    
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
      setClientChatClosedHandler(null);
      setTypingHandler(null);
    };
  }, [navigate]);
  
  // Handle client selection
  const handleClientSelect = (client) => {
    console.log('Selected client object:', client);
    setSelectedClient(client);
    
    // Mark client as read and RESET unread count when selected
    setActiveClients(prevClients => 
      prevClients.map(c => 
        c.id === client.id ? { ...c, unreadCount: 0 } : c // Reset count to 0
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
  
  const handleStatusToggle = () => {
    // Toggle between "available" and "paused"
    // Backend in this repo expects: socket.emit('operator_status_update', { id, status })
    // README backend expects:       socket.emit('operator-status-update', { status })
    const newStatus = operatorStatus === 'active' ? 'away' : 'active';

    const socket = getOperatorSocket();
    const operatorId = operatorStorage.operatorId || sessionStorage.getItem('operatorId');

    if (socket && socket.connected) {
      console.log(`Requesting status change to: ${newStatus}`);

      // New API (README)
      socket.emit('operator-status-update', { status: newStatus });

      // Existing backend in this repo (underscored event and explicit id)
      if (operatorId) {
        socket.emit('operator_status_update', { id: operatorId, status: newStatus });
      }

      setOperatorStatus(newStatus);
    } else {
      console.warn('Cannot change status: socket not connected.');
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
      const operatorId = operatorStorage.operatorId || sessionStorage.getItem('operatorId');
      socket.emit('end_chat', {
        roomId,
        userId: operatorId,
        userType: 'operator',
        reason: 'completed'
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
  
  // Handle input change for operator typing
  const handleInputChange = (e) => {
    setInputMessage(e.target.value);

    if (!selectedClient || !isConnected) return;

    // Find roomId
    let roomId = selectedClient.roomId;
    if (!roomId && operatorStorage.clients && operatorStorage.clients[selectedClient.id]) {
      roomId = operatorStorage.clients[selectedClient.id].roomId;
    }

    if (!roomId) {
      console.error('Cannot send typing event: room ID not available for client', selectedClient.id);
      return;
    }

    // Send typing=true immediately
    sendOperatorTypingEvent(roomId, true);

    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set timeout to send typing=false
    typingTimeoutRef.current = setTimeout(() => {
      sendOperatorTypingEvent(roomId, false);
    }, 2000); // Send stopped typing after 2 seconds of inactivity
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
              <span className="text-green-500 flex items-center">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                დაკავშირებული
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
              'bg-green-500 hover:bg-green-600' // Only active/paused states
            }`}
            disabled={!isConnected} // Disable if not connected
          >
            {operatorStatus === 'active' ? 'პაუზაზე გადასვლა' :
             'გააქტიურება' // Only two options needed
            }
          </button>
          <button
            onClick={handleEndChat}
            className={`px-4 py-2 rounded text-white ${
              !selectedClient || selectedClient.roomStatus === 'closed' || !isConnected
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-gray-500 hover:bg-gray-600'
            }`}
            disabled={!selectedClient || selectedClient.roomStatus === 'closed' || !isConnected}
          >
            ჩათის დასრულება
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
          {/* Sidebar - Client List */}
          <div className="w-64 bg-white border-r flex-shrink-0">
            <div className="h-full overflow-y-auto p-4">
              <h2 className="text-lg font-medium text-gray-700 mb-2">მომხმარებლები</h2>
              {/* Filter out clients with 'closed' roomStatus before mapping */}
              {activeClients.filter(client => client.roomStatus !== 'closed').length > 0 ? (
                <ul className="space-y-2">
                  {activeClients
                    .filter(client => client.roomStatus !== 'closed') // Only show non-closed chats
                    .map(client => (
                    <li 
                      key={client.id}
                      onClick={() => handleClientSelect(client)}
                      className={`p-2 border rounded cursor-pointer flex justify-between items-center ${ // Use flex for layout
                        selectedClient && selectedClient.id === client.id
                          ? 'bg-blue-50 border-blue-200'
                          : 'bg-white hover:bg-gray-50'
                      }`}
                    >
                      {/* Client Info */}
                      <div>
                        <div className="font-medium">{client.name}</div>
                        <div className="text-sm text-gray-500">{client.number}</div>
                      </div>
                      {/* Status and Unread Count */}
                      <div className="flex items-center space-x-2"> 
                        {/* Unread Count Badge - Show only if count > 0 AND not selected */}
                        {client.unreadCount > 0 && (!selectedClient || selectedClient.id !== client.id) && (
                          <span className="bg-blue-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                            {client.unreadCount}
                          </span>
                        )}
                        {/* Status Indicator */}
                        <div className="flex items-center">
                          <span className="text-xs text-gray-500 mr-1"> {/* Reduced margin */}
                            {client.roomStatus === 'active' ? 'აქტიური' : 'დასრულებული'}
                          </span>
                          <span className={`w-2 h-2 rounded-full ${
                            client.roomStatus === 'active' // Color based on roomStatus
                              ? 'bg-green-500' 
                              : client.roomStatus === 'closed'
                                ? 'bg-red-500'
                                : 'bg-yellow-500' // Keep yellow for potential other statuses, e.g., paused by operator?
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
                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
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
                          <span className="break-words">{message.text}</span>
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
                  {/* Client Typing Indicator */}
                  {selectedClient && clientTypingStatus[selectedClient.id] && (
                    <div className="flex justify-start mb-4">
                      <div className="bg-gray-200 text-gray-800 rounded-lg px-4 py-2 max-w-xs">
                        <div className="flex items-center space-x-1">
                          <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-100"></div>
                          <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-200"></div>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* End Client Typing Indicator */}
                </div>

                {/* Message input */}
                <div className="bg-white border-t p-4 flex-shrink-0">
                  <form onSubmit={handleSendMessage} className="flex space-x-4">
                    <input 
                      type="text"
                      value={inputMessage}
                      onChange={handleInputChange}
                      placeholder={selectedClient.roomStatus === 'closed' ? "ჩათი დასრულებულია" : "შეიყვანეთ შეტყობინება..."}
                      className="flex-1 p-2 border rounded-l-lg"
                      disabled={!isConnected}
                    />
                    <button 
                      type="submit" 
                      className={`px-6 py-2 rounded-r-lg ${
                        isConnected 
                          ? 'bg-blue-500 text-white hover:bg-blue-600' 
                          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      }`}
                      disabled={!isConnected}
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
          {/* Client Info Sidebar - Right Side */}
          {selectedClient && (
            <ClientInfoSidebar client={selectedClient} />
          )}
        </div>
      )}
    </div>
  );
}

export default OperatorDashboard;