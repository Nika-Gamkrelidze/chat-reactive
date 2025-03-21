import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  initClientSocket, 
  setClientMessageHandler, 
  setClientSessionHandler,
  sendClientMessage, 
  sendClientTypingStatus,
  clientStorage,
  getClientSocket,
  sendClientEndChat,
  sendClientFeedback,
  cleanupClientSocket,
  isSocketConnected
} from '../../services/socket/clientSocket';
import { MdCallEnd } from 'react-icons/md';
import { IoMdExit } from 'react-icons/io';
import { BiExit } from 'react-icons/bi';
import { RiCloseLine } from 'react-icons/ri';
import { FiPhoneOff } from 'react-icons/fi';

function ClientChat() {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [hasOperator, setHasOperator] = useState(false);
  const [operatorInfo, setOperatorInfo] = useState(null);
  const [operatorTyping, setOperatorTyping] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const socketInitializedRef = useRef(false);
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState(null);
  const [clientInfo, setClientInfo] = useState(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackScore, setFeedbackScore] = useState(0);
  const [feedbackComment, setFeedbackComment] = useState('');
  
  // Get client info from session storage
  const clientName = sessionStorage.getItem('clientName');
  const clientNumber = sessionStorage.getItem('clientNumber');
  const clientId = sessionStorage.getItem('clientId');
  
  useEffect(() => {
    // Redirect to login if no client info
    if (!clientName || !clientNumber) {
      navigate('/client/login');
      return;
    }

    if (socketInitializedRef.current) return;
    socketInitializedRef.current = true;

    // Define message handler function
    const handleNewMessage = (message) => {
      console.log('New message received in chat component:', message);
      
      // Handle typing indicator
      if (message.type === 'typing') {
        setOperatorTyping(message.isTyping);
        return;
      }
      
      setMessages(prevMessages => {
        const messagesToAdd = Array.isArray(message) ? message : [message];
        
        // Create a map of existing messages using messageId as key
        const existingMessages = new Map(
          prevMessages.map(msg => [msg.messageId, msg])
        );
        
        // Only add messages that come from the server (they will have proper messageId format)
        messagesToAdd.forEach(msg => {
          // Only add messages with proper server-generated messageId (not temp ids)
          if (msg.messageId && !msg.messageId.startsWith('temp_')) {
            existingMessages.set(msg.messageId, {
              ...msg,
              sender: msg.sentByOperator ? 'operator' : 'client'
            });
          }
        });
        
        return Array.from(existingMessages.values())
          .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      });
    };
    
    // Define session handler function
    const handleSessionUpdate = (sessionData) => {
      console.log('Session update received in ClientChat:', sessionData);
      setIsLoading(false);
      
      // Add this new condition
      if (sessionData.showFeedback) {
        setShowFeedbackModal(true);
        return;
      }
      
      // Handle operator assignment
      if (sessionData.operator) {
        setHasOperator(true);
        setOperatorInfo(sessionData.operator);
      }
      
      // Update room ID if available
      if (sessionData.roomId) {
        console.log('Setting room ID:', sessionData.roomId);
        setRoomId(sessionData.roomId);
        // Also store in session storage for persistence
        sessionStorage.setItem('roomId', sessionData.roomId);
      } else {
        // Try to get room ID from session storage if not in session data
        const storedRoomId = sessionStorage.getItem('roomId');
        if (storedRoomId) {
          console.log('Using stored room ID:', storedRoomId);
          setRoomId(storedRoomId);
        }
      }
      
      // Load messages if available and process them
      if (sessionData.messages && Array.isArray(sessionData.messages)) {
        const processedMessages = sessionData.messages.map(msg => ({
          ...msg,
          sender: msg.sentByOperator ? 'operator' : 'client'
        }));
        
        setMessages(processedMessages);
      }
      
      setIsConnected(true);
    };
    
    // Set message and session handlers
    setClientMessageHandler(handleNewMessage);
    setClientSessionHandler(handleSessionUpdate);
    
    // Check if socket is already connected
    if (!isSocketConnected()) {
      // Only initialize socket if not already connected
      console.log('Initializing client socket with:', { clientName, clientNumber, clientId });
      initClientSocket(clientName, clientNumber, clientId);
    } else {
      console.log('Using existing socket connection');
      setIsLoading(false);
      setIsConnected(true);
      
      // Request session reconnect data
      const socket = getClientSocket();
      if (socket) {
        socket.emit('request-session-data');
      }
    }
    
    // Get current socket instance
    const socket = getClientSocket();
    
    if (socket) {
      // Handle connection events
      socket.on('connect', () => {
        console.log('Socket connected in ClientChat component');
        setIsConnected(true);
      });
      
      socket.on('disconnect', () => {
        console.log('Socket disconnected in ClientChat component');
        setIsConnected(false);
      });
      
      socket.on('connect_error', (error) => {
        console.error('Connection error in ClientChat:', error);
        setIsLoading(false);
      });
    }
    
    // Load existing messages from storage and process them
    const storedMessages = clientStorage.messages || [];
    if (storedMessages.length > 0) {
      const processedMessages = storedMessages.map(msg => ({
        ...msg,
        sender: msg.sentByOperator ? 'operator' : 'client'
      }));
      
      setMessages(processedMessages);
    }
    
    // Update operator info if available
    if (clientStorage.hasOperator && clientStorage.operatorInfo) {
      setHasOperator(true);
      setOperatorInfo(clientStorage.operatorInfo);
    }
    
    // Set a timeout to check connection status
    const connectionTimeout = setTimeout(() => {
      if (!socket.connected) {
        console.log('Socket connection timed out, redirecting to login');
        navigate('/client/login');
      }
    }, 5000);
    
    // Clean up on unmount
    return () => {
      clearTimeout(connectionTimeout);
      
      // Don't disconnect the socket, just remove the handlers
      const currentSocket = getClientSocket();
      if (currentSocket) {
        currentSocket.off('connect');
        currentSocket.off('disconnect');
        currentSocket.off('connect_error');
      }
    };
  }, [clientName, clientNumber, clientId, navigate]);
  
  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);
  
  // Handle sending a message
  const handleSendMessage = (e) => {
    e.preventDefault();
    
    if (!inputMessage.trim() || !isConnected) return;
    
    const currentRoomId = roomId || sessionStorage.getItem('roomId');
    
    if (!currentRoomId) {
      console.error('Cannot send message: room ID not available');
      return;
    }
    
    console.log('Sending message with room ID:', currentRoomId);
    
    // Just send the message - no temporary message creation
    sendClientMessage(inputMessage.trim(), currentRoomId);
    
    // Clear input
    setInputMessage('');
  };
  
  // Handle input change and typing indicator
  const handleInputChange = (e) => {
    setInputMessage(e.target.value);
    
    if (!isConnected) return;
    
    // Send typing indicator
    sendClientTypingStatus(true);
    
    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Set timeout to clear typing indicator
    typingTimeoutRef.current = setTimeout(() => {
      sendClientTypingStatus(false);
    }, 2000);
  };
  
  // Helper to format message timestamp
  const formatMessageTime = (timestamp) => {
    try {
      return new Date(timestamp).toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit'
      });
    } catch (e) {
      console.error('Error formatting timestamp:', e);
      return '';
    }
  };
  
  const handleEndChat = () => {
    const endChatData = {
      userId: clientId,
      roomId,
      userType: 'client'
    };
    
    sendClientEndChat(endChatData);
    setRoomId(null);
    setHasOperator(false);
    setOperatorInfo(null);
    setIsConnected(false);
  };
  
  const handleSubmitFeedback = () => {
    const feedbackData = {
      clientId,
      clientNumber,
      clientName,
      feedbackScore,
      feedbackComment,
      operatorId: operatorInfo?.id,
      operatorName: operatorInfo?.name
    };
    
    sendClientFeedback(feedbackData);
    setShowFeedbackModal(false);

    // Use the new cleanup function
    cleanupClientSocket();
    
    // Reset component state
    setMessages([]);
    setHasOperator(false);
    setOperatorInfo(null);
    setRoomId(null);
    setIsConnected(false);
    
    // Navigate to login
    navigate('/client/login');
  };

  const handleShowFeedbackModal = () => {  
    setShowFeedbackModal(true);
  };
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 to-secondary-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-soft text-center">
          <div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold text-gray-800">კავშირის დამყარება...</h2>
          <p className="text-gray-500 mt-2">გთხოვთ დაელოდოთ კავშირის დამყარებას</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-secondary-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-soft overflow-hidden flex flex-col h-[80vh]">
        {/* Chat Header */}
        <div className="bg-gradient-to-r from-primary-500 to-primary-600 text-white p-4 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold">
              {hasOperator 
                ? `ჩათი ${operatorInfo?.name || 'ოპერატორთან'}`
                : 'ოპერატორის ლოდინი...'}
            </h2>
            <p className="text-sm text-primary-100">
              {!isConnected && <span className="text-red-200">⚠️ ხელახლა დაკავშირება...</span>}
              {isConnected && (hasOperator 
                ? 'თქვენ დაკავშირებული ხართ ოპერატორთან'
                : 'თქვენ ხართ რიგში')}
            </p>
          </div>
          <button
            onClick={handleEndChat}
            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors flex items-center gap-2 shadow-md hover:shadow-lg"
          >
            <IoMdExit className="text-xl" />
            <span>ჩათის დასრულება</span>
          </button>
        </div>
        
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
          {messages.map((msg, index) => (
            <div
              key={`${msg.messageId || index}`}
              className={`flex ${msg.sender === 'client' ? 'justify-end' : 'justify-start'} mb-3`}
            >
              <div
                className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                  msg.sender === 'client'
                    ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white'
                    : 'bg-white border border-gray-200 text-gray-800'
                }`}
              >
                <p className="text-sm">{msg.text}</p>
                <p className={`text-xs mt-1 ${
                  msg.sender === 'client' ? 'text-primary-100' : 'text-gray-400'
                }`}>
                  {formatMessageTime(msg.timestamp)}
                  {msg.isPending && <span className="ml-1">✓</span>}
                </p>
              </div>
            </div>
          ))}
          {operatorTyping && (
            <div className="flex justify-start mb-3">
              <div className="bg-white border border-gray-200 rounded-2xl px-4 py-2">
                <div className="flex items-center space-x-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="bg-white border-t p-4">
          <form onSubmit={handleSendMessage} className="flex space-x-4">
            <input
              type="text"
              value={inputMessage}
              onChange={handleInputChange}
              className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-all outline-none"
              placeholder="შეიყვანეთ შეტყობინება..."
              disabled={!isConnected}
            />
            <button
              type="submit"
              className={`px-6 py-2 font-medium rounded-lg transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] shadow-sm ${
                isConnected 
                  ? 'bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
              disabled={!isConnected}
            >
              გაგზავნა
            </button>
          </form>
        </div>

        {/* Feedback Modal */}
        {showFeedbackModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl p-6 max-w-md w-full">
              <h3 className="text-xl font-semibold text-gray-800 mb-4">შეაფასეთ მომსახურება</h3>
              
              {/* Star Rating */}
              <div className="flex justify-center space-x-2 mb-4">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setFeedbackScore(star)}
                    className={`text-2xl transition-colors ${
                      star <= feedbackScore ? 'text-yellow-400' : 'text-gray-300'
                    }`}
                  >
                    ★
                  </button>
                ))}
              </div>
              
              {/* Comment Box */}
              <textarea
                value={feedbackComment}
                onChange={(e) => setFeedbackComment(e.target.value)}
                placeholder="დატოვეთ კომენტარი (არასავალდებულო)"
                className="w-full p-3 border border-gray-200 rounded-lg mb-4 h-32 resize-none focus:ring-2 focus:ring-primary-400 focus:border-transparent"
              />
              
              {/* Submit Button */}
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowFeedbackModal(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  გაუქმება
                </button>
                <button
                  onClick={handleSubmitFeedback}
                  disabled={feedbackScore === 0}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    feedbackScore > 0
                      ? 'bg-primary-500 hover:bg-primary-600 text-white'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  გაგზავნა
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ClientChat;