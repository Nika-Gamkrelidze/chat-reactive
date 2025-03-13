import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { initOperatorSocket, isOperatorRegistered } from '../services/operatorSocket';
import './OperatorLogin.css';

function OperatorLogin() {
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    // Only check registration if we don't have credentials in session storage
    if (!sessionStorage.getItem('operatorName')) {
      const checkRegistration = async () => {
        const isRegistered = await isOperatorRegistered();
        if (isRegistered) {
          navigate('/operator/dashboard', { replace: true });
        }
      };
      checkRegistration();
    }
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!name.trim() || !number.trim()) {
      setError('Please enter both name and number');
      return;
    }

    try {
      // Store credentials first
      sessionStorage.setItem('operatorName', name);
      sessionStorage.setItem('operatorNumber', number);
      
      // Initialize socket connection
      const socket = initOperatorSocket(name, number);
      
      if (socket) {
        // Wait for socket to connect before navigating
        socket.on('connect', () => {
          navigate('/operator/dashboard', { replace: true });
        });
        
        socket.connect();
      } else {
        setError('Failed to create socket connection');
        sessionStorage.removeItem('operatorName');
        sessionStorage.removeItem('operatorNumber');
      }
    } catch (error) {
      console.error('Login error:', error);
      setError('Failed to connect to chat server');
      sessionStorage.removeItem('operatorName');
      sessionStorage.removeItem('operatorNumber');
    }
  };

  return (
    <div className="operator-login-container">
      <div className="login-form-container">
        <h2>Operator Login</h2>
        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="error-message">{error}</div>}
          
          <div className="form-group">
            <label htmlFor="name">Name</label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="number">Phone Number</label>
            <input
              type="text"
              id="number"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="Enter your phone number"
              required
            />
          </div>
          
          <button type="submit" className="login-button">
            Login as Operator
          </button>
        </form>
      </div>
    </div>
  );
}

export default OperatorLogin; 