import type { TorrentItem, Message } from '../types/types';

// 添加初始化标记到 window 对象
declare global {
  interface Window {
    RUTRACKER_HELPER_INITIALIZED?: boolean;
  }
}

window.RUTRACKER_HELPER_INITIALIZED = true;

// 添加全局变量来追踪下载进度
let downloadProgress = {
  current: 0,
  total: 0,
  isDownloading: false
};

// 修改消息监听器
chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  // 创建一个处理消息的异步函数
  const handleMessage = async () => {
    try {
  if (message.action === 'scan') {
        await scanPage();
        sendResponse({ success: true });
      } else if (message.action === 'download' && message.url) {
        await downloadTorrent(message.url);
        sendResponse({ success: true });
      } else if (message.action === 'batchDownload') {
        await handleBatchDownload();
        sendResponse({ success: true });
      } else if (message.action === 'goToNextPage') {
        goToNextPage();
        sendResponse({ success: true });
      } else if (message.action === 'injectToolbar') {
        injectToolbar();
        sendResponse({ success: true });
      } else if (message.action === 'downloadStatus') {
        if (message.status) {
          handleDownloadStatus(message.status, message.error);
          sendResponse({ success: true });
        }
      }
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  };

  // 立即执行异步处理函数
  handleMessage();

  // 返回 true 表示将异步发送响应
  return true;
});

// 扫描页面上的种子链接
function scanPage() {
  const torrentDivs = document.querySelectorAll('div.torTopic');
  const torrents: TorrentItem[] = [];

  torrentDivs.forEach((div) => {
    // 检查是否包含 t-icon-attach 图标或 tor-consumed 标签，如果包含则跳过
    const hasAttachIcon = div.querySelector('img.t-icon-attach');
    const hasConsumedIcon = div.querySelector('span.tor-icon.tor-consumed');
    if (hasAttachIcon || hasConsumedIcon) return;

    // 获取主题链接
    const link = div.querySelector('a.torTopic.bold, a.tt-text, a.gen.tt-text');
    if (!link) return;

    // 修改未读状态检查逻辑
    const isUnread = div.innerHTML.includes('class="t-is-unread"');

    const url = link.getAttribute('href');
    if (!url) return;

    const id = url.match(/t=(\d+)/)?.[1];
    if (!id) return;

    // 获取更新日期
    const row = div.closest('tr');
    const lastPostCell = row?.querySelector('td.vf-col-last-post');
    const dateParagraph = lastPostCell?.querySelector('p:first-child');
    const updateDate = dateParagraph?.textContent?.trim() || '';

    // 直接构造下载链接
    const downloadUrl = `https://rutracker.org/forum/dl.php?t=${id}`;
    const title = link.textContent?.trim() || 'Unknown Title';

    // 添加调试日志
    console.log('Scanning topic:', {
      id,
      title,
      isUnread,
      updateDate,
      html: div.innerHTML
    });

    torrents.push({
      id,
      title,
      url: url.startsWith('http') ? url : `https://rutracker.org/forum/${url}`,
      downloadUrl,
      isVisited: false,
      updateDate,
      isUnread
    });
  });

  // 添加调试日志
  console.log('Scanned torrents:', torrents);

  // 保存到 storage
  chrome.storage.local.get(['torrents'], (result) => {
    const existingTorrents = result.torrents || [];
    const newTorrents = torrents.filter(
      newTorrent => !existingTorrents.some(
        (existingTorrent: TorrentItem) => existingTorrent.id === newTorrent.id
      )
    );

    chrome.storage.local.set({
      torrents: [...existingTorrents, ...newTorrents]
    });
  });
}

