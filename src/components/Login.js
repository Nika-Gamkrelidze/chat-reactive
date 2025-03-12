import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { initSocket } from '../services/socket';

const Login = () => {
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!name.trim() || !number.trim()) {
      setError('Please enter both username and mobile number');
      return;
    }

    try {
      const socket = initSocket(name, number);
      
      socket.on('connect', () => {
        console.log('Connected to server');
      });
      
      socket.on('connect_error', (err) => {
        console.error('Connection error:', err.message);
        setError('Failed to connect to the server. Please try again.');
      });
      
      socket.on('session', () => {
        navigate('/chat');
      });
      
    } catch (err) {
      console.error('Error initializing socket:', err);
      setError('An error occurred. Please try again.');
    }
  };

  return (
    <div className="login-container">
      <h1>Chat Login</h1>
      {error && <div className="error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="name">Username</label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your username"
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="number">Mobile Number</label>
          <input
            type="tel"
            id="number"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="Enter your mobile number"
            required
          />
        </div>
        <button type="submit" className="login-btn">Login</button>
      </form>
    </div>
  );
};

export default Login; 