import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { 
  initOperatorSocket, 
  sendMessageToClient, 
  requestClientQueue,
  requestActiveClients
} from '../../services/socket/operatorSocket';

function OperatorDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  
  // State variables
  const [activeClients, setActiveClients] = useState([]);
  const [pendingClients, setPendingClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [messages, setMessages] = useState({});
  const [inputMessage, setInputMessage] = useState('');
  
  // Use ref to store socket to avoid re-renders
  const socketRef = useRef(null);

  // Memoized socket initialization
  const initializeSocket = useCallback(async () => {
    try {
      const username = sessionStorage.getItem('operatorName');
      const password = sessionStorage.getItem('operatorPassword');

      if (!username || !password) {
        navigate('/operator/login');
        return null;
      }

      const socket = await initOperatorSocket(username, password);
      
      // Safely set up event listeners
      if (socket) {
        socket.on('client-list', (clientList) => {
          setActiveClients(clientList || []);
        });

        socket.on('client-queue', (data) => {
          if (data?.pendingClients) {
            setPendingClients(data.pendingClients);
          }
        });

        socket.on('active-clients', (data) => {
          if (data?.activeClients) {
            setActiveClients(data.activeClients);
          }
        });

        socket.on('new-message', (messageData) => {
          if (messageData?.clientId) {
            setMessages(prevMessages => {
              const clientKey = messageData.clientId;
              return {
                ...prevMessages,
                [clientKey]: [...(prevMessages[clientKey] || []), messageData]
              };
            });
          }
        });

        // Request initial data
        socket.emit('get-client-list');
        requestClientQueue();
        requestActiveClients();
      }

      return socket;
    } catch (error) {
      console.error('Socket initialization error:', error);
      navigate('/operator/login');
      return null;
    }
  }, [navigate]);

  // Effect to initialize socket
  useEffect(() => {
    let isMounted = true;
    
    const setupSocket = async () => {
      const socket = await initializeSocket();
      
      if (isMounted && socket) {
        socketRef.current = socket;
      }
    };

    setupSocket();

    // Cleanup function
    return () => {
      isMounted = false;
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [initializeSocket]);

  // Message sending handler
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (inputMessage.trim() && selectedClient && socketRef.current) {
      sendMessageToClient(
        selectedClient.id,
        selectedClient.roomId,
        inputMessage
      );
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
          {activeClients.map(client => (
            <div 
              key={client.id}
              onClick={() => handleSelectClient(client)}
              className={`p-4 border-b cursor-pointer ${selectedClient?.id === client.id ? 'bg-gray-200' : 'hover:bg-gray-50'}`}
            >
              <h3 className="font-semibold">{client.name}</h3>
              <p className="text-sm text-gray-500">{client.number}</p>
            </div>
          ))}
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
              {(messages[selectedClient.id] || []).map((message, index) => (
                <div 
                  key={index} 
                  className={`mb-2 ${message.sentByOperator ? 'text-right' : 'text-left'}`}
                >
                  <span className={`inline-block p-2 rounded ${message.sentByOperator ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}>
                    {message.text}
                  </span>
                </div>
              ))}
            </div>

            {/* Message Input */}
            <form onSubmit={handleSendMessage} className="p-4 bg-white border-t flex">
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