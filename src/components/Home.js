import React from 'react';
import { Link } from 'react-router-dom';
import './Home.css';

function Home() {
  return (
    <div className="home-container">
      <h1>Welcome to Chat Application</h1>
      <div className="home-buttons">
        <Link to="/client/login" className="home-button client-button">
          Join as Client
        </Link>
        <Link to="/operator/login" className="home-button operator-button">
          Login as Operator
        </Link>
      </div>
      <div className="settings-link-container">
        <Link to="/settings" className="settings-link">
          Server Settings
        </Link>
      </div>
    </div>
  );
}

export default Home; 