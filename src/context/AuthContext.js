import React, { createContext, useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Check authentication on app load
    const checkAuth = () => {
      const clientName = sessionStorage.getItem('clientName');
      const clientNumber = sessionStorage.getItem('clientNumber');
      const operatorName = sessionStorage.getItem('operatorName');
      const operatorNumber = sessionStorage.getItem('operatorNumber');

      if (clientName && clientNumber) {
        setUser({ type: 'client', name: clientName, number: clientNumber });
      } else if (operatorName && operatorNumber) {
        setUser({ type: 'operator', name: operatorName, number: operatorNumber });
      }
    };

    checkAuth();
  }, []);

  const login = (userData, type) => {
    if (type === 'client') {
      setUser({ type: 'client', ...userData });
      navigate('/client/chat');
    } else if (type === 'operator') {
      setUser({ type: 'operator', ...userData });
      navigate('/operator/dashboard');
    }
  };

  const logout = () => {
    sessionStorage.clear();
    setUser(null);
    navigate('/');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}; 