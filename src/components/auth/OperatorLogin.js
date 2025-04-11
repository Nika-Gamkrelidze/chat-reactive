import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { initOperatorSocket, setSessionHandler } from '../../services/socket/operatorSocket';

function OperatorLogin() {
  const [username, setUsername] = useState('');
  const [number, setNumber] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionReceived, setSessionReceived] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  
  const attemptLogin = useCallback(async (loginName, loginNumber) => {
    setError('');
    setIsLoading(true);
    setSessionReceived(false);

    try {
      setSessionHandler((sessionData) => {
        console.log('Session data received:', sessionData);

        const { operator } = sessionData;

        if (operator && operator.id) {
          sessionStorage.setItem('operatorId', operator.id);
          sessionStorage.setItem('operatorName', operator.name || loginName);
          sessionStorage.setItem('operatorNumber', operator.number || loginNumber);

          login({
            id: operator.id,
            name: operator.name || loginName,
            number: operator.number || loginNumber,
            role: 'operator'
          });

          console.log('Session received, will navigate to dashboard...');

          setSessionReceived(true);
        } else {
          console.error('Session received but operator data is missing or invalid.');
          setError('Login failed: Invalid session data received.');
          setIsLoading(false);
          sessionStorage.removeItem('operatorId');
          sessionStorage.removeItem('operatorName');
          sessionStorage.removeItem('operatorNumber');
          sessionStorage.removeItem('user');
        }
      });

      console.log(`Attempting to login with name: ${loginName}, number: ${loginNumber}`);
      initOperatorSocket(loginName, loginNumber);

    } catch (error) {
      console.error('Login error during attemptLogin:', error);
      setError('Failed to connect. Please try again later.');
      setIsLoading(false);
    }
  }, [login]);

  useEffect(() => {
    const storedOperatorName = sessionStorage.getItem('operatorName');
    const storedOperatorNumber = sessionStorage.getItem('operatorNumber');
    const storedUser = sessionStorage.getItem('user');

    if (storedOperatorName && storedOperatorNumber && storedUser) {
      try {
        const user = JSON.parse(storedUser);
        if (user && user.role === 'operator') {
          console.log('Already logged in via sessionStorage, navigating to dashboard.');
          navigate('/operator/dashboard', { replace: true });
          return;
        }
      } catch (error) {
        console.error('Error parsing stored user:', error);
        sessionStorage.removeItem('operatorName');
        sessionStorage.removeItem('operatorNumber');
        sessionStorage.removeItem('user');
      }
    }

    const queryParams = new URLSearchParams(location.search);
    const nameFromUrl = queryParams.get('name');
    const numberFromUrl = queryParams.get('number');

    if (nameFromUrl && numberFromUrl && !isLoading) {
      console.log('Found name and number in URL, attempting auto-login.');
      setUsername(nameFromUrl);
      setNumber(numberFromUrl);
      attemptLogin(nameFromUrl, numberFromUrl);
    }
  }, [navigate, location.search, attemptLogin, isLoading]);

  useEffect(() => {
    if (sessionReceived) {
      console.log('Session received flag is true, navigating to dashboard.');
      navigate('/operator/dashboard', { replace: true });
    }
  }, [sessionReceived, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isLoading) {
      attemptLogin(username, number);
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