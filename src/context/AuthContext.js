import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Check for existing user on mount; restore from localStorage when session was lost (e.g. browser closed)
  useEffect(() => {
    const checkExistingAuth = () => {
      let storedUser = sessionStorage.getItem('user');
      
      if (storedUser) {
        try {
          const parsedUser = JSON.parse(storedUser);
          setUser(parsedUser);
          setIsAuthenticated(true);
          setIsLoading(false);
          return;
        } catch (error) {
          console.error('Error parsing stored user:', error);
          sessionStorage.removeItem('user');
        }
      }
      
      // Restore client session from localStorage so user can return to chat and operator sees client-reconnected
      try {
        const clientUser = localStorage.getItem('clientUser');
        const clientSession = localStorage.getItem('clientSession');
        const data = clientUser ? JSON.parse(clientUser) : clientSession ? JSON.parse(clientSession) : null;
        if (data && (data.id || data.clientId) && (data.name || data.clientName) && (data.number || data.clientNumber)) {
          const id = data.id || data.clientId;
          const name = data.name || data.clientName;
          const number = data.number || data.clientNumber;
          const police = data.police || data.clientPolice || '';
          const user = { id, name, number, police, role: 'client' };
          sessionStorage.setItem('user', JSON.stringify(user));
          sessionStorage.setItem('clientId', id);
          sessionStorage.setItem('clientName', name);
          sessionStorage.setItem('clientNumber', number);
          sessionStorage.setItem('clientPolice', police);
          setUser(user);
          setIsAuthenticated(true);
        }
      } catch (e) {
        console.warn('Could not restore client session from localStorage', e);
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
    
    if (sessionStorage.getItem('operatorName')) {
      const { clearOperatorData } = require('../services/socket/operatorSocket');
      clearOperatorData();
    }
    
    if (sessionStorage.getItem('clientName')) {
      sessionStorage.removeItem('clientName');
      sessionStorage.removeItem('clientNumber');
      sessionStorage.removeItem('clientId');
      sessionStorage.removeItem('clientPolice');
      sessionStorage.removeItem('clientActiveOperator');
      sessionStorage.removeItem('clientMessages');
      try {
        localStorage.removeItem('clientSession');
        localStorage.removeItem('clientUser');
      } catch (e) {}
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