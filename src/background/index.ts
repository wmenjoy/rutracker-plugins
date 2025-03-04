// 监听安装事件
chrome.runtime.onInstalled.addListener(async () => {
  try {
    // 初始化存储
    await chrome.storage.local.set({ torrents: [] });
  } catch (error) {
    console.error('Failed to initialize extension:', error);
  }
});

// 监听标签页更新事件
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (
    changeInfo.status === 'complete' && 
    tab.url?.includes('rutracker.org') &&
    tab.id
  ) {
    try {
      // 检查内容脚本是否已经注入
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.hasOwnProperty('RUTRACKER_HELPER_INITIALIZED'),
      });

      if (!result) {
        // 注入内容脚本
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['assets/content.js'],
        });
      }
    } catch (error) {
      console.error(`Failed to inject content script to tab ${tabId}:`, error);
    }
  }
});