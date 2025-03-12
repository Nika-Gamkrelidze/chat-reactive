import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  getSocket, 
  disconnectSocket, 
  sendMessage, 
  sendTypingStatus,
  requestUserList
} from '../services/socket';

const Chat = () => {
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [users, setUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [error, setError] = useState('');
  const socket = getSocket();
  const navigate = useNavigate();
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    // Check if user is logged in
    const userId = localStorage.getItem('userId');
    if (!userId || !socket) {
      navigate('/');
      return;
    }

    // Request initial user list
    requestUserList();

    // Listen for new messages
    socket.on('message', (message) => {
      console.log('New message received:', message);
      setMessages((prevMessages) => [...prevMessages, message]);
    });

    // Listen for users list updates
    socket.on('users', (usersList) => {
      console.log('Users list updated:', usersList);
      setUsers(usersList);
    });

    // Listen for typing indicators
    socket.on('typing', ({ userId, name, isTyping }) => {
      if (isTyping) {
        setTypingUsers(prev => [...prev.filter(user => user.userId !== userId), { userId, name }]);
      } else {
        setTypingUsers(prev => prev.filter(user => user.userId !== userId));
      }
    });

    // Listen for errors
    socket.on('error', (errorMessage) => {
      console.error('Server error:', errorMessage);
      setError(errorMessage);
      
      // Clear error after 5 seconds
      setTimeout(() => setError(''), 5000);
    });

    // Cleanup on component unmount
    return () => {
      socket.off('message');
      socket.off('users');
      socket.off('typing');
      socket.off('error');
      
      // Clear any pending typing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [navigate, socket]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!messageInput.trim()) return;

    const success = sendMessage(messageInput);
    
    if (success) {
      // Clear typing indicator when sending a message
      sendTypingStatus(false);
      setMessageInput('');
    } else {
      setError('Failed to send message. Please check your connection.');
    }
  };

  const handleInputChange = (e) => {
    setMessageInput(e.target.value);
    
    // Send typing indicator
    sendTypingStatus(true);
    
    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Set timeout to stop typing indicator after 2 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      sendTypingStatus(false);
    }, 2000);
  };

  const handleLogout = () => {
    localStorage.removeItem('userId');
    disconnectSocket();
    navigate('/');
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <h1>Chat Room</h1>
        <button onClick={handleLogout} className="logout-btn">Logout</button>
      </div>
      
      {error && <div className="error-banner">{error}</div>}
      
      <div className="chat-main">
        <div className="users-list">
          <h2>Online Users</h2>
          <ul>
            {users.map((user) => (
              <li key={user.userId} className={typingUsers.some(u => u.userId === user.userId) ? 'typing' : ''}>
                {user.name} {typingUsers.some(u => u.userId === user.userId) && <span className="typing-indicator">typing...</span>}
              </li>
            ))}
          </ul>
        </div>
        <div className="messages-container">
          <div className="messages">
            {messages.map((msg, index) => (
              <div 
                key={index} 
                className={`message ${msg.userId === localStorage.getItem('userId') ? 'own-message' : ''}`}
              >
                <div className="message-sender">{msg.name}</div>
                <div className="message-text">{msg.text}</div>
                <div className="message-time">
                  {new Date(msg.timestamp || msg.time).toLocaleTimeString()}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          
          {typingUsers.length > 0 && (
            <div className="typing-status">
              {typingUsers.length === 1 
                ? `${typingUsers[0].name} is typing...` 
                : `${typingUsers.length} people are typing...`}
            </div>
          )}
          
          <form onSubmit={handleSendMessage} className="message-form">
            <input
              type="text"
              value={messageInput}
              onChange={handleInputChange}
              placeholder="Type a message..."
            />
            <button type="submit">Send</button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Chat; 