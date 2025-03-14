import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Check for existing user on mount
  useEffect(() => {
    // Check if we have user data in session storage
    const checkExistingAuth = () => {
      const storedUser = sessionStorage.getItem('user');
      
      if (storedUser) {
        try {
          const parsedUser = JSON.parse(storedUser);
          setUser(parsedUser);
          setIsAuthenticated(true);
        } catch (error) {
          console.error('Error parsing stored user:', error);
          sessionStorage.removeItem('user');
        }
      }
      
      setIsLoading(false);
    };
    
    checkExistingAuth();
  }, []);
  
  // Login function
  const login = (userData) => {
    setUser(userData);
    setIsAuthenticated(true);
    sessionStorage.setItem('user', JSON.stringify(userData));
  };
  
  // Logout function
  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
    sessionStorage.removeItem('user');
    
    // Clear operator/client specific data
    if (sessionStorage.getItem('operatorName')) {
      // Use the clearAll method from operatorStorage
      const { clearOperatorData } = require('../services/socket/operatorSocket');
      clearOperatorData();
    }
    
    if (sessionStorage.getItem('clientName')) {
      sessionStorage.removeItem('clientName');
      sessionStorage.removeItem('clientNumber');
      sessionStorage.removeItem('clientId');
      sessionStorage.removeItem('clientActiveOperator');
      sessionStorage.removeItem('clientMessages');
    }
  };
  
  const value = {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout
  };
  
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
} 