import React, { useEffect, useState } from 'react';

const Options: React.FC = () => {
  const [downloadPath, setDownloadPath] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    // 加载保存的下载路径
    chrome.storage.sync.get(['downloadPath'], (result) => {
      setDownloadPath(result.downloadPath || '');
    });
  }, []);

  const handleSave = async () => {
    try {
      await chrome.storage.sync.set({ downloadPath });
      setStatus('Settings saved successfully!');
      setTimeout(() => setStatus(''), 2000);
    } catch (error) {
      setStatus('Failed to save settings');
      console.error('Failed to save settings:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">RuTracker Helper Settings</h1>
        
        <div className="bg-gray-800 rounded-lg p-6 shadow-lg">
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">
              Default Download Directory
            </label>
            <input
              type="text"
              value={downloadPath}
              onChange={(e) => setDownloadPath(e.target.value)}
              placeholder="Enter download path (e.g., D:\Downloads\Torrents)"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-2 text-sm text-gray-400">
              This path will be used as the default download location for torrents
            </p>
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={handleSave}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
            >
              Save Settings
            </button>
            {status && (
              <span className="text-sm text-green-400">{status}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Options; 