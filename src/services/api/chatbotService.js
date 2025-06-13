import config from '../../config/env';

class ChatbotService {
  constructor() {
    this.baseUrl = config.api.baseUrl;
    this.barrierToken = config.api.barrierToken;
  }

  async startChat() {
    try {
      const response = await fetch(`${this.baseUrl}${config.api.endpoints.startChat}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.barrierToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to start chat');
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error starting chat:', error);
      throw error;
    }
  }

  async getNextQuestion(questionId) {
    try {
      const response = await fetch(`${this.baseUrl}${config.api.endpoints.question}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.barrierToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id: questionId })
      });

      if (!response.ok) {
        throw new Error('Failed to get next question');
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error getting next question:', error);
      throw error;
    }
  }
}

export const chatbotService = new ChatbotService(); 