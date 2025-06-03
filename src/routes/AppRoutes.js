import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import PrivateRoute from './PrivateRoute';
import ClientLogin from '../components/auth/ClientLogin'; // Commented out
import OperatorLogin from '../components/auth/OperatorLogin';
import ClientChat from '../components/chat/ClientChat'; // Commented out
import OperatorDashboard from '../components/chat/OperatorDashboard';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/client/login" replace />} />

      <Route path="/client/login" element={<ClientLogin />} />
      <Route 
        path="/client/chat" 
        element={
          <PrivateRoute type="client">
            <ClientChat />
          </PrivateRoute>
        } 
      />
      {/* <Route path="/operator/login" element={<OperatorLogin />} /> */}
      {/* <Route 
        path="/operator/dashboard" 
        element={
          <PrivateRoute type="operator">
            <OperatorDashboard />
          </PrivateRoute>
        } 
      /> */}
    </Routes>
  );
}

export default AppRoutes; 