import React, { useEffect, useState, useMemo } from 'react';
import type { TorrentItem, Message } from '../types/types';

// 添加图标组件
const PreviewIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
  </svg>
);

const DownloadIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
);

// 添加设置图标组件
const SettingsIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

// 修改日期解析辅助函数
const parseRuTrackerDate = (dateStr: string): Date => {
  // 处理空字符串
  if (!dateStr.trim()) {
    return new Date(0);
  }

  try {
    // 打印日期字符串以便调试
    console.log('Parsing date:', dateStr);

    // 处理 YYYY-MM-DD HH:mm 格式
    const match = dateStr.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
    if (match) {
      const [_, year, month, day, hours, minutes] = match;
      return new Date(
        parseInt(year),
        parseInt(month) - 1, // 月份从0开始
        parseInt(day),
        parseInt(hours),
        parseInt(minutes)
      );
    }

    // 如果无法解析，返回一个很早的日期
    console.error('Unable to parse date format:', dateStr);
    return new Date(0);
  } catch (error) {
    console.error('Failed to parse date:', dateStr, error);
    return new Date(0);
  }
};

const Popup: React.FC = () => {
  const [torrents, setTorrents] = useState<TorrentItem[]>([]);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedTorrents, setSelectedTorrents] = useState<Set<string>>(new Set());
  const [daysFilter, setDaysFilter] = useState<number>(7); // 默认过滤7天内的种子
  const [showOnlyUnread, setShowOnlyUnread] = useState(false);
  const [titleFilter, setTitleFilter] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [downloadPath, setDownloadPath] = useState('');

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

    // 加载下载路径
    chrome.storage.sync.get(['downloadPath'], (result) => {
      setDownloadPath(result.downloadPath || '');
    });
  }, []);

  // 修改过滤逻辑
  const filteredTorrents = useMemo(() => {
    let filtered = torrents;
    
    // 按标题过滤
    if (titleFilter.trim()) {
      const searchTerms = titleFilter.toLowerCase().split(' ');
      filtered = filtered.filter(torrent => 
        searchTerms.every(term => 
          torrent.title.toLowerCase().includes(term)
        )
      );
    }
    
    // 按未读状态过滤
    if (showOnlyUnread) {
      filtered = filtered.filter(torrent => torrent.isUnread);
    }

    // 按日期过滤
    if (daysFilter) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysFilter);
      
      filtered = filtered.filter(torrent => {
        const updateDate = parseRuTrackerDate(torrent.updateDate);
        return updateDate >= cutoffDate;
      });
    }

    return filtered;
  }, [torrents, daysFilter, showOnlyUnread, titleFilter]);

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

  const handleDownloadAndPreview = async (torrent: TorrentItem) => {
    try {
      // 1. 先下载种子
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) return;

      await chrome.tabs.sendMessage(tab.id, {
        action: 'download',
        url: torrent.downloadUrl
      } as Message);

      // 2. 在新标签页中打开预览
      const previewTab = await chrome.tabs.create({ 
        url: torrent.url,
        active: false // 在后台打开
      });

      // 3. 等待页面加载完成后关闭
      if (previewTab.id) {
        const listener = (tabId: number, info: chrome.tabs.TabChangeInfo) => {
          if (tabId === previewTab.id && info.status === 'complete') {
            // 等待一小段时间后关闭标签页
            setTimeout(() => {
              chrome.tabs.remove(tabId);
              chrome.tabs.onUpdated.removeListener(listener);
            }, 2000); // 等待2秒后关闭
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
      }

      // 4. 更新状态
      const updatedTorrents = torrents.map(t => 
        t.id === torrent.id ? { ...t, isVisited: true } : t
      );
      setTorrents(updatedTorrents);
      await chrome.storage.local.set({ torrents: updatedTorrents });
    } catch (error) {
      console.error('Failed to download and preview torrent:', error);
    }
  };

  const handleBatchDownload = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) return;

      const selectedItems = torrents.filter(t => selectedTorrents.has(t.id));
      
      // 依次处理每个选中的种子
      for (const torrent of selectedItems) {
        await handleDownloadAndPreview(torrent);
        // 添加延迟以避免过快打开太多标签
        await new Promise(resolve => setTimeout(resolve, 1500));
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
    <div className="p-4 bg-gray-900 text-gray-100 min-h-screen">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-lg font-medium text-gray-100">RuTracker Helper</h1>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`text-gray-400 hover:text-gray-300 transition-colors ${
              showAdvanced ? 'text-blue-400' : ''
            }`}
            title="Advanced Settings"
          >
            <SettingsIcon />
          </button>
        </div>
      </div>

      {/* 高级设置区域 */}
      {showAdvanced && (
        <div className="mb-4 space-y-3 bg-gray-800 p-3 rounded-lg">
          <div className="relative">
            <input
              type="text"
              value={titleFilter}
              onChange={(e) => setTitleFilter(e.target.value)}
              placeholder="Search by title..."
              className="w-full px-3 py-2 bg-gray-700 border border-gray-700 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {titleFilter && (
              <button
                onClick={() => setTitleFilter('')}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-300"
              >
                ×
              </button>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={downloadPath}
              onChange={(e) => {
                setDownloadPath(e.target.value);
                chrome.storage.sync.set({ downloadPath: e.target.value });
              }}
              placeholder="Download directory path..."
              className="flex-1 px-3 py-2 bg-gray-700 border border-gray-700 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={() => chrome.runtime.openOptionsPage()}
              className="text-blue-400 hover:text-blue-300 text-sm whitespace-nowrap"
            >
              More Settings
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3 mb-4">
        <div className="flex items-center space-x-3">
          <select
            value={daysFilter}
            onChange={(e) => setDaysFilter(Number(e.target.value))}
            className="text-sm border rounded px-2 py-1.5 bg-gray-800 border-gray-700 text-gray-100"
          >
            <option value={0}>All time</option>
            <option value={1}>Last 24h</option>
            <option value={3}>Last 3 days</option>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
          </select>

          <label className="flex items-center space-x-2 text-sm">
            <input
              type="checkbox"
              checked={showOnlyUnread}
              onChange={(e) => setShowOnlyUnread(e.target.checked)}
              className="h-4 w-4 text-blue-600 rounded bg-gray-700 border-gray-600 focus:ring-blue-500"
            />
            <span>Unread only</span>
          </label>

          <button
            onClick={handleScan}
            disabled={scanning}
            className="ml-auto bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-3 rounded text-sm disabled:opacity-50"
          >
            {scanning ? 'Scanning...' : 'Scan Page'}
          </button>
        </div>
      </div>

      {filteredTorrents.length === 0 ? (
        <div className="text-center text-gray-400 py-8 text-sm">
          {torrents.length === 0 
            ? "No torrents found. Click 'Scan Page' to start."
            : "No torrents match the current filters."}
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center space-x-3">
              <button
                onClick={handleSelectAll}
                className="text-blue-400 hover:text-blue-300 text-sm"
              >
                {selectedTorrents.size === filteredTorrents.length ? 'Deselect All' : 'Select All'}
              </button>
              <span className="text-gray-400 text-sm">
                {filteredTorrents.length} items
              </span>
            </div>
            {selectedTorrents.size > 0 && (
              <button
                onClick={handleBatchDownload}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-3 rounded text-sm"
              >
                Download Selected ({selectedTorrents.size})
              </button>
            )}
          </div>

          <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto">
            {filteredTorrents.map((torrent) => (
              <div
                key={torrent.id}
                className={`p-2 border rounded-lg ${
                  torrent.isVisited ? 'bg-gray-800 border-gray-700' : 'bg-gray-800 border-gray-700'
                } hover:border-blue-500 transition-colors ${
                  torrent.isUnread ? 'border-l-4 border-l-blue-500' : ''
                }`}
              >
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={selectedTorrents.has(torrent.id)}
                    onChange={() => handleToggleSelect(torrent.id)}
                    className="h-4 w-4 text-blue-600 rounded bg-gray-700 border-gray-600 focus:ring-blue-500"
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xs font-medium truncate text-gray-200">{torrent.title}</h3>
                    <span className="text-xs text-gray-400">{torrent.updateDate}</span>
                  </div>
                  <div className="flex space-x-2 ml-2">
                    <button
                      onClick={() => handleDownloadAndPreview(torrent)}
                      className="text-blue-400 hover:text-blue-300 p-1 rounded-full hover:bg-gray-700"
                      title="Preview"
                    >
                      <PreviewIcon />
                    </button>
                    <button
                      onClick={() => handleDownloadAndPreview(torrent)}
                      className="text-green-400 hover:text-green-300 p-1 rounded-full hover:bg-gray-700"
                      title="Download"
                    >
                      <DownloadIcon />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex justify-center">
            <button
              onClick={handleClear}
              className="bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-3 rounded text-sm"
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