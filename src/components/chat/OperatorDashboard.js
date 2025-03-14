import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { 
  reconnectOperatorSocket,
  initOperatorSocket,
  sendMessageToClient, 
  requestClientQueue,
  requestActiveClients,
  setMessageHandler,
  setClientListHandler,
  setClientQueueHandler,
  setSessionHandler,
  operatorStorage,
  disconnectOperatorSocket,
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
  
  // Refs to prevent multiple effect runs
  const isInitializedRef = useRef(false);

  // Initialize socket and set up event handlers
  useEffect(() => {
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;
    
    const operatorName = sessionStorage.getItem('operatorName');
    const operatorNumber = sessionStorage.getItem('operatorNumber');
    const operatorId = sessionStorage.getItem('operatorId');

    if (!operatorName || !operatorNumber) {
      navigate('/operator/login');
      return;
    }

    const setupSocket = async () => {
      // Set up message handler
      setMessageHandler((message) => {
        console.log('Message received in dashboard:', message);
        
        // Handle typing indicator
        if (message.type === 'typing') {
          // Handle typing indicator if needed
          return;
        }
        
        // Update messages state
        setMessages(prevMessages => {
          const clientId = message.clientId;
          const clientMessages = [...(prevMessages[clientId] || [])];
          
          // Check if message already exists
          const exists = clientMessages.some(m => m.messageId === message.messageId);
          if (exists) return prevMessages;
          
          // Add new message
          clientMessages.push(message);
          
          // Return updated messages
          return {
            ...prevMessages,
            [clientId]: clientMessages
          };
        });
      });
      
      // Set up session handler
      setSessionHandler((sessionData) => {
        console.log('Session update received in OperatorDashboard:', sessionData);
      });
      
      // Set up client list handler
      setClientListHandler((clients) => {
        console.log('Active clients updated:', clients);
        setActiveClients(clients);
        operatorStorage.activeClients = clients;
        operatorStorage.saveToStorage();
      });
      
      // Set up client queue handler
      setClientQueueHandler((queue) => {
        console.log('Client queue updated:', queue);
        setPendingClients(queue);
        operatorStorage.pendingClients = queue;
        operatorStorage.saveToStorage();
      });
      
      // Try to reconnect with stored credentials
      let socket;
      
      if (operatorId) {
        // Try to reconnect with existing ID
        socket = reconnectOperatorSocket();
        
        // Set up connection error handler
        if (socket) {
          socket.on('connect_error', (error) => {
            console.error('Reconnection error:', error);
            
            // If reconnection fails, try to initialize a new connection
            socket = initOperatorSocket(operatorName, operatorNumber);
          });
        }
      }
      
      // If no stored ID or reconnection failed, initialize a new connection
      if (!socket) {
        socket = initOperatorSocket(operatorName, operatorNumber);
      }
      
      if (socket) {
        // Request initial data
        requestActiveClients();
        requestClientQueue();
        
        // Load data from storage
        const storedMessages = operatorStorage.messages || {};
        if (Object.keys(storedMessages).length > 0) {
          setMessages(storedMessages);
        }
        
        const storedActiveClients = operatorStorage.activeClients || [];
        if (storedActiveClients.length > 0) {
          setActiveClients(storedActiveClients);
        }
        
        const storedPendingClients = operatorStorage.pendingClients || [];
        if (storedPendingClients.length > 0) {
          setPendingClients(storedPendingClients);
        }
      } else {
        // If connection failed, redirect to login
        navigate('/operator/login');
      }
    };
    
    setupSocket();
    
    // Clean up on unmount
    return () => {
      disconnectOperatorSocket();
    };
  }, [navigate]);
  
  // Handle sending a message to a client
  const handleSendMessage = (e) => {
    e.preventDefault();
    
    if (!selectedClient || !inputMessage.trim()) return;
    
    // Send message to client
    const success = sendMessageToClient(selectedClient.id, inputMessage);
    
    if (success) {
      // Add message to local state
      const newMessage = {
        messageId: `operator_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        text: inputMessage,
        clientId: selectedClient.id,
        sentByOperator: true,
        timestamp: new Date().toISOString()
      };
      
      setMessages(prevMessages => {
        const clientMessages = [...(prevMessages[selectedClient.id] || []), newMessage];
        return {
          ...prevMessages,
          [selectedClient.id]: clientMessages
        };
      });
      
      setInputMessage('');
    }
  };
  
  // Handle accepting a client from the queue
  const handleAcceptClient = (client) => {
    acceptClient(client.id);
  };
  
  // Handle selecting a client to chat with
  const handleSelectClient = (client) => {
    setSelectedClient(client);
  };
  
  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r overflow-y-auto">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Operator Dashboard</h2>
          <p className="text-sm text-gray-500">{user?.name || 'Operator'}</p>
        </div>
        
        {/* Active Clients */}
        <div className="p-4 border-b">
          <h3 className="font-medium mb-2">Active Clients</h3>
          <div className="space-y-2">
            {activeClients.length > 0 ? (
              activeClients.map(client => (
                <div 
                  key={client.id}
                  className={`p-2 rounded cursor-pointer ${
                    selectedClient?.id === client.id ? 'bg-blue-100' : 'hover:bg-gray-100'
                  }`}
                  onClick={() => handleSelectClient(client)}
                >
                  <div className="font-medium">{client.name}</div>
                  <div className="text-xs text-gray-500">{client.number}</div>
                </div>
              ))
            ) : (
              <div className="text-sm text-gray-500">No active clients</div>
            )}
          </div>
        </div>
        
        {/* Pending Clients */}
        <div className="p-4">
          <h3 className="font-medium mb-2">Pending Clients</h3>
          <div className="space-y-2">
            {pendingClients.length > 0 ? (
              pendingClients.map(client => (
                <div 
                  key={client.id}
                  className="p-2 rounded bg-yellow-50 flex justify-between items-center"
                >
                  <div>
                    <div className="font-medium">{client.name}</div>
                    <div className="text-xs text-gray-500">{client.number}</div>
                  </div>
                  <button
                    className="px-2 py-1 bg-blue-500 text-white text-xs rounded"
                    onClick={() => handleAcceptClient(client)}
                  >
                    Accept
                  </button>
                </div>
              ))
            ) : (
              <div className="text-sm text-gray-500">No pending clients</div>
            )}
          </div>
        </div>
      </div>
      
      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {selectedClient ? (
          <>
            {/* Chat Header */}
            <div className="p-4 bg-white border-b flex justify-between items-center">
              <div>
                <h3 className="font-medium">{selectedClient.name}</h3>
                <p className="text-sm text-gray-500">{selectedClient.number}</p>
              </div>
            </div>
            
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
              {(messages[selectedClient.id] || []).length > 0 ? (
                (messages[selectedClient.id] || []).map((message, index) => (
                  <div 
                    key={index} 
                    className={`mb-2 ${message.sentByOperator ? 'text-right' : 'text-left'}`}
                  >
                    <span className={`inline-block p-2 rounded ${
                      message.sentByOperator 
                        ? 'bg-blue-500 text-white' 
                        : 'bg-gray-200'
                    }`}>
                      {message.text}
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
              />
              <button 
                type="submit" 
                className="bg-blue-500 text-white p-2 rounded-r-lg"
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
  );
}

export default OperatorDashboard;