import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { initOperatorSocket, isOperatorRegistered } from '../services/operatorSocket';
import './OperatorLogin.css';

function OperatorLogin() {
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  // Check if already registered on component mount
  useEffect(() => {
    try {
      if (isOperatorRegistered()) {
        navigate('/operator/dashboard');
      }
    } catch (error) {
      console.error('Error checking operator registration:', error);
      // Don't redirect if there's an error
    }
  }, [navigate]);

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!name.trim() || !number.trim()) {
      setError('Please enter both name and number');
      return;
    }
    
    try {
      // Store credentials in session storage
      sessionStorage.setItem('operatorName', name);
      sessionStorage.setItem('operatorNumber', number);
      
      // Initialize socket connection with operator credentials
      const socket = initOperatorSocket(name, number);
      
      if (socket) {
        // Navigate to dashboard
        navigate('/operator/dashboard');
      } else {
        setError('Failed to connect to chat server');
      }
    } catch (error) {
      console.error('Error during operator login:', error);
      setError('An error occurred during login. Please try again.');
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