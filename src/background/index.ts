// 监听安装事件
chrome.runtime.onInstalled.addListener(async () => {
  try {
    // 初始化存储
    await chrome.storage.local.set({ torrents: [] });
  } catch (error) {
    console.error('Failed to initialize extension:', error);
  }

  // 创建右键菜单
  chrome.contextMenus.create({
    id: 'nextPage',
    title: 'Next Page',
    contexts: ['page'],
    documentUrlPatterns: ['*://rutracker.org/forum/viewforum.php?f=*']
  });
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
          files: ['src/content/index.ts'],
        });
      }

      // 如果是论坛页面，注入工具栏
      if (tab.url.includes('viewforum.php')) {
        chrome.tabs.sendMessage(tab.id, { action: 'injectToolbar' });
      }
    } catch (error) {
      console.error(`Failed to inject content script to tab ${tabId}:`, error);
    }
  }
});

// 处理右键菜单点击
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'nextPage' && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { action: 'goToNextPage' });
  }
});