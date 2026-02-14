import React from 'react';
import { useNavigate } from 'react-router-dom';

function AdminLogs() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-secondary-50 flex flex-col p-4">
      <header className="bg-gradient-to-r from-primary-500 to-primary-600 text-white p-4 rounded-t-2xl shadow-soft flex justify-between items-center">
        <div>
          <h1 className="text-xl font-semibold">ლოგები</h1>
          <p className="text-sm text-primary-100">სისტემის ლოგები</p>
        </div>
        <button
          onClick={() => navigate(-1)}
          className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
        >
          უკან
        </button>
      </header>
      <main className="flex-1 bg-white rounded-b-2xl shadow-soft p-4 mt-0 overflow-auto">
        <p className="text-gray-500">ლოგების გვერდი. სერვერის ლოგები შეგიძლიათ ნახოთ სერვერის ფაილურ სისტემაში ან ლოგების API-ის მეშვეობით.</p>
      </main>
    </div>
  );
}

export default AdminLogs;
