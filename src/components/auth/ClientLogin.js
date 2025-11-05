import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { initClientSocket, setClientSessionHandler } from '../../services/socket/clientSocket';
import { workingHoursService } from '../../services/api/workingHoursService';
import WorkingHoursModal from '../common/WorkingHoursModal';
import { FaUser, FaShieldAlt, FaPhone, FaRegCommentDots } from 'react-icons/fa';

function ClientLogin() {
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [police, setPolice] = useState('');
  const [generalError, setGeneralError] = useState('');
  const [inputErrors, setInputErrors] = useState({ name: '', police: '', number: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [sessionReceived, setSessionReceived] = useState(false);
  const [showWorkingHoursModal, setShowWorkingHoursModal] = useState(false);
  const [nonWorkMessage, setNonWorkMessage] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  
  // Show working-hours modal immediately on page load if outside working hours
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const workingHours = await workingHoursService.getWorkingHours();
        const hoursCheck = workingHoursService.isWithinWorkingHours(workingHours);
        if (isMounted && !hoursCheck.isWithinHours) {
          const msg = workingHours[hoursCheck.currentDay]?.nonWorkHoursMessage;
          if (msg) setNonWorkMessage(msg);
          setShowWorkingHoursModal(true);
        }
      } catch (err) {
        // Fail silently; do not block UI if check fails
      }
    })();
    return () => { isMounted = false; };
  }, []);

  const attemptLogin = useCallback(async (loginName, loginNumber, loginPolice) => {
    setGeneralError('');
    setInputErrors({ name: '', police: '', number: '' });
    setIsLoading(true);
    setSessionReceived(false);
    
    try {
      // Check working hours before attempting socket connection
      const workingHours = await workingHoursService.getWorkingHours();
      const hoursCheck = workingHoursService.isWithinWorkingHours(workingHours);
      if (!hoursCheck.isWithinHours) {
        const msg = workingHours[hoursCheck.currentDay]?.nonWorkHoursMessage;
        if (msg) setNonWorkMessage(msg);
        setShowWorkingHoursModal(true);
        setIsLoading(false);
        return;
      }

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
          setGeneralError('Login failed: Invalid session data received.');
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
      setGeneralError('Failed to connect. Please try again.');
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
    setGeneralError('');
    
    let currentInputErrors = { name: '', police: '', number: '' };
    let hasErrors = false;

    if (name.trim().length < 2) {
      currentInputErrors.name = 'სახელი უნდა შეიცავდეს მინიმუმ 2 სიმბოლოს.';
      hasErrors = true;
    }
    if (police.trim().length < 5) {
      currentInputErrors.police = 'პოლისის ან პირადი ნომერი უნდა შეიცავდეს მინიმუმ 5 სიმბოლოს.';
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
              {/* <p className="text-xs text-gray-500">ჩათი მუშაობს 10:00-დან 18:00-მდე</p> */}
            </div>
          </div>
        </div>

        <div className="flex-grow flex flex-col justify-center">
          {generalError && (
            <div className="bg-red-100 border border-red-200 text-red-700 px-3 py-2 rounded-lg mb-3 text-sm">
              {generalError === 'Failed to connect. Please try again.' ? 
                'კავშირი ვერ მოხერხდა. გთხოვთ სცადოთ ხელახლა.' : 
               (generalError === 'Login failed: Invalid session data received.' ?
                'ავტორიზაცია ვერ მოხერხდა: მიღებულია არასწორი სესიის მონაცემები.' : generalError)
              }
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
                  <FaShieldAlt className="text-gray-400" />
                </div>
                <input
                  type="text"
                  id="police"
                  value={police}
                  onChange={(e) => {
                    setPolice(e.target.value);
                    setInputErrors(prev => ({ ...prev, police: '' }));
                  }}
                  className={`w-full pl-10 pr-3 py-2 border ${inputErrors.police ? 'border-red-500' : 'border-gray-300'} rounded-lg focus:ring-1 ${inputErrors.police ? 'focus:ring-red-500 focus:border-red-500' : 'focus:ring-primary-400 focus:border-primary-400'} transition-all outline-none text-sm`}
                  placeholder="პოლისის ან პირადი ნომერი"
                  disabled={isLoading}
                  aria-invalid={!!inputErrors.police}
                  aria-describedby="police-error"
                />
              </div>
              {inputErrors.police && <p id="police-error" className="text-red-500 text-xs mt-1 ml-1">{inputErrors.police}</p>}
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

        {/* Working Hours Modal */}
        <WorkingHoursModal
          isOpen={showWorkingHoursModal}
          onClose={() => setShowWorkingHoursModal(false)}
          message={nonWorkMessage}
        />
      </div>
    </div>
  );
}

export default ClientLogin; 