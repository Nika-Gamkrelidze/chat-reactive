import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { 
  reconnectOperatorSocket,
  sendMessageToClient, 
  requestClientQueue,
  requestActiveClients,
  setMessageHandler,
  setClientListHandler,
  setClientQueueHandler,
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
    
    const operatorName = sessionStorage.getItem('operatorName');
    const operatorNumber = sessionStorage.getItem('operatorNumber');
    const operatorId = sessionStorage.getItem('operatorId');

    if (!operatorName || !operatorNumber) {
      navigate('/operator/login');
      return;
    }

    const setupSocket = async () => {
      try {
        // Try to reconnect with stored credentials
        const socket = reconnectOperatorSocket();
        
        if (!socket) {
          console.error('Failed to reconnect socket');
          navigate('/operator/login');
          return;
        }
        
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
            
            // Sort by timestamp
            clientMessages.sort((a, b) => 
              new Date(a.timestamp) - new Date(b.timestamp)
            );
            
            return {
              ...prevMessages,
              [clientId]: clientMessages
            };
          });
        });
        
        // Set up client list handler
        setClientListHandler((clients) => {
          console.log('Active clients updated:', clients);
          setActiveClients(clients);
        });
        
        // Set up client queue handler
        setClientQueueHandler((queue) => {
          console.log('Client queue updated:', queue);
          setPendingClients(queue);
        });
        
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
        
        isInitializedRef.current = true;
      } catch (error) {
        console.error('Error setting up socket:', error);
        navigate('/operator/login');
      }
    };
    
    setupSocket();
    
    return () => {
      disconnectOperatorSocket();
    };
  }, [navigate]);
  
  // Handle sending a message to the selected client
  const handleSendMessage = (e) => {
    e.preventDefault();
    
    if (!selectedClient || !inputMessage.trim()) return;
    
    const messageText = inputMessage.trim();
    setInputMessage('');
    
    // Send message to client
    sendMessageToClient(selectedClient.id, messageText);
    
    // Add message to local state
    const newMessage = {
      messageId: `operator_${Date.now()}`,
      clientId: selectedClient.id,
      text: messageText,
      timestamp: new Date().toISOString(),
      sentByOperator: true
    };
    
    setMessages(prevMessages => {
      const clientMessages = [...(prevMessages[selectedClient.id] || [])];
      clientMessages.push(newMessage);
      
      return {
        ...prevMessages,
        [selectedClient.id]: clientMessages
      };
    });
  };
  
  // Handle selecting a client
  const handleSelectClient = (client) => {
    setSelectedClient(client);
  };
  
  // Handle operator logout
  const handleLogout = () => {
    disconnectOperatorSocket();
    operatorStorage.clear();
    logout();
    navigate('/operator/login');
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r flex flex-col">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Operator Dashboard</h2>
          <p className="text-sm text-gray-500">{user?.name || 'Operator'}</p>
          <button 
            onClick={handleLogout}
            className="mt-2 text-sm text-red-500 hover:text-red-700"
          >
            Logout
          </button>
        </div>
        
        {/* Active Clients */}
        <div className="p-4 border-b">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Active Clients</h3>
          <div className="space-y-2">
            {activeClients.length > 0 ? (
              activeClients.map(client => (
                <div 
                  key={client.id}
                  className={`p-2 rounded cursor-pointer ${
                    selectedClient?.id === client.id 
                      ? 'bg-blue-100' 
                      : 'hover:bg-gray-100'
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
          <h3 className="text-sm font-medium text-gray-500 mb-2">Pending Clients</h3>
          <div className="space-y-2">
            {pendingClients.length > 0 ? (
              pendingClients.map(client => (
                <div 
                  key={client.id}
                  className="p-2 bg-yellow-50 rounded"
                >
                  <div className="font-medium">{client.name}</div>
                  <div className="text-xs text-gray-500">{client.number}</div>
                  <button 
                    className="mt-1 text-xs bg-green-500 text-white px-2 py-1 rounded"
                    onClick={() => acceptClient(client.id)}
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