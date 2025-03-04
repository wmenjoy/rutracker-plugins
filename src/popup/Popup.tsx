import React, { useEffect, useState } from 'react';
import type { TorrentItem, Message } from '../types/types';

const Popup: React.FC = () => {
  const [torrents, setTorrents] = useState<TorrentItem[]>([]);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedTorrents, setSelectedTorrents] = useState<Set<string>>(new Set());

  useEffect(() => {
    // 从 storage 加载已保存的种子列表
    chrome.storage.local.get(['torrents'], (result) => {
      setTorrents(result.torrents || []);
      setLoading(false);
    });

    // 监听 storage 变化
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.torrents) {
        setTorrents(changes.torrents.newValue || []);
      }
    });
  }, []);

  const handleScan = async () => {
    setScanning(true);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab.id) {
        const message: Message = { action: 'scan' };
        await chrome.tabs.sendMessage(tab.id, message);
      }
    } catch (error) {
      console.error('Failed to scan page:', error);
    } finally {
      setScanning(false);
    }
  };

  const handlePreview = async (torrent: TorrentItem) => {
    try {
      await chrome.tabs.create({ url: torrent.url });
      const updatedTorrents = torrents.map(t => 
        t.id === torrent.id ? { ...t, isVisited: true } : t
      );
      setTorrents(updatedTorrents);
      await chrome.storage.local.set({ torrents: updatedTorrents });
    } catch (error) {
      console.error('Failed to preview torrent:', error);
    }
  };

  const handleDownload = async (torrent: TorrentItem) => {
    try {
      // 打开种子页面
      const tab = await chrome.tabs.create({ url: torrent.url });
      if (!tab.id) return;

      // 等待页面加载完成
      await new Promise(resolve => {
        chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
          if (tabId === tab.id && info.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve(undefined);
          }
        });
      });

      // 发送下载消息
      await chrome.tabs.sendMessage(tab.id, {
        action: 'download',
        url: torrent.downloadUrl
      } as Message);

      // 标记为已访问
      const updatedTorrents = torrents.map(t => 
        t.id === torrent.id ? { ...t, isVisited: true } : t
      );
      setTorrents(updatedTorrents);
      await chrome.storage.local.set({ torrents: updatedTorrents });
    } catch (error) {
      console.error('Failed to download torrent:', error);
    }
  };

  const handleBatchDownload = async () => {
    try {
      const selectedItems = torrents.filter(t => selectedTorrents.has(t.id));
      for (const torrent of selectedItems) {
        await handleDownload(torrent);
      }
      setSelectedTorrents(new Set());
    } catch (error) {
      console.error('Failed to batch download torrents:', error);
    }
  };

  const handleToggleSelect = (id: string) => {
    const newSelected = new Set(selectedTorrents);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedTorrents(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedTorrents.size === torrents.length) {
      setSelectedTorrents(new Set());
    } else {
      setSelectedTorrents(new Set(torrents.map(t => t.id)));
    }
  };

  const handleClear = async () => {
    try {
      setTorrents([]);
      setSelectedTorrents(new Set());
      await chrome.storage.local.remove(['torrents']);
    } catch (error) {
      console.error('Failed to clear torrents:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-lg font-medium">RuTracker Torrent Helper</h1>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded text-sm disabled:opacity-50"
        >
          {scanning ? 'Scanning...' : 'Scan Page'}
        </button>
      </div>

      {torrents.length === 0 ? (
        <div className="text-center text-gray-500 py-8 text-sm">
          No torrents found. Click "Scan Page" to start.
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center mb-2">
            <button
              onClick={handleSelectAll}
              className="text-blue-500 hover:text-blue-700 text-sm"
            >
              {selectedTorrents.size === torrents.length ? 'Deselect All' : 'Select All'}
            </button>
            {selectedTorrents.size > 0 && (
              <button
                onClick={handleBatchDownload}
                className="bg-green-500 hover:bg-green-700 text-white font-bold py-1 px-3 rounded text-sm"
              >
                Download Selected ({selectedTorrents.size})
              </button>
            )}
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {torrents.map((torrent) => (
              <div
                key={torrent.id}
                className={`p-2 border rounded-lg ${
                  torrent.isVisited ? 'bg-gray-50' : 'bg-white'
                } hover:border-blue-300 transition-colors`}
              >
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={selectedTorrents.has(torrent.id)}
                    onChange={() => handleToggleSelect(torrent.id)}
                    className="h-4 w-4 text-blue-500 rounded border-gray-300 focus:ring-blue-500"
                  />
                  <h3 className="text-xs font-medium truncate flex-1">{torrent.title}</h3>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handlePreview(torrent)}
                      className="text-blue-500 hover:text-blue-700 text-xs whitespace-nowrap"
                    >
                      Preview
                    </button>
                    <button
                      onClick={() => handleDownload(torrent)}
                      className="text-green-500 hover:text-green-700 text-xs whitespace-nowrap"
                    >
                      Download
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex justify-center">
            <button
              onClick={handleClear}
              className="bg-red-500 hover:bg-red-700 text-white font-bold py-1 px-3 rounded text-sm"
            >
              Clear All
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default Popup; 