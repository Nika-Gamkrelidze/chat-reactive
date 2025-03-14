import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { initOperatorSocket } from '../../services/socket/operatorSocket';

function OperatorLogin() {
  const [username, setUsername] = useState('');
  const [number, setNumber] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    // Check if operator is already registered in session
    const operatorName = sessionStorage.getItem('operatorName');
    const operatorNumber = sessionStorage.getItem('operatorNumber');
    
    if (operatorName && operatorNumber) {
      navigate('/operator/dashboard');
    }
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      // Attempt socket connection
      const socket = await initOperatorSocket(username, number);
      
      if (socket) {
        // Set up a one-time listener for session confirmation
        socket.once('session', (sessionData) => {
          if (sessionData.operatorId) {
            // Store operator details in session storage
            sessionStorage.setItem('operatorId', sessionData.operatorId);
            sessionStorage.setItem('operatorName', sessionData.name);
            sessionStorage.setItem('operatorNumber', sessionData.number);

            // Log in and redirect
            login({ 
              name: sessionData.name, 
              number: sessionData.number, 
              id: sessionData.operatorId 
            }, 'operator');
            
            navigate('/operator/dashboard');
          }
        });
      }
    } catch (err) {
      setError('Login failed. Please check your credentials.');
      console.error('Login error:', err);
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
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-secondary-400 focus:border-transparent transition-all outline-none"
              placeholder="Enter your username"
              required
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