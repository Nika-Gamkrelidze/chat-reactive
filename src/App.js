import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Chat from './components/Chat';
import { getSocket, initSocket } from './services/socket';
import './App.css';

function App() {
  useEffect(() => {
    // Check if user was previously logged in
    const userId = localStorage.getItem('userId');
    if (userId && !getSocket()) {
      // Reconnect with stored userId
      initSocket('', '', userId);
    }
  }, []);

  return (
    <div className="App">
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default App;
