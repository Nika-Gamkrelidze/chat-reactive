import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ClientLogin from './components/ClientLogin';
import ClientChat from './components/ClientChat';
import OperatorLogin from './components/OperatorLogin';
import OperatorDashboard from './components/OperatorDashboard';
import Home from './components/Home';
import Settings from './components/Settings';
import { reconnectClientSocket } from './services/clientSocket';
import { reconnectOperatorSocket } from './services/operatorSocket';
import './App.css';

function App() {
  useEffect(() => {
    // Try to reconnect client socket if credentials exist
    const clientName = sessionStorage.getItem('clientName');
    const clientNumber = sessionStorage.getItem('clientNumber');
    const clientId = sessionStorage.getItem('clientId');
    
    if (clientName && clientNumber && clientId) {
      console.log('Attempting to reconnect client socket with stored credentials');
      reconnectClientSocket();
    }
    
    // Try to reconnect operator socket if credentials exist
    const operatorName = sessionStorage.getItem('operatorName');
    const operatorNumber = sessionStorage.getItem('operatorNumber');
    const operatorId = sessionStorage.getItem('operatorId');
    
    if (operatorName && operatorNumber && operatorId) {
      console.log('Attempting to reconnect operator socket with stored credentials');
      reconnectOperatorSocket();
    }
  }, []);
  
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/client/login" element={<ClientLogin />} />
          <Route path="/client/chat" element={<ClientChatWrapper />} />
          <Route path="/operator/login" element={<OperatorLogin />} />
          <Route path="/operator/dashboard" element={<OperatorDashboardWrapper />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </Router>
  );
}

// Wrapper component to handle client chat authentication
function ClientChatWrapper() {
  // Get credentials from session storage
  const name = sessionStorage.getItem('clientName');
  const number = sessionStorage.getItem('clientNumber');
  
  // If no credentials, redirect to login
  if (!name || !number) {
    return <Navigate to="/client/login" replace />;
  }
  
  // Pass credentials to chat component
  return <ClientChat userName={name} userNumber={number} />;
}

// Wrapper component to handle operator dashboard authentication
function OperatorDashboardWrapper() {
  // Get credentials from session storage
  const name = sessionStorage.getItem('operatorName');
  const number = sessionStorage.getItem('operatorNumber');
  
  // If no credentials, redirect to login
  if (!name || !number) {
    return <Navigate to="/operator/login" replace />;
  }
  
  // Pass credentials to dashboard component
  return <OperatorDashboard operatorName={name} operatorNumber={number} />;
}

export default App;
