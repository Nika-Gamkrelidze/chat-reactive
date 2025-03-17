import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { initOperatorSocket, setSessionHandler } from '../../services/socket/operatorSocket';

function OperatorLogin() {
  const [username, setUsername] = useState('');
  const [number, setNumber] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionReceived, setSessionReceived] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();
  
  useEffect(() => {
    // Check if already logged in
    const operatorName = sessionStorage.getItem('operatorName');
    const operatorNumber = sessionStorage.getItem('operatorNumber');
    const storedUser = sessionStorage.getItem('user');
    
    if (operatorName && operatorNumber && storedUser) {
      try {
        const user = JSON.parse(storedUser);
        if (user && user.role === 'operator') {
          navigate('/operator/dashboard', { replace: true });
        }
      } catch (error) {
        console.error('Error parsing stored user:', error);
      }
    }
  }, [navigate]);
  
  // Handle navigation after session is received
  useEffect(() => {
    if (sessionReceived) {
      navigate('/operator/dashboard', { replace: true });
    }
  }, [sessionReceived, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    try {
      // Set up session handler before initializing socket
      setSessionHandler((sessionData) => {
        console.log('Session data received:', sessionData);
        
        // Store operator data in session storage - handle flattened structure
        if (sessionData.operatorId) {
          sessionStorage.setItem('operatorId', sessionData.operatorId);
          sessionStorage.setItem('operatorName', sessionData.name || username);
          sessionStorage.setItem('operatorNumber', sessionData.number || number);
          
          // Login in auth context with correct role
          login({
            id: sessionData.operatorId,
            name: sessionData.name || username,
            number: sessionData.number || number,
            role: 'operator'
          });
          
          console.log('Session received, will navigate to dashboard...');
          
          // Set state to trigger navigation in the useEffect
          setSessionReceived(true);
        }
      });
      
      // Initialize socket connection
      initOperatorSocket(username, number);
      
      // Note: We don't navigate here - we wait for the session event
    } catch (error) {
      console.error('Login error:', error);
      setError('Failed to connect. Please try again later.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-secondary-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-soft p-8">
        <h1 className="text-2xl font-bold text-center text-gray-800 mb-6">ოპერატორის შესვლა</h1>
        
        {error && (
          <div className="bg-red-100 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
            {error === 'Failed to connect. Please try again later.' ? 
              'დაკავშირება ვერ მოხერხდა. გთხოვთ სცადოთ მოგვიანებით.' : error}
          </div>
        )}
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
              სახელი
            </label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-secondary-400 focus:border-transparent transition-all outline-none"
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
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-secondary-400 focus:border-transparent transition-all outline-none"
              placeholder="შეიყვანეთ თქვენი ნომერი"
              required
              disabled={isLoading}
            />
          </div>
          
          <button
            type="submit"
            className="w-full bg-gradient-to-r from-secondary-500 to-secondary-600 hover:from-secondary-600 hover:to-secondary-700 text-white font-medium py-2.5 px-4 rounded-lg transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] shadow-sm"
            disabled={isLoading}
          >
            {isLoading ? 'დაკავშირება...' : 'შესვლა'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default OperatorLogin; 