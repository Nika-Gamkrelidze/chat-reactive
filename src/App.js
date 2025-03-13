import React, { useEffect, useState, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import ClientLogin from './components/ClientLogin';
import ClientChat from './components/ClientChat';
import OperatorLogin from './components/OperatorLogin';
import OperatorDashboard from './components/OperatorDashboard';
import Home from './components/Home';
import Settings from './components/Settings';
import { initClientSocket, getClientSocket } from './services/clientSocket';
import { initOperatorSocket, getOperatorSocket } from './services/operatorSocket';
import './App.css';

function App() {
  useEffect(() => {
    // Try to reconnect based on stored credentials
    const storedClientId = sessionStorage.getItem('clientId');
    const storedClientName = sessionStorage.getItem('clientName');
    const storedClientNumber = sessionStorage.getItem('clientNumber');
    
    const storedOperatorId = sessionStorage.getItem('operatorId');
    const storedOperatorName = sessionStorage.getItem('operatorName');
    const storedOperatorNumber = sessionStorage.getItem('operatorNumber');
    
    // Check if client credentials exist
    if (storedClientId && storedClientName && storedClientNumber) {
      const clientSocket = getClientSocket();
      if (!clientSocket?.connected) {
        console.log('Attempting to reconnect client socket with stored credentials');
        const socket = initClientSocket(storedClientName, storedClientNumber);
        if (socket) {
          socket.auth = {
            userId: storedClientId,
            name: storedClientName,
            number: storedClientNumber,
            type: 'client'
          };
          socket.connect();
        }
      }
    }
    
    // Check if operator credentials exist
    if (storedOperatorId && storedOperatorName && storedOperatorNumber) {
      const operatorSocket = getOperatorSocket();
      if (!operatorSocket?.connected) {
        console.log('Attempting to reconnect operator socket with stored credentials');
        const socket = initOperatorSocket(storedOperatorName, storedOperatorNumber);
        if (socket) {
          socket.auth = {
            userId: storedOperatorId,
            name: storedOperatorName,
            number: storedOperatorNumber,
            type: 'operator'
          };
          socket.connect();
        }
      }
    }
  }, []);

  return (
    <Router>
      <div className="bg-blue-500 min-h-screen p-4">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/client/login" element={<ClientLoginWrapper />} />
          <Route path="/client/chat" element={<ClientChatWrapper />} />
          <Route path="/operator/login" element={<OperatorLoginWrapper />} />
          <Route path="/operator/dashboard" element={<OperatorDashboardWrapper />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </Router>
  );
}

// Wrapper component to handle client login authentication
function ClientLoginWrapper() {
  // Check if already logged in
  const clientId = sessionStorage.getItem('clientId');
  const clientName = sessionStorage.getItem('clientName');
  const clientNumber = sessionStorage.getItem('clientNumber');
  
  // If credentials exist, redirect to chat
  if (clientId && clientName && clientNumber) {
    return <Navigate to="/client/chat" replace />;
  }
  
  return <ClientLogin />;
}

// Wrapper component to handle client chat authentication
function ClientChatWrapper() {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  const checkAuth = useCallback(() => {
    const clientName = sessionStorage.getItem('clientName');
    const clientNumber = sessionStorage.getItem('clientNumber');
    
    if (!clientName || !clientNumber) {
      navigate('/client/login', { replace: true });
      setIsAuthenticated(false);
    } else {
      setIsAuthenticated(true);
    }
    setIsChecking(false);
  }, [navigate]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (isChecking) {
    return <div>Loading...</div>; // or a spinner component
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <ClientChat 
      clientName={sessionStorage.getItem('clientName')}
      clientNumber={sessionStorage.getItem('clientNumber')}
    />
  );
}

// Wrapper component to handle operator login authentication
function OperatorLoginWrapper() {
  const navigate = useNavigate();
  
  useEffect(() => {
    // Check if already logged in
    const operatorId = sessionStorage.getItem('operatorId');
    const operatorName = sessionStorage.getItem('operatorName');
    const operatorNumber = sessionStorage.getItem('operatorNumber');
    
    // If credentials exist, redirect to dashboard
    if (operatorId && operatorName && operatorNumber) {
      navigate('/operator/dashboard', { replace: true });
    }
  }, []); // Empty dependency array to run only once
  
  return <OperatorLogin />;
}

// Wrapper component to handle operator dashboard authentication
function OperatorDashboardWrapper() {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  useEffect(() => {
    const checkAuth = () => {
      const operatorName = sessionStorage.getItem('operatorName');
      const operatorNumber = sessionStorage.getItem('operatorNumber');
      
      if (!operatorName || !operatorNumber) {
        navigate('/operator/login', { replace: true });
      } else {
        setIsAuthenticated(true);
      }
    };
    
    checkAuth();
  }, [navigate]);
  
  if (!isAuthenticated) {
    return null;
  }
  
  return (
    <OperatorDashboard 
      operatorName={sessionStorage.getItem('operatorName')}
      operatorNumber={sessionStorage.getItem('operatorNumber')}
    />
  );
}

export default App;
