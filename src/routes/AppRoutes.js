import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import PrivateRoute from './PrivateRoute';
import ClientLogin from '../components/auth/ClientLogin';
import OperatorLogin from '../components/auth/OperatorLogin';
import ClientChat from '../components/chat/ClientChat';
import OperatorDashboard from '../components/chat/OperatorDashboard';
import AdminLogs from '../components/admin/AdminLogs';

function AppRoutes() {
  return (
    <Routes>
      {/* <Route path="/home" element={<Home />} /> */}
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
      <Route path="/admin" element={<Navigate to="/admin/logs" replace />} />
      <Route path="/admin/logs" element={<AdminLogs />} />
      <Route path="/" element={<Navigate to="/operator/login" replace />} />
    </Routes>
  );
}

export default AppRoutes; 