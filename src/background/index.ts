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

// 处理下载请求
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'downloadTorrent') {
    handleDownload(message.url, sender.tab?.id, message.filename, message.saveAs)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // 表示将异步发送响应
  }
});

// 下载处理函数
async function handleDownload(url: string, tabId?: number, filename?: string, saveAs?: boolean) {
  try {
    // 使用 chrome.downloads API 下载文件，并显示保存对话框
    const downloadId = await chrome.downloads.download({
      url: url,
      filename: filename || `rutracker-${new Date().getTime()}.torrent`,
      saveAs: saveAs // 使用传入的 saveAs 参数
    });

    // 监听下载状态变化
    chrome.downloads.onChanged.addListener(function onChanged(delta) {
      if (delta.id === downloadId) {
        // 如果下载被取消或发生错误
        if (delta.state?.current === 'interrupted' || delta.error) {
          chrome.downloads.onChanged.removeListener(onChanged);
          // 获取错误详情
          chrome.downloads.search({ id: downloadId }, (downloads) => {
            const download = downloads[0];
            let errorMessage = 'Download failed';
            
            if (download?.error) {
              switch (download.error) {
                case 'FILE_FAILED':
                  errorMessage = 'File download failed. Please check your connection.';
                  break;
                case 'FILE_ACCESS_DENIED':
                  errorMessage = 'Access denied. Please check your permissions.';
                  break;
                case 'FILE_NO_SPACE':
                  errorMessage = 'Not enough disk space.';
                  break;
                case 'FILE_NAME_TOO_LONG':
                  errorMessage = 'File name is too long.';
                  break;
                case 'FILE_TOO_LARGE':
                  errorMessage = 'File is too large.';
                  break;
                case 'USER_CANCELED':
                  errorMessage = 'Download cancelled.';
                  break;
                default:
                  errorMessage = `Download failed: ${download.error}`;
              }
            }
            
            // 通知内容脚本重置下载按钮
            if (tabId) {
              chrome.tabs.sendMessage(tabId, { 
                action: 'downloadStatus',
                status: 'error',
                error: errorMessage
              });
            }
          });
        }
        // 如果下载完成
        else if (delta.state?.current === 'complete') {
          chrome.downloads.onChanged.removeListener(onChanged);
          // 通知内容脚本更新状态
          if (tabId) {
            chrome.tabs.sendMessage(tabId, { 
              action: 'downloadStatus',
              status: 'completed'
            });
          }
        }
      }
    });
  } catch (error) {
    console.error('Failed to download torrent:', error);
    // 发送错误状态
    if (tabId) {
      chrome.tabs.sendMessage(tabId, { 
        action: 'downloadStatus',
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to start download'
      });
    }
  }
}

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