// 添加文件名清理函数
function sanitizeFilename(filename: string): string {
  // 1. 替换特殊字符和格式化符号
  let sanitized = filename
    // 替换音乐相关的特殊字符为对应的安全字符
    .replace(/[\/\\:*?"<>|]/g, '-')  // 基本的非法字符替换
    .replace(/\s*[\/\\]\s*/g, '-')   // 斜杠替换为连字符
    .replace(/\s*\|\s*/g, '-')       // 竖线替换为连字符
    .replace(/\s*:\s*/g, ' - ')      // 冒号替换为连字符
    .replace(/\s*[&＆]\s*/g, ' and ') // &符号替换为 and
    .replace(/[\x00-\x1f\x80-\x9f]/g, '') // 移除控制字符
    .replace(/\.+$/, '')             // 移除末尾的点
    .replace(/^\.+/, '')             // 移除开头的点
    .replace(/\s+/g, ' ')            // 多个空格替换为单个空格
    .trim();

  // 2. 处理括号和特殊格式
  sanitized = sanitized
    .replace(/[\(\[\{](\d+)[\)\]\}]/g, '($1)') // 统一数字的括号格式
    .replace(/\s*-\s*/g, ' - ')      // 统一连字符格式
    .replace(/\s+/g, ' ')            // 再次清理多余空格
    .trim();

  // 3. 处理音乐相关的特殊标记
  sanitized = sanitized
    .replace(/\b(MP3|FLAC|WAV|VBR|CBR)\b/gi, x => x.toUpperCase())  // 统一音频格式大写
    .replace(/\b(kbps|Kbps|KBPS)\b/g, 'kbps')                       // 统一码率单位
    .replace(/\s*~\s*/g, ' ');                                      // 处理约等于符号

  // 4. 处理文件名长度 (Windows 最大 255 字符)
  const ext = '.torrent';
  const maxLength = 255 - ext.length;
  if (sanitized.length > maxLength) {
    // 智能截断：尽量在单词边界处截断
    const truncated = sanitized.slice(0, maxLength).replace(/\s+\S*$/, '');
    sanitized = truncated || sanitized.slice(0, maxLength); // 如果没有找到合适的单词边界，就直接截断
  }

  // 5. 处理 Windows 保留文件名
  const reservedNames = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;
  if (reservedNames.test(sanitized)) {
    sanitized = `_${sanitized}`;
  }

  // 6. 确保文件名不为空
  if (!sanitized) {
    sanitized = 'unnamed_torrent';
  }

  // 7. 添加扩展名
  return `${sanitized}${ext}`;
}

// 修改下载函数，确保返回 Promise
async function downloadTorrent(url: string, title?: string): Promise<void> {
  try {
    // 检查登录状态
    const loginIndicators = [
      document.querySelector('a.logged-in-username'),
      document.querySelector('a[href*="logout="]'),
      document.querySelector('.topmenu a[href*="profile.php"]')
    ];
    
    const isLoggedIn = loginIndicators.some(indicator => indicator !== null);
    if (!isLoggedIn) {
      const loginUrl = 'https://rutracker.org/forum/login.php';
      if (confirm('You need to login to RuTracker first. Would you like to open the login page?')) {
        window.open(loginUrl, '_blank');
      }
      throw new Error('Please login to RuTracker first');
    }

    // 获取保存位置设置
    const { askSaveLocation } = await chrome.storage.sync.get(['askSaveLocation']);

    // 处理文件名
    const filename = title ? sanitizeFilename(`${title}.torrent`) : `torrent-${Date.now()}.torrent`;

    // 发送消息给 background script 处理下载
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'downloadTorrent',
        url: url,
        filename: filename,
        saveAs: askSaveLocation
      }, (response: { success: boolean; error?: string }) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else if (!response.success) {
          reject(new Error(response.error || 'Download failed'));
        } else {
          resolve();
        }
      });
    });
  } catch (error) {
    console.error('Failed to download torrent:', error);
    handleDownloadStatus('error', error instanceof Error ? error.message : 'Failed to download torrent');
    throw error;
  }
}

// 修改 handleDownloadAndPreview 函数
async function handleDownloadAndPreview(torrent: { id: string, url: string, downloadUrl: string, title: string }) {
  try {
    // 1. 先下载种子
    await downloadTorrent(torrent.downloadUrl, torrent.title);

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
  } catch (error) {
    console.error('Failed to download and preview torrent:', error);
    throw error;
  }
}

