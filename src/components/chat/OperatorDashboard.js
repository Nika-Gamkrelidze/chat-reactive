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
  operatorStorage
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
  
  // Refs to prevent multiple effect runs and manage socket
  const socketRef = useRef(null);
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
        
        socketRef.current = socket;
        isInitializedRef.current = true;
        
        // Request initial data
        requestClientQueue();
        requestActiveClients();
        
        // Load data from storage
        if (operatorStorage.activeClients.length > 0) {
          setActiveClients(operatorStorage.activeClients);
        }
        
        if (operatorStorage.pendingClients.length > 0) {
          setPendingClients(operatorStorage.pendingClients);
        }
        
        if (Object.keys(operatorStorage.messages).length > 0) {
          setMessages(operatorStorage.messages);
        }
        
      } catch (error) {
        console.error('Failed to initialize socket:', error);
        navigate('/operator/login');
      }
    };

    setupSocket();

    // Clean up on unmount
    return () => {
      isInitializedRef.current = false;
    };
  }, [navigate]);

  // Set up event handlers
  useEffect(() => {
    // Set up message handler
    setMessageHandler((messageData) => {
      setMessages(prevMessages => {
        const newMessages = {...prevMessages};
        if (!newMessages[messageData.clientId]) {
          newMessages[messageData.clientId] = [];
        }
        
        // Check if message already exists
        const exists = newMessages[messageData.clientId].some(
          msg => msg.messageId === messageData.messageId
        );
        
        if (!exists) {
          newMessages[messageData.clientId].push(messageData);
          // Sort by timestamp
          newMessages[messageData.clientId].sort(
            (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
          );
        }
        
        return newMessages;
      });
    });
    
    // Set up client list handler
    setClientListHandler((clientList) => {
      setActiveClients(clientList || []);
    });
    
    // Set up client queue handler
    setClientQueueHandler((queueData) => {
      if (queueData?.pendingClients) {
        setPendingClients(queueData.pendingClients);
      }
    });
    
    // Clean up on unmount
    return () => {
      setMessageHandler(null);
      setClientListHandler(null);
      setClientQueueHandler(null);
    };
  }, []);

  // Message sending handler
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (inputMessage.trim() && selectedClient) {
      sendMessageToClient(selectedClient.id, inputMessage);
      
      // Optimistically add message to UI
      const newMessage = {
        clientId: selectedClient.id,
        text: inputMessage,
        sentByOperator: true,
        timestamp: new Date().toISOString(),
        messageId: `operator_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };
      
      setMessages(prevMessages => {
        const newMessages = {...prevMessages};
        if (!newMessages[selectedClient.id]) {
          newMessages[selectedClient.id] = [];
        }
        newMessages[selectedClient.id].push(newMessage);
        return newMessages;
      });
      
      setInputMessage('');
    }
  };

  // Client selection handler
  const handleSelectClient = (client) => {
    setSelectedClient(client);
  };

  // Logout handler
  const handleLogout = () => {
    logout();
    navigate('/operator/login');
  };

  // Render method
  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar for clients */}
      <div className="w-1/4 bg-white border-r">
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="text-xl font-bold">Clients</h2>
          <button 
            onClick={handleLogout}
            className="text-red-500 hover:text-red-700"
          >
            Logout
          </button>
        </div>
        
        {/* Active Clients List */}
        <div className="overflow-y-auto">
          {activeClients.length > 0 ? (
            activeClients.map(client => (
              <div 
                key={client.id}
                onClick={() => handleSelectClient(client)}
                className={`p-4 border-b cursor-pointer ${selectedClient?.id === client.id ? 'bg-gray-200' : 'hover:bg-gray-50'}`}
              >
                <h3 className="font-semibold">{client.name}</h3>
                <p className="text-sm text-gray-500">{client.number}</p>
              </div>
            ))
          ) : (
            <div className="p-4 text-center text-gray-500">
              No active clients
            </div>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {selectedClient ? (
          <>
            {/* Chat Header */}
            <div className="p-4 bg-white border-b">
              <h2 className="text-xl font-bold">{selectedClient.name}</h2>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4">
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