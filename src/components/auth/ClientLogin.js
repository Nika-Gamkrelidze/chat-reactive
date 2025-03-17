import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { initClientSocket, setClientSessionHandler, isSocketConnected } from '../../services/socket/clientSocket';

function ClientLogin() {
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionReceived, setSessionReceived] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();
  
  useEffect(() => {
    // Check if already logged in
    const clientName = sessionStorage.getItem('clientName');
    const clientNumber = sessionStorage.getItem('clientNumber');
    const storedUser = sessionStorage.getItem('user');
    
    if (clientName && clientNumber && storedUser) {
      try {
        const user = JSON.parse(storedUser);
        if (user && user.role === 'client') {
          navigate('/client/chat', { replace: true });
        }
      } catch (error) {
        console.error('Error parsing stored user:', error);
      }
    }
  }, [navigate]);
  
  // Handle navigation after session is received
  useEffect(() => {
    if (sessionReceived) {
      navigate('/client/chat', { replace: true });
    }
  }, [sessionReceived, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    try {
      // Set up session handler before initializing socket
      setClientSessionHandler((sessionData) => {
        console.log('Session data received:', sessionData);
        
        // Store client data in session storage
        if (sessionData.client) {
          sessionStorage.setItem('clientId', sessionData.client.id);
          sessionStorage.setItem('clientName', name);
          sessionStorage.setItem('clientNumber', number);
          
          // Login in auth context with correct role
          login({
            id: sessionData.client.id,
            name: name,
            number: number,
            role: 'client'
          });
          
          console.log('Session received, will navigate to chat...');
          setSessionReceived(true);
        }
      });
      
      // Check if socket is already connected
      if (!isSocketConnected()) {
        // Only initialize if not connected
        initClientSocket(name, number);
      }
      
    } catch (error) {
      console.error('Login error:', error);
      setError('Failed to connect. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-soft p-8">
        <h1 className="text-2xl font-bold text-center text-gray-800 mb-6">მომხმარებლის შესვლა</h1>
        
        {error && (
          <div className="bg-red-100 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
            {error === 'Failed to connect. Please try again.' ? 
              'დაკავშირება ვერ მოხერხდა. გთხოვთ სცადოთ ხელახლა.' : error}
          </div>
        )}
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              სახელი
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-all outline-none"
              placeholder="შეიყვანეთ თქვენი სახელი"
              required
              disabled={isLoading}
            />
          </div>
          
          <div className="mb-6">
            <label htmlFor="number" className="block text-sm font-medium text-gray-700 mb-1">
              ნომერი
            </label>
            <input
              type="text"
              id="number"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-all outline-none"
              placeholder="შეიყვანეთ თქვენი ნომერი"
              required
              disabled={isLoading}
            />
          </div>
          
          <button
            type="submit"
            className="w-full bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-medium py-2.5 px-4 rounded-lg transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] shadow-sm"
            disabled={isLoading}
          >
            {isLoading ? 'დაკავშირება...' : 'ჩათის დაწყება'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default ClientLogin; 