// 修改批量下载处理函数
async function handleBatchDownload() {
  const downloadButton = document.getElementById('batch-download');
  const progressBar = document.querySelector('#rutracker-helper-toolbar .download-progress') as HTMLElement;
  const progressBarInner = document.querySelector('#rutracker-helper-toolbar .progress-bar') as HTMLElement;
  
  if (!downloadButton || !progressBar || !progressBarInner) return;

  // 获取所有选中的种子信息
  const selectedTorrents = Array.from(document.querySelectorAll('div.torTopic'))
    .filter(div => !div.querySelector('span.tor-icon.tor-consumed')) // 过滤掉已消费的种子
    .map(div => {
      const link = div.querySelector('a.torTopic.bold, a.tt-text, a.gen.tt-text');
      const id = link?.getAttribute('href')?.match(/t=(\d+)/)?.[1];
      const url = link?.getAttribute('href');
      const title = link?.textContent?.trim();
      const checkbox = div.querySelector('input[type="checkbox"]') as HTMLInputElement;
      
      if (!id || !url || !title || !checkbox.checked) return null;

      return {
        id,
        title,
        url: url.startsWith('http') ? url : `https://rutracker.org/forum/${url}`,
        downloadUrl: `https://rutracker.org/forum/dl.php?t=${id}`
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  if (selectedTorrents.length === 0) {
    alert('Please select at least one torrent to download');
    return;
  }

  downloadProgress = {
    current: 0,
    total: selectedTorrents.length,
    isDownloading: true
  };

  // 更新UI状态
  downloadButton.setAttribute('disabled', 'true');
  downloadButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  downloadButton.setAttribute('data-tooltip', `Downloading 0/${selectedTorrents.length}`);
  progressBar.style.display = 'block';
  progressBarInner.style.width = '0%';

  let hasError = false;
  let completedCount = 0;

  try {
    // 依次处理每个选中的种子
    for (const torrent of selectedTorrents) {
      try {
        await handleDownloadAndPreview(torrent);
        
        // 更新进度
        completedCount++;
        const progress = (completedCount / selectedTorrents.length) * 100;
        progressBarInner.style.width = `${progress}%`;
        downloadButton.setAttribute('data-tooltip', `Downloading ${completedCount}/${selectedTorrents.length}`);
        
        // 添加延迟以避免过快打开太多标签
        if (completedCount < selectedTorrents.length) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      } catch (error) {
        console.error(`Failed to download torrent ${torrent.title}:`, error);
        hasError = true;
      }
    }
  } catch (error) {
    console.error('Batch download failed:', error);
    hasError = true;
  } finally {
    // 恢复按钮状态
    downloadProgress.isDownloading = false;
    downloadButton.innerHTML = '<i class="fas fa-download"></i>';
    downloadButton.removeAttribute('disabled');
    downloadButton.setAttribute('data-tooltip', 'Download Selected');
    progressBar.style.display = 'none';

    if (hasError) {
      alert('Some downloads failed. Please try again.');
    } else if (completedCount === selectedTorrents.length) {
      // 所有下载成功完成
      downloadButton.setAttribute('data-tooltip', `Successfully downloaded ${completedCount} torrents`);
    }
  }
}

// 添加跳转到下一页的函数
function goToNextPage() {
  const url = new URL(window.location.href);
  const forumId = url.searchParams.get('f');
  if (!forumId) return;

  // 获取当前的 start 参数
  let currentStart = parseInt(url.searchParams.get('start') || '0');
  
  // 计算下一页的 start 值
  const nextStart = currentStart + 50;

  // 构造新的 URL
  url.searchParams.set('start', nextStart.toString());
  
  // 跳转到下一页
  window.location.href = url.toString();
}

// 添加工具栏到页面
function injectToolbar() {
  // 检查是否已存在工具栏
  if (document.getElementById('rutracker-helper-toolbar')) return;

  // 添加 Font Awesome
  const fontAwesome = document.createElement('link');
  fontAwesome.rel = 'stylesheet';
  fontAwesome.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css';
  document.head.appendChild(fontAwesome);

  // 创建工具栏容器
  const toolbar = document.createElement('div');
  toolbar.id = 'rutracker-helper-toolbar';
  toolbar.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: rgba(45, 55, 72, 0.95);
    padding: 12px;
    border-radius: 12px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06);
    z-index: 99999;
    display: flex;
    flex-direction: column;
    gap: 10px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 14px;
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    min-width: 200px;
    transition: all 0.3s ease;
  `;

  // 创建工具栏内容
  toolbar.innerHTML = `
    <style>
      #rutracker-helper-toolbar button {
        background: rgba(74, 85, 104, 0.8);
        color: white;
        border: none;
        padding: 8px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 16px;
        margin: 0;
        line-height: normal;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        position: relative;
      }
      #rutracker-helper-toolbar button:hover:not([disabled]) {
        background: rgba(66, 153, 225, 0.8);
        transform: translateY(-1px);
      }
      #rutracker-helper-toolbar button[disabled] {
        opacity: 0.6;
        cursor: not-allowed;
      }
      #rutracker-helper-toolbar button i {
        font-size: 16px;
      }
      #rutracker-helper-toolbar select {
        background: rgba(74, 85, 104, 0.8);
        color: white;
        border: none;
        padding: 8px;
        border-radius: 8px;
        font-size: 14px;
        margin: 0;
        flex-grow: 1;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      #rutracker-helper-toolbar select:hover {
        background: rgba(66, 153, 225, 0.8);
      }
      #rutracker-helper-toolbar .toolbar-group {
        display: flex;
        gap: 8px;
        align-items: center;
        margin: 0;
      }
      #rutracker-helper-toolbar .selected-count {
        color: rgba(255, 255, 255, 0.9);
        font-size: 14px;
        margin-left: auto;
      }
      .torTopic input[type="checkbox"] {
        margin-right: 8px;
        vertical-align: middle;
        cursor: pointer;
        width: 16px;
        height: 16px;
        border-radius: 4px;
        border: 2px solid rgba(66, 153, 225, 0.5);
        transition: all 0.2s ease;
      }
      .torTopic input[type="checkbox"]:checked {
        background-color: rgba(66, 153, 225, 0.8);
        border-color: rgba(66, 153, 225, 0.8);
      }
      #rutracker-helper-toolbar .download-progress {
        height: 2px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 1px;
        overflow: hidden;
        display: none;
        margin-top: -8px;
      }
      #rutracker-helper-toolbar .download-progress .progress-bar {
        height: 100%;
        background: #48BB78;
        transition: width 0.3s ease;
      }
      #rutracker-helper-toolbar .toolbar-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 4px;
      }
      #rutracker-helper-toolbar .toolbar-title {
        color: white;
        font-weight: 600;
        font-size: 14px;
      }
      /* 工具提示样式 */
      #rutracker-helper-toolbar button::after {
        content: attr(data-tooltip);
        position: absolute;
        bottom: -30px;
        left: 50%;
        transform: translateX(-50%);
        padding: 4px 8px;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        font-size: 12px;
        border-radius: 4px;
        white-space: nowrap;
        opacity: 0;
        visibility: hidden;
        transition: all 0.2s ease;
      }
      #rutracker-helper-toolbar button:hover::after {
        opacity: 1;
        visibility: visible;
      }
      #rutracker-helper-toolbar .download-button {
        background: rgba(72, 187, 120, 0.8);
        width: 100%;
      }
      #rutracker-helper-toolbar .download-button:hover:not([disabled]) {
        background: rgba(72, 187, 120, 0.9);
      }
      #rutracker-helper-toolbar button.single-download {
        width: 24px;
        height: 24px;
        padding: 4px;
        margin-left: 4px;
        background: rgba(72, 187, 120, 0.8);
      }
      #rutracker-helper-toolbar button.single-download:hover:not([disabled]) {
        background: rgba(72, 187, 120, 0.9);
      }
      #rutracker-helper-toolbar .settings-group {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 0;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        margin-top: 4px;
      }
      #rutracker-helper-toolbar .toggle-switch {
        position: relative;
        display: inline-block;
        width: 36px;
        height: 20px;
      }
      #rutracker-helper-toolbar .toggle-switch input {
        opacity: 0;
        width: 0;
        height: 0;
      }
      #rutracker-helper-toolbar .toggle-slider {
        position: absolute;
        cursor: pointer;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(74, 85, 104, 0.8);
        transition: .4s;
        border-radius: 20px;
      }
      #rutracker-helper-toolbar .toggle-slider:before {
        position: absolute;
        content: "";
        height: 16px;
        width: 16px;
        left: 2px;
        bottom: 2px;
        background-color: white;
        transition: .4s;
        border-radius: 50%;
      }
      #rutracker-helper-toolbar .toggle-switch input:checked + .toggle-slider {
        background-color: rgba(72, 187, 120, 0.8);
      }
      #rutracker-helper-toolbar .toggle-switch input:checked + .toggle-slider:before {
        transform: translateX(16px);
      }
      #rutracker-helper-toolbar .setting-label {
        color: rgba(255, 255, 255, 0.9);
        font-size: 12px;
      }
    </style>
    <div class="toolbar-header">
      <span class="toolbar-title">RuTracker Helper</span>
      <span class="selected-count">0</span>
    </div>
    <div class="toolbar-group">
      <button id="toggle-select" data-tooltip="Select All">
        <i class="fas fa-check-square"></i>
      </button>
      <select id="days-filter">
        <option value="0">All time</option>
        <option value="1">Last 24h</option>
        <option value="3">Last 3 days</option>
        <option value="7">Last 7 days</option>
        <option value="30">Last 30 days</option>
      </select>
      <button id="apply-days-filter" data-tooltip="Apply Filter">
        <i class="fas fa-filter"></i>
      </button>
      <button id="next-page" data-tooltip="Next Page">
        <i class="fas fa-arrow-right"></i>
      </button>
    </div>
    <div class="toolbar-group">
      <button id="toggle-read-status" data-tooltip="Select Unread">
        <i class="fas fa-eye-slash"></i>
      </button>
      <button id="batch-preview" data-tooltip="Preview Selected">
        <i class="fas fa-eye"></i>
      </button>
      <button id="batch-download" class="download-button" data-tooltip="Download Selected">
        <i class="fas fa-download"></i>
      </button>
    </div>
    <div class="download-progress">
      <div class="progress-bar" style="width: 0%"></div>
    </div>
    <div class="settings-group">
      <label class="setting-label">Ask save location</label>
      <label class="toggle-switch">
        <input type="checkbox" id="ask-save-location">
        <span class="toggle-slider"></span>
      </label>
    </div>
  `;

  document.body.appendChild(toolbar);
  setupToolbarHandlers();
}

// 设置工具栏事件处理
function setupToolbarHandlers() {
  const checkboxes = new Map<string, HTMLInputElement>();

  // 为每个种子主题添加复选框
  document.querySelectorAll('div.torTopic').forEach(div => {
    // 检查是否包含 tor-consumed 标签，如果包含则跳过
    const hasConsumedIcon = div.querySelector('span.tor-icon.tor-consumed');
    if (hasConsumedIcon) return;

    const link = div.querySelector('a.torTopic.bold, a.tt-text, a.gen.tt-text');
    if (!link) return;

    const id = link.getAttribute('href')?.match(/t=(\d+)/)?.[1];
    if (!id) return;

    // 检查是否已经添加了复选框
    if (div.querySelector('input[type="checkbox"]')) return;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.style.cssText = 'margin-right: 8px; cursor: pointer; vertical-align: middle;';
    checkbox.dataset.torrentId = id;
    
    // 创建单个下载按钮
    const singleDownloadBtn = document.createElement('button');
    singleDownloadBtn.className = 'single-download';
    singleDownloadBtn.setAttribute('data-tooltip', 'Download this torrent');
    singleDownloadBtn.innerHTML = '<i class="fas fa-download"></i>';
    singleDownloadBtn.style.cssText = `
      width: 24px;
      height: 24px;
      padding: 4px;
      margin-left: 4px;
      background: rgba(72, 187, 120, 0.8);
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      vertical-align: middle;
      transition: all 0.2s ease;
    `;
    singleDownloadBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const url = `https://rutracker.org/forum/dl.php?t=${id}`;
      const title = link.textContent?.trim() || 'Unknown Title';
      await downloadTorrent(url, title);
    });

    // 创建单个预览按钮
    const singlePreviewBtn = document.createElement('button');
    singlePreviewBtn.className = 'single-preview';
    singlePreviewBtn.setAttribute('data-tooltip', 'Preview this topic');
    singlePreviewBtn.innerHTML = '<i class="fas fa-eye"></i>';
    singlePreviewBtn.style.cssText = `
      width: 24px;
      height: 24px;
      padding: 4px;
      margin-left: 4px;
      background: rgba(66, 153, 225, 0.8);
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      vertical-align: middle;
      transition: all 0.2s ease;
    `;
    singlePreviewBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const url = link.getAttribute('href');
      if (url) {
        window.open(url.startsWith('http') ? url : `https://rutracker.org/forum/${url}`, '_blank');
      }
    });
    
    // 创建单个搜索按钮
    const singleSearchBtn = document.createElement('button');
    singleSearchBtn.className = 'single-search';
    singleSearchBtn.setAttribute('data-tooltip', 'Search for artist/band');
    singleSearchBtn.innerHTML = '<i class="fas fa-search"></i>';
    singleSearchBtn.style.cssText = `
      width: 24px;
      height: 24px;
      padding: 4px;
      margin-left: 4px;
      background: rgba(66, 153, 225, 0.8);
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      vertical-align: middle;
      transition: all 0.2s ease;
    `;
    singleSearchBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const title = link.textContent?.trim() || '';
      // 提取艺术家或乐队名称，忽略括号中的内容
      const artistMatch = title.match(/\)\s*([^\-]+)\s*-\s*/);
      const artist = artistMatch ? artistMatch[1].trim() : '';
      if (artist) {
        const searchUrl = `https://rutracker.org/forum/tracker.php?nm=${encodeURIComponent(artist)}`;
        window.open(searchUrl, '_blank');
      } else {
        alert('Could not extract artist/band name from title.');
      }
    });

    checkboxes.set(id, checkbox);
    div.insertBefore(singleSearchBtn, div.firstChild);
    div.insertBefore(singlePreviewBtn, div.firstChild);
    div.insertBefore(singleDownloadBtn, div.firstChild);
    div.insertBefore(checkbox, div.firstChild);
  });

  // 更新选中计数
  const updateSelectedCount = () => {
    const count = Array.from(checkboxes.values()).filter(cb => cb.checked).length;
    const countElement = document.querySelector('.selected-count');
    if (countElement) countElement.textContent = `Selected: ${count}`;
  };

  // 全选按钮
  document.getElementById('toggle-select')?.addEventListener('click', () => {
    const allChecked = Array.from(checkboxes.values()).every(cb => cb.checked);
    checkboxes.forEach(cb => cb.checked = !allChecked);
    updateSelectedCount();
  });

  // 日期过滤
  document.getElementById('apply-days-filter')?.addEventListener('click', () => {
    const days = parseInt(
      (document.getElementById('days-filter') as HTMLSelectElement).value
    );
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    document.querySelectorAll('div.torTopic').forEach(div => {
      const id = div.querySelector('a')?.getAttribute('href')?.match(/t=(\d+)/)?.[1];
      if (!id) return;

      const dateCell = div.closest('tr')?.querySelector('td.vf-col-last-post p:first-child');
      const dateStr = dateCell?.textContent?.trim() || '';
      const updateDate = parseRuTrackerDate(dateStr);

      const checkbox = checkboxes.get(id);
      if (checkbox) {
        checkbox.checked = updateDate >= cutoffDate;
      }
    });
    updateSelectedCount();
  });

  // 修改选择未读/已读按钮的处理逻辑
  const toggleReadStatusButton = document.getElementById('toggle-read-status');
  let isSelectingUnread = true; // 添加状态变量

  toggleReadStatusButton?.addEventListener('click', () => {
    document.querySelectorAll('div.torTopic').forEach(div => {
      const id = div.querySelector('a')?.getAttribute('href')?.match(/t=(\d+)/)?.[1];
      if (!id) return;

      const isUnread = div.innerHTML.includes('class="t-is-unread"');
      const checkbox = checkboxes.get(id);
      if (checkbox) {
        checkbox.checked = isSelectingUnread ? isUnread : !isUnread;
      }
    });
    
    // 更新按钮文本和状态
    if (toggleReadStatusButton) {
      if (isSelectingUnread) {
        toggleReadStatusButton.textContent = 'Select Read';
        toggleReadStatusButton.setAttribute('data-tooltip', 'Select Read Topics');
      } else {
        toggleReadStatusButton.textContent = 'Select Unread';
        toggleReadStatusButton.setAttribute('data-tooltip', 'Select Unread Topics');
      }
      isSelectingUnread = !isSelectingUnread;
    }
    
    updateSelectedCount();
  });

  // 批量下载
  document.getElementById('batch-download')?.addEventListener('click', async () => {
    const selectedIds = Array.from(checkboxes.entries())
      .filter(([_, cb]) => cb.checked)
      .map(([id]) => {
        // 修改获取标题的逻辑，确保能正确获取到对应的标题
        const div = document.querySelector(`input[data-torrent-id="${id}"]`)?.closest('div.torTopic');
        const link = div?.querySelector('a.torTopic.bold, a.tt-text, a.gen.tt-text');
        const title = link?.textContent?.trim();
        
        // 添加调试日志
        console.log('Selected torrent:', { id, title, div, link });
        
        return {
          id,
          title: title || `torrent-${id}` // 如果无法获取标题，使用 ID 作为后备
        };
      });

    if (selectedIds.length === 0) {
      alert('Please select at least one torrent to download');
      return;
    }

    const downloadButton = document.getElementById('batch-download');
    const progressBar = document.querySelector('#rutracker-helper-toolbar .download-progress') as HTMLElement;
    const progressBarInner = document.querySelector('#rutracker-helper-toolbar .progress-bar') as HTMLElement;

    if (!downloadButton || !progressBar || !progressBarInner) return;

    downloadProgress = {
      current: 0,
      total: selectedIds.length,
      isDownloading: true
    };

    // 更新UI状态
    downloadButton.setAttribute('disabled', 'true');
    downloadButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    downloadButton.setAttribute('data-tooltip', `Downloading 0/${selectedIds.length}`);
    progressBar.style.display = 'block';
    progressBarInner.style.width = '0%';

    let hasError = false;
    let completedCount = 0;

    try {
      // 串行下载，确保每个文件都能正确下载
      for (const torrent of selectedIds) {
        try {
          const url = `https://rutracker.org/forum/dl.php?t=${torrent.id}`;
          
          // 确保使用正确的标题作为文件名
          console.log('Downloading torrent:', { id: torrent.id, title: torrent.title });
          await downloadTorrent(url, torrent.title);
          
          // 更新进度
          completedCount++;
          const progress = (completedCount / selectedIds.length) * 100;
          progressBarInner.style.width = `${progress}%`;
          downloadButton.setAttribute('data-tooltip', `Downloading ${completedCount}/${selectedIds.length}`);
          
          // 添加延迟以避免服务器限制
          if (completedCount < selectedIds.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (error) {
          console.error(`Failed to download torrent ${torrent.title}:`, error);
          hasError = true;
        }
      }
    } catch (error) {
      console.error('Batch download failed:', error);
      hasError = true;
    } finally {
      // 恢复按钮状态
      downloadProgress.isDownloading = false;
      downloadButton.innerHTML = '<i class="fas fa-download"></i>';
      downloadButton.removeAttribute('disabled');
      downloadButton.setAttribute('data-tooltip', 'Download Selected');
      progressBar.style.display = 'none';

      if (hasError) {
        alert('Some downloads failed. Please try again.');
      } else if (completedCount === selectedIds.length) {
        // 所有下载成功完成
        downloadButton.setAttribute('data-tooltip', `Successfully downloaded ${completedCount} torrents`);
      }
    }
  });

  // 批量预览
  document.getElementById('batch-preview')?.addEventListener('click', async () => {
    const selectedIds = Array.from(checkboxes.entries())
      .filter(([_, cb]) => cb.checked)
      .map(([id]) => id);

    if (selectedIds.length === 0) {
      alert('Please select at least one torrent to preview');
      return;
    }

    // 在新标签页中打开选中的种子
    selectedIds.forEach(id => {
      const url = `https://rutracker.org/forum/viewtopic.php?t=${id}`;
      window.open(url, '_blank');
    });
  });

  // 为每个复选框添加change事件
  checkboxes.forEach(cb => {
    cb.addEventListener('change', () => {
      updateSelectedCount();
      
      // 更新全选按钮的状态
      const toggleSelectButton = document.getElementById('toggle-select');
      if (toggleSelectButton) {
        const allChecked = Array.from(checkboxes.values()).every(cb => cb.checked);
        toggleSelectButton.textContent = allChecked ? 'Deselect All' : 'Select All';
      }
    });
  });

  // 读取并设置开关状态
  chrome.storage.sync.get(['askSaveLocation'], (result) => {
    const askSaveLocationToggle = document.getElementById('ask-save-location') as HTMLInputElement;
    if (askSaveLocationToggle) {
      askSaveLocationToggle.checked = result.askSaveLocation ?? false;
    }
  });

  // 监听开关变化
  document.getElementById('ask-save-location')?.addEventListener('change', (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    chrome.storage.sync.set({ askSaveLocation: checked });
  });

  // 下一页按钮
  document.getElementById('next-page')?.addEventListener('click', () => {
    goToNextPage();
  });
}

// 确保 Font Awesome 已加载
function ensureFontAwesomeLoaded() {
  if (!document.querySelector('link[href*="font-awesome"]')) {
    const fontAwesome = document.createElement('link');
    fontAwesome.rel = 'stylesheet';
    fontAwesome.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css';
    document.head.appendChild(fontAwesome);
  }
}

// 修改页面加载事件监听
window.addEventListener('load', () => {
  ensureFontAwesomeLoaded(); // 确保 Font Awesome 已加载
  if (window.location.href.includes('viewforum.php')) {
    setTimeout(() => {
      injectToolbar();
    }, 500); // 添加小延迟确保页面完全加载
  } else if (window.location.href.includes('tracker.php?nm=')) {
    setTimeout(() => {
      injectSearchResultButtons();
    }, 500); // 添加小延迟确保页面完全加载
  }
});

// 添加日期解析函数
function parseRuTrackerDate(dateStr: string): Date {
  // 处理空字符串
  if (!dateStr.trim()) {
    return new Date(0);
  }

  try {
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
}

// 修改下载状态处理函数
function handleDownloadStatus(status: string, error?: string) {
  const downloadButton = document.getElementById('batch-download');
  const progressBar = document.querySelector('#rutracker-helper-toolbar .download-progress') as HTMLElement;
  const progressBarInner = document.querySelector('#rutracker-helper-toolbar .progress-bar') as HTMLElement;
  
  if (!downloadButton || !progressBar || !progressBarInner) return;

  switch (status) {
    case 'error':
      downloadProgress.isDownloading = false;
      downloadButton.innerHTML = '<i class="fas fa-download"></i>';
      downloadButton.removeAttribute('disabled');
      progressBar.style.display = 'none';
      // 显示具体的错误消息
      alert(error || 'Download failed. Please try again.');
      break;
    case 'completed':
      if (downloadProgress.isDownloading) {
        downloadProgress.current += 1;
        const progress = (downloadProgress.current / downloadProgress.total) * 100;
        progressBarInner.style.width = `${progress}%`;
        
        if (downloadProgress.current < downloadProgress.total) {
          // 更新进度
          downloadButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
          downloadButton.setAttribute('data-tooltip', `Downloading ${downloadProgress.current}/${downloadProgress.total}`);
          progressBar.style.display = 'block';
        } else {
          // 所有文件下载完成
          downloadProgress.isDownloading = false;
          downloadButton.innerHTML = '<i class="fas fa-download"></i>';
          downloadButton.setAttribute('data-tooltip', 'Download Selected');
          downloadButton.removeAttribute('disabled');
          progressBar.style.display = 'none';
        }
      } else {
        // 单个文件下载完成
        downloadButton.innerHTML = '<i class="fas fa-download"></i>';
        downloadButton.removeAttribute('disabled');
        progressBar.style.display = 'none';
      }
      break;
  }
}

// 添加搜索结果页面的按钮注入逻辑
function injectSearchResultButtons() {
  document.querySelectorAll('.wbr.t-title').forEach(titleElement => {
    const link = titleElement.querySelector('a');
    if (!link) return;

    const id = link.getAttribute('href')?.match(/t=(\d+)/)?.[1];
    if (!id) return;

    // 创建单个下载按钮
    const singleDownloadBtn = document.createElement('button');
    singleDownloadBtn.className = 'single-download';
    singleDownloadBtn.setAttribute('data-tooltip', 'Download this torrent');
    singleDownloadBtn.innerHTML = '<i class="fas fa-file-download"></i>';
    singleDownloadBtn.style.cssText = `
      width: 24px;
      height: 24px;
      padding: 4px;
      margin-right: 4px;
      background: rgba(72, 187, 120, 0.8);
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      vertical-align: middle;
      transition: all 0.2s ease;
    `;
    singleDownloadBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const url = `https://rutracker.org/forum/dl.php?t=${id}`;
      const title = link.textContent?.trim() || 'Unknown Title';
      await downloadTorrent(url, title);
    });

    // 创建单个预览按钮
    const singlePreviewBtn = document.createElement('button');
    singlePreviewBtn.className = 'single-preview';
    singlePreviewBtn.setAttribute('data-tooltip', 'Preview this topic');
    singlePreviewBtn.innerHTML = '<i class="fas fa-eye"></i>';
    singlePreviewBtn.style.cssText = `
      width: 24px;
      height: 24px;
      padding: 4px;
      margin-right: 4px;
      background: rgba(66, 153, 225, 0.8);
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      vertical-align: middle;
      transition: all 0.2s ease;
    `;
    singlePreviewBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const url = link.getAttribute('href');
      if (url) {
        window.open(url.startsWith('http') ? url : `https://rutracker.org/forum/${url}`, '_blank');
      }
    });

    titleElement.insertBefore(singlePreviewBtn, link);
    titleElement.insertBefore(singleDownloadBtn, link);
  });
}