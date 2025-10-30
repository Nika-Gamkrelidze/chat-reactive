import React from 'react';
import { RiCloseLine } from 'react-icons/ri';
import { FaClock } from 'react-icons/fa';

function WorkingHoursModal({ isOpen, onClose, message }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50">
      <div className="bg-white w-full h-full rounded-none p-6 shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <div className="bg-orange-100 p-2 rounded-full mr-3">
              <FaClock className="text-orange-500 text-lg" />
            </div>
            <h3 className="text-lg font-semibold text-gray-800">სამუშაო საათები</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <RiCloseLine size={24} />
          </button>
        </div>

        {/* Working Hours Message */}
        <div className="mb-6 flex-1 overflow-y-auto">
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <div className="text-orange-700 text-sm leading-relaxed whitespace-pre-line">
              {message || 'გთხოვთ, გაითვალისწინოთ, რომ ონლაინ ჩატი ხელმისაწვდომია ყოველდღე 10:00-დან 18:00-მდე.\n\nარასამუშაო საათებში შეგიძლიათ დაუკავშირდეთ ჩვენი მხარდაჭერის გუნდს ნომერზე: 032 2 505 111\n\nPlease note that our live chat is available daily from 10:00 AM to 6:00 PM. Outside of these hours, you can contact our support team at 032 2 505 111'}
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors text-sm font-medium"
          >
            გასაგებია
          </button>
        </div>
      </div>
    </div>
  );
}

export default WorkingHoursModal;