import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

function PrivateRoute({ children, role }) {
  const { user, isAuthenticated } = useAuth();
  
  // Check if user is authenticated
  if (!isAuthenticated) {
    // Redirect to appropriate login page based on role
    if (role === 'operator') {
      return <Navigate to="/operator/login" replace />;
    } else {
      return <Navigate to="/client/login" replace />;
    }
  }
  
  // Check if user has the required role
  if (role && user.role !== role) {
    // Redirect to appropriate login page based on role
    if (role === 'operator') {
      return <Navigate to="/operator/login" replace />;
    } else {
      return <Navigate to="/client/login" replace />;
    }
  }
  
  // If authenticated and has the correct role, render the children
  return children;
}

export default PrivateRoute; 