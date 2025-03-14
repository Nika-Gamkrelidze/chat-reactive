import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { initOperatorSocket, setSessionHandler } from '../../services/socket/operatorSocket';

function OperatorLogin() {
  const [username, setUsername] = useState('');
  const [number, setNumber] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    try {
      // Set up session handler before initializing socket
      setSessionHandler((sessionData) => {
        console.log('Session data received:', sessionData);
        
        // Store operator data in session storage
        sessionStorage.setItem('operatorName', username);
        sessionStorage.setItem('operatorNumber', number);
        
        if (sessionData && sessionData.operatorId) {
          sessionStorage.setItem('operatorId', sessionData.operatorId);
        }
        
        // Update auth context
        login({
          name: username,
          number: number,
          type: 'operator',
          operatorId: sessionData.operatorId
        });
        
        // Navigate to dashboard
        navigate('/operator/dashboard');
      });
      
      // Initialize socket connection
      const socket = initOperatorSocket(username, number);
      
      // Handle connection error
      socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        setError('Failed to connect: ' + error.message);
        setIsLoading(false);
      });
      
    } catch (error) {
      console.error('Login error:', error);
      setError('Failed to connect. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-secondary-50 to-primary-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-soft p-8">
        <h2 className="text-2xl font-bold text-center mb-6 text-gray-800">
          Operator Login
        </h2>
        
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
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-secondary-400 focus:border-transparent transition-all outline-none"
              placeholder="Enter your username"
              required
              disabled={isLoading}
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="number" className="block text-sm font-medium text-gray-700">
              Number
            </label>
            <input
              type="text"
              id="number"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-secondary-400 focus:border-transparent transition-all outline-none"
              placeholder="Enter your number"
              required
              disabled={isLoading}
            />
          </div>
          
          <button
            type="submit"
            className="w-full bg-gradient-to-r from-secondary-500 to-secondary-600 hover:from-secondary-600 hover:to-secondary-700 text-white font-medium py-2.5 px-4 rounded-lg transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] shadow-sm"
            disabled={isLoading}
          >
            {isLoading ? 'Connecting...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default OperatorLogin; 