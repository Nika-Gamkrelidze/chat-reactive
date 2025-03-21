import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function PrivateRoute({ children, type }) {
  const { user, isAuthenticated } = useAuth();
  
  // Check if user is authenticated
  if (!isAuthenticated) {
    // Redirect to appropriate login page based on type
    if (type === 'operator') {
      return <Navigate to="/operator/login" replace />;
    } else {
      return <Navigate to="/client/login" replace />;
    }
  }
  
  // Check if user has the required type
  if (type && user.role !== type) {
    // Redirect to appropriate login page based on type
    if (type === 'operator') {
      return <Navigate to="/operator/login" replace />;
    } else {
      return <Navigate to="/client/login" replace />;
    }
  }
  
  // If authenticated and has the correct type, render the children
  return children;
}

export default PrivateRoute; 