import React, { useState, useEffect, useRef } from 'react';
import { chatbotService } from '../../services/api/chatbotService';
import { initClientSocket } from '../../services/socket/clientSocket';
import { FaRobot } from 'react-icons/fa';
import { FaHeadset } from 'react-icons/fa';

function ChatbotInterface({ onConnectToOperator, clientName, clientNumber, clientPolice }) {
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [nextQuestions, setNextQuestions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const chatContainerRef = useRef(null);
  const lastMessageRef = useRef(null);

  useEffect(() => {
    startChat();
  }, []);

  // Auto scroll when chat history changes
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory, isLoading]);

  const startChat = async () => {
    try {
      setIsLoading(true);
      const response = await chatbotService.startChat();
      if (response.success) {
        setCurrentQuestion(response.data.question);
        // Filter out the operator connection question
        const filteredQuestions = response.data.next_questions.filter(
          q => !q.question_text.toLowerCase().includes('speak with an operator')
        );
        setNextQuestions(filteredQuestions);
        setChatHistory([{
          type: 'question',
          text: response.data.question.question_text,
          options: filteredQuestions
        }]);
      }
    } catch (error) {
      setError('Failed to start chat. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuestionClick = async (question) => {
    try {
      setIsLoading(true);
      // Add user's selection to chat history
      setChatHistory(prev => [...prev, {
        type: 'answer',
        text: question.question_text
      }]);

      const response = await chatbotService.getNextQuestion(question.id);
      
      if (response.success) {
        setCurrentQuestion(response.data.question);
        // Filter out the operator connection question
        const filteredQuestions = response.data.next_questions.filter(
          q => !q.question_text.toLowerCase().includes('speak with an operator')
        );
        setNextQuestions(filteredQuestions);
        
        // Add bot's next question and options to chat history
        setChatHistory(prev => [...prev, {
          type: 'question',
          text: response.data.question.question_text,
          options: filteredQuestions
        }]);

        // Do NOT auto-connect to operator if no more questions
        // User must press the operator button
      }
    } catch (error) {
      setError('Failed to get next question. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnectToOperator = () => {
    // Initialize socket connection
    initClientSocket(clientName, clientNumber, clientPolice);
    // Notify parent component
    onConnectToOperator();
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 relative">
      {/* Header with Operator Button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-gradient-to-r from-primary-500 to-primary-600 text-white p-3">
        <div>
          <h2 className="text-lg font-semibold">ჩატბოტი</h2>
          <p className="text-xs text-primary-100">გთხოვთ აირჩიოთ თქვენი კითხვა</p>
        </div>
        <button
          onClick={handleConnectToOperator}
          className="flex items-center gap-1 px-3 py-1.5 bg-lime-500 text-white rounded-md hover:bg-lime-600 transition-colors text-xs font-medium shadow-sm border border-lime-100"
          style={{ fontSize: '13px' }}
        >
          <FaHeadset className="text-base mr-1" style={{ fontSize: '16px' }} />
          <span style={{ whiteSpace: 'normal' }}>
            ოპერატორთან <br/> დაკავშირება
          </span>
        </button>
      </div>

      {/* Chat History */}
      <div 
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth"
        style={{ maxHeight: 'calc(100vh - 180px)' }}
      >
        {chatHistory.map((item, index) => (
          <div key={index} className="space-y-3">
            {/* Message Bubble */}
            <div
              className={`flex ${item.type === 'answer' ? 'justify-end' : 'justify-start'}`}
            >
              {item.type === 'question' && (
                <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center mr-2 flex-shrink-0">
                  <FaRobot className="text-white text-sm" />
                </div>
              )}
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                  item.type === 'answer'
                    ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white'
                    : 'bg-white border border-gray-200 text-gray-800 shadow-sm'
                }`}
              >
                <p className="text-sm font-medium">{item.text}</p>
              </div>
            </div>

            {/* Options */}
            {item.type === 'question' && item.options && item.options.length > 0 && (
              <div className="flex flex-wrap gap-2 pl-10">
                {item.options.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => handleQuestionClick(option)}
                    className="px-4 py-2 bg-gray-50 border border-gray-100 rounded-full text-sm text-gray-600 hover:bg-white hover:border-primary-200 hover:text-primary-600 transition-all duration-200 shadow-sm hover:shadow text-left"
                  >
                    {option.question_text}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex items-center space-x-2 pl-10">
            <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center">
              <FaRobot className="text-white text-sm" />
            </div>
            <div className="flex space-x-1">
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ChatbotInterface; 