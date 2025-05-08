import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { initClientSocket, setClientSessionHandler } from '../../services/socket/clientSocket';
import { FaUser, FaShieldAlt, FaPhone, FaRegCommentDots } from 'react-icons/fa';

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
    <div className="h-full w-full flex items-center justify-center">
      <div className="h-full w-full max-w-sm bg-white rounded-xl shadow-lg p-6 flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <div className="bg-gray-100 p-2.5 rounded-full mr-3 shadow-sm">
              <FaRegCommentDots size={20} className="text-gray-500" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-800">გამარჯობა</h2>
              <p className="text-xs text-gray-500">ჩვენ 24/7-ზე ხელმისაწვდომნი ვართ</p>
            </div>
          </div>
        </div>

        <div className="flex-grow flex flex-col justify-center">
          {error && (
            <div className="bg-red-100 border border-red-200 text-red-700 px-3 py-2 rounded-lg mb-3 text-sm">
              {error === 'Failed to connect. Please try again.' ? 
                'კავშირი ვერ მოხერხდა. გთხოვთ სცადოთ ხელახლა.' : 
               (error === 'Login failed: Invalid session data received.' ?
                'ავტორიზაცია ვერ მოხერხდა: მიღებულია არასწორი სესიის მონაცემები.' : error)
              }
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <FaUser className="text-gray-400" />
              </div>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-primary-400 focus:border-primary-400 transition-all outline-none text-sm"
                placeholder="სახელი"
                required
                disabled={isLoading}
              />
            </div>
            
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <FaShieldAlt className="text-gray-400" />
              </div>
              <input
                type="text"
                id="police"
                value={police}
                onChange={(e) => setPolice(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-primary-400 focus:border-primary-400 transition-all outline-none text-sm"
                placeholder="პოლისის ან პირადი ნომერი"
                required
                disabled={isLoading}
              />
            </div>
            
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <FaPhone className="text-gray-400" />
              </div>
              <input
                type="text"
                id="number"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-primary-400 focus:border-primary-400 transition-all outline-none text-sm"
                placeholder="ტელეფონის ნომერი"
                required
                disabled={isLoading}
              />
            </div>
            
            <button
              type="submit"
              className="w-full bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-medium py-2.5 px-4 rounded-lg transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] shadow-sm text-sm"
              disabled={isLoading}
            >
              {isLoading ? 'დაკავშირება...' : 'ჩატის დაწყება'}
            </button>
          </form>
        </div>

        <div className="text-center text-xs text-gray-500 pt-4 mt-auto">
          © 2024 შექმნილია <span role="img" aria-label="heart">♥</span>-ით CommuniQ-ის მიერ
        </div>
      </div>
    </div>
  );
}

export default ClientLogin; 