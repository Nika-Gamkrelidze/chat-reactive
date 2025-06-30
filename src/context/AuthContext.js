import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Helper function to get the appropriate localStorage key based on user role
  const getUserStorageKey = (role) => {
    return role === 'operator' ? 'operatorUser' : 'clientUser';
  };
  
  // Check for existing user on mount
  useEffect(() => {
    // Check if we have user data in local storage
    const checkExistingAuth = () => {
      // Check for operator user first
      const operatorUser = localStorage.getItem('operatorUser');
      if (operatorUser) {
        try {
          const parsedUser = JSON.parse(operatorUser);
          if (parsedUser.role === 'operator') {
            setUser(parsedUser);
            setIsAuthenticated(true);
            setIsLoading(false);
            return;
          }
        } catch (error) {
          console.error('Error parsing stored operator user:', error);
          localStorage.removeItem('operatorUser');
        }
      }
      
      // Check for client user
      const clientUser = localStorage.getItem('clientUser');
      if (clientUser) {
        try {
          const parsedUser = JSON.parse(clientUser);
          if (parsedUser.role === 'client') {
            setUser(parsedUser);
            setIsAuthenticated(true);
            setIsLoading(false);
            return;
          }
        } catch (error) {
          console.error('Error parsing stored client user:', error);
          localStorage.removeItem('clientUser');
        }
      }
      
      // Fallback: check legacy 'user' key for backward compatibility
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        try {
          const parsedUser = JSON.parse(storedUser);
          setUser(parsedUser);
          setIsAuthenticated(true);
          // Migrate to new storage format
          const storageKey = getUserStorageKey(parsedUser.role);
          localStorage.setItem(storageKey, storedUser);
          localStorage.removeItem('user'); // Remove legacy key
        } catch (error) {
          console.error('Error parsing stored user:', error);
          localStorage.removeItem('user');
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
    const storageKey = getUserStorageKey(userData.role);
    localStorage.setItem(storageKey, JSON.stringify(userData));
    
    // Remove the legacy 'user' key if it exists to prevent conflicts
    localStorage.removeItem('user');
  };
  
  // Logout function
  const logout = () => {
    const currentUserRole = user?.role;
    setUser(null);
    setIsAuthenticated(false);
    
    // Remove role-specific storage
    if (currentUserRole) {
      const storageKey = getUserStorageKey(currentUserRole);
      localStorage.removeItem(storageKey);
    }
    
    // Remove legacy storage
    localStorage.removeItem('user');
    
    // Clear operator/client specific data
    if (currentUserRole === 'operator' || localStorage.getItem('operatorName')) {
      // Use the clearAll method from operatorStorage
      const { clearOperatorData } = require('../services/socket/operatorSocket');
      clearOperatorData();
    }
    
    if (currentUserRole === 'client' || localStorage.getItem('clientName')) {
      localStorage.removeItem('clientName');
      localStorage.removeItem('clientNumber');
      localStorage.removeItem('clientId');
      localStorage.removeItem('clientActiveOperator');
      localStorage.removeItem('clientMessages');
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