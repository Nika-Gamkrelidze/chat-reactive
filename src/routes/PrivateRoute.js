import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function PrivateRoute({ children, type }) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to={`/${type}/login`} replace />;
  }

  if (user.type !== type) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default PrivateRoute; 