import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { initOperatorSocket, setSessionHandler } from '../../services/socket/operatorSocket';

function OperatorLogin() {
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionReceived, setSessionReceived] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  
  const attemptLogin = useCallback(async (loginName, loginNumber, operatorId = null) => {
    setError('');
    setIsLoading(true);
    setSessionReceived(false);

    try {
      setSessionHandler((sessionData) => {
        console.log('Session data received:', sessionData);

        const { operator } = sessionData;

        if (operator && operator.id) {
          localStorage.setItem('operatorId', operator.id);
          localStorage.setItem('operatorName', operator.name || loginName);
          localStorage.setItem('operatorNumber', operator.number || loginNumber);

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
          localStorage.removeItem('operatorId');
          localStorage.removeItem('operatorName');
          localStorage.removeItem('operatorNumber');
          localStorage.removeItem('operatorUser');
          localStorage.removeItem('user');
        }
      });

      console.log(`Attempting to login with name: ${loginName}, number: ${loginNumber}`);
      initOperatorSocket(loginName, loginNumber, operatorId);

    } catch (error) {
      console.error('Login error during attemptLogin:', error);
      setError('Failed to connect. Please try again later.');
      setIsLoading(false);
    }
  }, [login]);

  useEffect(() => {
    const storedOperatorName = localStorage.getItem('operatorName');
    const storedOperatorNumber = localStorage.getItem('operatorNumber');
    const storedUser = localStorage.getItem('operatorUser') || localStorage.getItem('user');

    if (storedOperatorName && storedOperatorNumber && storedUser) {
      try {
        const user = JSON.parse(storedUser);
        if (user && user.role === 'operator') {
          console.log('Already logged in via localStorage, navigating to dashboard.');
          navigate('/operator/dashboard', { replace: true });
          return;
        }
      } catch (error) {
        console.error('Error parsing stored user:', error);
        localStorage.removeItem('operatorName');
        localStorage.removeItem('operatorNumber');
        localStorage.removeItem('operatorUser');
        localStorage.removeItem('user');
      }
    }

    const queryParams = new URLSearchParams(location.search);
    const nameFromUrl = queryParams.get('name');
    const numberFromUrl = queryParams.get('number');
    const operatorIdFromUrl = queryParams.get('operatorId');

    if (nameFromUrl && numberFromUrl && !isLoading) {
      console.log('Found name and number in URL, attempting auto-login.');
      attemptLogin(nameFromUrl, numberFromUrl, operatorIdFromUrl);
    }
  }, [navigate, location.search, attemptLogin, isLoading]);

  useEffect(() => {
    if (sessionReceived) {
      console.log('Session received flag is true, navigating to dashboard.');
      navigate('/operator/dashboard', { replace: true });
    }
  }, [sessionReceived, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-secondary-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-soft p-8 text-center">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">გთხოვთ გადადით ჩათის სტატუსზე</h1>
        
        {error && (
          <div className="bg-red-100 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
            {error === 'Failed to connect. Please try again later.' ? 
              'დაკავშირება ვერ მოხერხდა. გთხოვთ სცადოთ მოგვიანებით.' : error}
          </div>
        )}

        {isLoading ? (
          <div className="text-gray-600 text-lg">
            დაკავშირება...
          </div>
        ) : (
          !error && (
            <div className="text-red-700 text-xl font-medium my-8 ">
              ჩათიდან გასული ხართ
            </div>
          )
        )}
      </div>
    </div>
  );
}

export default OperatorLogin; 