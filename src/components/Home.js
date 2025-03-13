import React from 'react';
import { Link } from 'react-router-dom';

function Home() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-lg shadow-lg w-full max-w-md">
        <h1 className="text-3xl font-bold text-center mb-8 text-gray-800">
          Chat Support
        </h1>
        
        <div className="space-y-4">
          <Link 
            to="/client/login" 
            className="block w-full py-3 px-4 text-center bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors"
          >
            Join as Client
          </Link>
          
          <Link 
            to="/operator/login" 
            className="block w-full py-3 px-4 text-center bg-gray-500 hover:bg-gray-600 text-white rounded-md transition-colors"
          >
            Login as Operator
          </Link>
          
          <Link 
            to="/settings" 
            className="block text-center text-sm text-gray-600 hover:text-gray-800 mt-4"
          >
            Settings
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Home; 