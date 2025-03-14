import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import PrivateRoute from './PrivateRoute';
import Home from '../components/common/Home';
import ClientLogin from '../components/auth/ClientLogin';
import OperatorLogin from '../components/auth/OperatorLogin';
import ClientChat from '../components/chat/ClientChat';
import OperatorDashboard from '../components/chat/OperatorDashboard';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/home" element={<Home />} />
      <Route path="/client/login" element={<ClientLogin />} />
      <Route 
        path="/client/chat" 
        element={
          <PrivateRoute type="client">
            <ClientChat />
          </PrivateRoute>
        } 
      />
      <Route path="/operator/login" element={<OperatorLogin />} />
      <Route 
        path="/operator/dashboard" 
        element={
          <PrivateRoute type="operator">
            <OperatorDashboard />
          </PrivateRoute>
        } 
      />
      <Route path="/" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}

export default AppRoutes; 