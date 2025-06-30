import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  initClientSocket, 
  setClientMessageHandler, 
  setClientSessionHandler,
  sendClientMessage, 
  sendTypingEvent,
  clientStorage,
  getClientSocket,
  sendClientEndChat,
  sendClientFeedback,
  cleanupClientSocket,
  isSocketConnected,
  sendClientCallbackRequest
} from '../../services/socket/clientSocket';
import { MdCallEnd } from 'react-icons/md';
import { IoMdExit } from 'react-icons/io';
import { BiExit } from 'react-icons/bi';
import { RiCloseLine } from 'react-icons/ri';
import { FiPhoneOff } from 'react-icons/fi';
import { IoSend } from 'react-icons/io5';
import ChatbotInterface from './ChatbotInterface';

function ClientChat() {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [hasOperator, setHasOperator] = useState(false);
  const [operatorInfo, setOperatorInfo] = useState(null);
  const [operatorTyping, setOperatorTyping] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showChatbot, setShowChatbot] = useState(true);
  const messagesEndRef = useRef(null);
  const clientTypingTimeoutRef = useRef(null);
  const operatorTypingTimeoutRef = useRef(null);
  const socketInitializedRef = useRef(false);
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackScore, setFeedbackScore] = useState(0);
  const [feedbackComment, setFeedbackComment] = useState('');
  
  // Get client info from local storage
  const clientName = localStorage.getItem('clientName');
  const clientNumber = localStorage.getItem('clientNumber');
  const clientId = localStorage.getItem('clientId');
  
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
        console.log('[ClientChat] Typing event received:', message);
        // Clear existing timeout
        if (operatorTypingTimeoutRef.current) {
          clearTimeout(operatorTypingTimeoutRef.current);
        }

        if (message.isTyping) {
          console.log('[ClientChat] Setting operatorTyping to TRUE');
          setOperatorTyping(true);
          // Set a new timeout to hide the indicator
          operatorTypingTimeoutRef.current = setTimeout(() => {
            console.log('[ClientChat] Operator typing timeout expired, setting to FALSE');
            setOperatorTyping(false);
          }, 2500); // Operator typing indicator timeout (2.5 seconds)
        } else {
          console.log('[ClientChat] Setting operatorTyping to FALSE (isTyping was false)');
          setOperatorTyping(false); // Explicitly set to false if isTyping is false
          operatorTypingTimeoutRef.current = null;
        }
        return;
      }
      
      const currentClientId = localStorage.getItem('clientId');

      setMessages(prevMessages => {
        const messagesToProcess = Array.isArray(message) ? message : [message];
        let updatedMessages = [...prevMessages];

        messagesToProcess.forEach(newMessage => {
          // Ignore temporary messages if they somehow get echoed back with temp ID
          if (!newMessage.messageId || newMessage.messageId.startsWith('temp_')) {
            return; 
          }

          let isConfirmationOfOptimistic = false;
          // Check if this is a server confirmation of an optimistically added message
          // It should have senderId matching current client, and not be marked as from operator
          if (newMessage.senderId === currentClientId && !newMessage.sentByOperator) {
            const optimisticMessageIndex = updatedMessages.findIndex(
              m => m.isPending && 
                   m.senderId === currentClientId &&
                   m.text === newMessage.text // Match by text; more robust would be a correlation ID
            );

            if (optimisticMessageIndex > -1) {
              // Replace optimistic message with server-confirmed one
              updatedMessages[optimisticMessageIndex] = {
                ...newMessage,
                sender: 'client', // Confirm sender as client
                isPending: false, // No longer pending
              };
              isConfirmationOfOptimistic = true;
            }
          }

          // If it wasn't a confirmation that replaced an optimistic message,
          // add/update it using its final messageId.
          if (!isConfirmationOfOptimistic) {
            const existingIndex = updatedMessages.findIndex(m => m.messageId === newMessage.messageId);
            const finalMessage = {
              ...newMessage,
              // Determine sender based on sentByOperator or if senderId matches current client
              sender: newMessage.sentByOperator ? 'operator' : (newMessage.senderId === currentClientId ? 'client' : 'operator'),
              isPending: false
            };

            if (existingIndex > -1) {
              updatedMessages[existingIndex] = finalMessage; // Update existing
            } else {
              updatedMessages.push(finalMessage); // Add new
            }
          }
        });
        
        return updatedMessages;
      });
    };
    
    // Define session handler function
    const handleSessionUpdate = (sessionData) => {
      console.log('Session update received in ClientChat:', sessionData);

      // Handle feedback processed signal
      if (sessionData.feedbackProcessed) {
        // Cleanup and redirect regardless of success, as the feedback process is complete.
        console.log(`Feedback process finished (success: ${sessionData.success}), cleaning up and redirecting.`);
        // Reset component state
        setMessages([]);
        setHasOperator(false);
        setOperatorInfo(null);
        setRoomId(null);
        setIsConnected(false);
        // Navigate to login
        navigate('/client/login');

        return; // Stop further processing for this event
      }

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
        // Also store in local storage for persistence
        localStorage.setItem('roomId', sessionData.roomId);
      } else {
        // Try to get room ID from local storage if not in session data
        const storedRoomId = localStorage.getItem('roomId');
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
      
      // Clear any pending typing timeouts
      if (clientTypingTimeoutRef.current) {
        clearTimeout(clientTypingTimeoutRef.current);
      }
      if (operatorTypingTimeoutRef.current) {
        clearTimeout(operatorTypingTimeoutRef.current);
      }
      
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
    
    const currentRoomId = roomId || localStorage.getItem('roomId');
    const actualClientId = localStorage.getItem('clientId'); // Get client ID for the message object

    if (!currentRoomId) {
      console.error('Cannot send message: room ID not available');
      return;
    }
    if (!actualClientId) {
      console.error('Cannot send message: client ID not available for optimistic update.');
      return;
    }
    
    const tempId = `temp_${Date.now()}`; // Generate a unique temporary ID
    const optimisticMessage = {
      messageId: tempId,
      text: inputMessage.trim(),
      sender: 'client', // Message is from the current client
      senderId: actualClientId, // Include senderId
      timestamp: new Date().toISOString(),
      sentByOperator: false, // Explicitly false
      isPending: true // Mark as pending server confirmation
    };

    // Add message optimistically to the UI
    setMessages(prevMessages => [...prevMessages, optimisticMessage]);
    
    // Send the actual message to the server
    sendClientMessage(inputMessage.trim(), currentRoomId);
    
    // Clear input
    setInputMessage('');

    // Clear typing indicator immediately after sending
    if (clientTypingTimeoutRef.current) {
      clearTimeout(clientTypingTimeoutRef.current);
      clientTypingTimeoutRef.current = null; 
    }
    sendTypingEvent(false);
  };
  
  // Handle input change and typing indicator
  const handleInputChange = (e) => {
    setInputMessage(e.target.value);
    
    if (!isConnected) return;
    
    // Send typing indicator
    sendTypingEvent(true);
    
    // Clear previous timeout
    if (clientTypingTimeoutRef.current) {
      clearTimeout(clientTypingTimeoutRef.current);
    }
    
    // Set timeout to clear typing indicator
    clientTypingTimeoutRef.current = setTimeout(() => {
      sendTypingEvent(false);
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
    
    // Show feedback modal instead of immediately ending chat
    setShowFeedbackModal(true);
  };
  
  const handleSubmitFeedback = () => {
    // Only pass score and comment
    const feedbackData = {
      score: feedbackScore,
      comment: feedbackComment
    };
    
    sendClientFeedback(feedbackData);
    setShowFeedbackModal(false);
    // Cleanup and navigation are handled in handleSessionUpdate after feedback_submitted event
  };

  const handleShowFeedbackModal = () => {  
    setShowFeedbackModal(true);
  };
  
  const handleCallbackRequest = () => {
    const currentRoomId = localStorage.getItem('roomId');
    
    if (!currentRoomId) {
      console.error('Cannot send callback request: room ID not available');
      return;
    }

    const callbackData = {
      userId: clientId,
      roomId: currentRoomId,
      name: clientName,
      number: clientNumber
    };
    
    sendClientCallbackRequest(callbackData);
    
    // Navigate to login
    navigate('/client/login');
  };
  
  const handleConnectToOperator = () => {
    setShowChatbot(false);
    setIsLoading(false);
  };
  
  // Log operatorTyping state during render
  console.log('[ClientChat] Rendering - operatorTyping:', operatorTyping);
  
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
  
  if (showChatbot) {
    return (
      <div className="h-full w-full flex flex-col">
        <div className="w-full max-w-md mx-auto bg-white rounded-lg shadow-xl overflow-hidden flex flex-col h-full">
          <ChatbotInterface
            onConnectToOperator={handleConnectToOperator}
            clientName={clientName}
            clientNumber={clientNumber}
          />
        </div>
      </div>
    );
  }
  
  return (
    <div className="h-full w-full flex flex-col">
      <div className="w-full max-w-md mx-auto bg-white rounded-lg shadow-xl overflow-hidden flex flex-col h-full">
        {/* Chat Header */}
        <div className="bg-gradient-to-r from-primary-500 to-primary-600 text-white p-3 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold">
              {hasOperator 
                ? `${operatorInfo?.name || 'ოპერატორთან'}`
                : 'მოლოდინში...'}
            </h2>
            <p className="text-xs text-primary-100">
              {!isConnected && <span className="text-red-200">⚠️ ხელახლა დაკავშირება...</span>}
              {isConnected && (hasOperator 
                ? 'თქვენ დაკავშირებული ხართ'
                : 'თქვენ რიგში ხართ')}
            </p>
          </div>
          <div className="flex gap-1.5">
            {!hasOperator && (
              <button
                onClick={handleCallbackRequest}
                title="ზარის მოთხოვნა"
                className="p-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-md transition-colors flex items-center justify-center shadow-sm hover:shadow-md"
              >
                <FiPhoneOff className="text-lg" />
              </button>
            )}
            <button
              onClick={handleEndChat}
              title="ჩატის დასრულება"
              className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-md transition-colors flex items-center justify-center shadow-sm hover:shadow-md"
            >
              <IoMdExit className="text-lg" />
            </button>
          </div>
        </div>
        
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-3 bg-gray-50">
          {messages.map((msg, index) => (
            <div
              key={`${msg.messageId || index}`}
              className={`flex ${msg.sender === 'client' ? 'justify-end' : 'justify-start'} mb-2.5`}
            >
              <div
                className={`max-w-[75%] rounded-xl px-3 py-1.5 ${
                  msg.sender === 'client'
                    ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white'
                    : 'bg-white border border-gray-200 text-gray-800'
                }`}
              >
                {msg.sender === 'operator' && msg.senderName && (
                  <p className="text-xs font-medium mb-1 text-gray-600">{msg.senderName}</p>
                )}
                <p className="text-xs break-words">{msg.text}</p>
                <p className={`text-[10px] mt-0.5 ${
                  msg.sender === 'client' ? 'text-primary-100' : 'text-gray-400'
                }`}>
                  {formatMessageTime(msg.timestamp)}
                  {msg.isPending && <span className="ml-1">✓</span>}
                </p>
              </div>
            </div>
          ))}
          {operatorTyping && (
            <div className="flex justify-start mb-2.5">
              <div className="bg-white border border-gray-200 rounded-xl px-3 py-1.5">
                <div className="flex items-center space-x-1">
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-200"></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="bg-white border-t p-3">
          <form onSubmit={handleSendMessage} className="flex space-x-2">
            <input
              type="text"
              value={inputMessage}
              onChange={handleInputChange}
              className="flex-1 px-3 py-1.5 border border-gray-200 rounded-md focus:ring-1 focus:ring-primary-400 focus:border-transparent transition-all outline-none text-sm"
              placeholder="აკრიფეთ შეტყობინება..."
              disabled={!isConnected}
            />
            <button
              type="submit"
              className={`w-9 h-9 text-sm font-medium rounded-md transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] shadow-sm flex items-center justify-center ${
                isConnected 
                  ? 'bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
              disabled={!isConnected}
            >
              <IoSend size={18} />
            </button>
          </form>
        </div>
        <div className="text-center text-xs text-gray-500 py-2 border-t border-gray-200">
        © 2024 Created with <span role="img" aria-label="heart">♥</span> by CommuniQ
        </div>

        {/* Feedback Modal */}
        {showFeedbackModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl p-5 max-w-sm w-full">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">შეაფასეთ თქვენი გამოცდილება</h3>
              
              {/* Star Rating */}
              <div className="flex justify-center space-x-1 mb-3">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setFeedbackScore(star)}
                    className={`text-xl transition-colors ${
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
                placeholder="დატოვეთ კომენტარი (სურვილისამებრ)"
                className="w-full p-2.5 border border-gray-200 rounded-md mb-3 h-24 resize-none focus:ring-1 focus:ring-primary-400 focus:border-transparent text-sm"
              />
              
              {/* Submit Button */}
              <div className="flex justify-end space-x-2">
                <button
                  onClick={() => setShowFeedbackModal(false)}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                >
                  გაუქმება
                </button>
                <button
                  onClick={handleSubmitFeedback}
                  disabled={feedbackScore === 0}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
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