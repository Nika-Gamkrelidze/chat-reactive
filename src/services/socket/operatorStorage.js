// Operator storage for managing state between reconnects
const operatorStorage = {
  operatorId: null,
  activeClients: [],
  pendingClients: [],
  messages: {},
  
  // Add message to storage
  addMessage(message) {
    const clientId = message.clientId;
    
    // Initialize client messages array if it doesn't exist
    if (!this.messages[clientId]) {
      this.messages[clientId] = [];
    }
    
    // Check if message already exists
    const messageExists = this.messages[clientId].some(
      m => m.messageId === message.messageId
    );
    
    if (!messageExists) {
      this.messages[clientId].push(message);
      this.saveToStorage();
    }
  },
  
  // Update storage from session data
  updateFromSession(data) {
    if (data.operator) {
      this.operatorId = data.operator.id;
      
      // Store operator data in session storage
      sessionStorage.setItem('operatorId', data.operator.id);
      sessionStorage.setItem('operatorName', data.operator.name);
      sessionStorage.setItem('operatorNumber', data.operator.number);
      
      // Store user data for auth context
      const userData = {
        id: data.operator.id,
        name: data.operator.name,
        number: data.operator.number,
        role: 'operator'
      };
      sessionStorage.setItem('user', JSON.stringify(userData));
    }
    
    // Handle active rooms from reconnection
    if (data.activeRooms && Array.isArray(data.activeRooms)) {
      this.activeClients = data.activeRooms
        .filter(room => room.client)
        .map(room => room.client);
      
      // Initialize messages from active rooms
      data.activeRooms.forEach(room => {
        if (room.client && room.messages) {
          this.messages[room.client.id] = room.messages;
        }
      });
    }
    
    this.saveToStorage();
  },
  
  // Save current state to session storage
  saveToStorage() {
    try {
      sessionStorage.setItem('operatorActiveClients', JSON.stringify(this.activeClients));
      sessionStorage.setItem('operatorPendingClients', JSON.stringify(this.pendingClients));
      sessionStorage.setItem('operatorMessages', JSON.stringify(this.messages));
      
      // Also save operator data
      const operatorData = {
        id: this.operatorId,
        name: sessionStorage.getItem('operatorName'),
        number: sessionStorage.getItem('operatorNumber')
      };
      sessionStorage.setItem('operatorData', JSON.stringify(operatorData));
    } catch (error) {
      console.error('Error saving operator data to session storage:', error);
    }
  },
  
  // Load state from session storage
  loadFromStorage() {
    try {
      const activeClients = sessionStorage.getItem('operatorActiveClients');
      const pendingClients = sessionStorage.getItem('operatorPendingClients');
      const messages = sessionStorage.getItem('operatorMessages');
      const operatorData = sessionStorage.getItem('operatorData');
      
      if (activeClients) {
        this.activeClients = JSON.parse(activeClients);
      }
      
      if (pendingClients) {
        this.pendingClients = JSON.parse(pendingClients);
      }
      
      if (messages) {
        this.messages = JSON.parse(messages);
      }
      
      if (operatorData) {
        const parsedData = JSON.parse(operatorData);
        this.operatorId = parsedData.id;
      } else {
        // Try to get operatorId directly if operatorData is not available
        this.operatorId = sessionStorage.getItem('operatorId');
      }
    } catch (error) {
      console.error('Error loading operator data from session storage:', error);
    }
  },
  
  // Clear all stored data
  clear() {
    this.operatorId = null;
    this.activeClients = [];
    this.pendingClients = [];
    this.messages = {};
    
    try {
      sessionStorage.removeItem('operatorActiveClients');
      sessionStorage.removeItem('operatorPendingClients');
      sessionStorage.removeItem('operatorMessages');
      sessionStorage.removeItem('operatorData');
      // Don't remove operatorId, operatorName, operatorNumber, or user here
      // as they are needed for reconnection
    } catch (error) {
      console.error('Error clearing operator data from session storage:', error);
    }
  },
  
  // Clear all operator data including login credentials
  clearAll() {
    this.clear();
    
    try {
      sessionStorage.removeItem('operatorId');
      sessionStorage.removeItem('operatorName');
      sessionStorage.removeItem('operatorNumber');
      sessionStorage.removeItem('user');
    } catch (error) {
      console.error('Error clearing all operator data from session storage:', error);
    }
  }
};

export default operatorStorage; 