import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import config from '../config/env';
import './Settings.css';

function Settings() {
  const [serverProtocol, setServerProtocol] = useState(config.server.protocol);
  const [serverHost, setServerHost] = useState(config.server.host);
  const [serverPort, setServerPort] = useState(config.server.port.toString());
  const [namespace, setNamespace] = useState(config.server.namespace);
  const [message, setMessage] = useState('');
  const [useDevelopmentProxy, setUseDevelopmentProxy] = useState(
    localStorage.getItem('useDevelopmentProxy') === 'true'
  );
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Validate inputs
    if (!serverHost.trim() || !namespace.trim()) {
      setMessage('Please fill in all required fields');
      return;
    }
    
    // Update config
    config.server.protocol = serverProtocol;
    config.server.host = serverHost;
    config.server.port = serverPort.trim() ? parseInt(serverPort, 10) : '';
    config.server.namespace = namespace;
    
    // Save to localStorage for persistence
    localStorage.setItem('serverProtocol', serverProtocol);
    localStorage.setItem('serverHost', serverHost);
    localStorage.setItem('serverPort', serverPort);
    localStorage.setItem('serverNamespace', namespace);
    localStorage.setItem('useDevelopmentProxy', useDevelopmentProxy);
    
    setMessage('Settings saved successfully!');
    
    // Clear any existing sessions
    sessionStorage.clear();
    
    // Redirect to home after a short delay
    setTimeout(() => {
      navigate('/');
    }, 1500);
  };
  
  // Load saved settings on component mount
  useEffect(() => {
    const savedProtocol = localStorage.getItem('serverProtocol');
    const savedHost = localStorage.getItem('serverHost');
    const savedPort = localStorage.getItem('serverPort');
    const savedNamespace = localStorage.getItem('serverNamespace');
    const savedUseDevelopmentProxy = localStorage.getItem('useDevelopmentProxy');
    
    if (savedProtocol) {
      setServerProtocol(savedProtocol);
      config.server.protocol = savedProtocol;
    }
    
    if (savedHost) {
      setServerHost(savedHost);
      config.server.host = savedHost;
    }
    
    if (savedPort) {
      setServerPort(savedPort);
      config.server.port = savedPort.trim() ? parseInt(savedPort, 10) : '';
    }
    
    if (savedNamespace) {
      setNamespace(savedNamespace);
      config.server.namespace = savedNamespace;
    }
    
    if (savedUseDevelopmentProxy !== null) {
      setUseDevelopmentProxy(savedUseDevelopmentProxy === 'true');
    }
  }, []);

  return (
    <div className="settings-container">
      <div className="settings-form-container">
        <h2>Server Settings</h2>
        {message && <div className="message">{message}</div>}
        
        <form onSubmit={handleSubmit} className="settings-form">
          <div className="form-group protocol-selector">
            <label>Protocol</label>
            <div className="radio-group">
              <label className="radio-label">
                <input
                  type="radio"
                  name="protocol"
                  value="http"
                  checked={serverProtocol === 'http'}
                  onChange={() => setServerProtocol('http')}
                />
                HTTP
              </label>
              <label className="radio-label">
                <input
                  type="radio"
                  name="protocol"
                  value="https"
                  checked={serverProtocol === 'https'}
                  onChange={() => setServerProtocol('https')}
                />
                HTTPS
              </label>
            </div>
          </div>
          
          <div className="form-group">
            <label htmlFor="serverHost">Server Host</label>
            <input
              type="text"
              id="serverHost"
              value={serverHost}
              onChange={(e) => setServerHost(e.target.value)}
              placeholder="e.g., chat.communiq.ge"
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="serverPort">Server Port (leave empty for default)</label>
            <input
              type="text"
              id="serverPort"
              value={serverPort}
              onChange={(e) => setServerPort(e.target.value)}
              placeholder="e.g., 443 (leave empty for default)"
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="namespace">Namespace</label>
            <input
              type="text"
              id="namespace"
              value={namespace}
              onChange={(e) => setNamespace(e.target.value)}
              placeholder="e.g., namespace1"
              required
            />
          </div>
          
          <div className="form-group checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={useDevelopmentProxy}
                onChange={(e) => setUseDevelopmentProxy(e.target.checked)}
              />
              Use Development Proxy (localhost:3001)
            </label>
          </div>
          
          <div className="button-group">
            <button type="submit" className="save-button">
              Save Settings
            </button>
            <button 
              type="button" 
              className="cancel-button"
              onClick={() => navigate('/')}
            >
              Cancel
            </button>
          </div>
        </form>
        
        <div className="connection-info">
          <h3>Current Connection URL:</h3>
          <p>{config.server.namespaceUrl}</p>
        </div>
      </div>
    </div>
  );
}

export default Settings; 