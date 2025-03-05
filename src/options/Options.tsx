import React from 'react';

const Options: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">RuTracker Helper Settings</h1>
        
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
          <p className="text-gray-400">
            No settings available at the moment. When downloading torrents, you'll be prompted to choose where to save them.
          </p>
        </div>
      </div>
    </div>
  );
}

export default Options; 