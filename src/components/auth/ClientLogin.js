import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { FaUser, FaPhone, FaRegCommentDots } from 'react-icons/fa';

function ClientLogin() {
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [generalError, setGeneralError] = useState('');
  const [inputErrors, setInputErrors] = useState({ name: '', number: '' });
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  
  useEffect(() => {
    const storedClientName = localStorage.getItem('clientName');
    const storedClientNumber = localStorage.getItem('clientNumber');
    const storedUser = localStorage.getItem('clientUser') || localStorage.getItem('user');
    
    if (storedClientName && storedClientNumber && storedUser) {
      try {
        const user = JSON.parse(storedUser);
        if (user && user.role === 'client') {
          console.log('Client already logged in via localStorage, navigating to chat.');
          navigate('/client/chat', { replace: true });
          return;
        }
      } catch (parseError) {
        console.error('Error parsing stored user for client:', parseError);
        localStorage.removeItem('clientName');
        localStorage.removeItem('clientNumber');
        localStorage.removeItem('clientUser');
        localStorage.removeItem('user');
        localStorage.removeItem('clientId');
        localStorage.removeItem('hasConnectedToOperator');
      }
    }

    const queryParams = new URLSearchParams(location.search);
    const nameFromUrl = queryParams.get('name');
    const numberFromUrl = queryParams.get('number');

    if (nameFromUrl && numberFromUrl) {
      console.log('Found client name and number in URL, pre-filling form.');
      setName(nameFromUrl);
      setNumber(numberFromUrl);
    }
  }, [navigate, location.search]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setGeneralError('');
    
    let currentInputErrors = { name: '', number: '' };
    let hasErrors = false;

    if (name.trim().length < 2) {
      currentInputErrors.name = 'სახელი უნდა შეიცავდეს მინიმუმ 2 სიმბოლოს.';
      hasErrors = true;
    }
    const phoneRegex = /^5\d{8}$/;
    if (!phoneRegex.test(number)) {
      currentInputErrors.number = 'ტელეფონის ნომერი უნდა იწყებოდეს 5-ით და შეიცავდეს 9 ციფრს.';
      hasErrors = true;
    }

    setInputErrors(currentInputErrors);

    if (hasErrors) {
      return;
    }

    setIsLoading(true);
    
    try {
      // Store client credentials
      localStorage.setItem('clientName', name);
      localStorage.setItem('clientNumber', number);
      
      // Create user object and store it
      const user = {
        name: name,
        number: number,
        role: 'client'
      };
      
      localStorage.setItem('clientUser', JSON.stringify(user));
      localStorage.setItem('user', JSON.stringify(user));
      
      // Login to auth context
      login(user);
      
      console.log('Client credentials stored, navigating to chat.');
      navigate('/client/chat', { replace: true });
      
    } catch (err) {
      console.error('Login error:', err);
      setGeneralError('Failed to login. Please try again.');
      setIsLoading(false);
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
          {generalError && (
            <div className="bg-red-100 border border-red-200 text-red-700 px-3 py-2 rounded-lg mb-3 text-sm">
              {generalError}
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-3" noValidate>
            <div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <FaUser className="text-gray-400" />
                </div>
                <input
                  type="text"
                  id="name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setInputErrors(prev => ({ ...prev, name: '' }));
                  }}
                  className={`w-full pl-10 pr-3 py-2 border ${inputErrors.name ? 'border-red-500' : 'border-gray-300'} rounded-lg focus:ring-1 ${inputErrors.name ? 'focus:ring-red-500 focus:border-red-500' : 'focus:ring-primary-400 focus:border-primary-400'} transition-all outline-none text-sm`}
                  placeholder="სახელი"
                  disabled={isLoading}
                  aria-invalid={!!inputErrors.name}
                  aria-describedby="name-error"
                />
              </div>
              {inputErrors.name && <p id="name-error" className="text-red-500 text-xs mt-1 ml-1">{inputErrors.name}</p>}
            </div>
            
            <div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <FaPhone className="text-gray-400" />
                </div>
                <input
                  type="text"
                  id="number"
                  value={number}
                  onChange={(e) => {
                    setNumber(e.target.value);
                    setInputErrors(prev => ({ ...prev, number: '' }));
                  }}
                  className={`w-full pl-10 pr-3 py-2 border ${inputErrors.number ? 'border-red-500' : 'border-gray-300'} rounded-lg focus:ring-1 ${inputErrors.number ? 'focus:ring-red-500 focus:border-red-500' : 'focus:ring-primary-400 focus:border-primary-400'} transition-all outline-none text-sm`}
                  placeholder="ტელეფონის ნომერი"
                  disabled={isLoading}
                  aria-invalid={!!inputErrors.number}
                  aria-describedby="number-error"
                />
              </div>
              {inputErrors.number && <p id="number-error" className="text-red-500 text-xs mt-1 ml-1">{inputErrors.number}</p>}
            </div>
            
            <button
              type="submit"
              className="w-full bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-medium py-2.5 px-4 rounded-lg transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] shadow-sm text-sm pt-5"
              disabled={isLoading}
            >
              {isLoading ? 'დაკავშირება...' : 'ჩატის დაწყება'}
            </button>
          </form>
        </div>

        <div className="text-center text-xs text-gray-500 pt-4 mt-auto">
          © 2024 Created with <span role="img" aria-label="heart">♥</span> by CommuniQ
        </div>
      </div>
    </div>
  );
}

export default ClientLogin; 