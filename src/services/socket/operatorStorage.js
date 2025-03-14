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
  
  // Load data from session storage
  loadFromStorage() {
    try {
      const storedData = sessionStorage.getItem('operatorData');
      if (storedData) {
        const parsedData = JSON.parse(storedData);
        this.operatorId = parsedData.operatorId || null;
        this.operatorName = parsedData.operatorName || null;
        this.operatorNumber = parsedData.operatorNumber || null;
        this.messages = parsedData.messages || {};
        this.clients = parsedData.clients || {};
      }
      
      // Also load from individual session storage items
      this.operatorId = this.operatorId || sessionStorage.getItem('operatorId');
      this.operatorName = this.operatorName || sessionStorage.getItem('operatorName');
      this.operatorNumber = this.operatorNumber || sessionStorage.getItem('operatorNumber');
    } catch (error) {
      console.error('Error loading operator data from storage:', error);
    }
  }
  
  // Save data to session storage
  saveToStorage() {
    try {
      const dataToStore = {
        operatorId: this.operatorId,
        operatorName: this.operatorName,
        operatorNumber: this.operatorNumber,
        messages: this.messages,
        clients: this.clients
      };
      
      sessionStorage.setItem('operatorData', JSON.stringify(dataToStore));
      
      // Also save individual items for backward compatibility
      if (this.operatorId) sessionStorage.setItem('operatorId', this.operatorId);
      if (this.operatorName) sessionStorage.setItem('operatorName', this.operatorName);
      if (this.operatorNumber) sessionStorage.setItem('operatorNumber', this.operatorNumber);
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
      this.messages[clientId].push(message);
      
      // Sort messages by timestamp
      this.messages[clientId].sort(
        (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
      );
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
  
  // Clear all data
  clear() {
    this.operatorId = null;
    this.operatorName = null;
    this.operatorNumber = null;
    this.messages = {};
    this.clients = {};
    sessionStorage.removeItem('operatorData');
    sessionStorage.removeItem('operatorId');
    sessionStorage.removeItem('operatorName');
    sessionStorage.removeItem('operatorNumber');
  }
}

export const operatorStorage = new OperatorStorage(); 