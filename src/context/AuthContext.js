import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const storedUser = localStorage.getItem('user');
    return storedUser ? JSON.parse(storedUser) : null;
  });

  const [loading, setLoading] = useState(false);

  const login = (userData) => {
    console.log('User logged in:', userData);
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('user');
    
    // Clear operator data if exists
    if (localStorage.getItem('operatorName')) {
      const { clearOperatorData } = require('../services/socket/operatorSocket');
      clearOperatorData();
    }

    // Clear client data if exists  
    if (localStorage.getItem('clientName')) {
      localStorage.removeItem('clientName');
    }
  };
  
  const value = {
    user,
    isAuthenticated: !!user,
    isLoading: loading,
    login,
    logout
  };
  
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
} 