// Operator storage for persisting data between page reloads
class OperatorStorage {
  constructor() {
    this.operatorId = null;
    this.operatorName = null;
    this.operatorNumber = null;
    this.messages = {};
    this.clients = {};
    this.loadFromStorage();
  }
  
  // Load data from local storage
  loadFromStorage() {
    try {
      const storedData = localStorage.getItem('operatorData');
      if (storedData) {
        const parsedData = JSON.parse(storedData);
        this.operatorId = parsedData.operatorId || null;
        this.operatorName = parsedData.operatorName || null;
        this.operatorNumber = parsedData.operatorNumber || null;
        this.messages = parsedData.messages || {};
        this.clients = parsedData.clients || {};
      }
      
      // Also load from individual local storage items
      const storedOperatorId = localStorage.getItem('operatorId');
      const storedOperatorName = localStorage.getItem('operatorName');
      const storedOperatorNumber = localStorage.getItem('operatorNumber');
      
      // Only use stored values if they're valid (not 'null' or 'undefined' strings)
      this.operatorId = this.operatorId || 
        ((storedOperatorId && storedOperatorId !== 'null' && storedOperatorId !== 'undefined') ? storedOperatorId : null);
      this.operatorName = this.operatorName || 
        ((storedOperatorName && storedOperatorName !== 'null' && storedOperatorName !== 'undefined') ? storedOperatorName : null);
      this.operatorNumber = this.operatorNumber || 
        ((storedOperatorNumber && storedOperatorNumber !== 'null' && storedOperatorNumber !== 'undefined') ? storedOperatorNumber : null);
    } catch (error) {
      console.error('Error loading operator data from storage:', error);
    }
  }
  
  // Save data to local storage
  saveToStorage() {
    try {
      const dataToStore = {
        operatorId: this.operatorId,
        operatorName: this.operatorName,
        operatorNumber: this.operatorNumber,
        messages: this.messages,
        clients: this.clients
      };
      
      localStorage.setItem('operatorData', JSON.stringify(dataToStore));
      
      // Also save individual items for backward compatibility, but only if they're not null
      if (this.operatorId) localStorage.setItem('operatorId', this.operatorId);
      if (this.operatorName) localStorage.setItem('operatorName', this.operatorName);
      if (this.operatorNumber) localStorage.setItem('operatorNumber', this.operatorNumber);
    } catch (error) {
      console.error('Error saving operator data to storage:', error);
    }
  }
  
  // Update storage from session data
  updateFromSession(sessionData) {
    if (sessionData.operator) {
      this.operatorId = sessionData.operator.id || this.operatorId;
      this.operatorName = sessionData.operator.name || this.operatorName;
      this.operatorNumber = sessionData.operator.number || this.operatorNumber;
    }
    
    if (sessionData.activeClients) {
      sessionData.activeClients.forEach(client => {
        if (!this.clients) {
          this.clients = {};
        }
        this.clients[client.id] = client;
      });
    }
    
    if (sessionData.messages) {
      Object.keys(sessionData.messages).forEach(clientId => {
        this.messages[clientId] = sessionData.messages[clientId];
      });
    }
    
    this.saveToStorage();
  }
  
  // Add a message to storage
  addMessage(message) {
    const clientId = message.sentByOperator ? message.receiverId : message.senderId;
    
    if (!clientId) {
      console.error('Cannot add message: missing client ID', message);
      return;
    }
    
    if (!this.messages[clientId]) {
      this.messages[clientId] = [];
    }
    
    // Check if message already exists
    const existingIndex = this.messages[clientId].findIndex(
      existingMsg => existingMsg.messageId === message.messageId
    );
    
    if (existingIndex === -1) {
      // Add new message
      const updatedClientMessages = [...this.messages[clientId], {
        ...message,
        sentByOperator: message.senderId === this.operatorId
      }].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      
      return {
        ...this.messages,
        [clientId]: updatedClientMessages
      };
    } else {
      // Update existing message
      this.messages[clientId][existingIndex] = {
        ...this.messages[clientId][existingIndex],
        ...message,
        isPending: false
      };
    }
    
    // Store roomId in client data if available
    if (message.roomId && (!this.clients[clientId] || !this.clients[clientId].roomId)) {
      if (!this.clients[clientId]) {
        this.clients[clientId] = { id: clientId };
      }
      this.clients[clientId].roomId = message.roomId;
    }
    
    this.saveToStorage();
  }
  
  // Clear data for a specific client (chat messages and client info)
  clearClientData(clientId) {
    if (!clientId) {
      console.warn('Cannot clear client data: clientId is required');
      return false;
    }
    
    let dataCleared = false;
    
    // Remove client messages
    if (this.messages[clientId]) {
      delete this.messages[clientId];
      console.log(`Cleared messages for client ${clientId}`);
      dataCleared = true;
    }
    
    // Remove client info
    if (this.clients[clientId]) {
      delete this.clients[clientId];
      console.log(`Cleared client info for client ${clientId}`);
      dataCleared = true;
    }
    
    if (dataCleared) {
      this.saveToStorage();
      console.log(`Successfully cleaned up data for client ${clientId}`);
    } else {
      console.log(`No data found to clear for client ${clientId}`);
    }
    
    return dataCleared;
  }

  // Clear all data
  clear() {
    this.operatorId = null;
    this.operatorName = null;
    this.operatorNumber = null;
    this.messages = {};
    this.clients = {};
    localStorage.removeItem('operatorData');
    localStorage.removeItem('operatorId');
    localStorage.removeItem('operatorName');
    localStorage.removeItem('operatorNumber');
  }
}

export const operatorStorage = new OperatorStorage(); 