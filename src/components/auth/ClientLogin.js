import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { initClientSocket, setClientSessionHandler, isSocketConnected } from '../../services/socket/clientSocket';

function ClientLogin() {
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [police, setPolice] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionReceived, setSessionReceived] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  
  const attemptLogin = useCallback(async (loginName, loginNumber, loginPolice) => {
    setError('');
    setIsLoading(true);
    setSessionReceived(false);
    
    try {
      setClientSessionHandler((sessionData) => {
        console.log('Client session data received:', sessionData);
        
        if (sessionData.client) {
          sessionStorage.setItem('clientId', sessionData.client.id);
          sessionStorage.setItem('clientName', loginName);
          sessionStorage.setItem('clientNumber', loginNumber);
          sessionStorage.setItem('clientPolice', loginPolice);
          
          login({
            id: sessionData.client.id,
            name: loginName,
            number: loginNumber,
            police: loginPolice,
            role: 'client'
          });
          
          console.log('Session received, setting state to navigate to chat...');
          setSessionReceived(true);
        } else {
          console.error('Session received but client data is missing or invalid.');
          setError('Login failed: Invalid session data received.');
          setIsLoading(false);
          sessionStorage.removeItem('clientId');
          sessionStorage.removeItem('clientName');
          sessionStorage.removeItem('clientNumber');
          sessionStorage.removeItem('clientPolice');
          sessionStorage.removeItem('user');
        }
      });
      
      console.log(`Attempting to login client with name: ${loginName}, number: ${loginNumber}, police: ${loginPolice}`);
      initClientSocket(loginName, loginNumber, loginPolice);
      
    } catch (err) {
      console.error('Login error during client attemptLogin:', err);
      setError('Failed to connect. Please try again.');
      setIsLoading(false);
    }
  }, [login]);

  useEffect(() => {
    const storedClientName = sessionStorage.getItem('clientName');
    const storedClientNumber = sessionStorage.getItem('clientNumber');
    const storedClientPolice = sessionStorage.getItem('clientPolice');
    const storedUser = sessionStorage.getItem('user');
    
    if (storedClientName && storedClientNumber && storedClientPolice && storedUser) {
      try {
        const user = JSON.parse(storedUser);
        if (user && user.role === 'client') {
          console.log('Client already logged in via sessionStorage, navigating to chat.');
          navigate('/client/chat', { replace: true });
          return;
        }
      } catch (parseError) {
        console.error('Error parsing stored user for client:', parseError);
        sessionStorage.removeItem('clientName');
        sessionStorage.removeItem('clientNumber');
        sessionStorage.removeItem('clientPolice');
        sessionStorage.removeItem('user');
        sessionStorage.removeItem('clientId');
      }
    }

    const queryParams = new URLSearchParams(location.search);
    const nameFromUrl = queryParams.get('name');
    const numberFromUrl = queryParams.get('number');
    const policeFromUrl = queryParams.get('police');

    if (nameFromUrl && numberFromUrl && policeFromUrl && !isLoading) {
      console.log('Found client name, number, and police in URL, attempting auto-login.');
      setName(nameFromUrl);
      setNumber(numberFromUrl);
      setPolice(policeFromUrl);
      attemptLogin(nameFromUrl, numberFromUrl, policeFromUrl);
    }
  }, [navigate, location.search, isLoading, attemptLogin]);
  
  useEffect(() => {
    if (sessionReceived) {
      console.log('Session received flag is true, navigating to client chat.');
      navigate('/client/chat', { replace: true });
    }
  }, [sessionReceived, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isLoading) {
      attemptLogin(name, number, police);
    }
  };

  return (
    <div className="">
      <div className="w-full min-h-screen bg-white shadow-soft p-8">
        
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
          
          <div className="mb-4">
            <label htmlFor="police" className="block text-sm font-medium text-gray-700 mb-1">
              პოლისის ნომერი
            </label>
            <input
              type="text"
              id="police"
              value={police}
              onChange={(e) => setPolice(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-all outline-none"
              placeholder="შეიყვანეთ პოლისის ნომერი"
              required
              disabled={isLoading}
            />
          </div>
          
          <div className="mb-6">
            <label htmlFor="number" className="block text-sm font-medium text-gray-700 mb-1">
              ტელეფონის ნომერი
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