import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { initClientSocket, isClientRegistered } from '../services/clientSocket';
import './ClientLogin.css';

function ClientLogin() {
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!sessionStorage.getItem('clientName')) {
      const checkRegistration = async () => {
        const isRegistered = await isClientRegistered();
        if (isRegistered) {
          navigate('/client/chat', { replace: true });
        }
      };
      checkRegistration();
    }
  }, [navigate]); // Add navigate to dependencies

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const socket = await initClientSocket(name, number);
      
      if (socket) {
        // Wait for socket connection before navigating
        socket.on('connect', () => {
          navigate('/client/chat', { replace: true });
        });
      }
    } catch (error) {
      setError('Failed to connect. Please try again.');
      console.error('Login error:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-secondary-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-soft p-8">
        <h2 className="text-2xl font-bold text-center mb-6 text-gray-800">
          Client Login
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm text-center">
              {error}
            </div>
          )}
          
          <div className="space-y-2">
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
              Name
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-all outline-none"
              placeholder="Enter your name"
              required
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="number" className="block text-sm font-medium text-gray-700">
              Phone Number
            </label>
            <input
              type="text"
              id="number"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-all outline-none"
              placeholder="Enter your phone number"
              required
            />
          </div>
          
          <button
            type="submit"
            className="w-full bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-medium py-2.5 px-4 rounded-lg transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] shadow-sm"
          >
            Start Chat
          </button>
        </form>
      </div>
    </div>
  );
}

export default ClientLogin; 