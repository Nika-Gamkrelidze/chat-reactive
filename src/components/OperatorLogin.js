import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { initOperatorSocket, isOperatorRegistered } from '../services/operatorSocket';
import './OperatorLogin.css';

function OperatorLogin() {
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    // Only check registration if we don't have credentials in session storage
    if (!sessionStorage.getItem('operatorName')) {
      const checkRegistration = async () => {
        const isRegistered = await isOperatorRegistered();
        if (isRegistered) {
          navigate('/operator/dashboard', { replace: true });
        }
      };
      checkRegistration();
    }
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!name.trim() || !number.trim()) {
      setError('Please enter both name and number');
      return;
    }

    try {
      // Store credentials first
      sessionStorage.setItem('operatorName', name);
      sessionStorage.setItem('operatorNumber', number);
      
      // Initialize socket connection
      const socket = initOperatorSocket(name, number);
      
      if (socket) {
        // Wait for socket to connect before navigating
        socket.on('connect', () => {
          navigate('/operator/dashboard', { replace: true });
        });
        
        socket.connect();
      } else {
        setError('Failed to create socket connection');
        sessionStorage.removeItem('operatorName');
        sessionStorage.removeItem('operatorNumber');
      }
    } catch (error) {
      console.error('Login error:', error);
      setError('Failed to connect to chat server');
      sessionStorage.removeItem('operatorName');
      sessionStorage.removeItem('operatorNumber');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-secondary-50 to-primary-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-soft p-8">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Operator Login</h2>
          <p className="text-gray-500">Access your support dashboard</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm text-center">
              {error}
            </div>
          )}
          
          <div className="space-y-2">
            <label htmlFor="username" className="block text-sm font-medium text-gray-700">
              Username
            </label>
            <input
              type="text"
              id="username"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-secondary-400 focus:border-transparent transition-all outline-none"
              placeholder="Enter your username"
              required
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              type="text"
              id="password"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-secondary-400 focus:border-transparent transition-all outline-none"
              placeholder="Enter your password"
              required
            />
          </div>
          
          <button
            type="submit"
            className="w-full bg-gradient-to-r from-secondary-500 to-secondary-600 hover:from-secondary-600 hover:to-secondary-700 text-white font-medium py-2.5 px-4 rounded-lg transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] shadow-sm"
          >
            Login
          </button>
        </form>
      </div>
    </div>
  );
}

export default OperatorLogin; 