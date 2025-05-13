import React from 'react';

function ClientInfoSidebar({ client }) {
  if (!client) {
    return (
      <div className="w-64 bg-white border-l flex-shrink-0 p-4 flex items-center justify-center text-gray-500">
        No client selected.
      </div>
    );
  }

  return (
    <div className="w-64 bg-white border-l flex-shrink-0 p-4 space-y-4 overflow-y-auto">
      <h2 className="text-lg font-medium text-gray-700 mb-4 border-b pb-2">კლიენტის ინფორმაცია</h2>
      <div>
        <label className="block text-sm font-medium text-gray-500">Name</label>
        <p className="text-gray-800">{client.name}</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-500">Number</label>
        <p className="text-gray-800">{client.number}</p>
      </div>
      {/* Display Metadata */}
      {client.metadata && typeof client.metadata === 'object' && Object.keys(client.metadata).length > 0 && (
        <div className=" pt-4 mt-4">
          <h3 className="text-lg font-medium text-gray-700 mb-4 border-b pb-2 ">დამატებითი ინფორმაცია</h3>
            <div className="mb-2">
              <label className="block text-sm font-medium text-gray-500 capitalize">პოლისი</label>
              <p className="text-gray-800 break-words">{String(client.metadata.police)}</p> {/* Convert value to string */}
            </div>
        </div>
      )}
      {/* Add more client details here if needed */}
      {/* 
      <div>
        <label className="block text-sm font-medium text-gray-500">Status</label>
        <p className={`text-sm ${client.roomStatus === 'active' ? 'text-green-600' : 'text-red-600'}`}>
          {client.roomStatus === 'active' ? 'Active' : 'Closed'}
        </p>
      </div> 
      */}
    </div>
  );
}

export default ClientInfoSidebar; 