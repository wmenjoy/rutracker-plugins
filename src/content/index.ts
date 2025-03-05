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

// 监听来自弹出窗口的消息
chrome.runtime.onMessage.addListener((message: Message) => {
  if (message.action === 'scan') {
    scanPage();
  } else if (message.action === 'download' && message.url) {
    downloadTorrent(message.url);
  } else if (message.action === 'batchDownload' && message.urls) {
    handleBatchDownload(message.urls);
  } else if (message.action === 'goToNextPage') {
    goToNextPage();
  } else if (message.action === 'injectToolbar') {
    injectToolbar();
  } else if (message.action === 'downloadStatus') {
    if (message.status) {
      handleDownloadStatus(message.status, message.error);
    }
  }
});

// 扫描页面上的种子链接
function scanPage() {
  const torrentDivs = document.querySelectorAll('div.torTopic');
  const torrents: TorrentItem[] = [];

  torrentDivs.forEach((div) => {
    // 检查是否包含 t-icon-attach 图标，如果包含则跳过
    const hasAttachIcon = div.querySelector('img.t-icon-attach');
    if (hasAttachIcon) return;

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

// 修改下载函数
async function downloadTorrent(url: string, title?: string) {
  try {
    // 检查登录状态 - 使用多个指标
    const loginIndicators = [
      document.querySelector('a.logged-in-username'),           // 用户名链接
      document.querySelector('a[href*="logout="]'),            // 登出链接
      document.querySelector('.topmenu a[href*="profile.php"]') // 个人资料链接
    ];
    
    const isLoggedIn = loginIndicators.some(indicator => indicator !== null);
    if (!isLoggedIn) {
      // 获取登录页面链接
      const loginUrl = 'https://rutracker.org/forum/login.php';
      if (confirm('You need to login to RuTracker first. Would you like to open the login page?')) {
        window.open(loginUrl, '_blank');
      }
      throw new Error('Please login to RuTracker first');
    }

    // 发送消息给 background script 处理下载
    await chrome.runtime.sendMessage({
      action: 'downloadTorrent',
      url: url,
      filename: title ? `${title.replace(/[<>:"/\\|?*]/g, '_')}.torrent` : undefined
    });
  } catch (error) {
    console.error('Failed to download torrent:', error);
    handleDownloadStatus('error', error instanceof Error ? error.message : 'Failed to download torrent');
  }
}

// 修改批量下载处理函数
async function handleBatchDownload(urls: string[]) {
  const downloadButton = document.getElementById('batch-download');
  const progressBar = document.querySelector('#rutracker-helper-toolbar .download-progress') as HTMLElement;
  const progressBarInner = document.querySelector('#rutracker-helper-toolbar .progress-bar') as HTMLElement;
  
  if (!downloadButton || !progressBar || !progressBarInner) return;

  // 检查登录状态 - 使用多个指标
  const loginIndicators = [
    document.querySelector('a.logged-in-username'),           // 用户名链接
    document.querySelector('a[href*="logout="]'),            // 登出链接
    document.querySelector('.topmenu a[href*="profile.php"]') // 个人资料链接
  ];
  
  const isLoggedIn = loginIndicators.some(indicator => indicator !== null);
  if (!isLoggedIn) {
    const loginUrl = 'https://rutracker.org/forum/login.php';
    if (confirm('You need to login to RuTracker first. Would you like to open the login page?')) {
      window.open(loginUrl, '_blank');
    }
    return;
  }

  downloadProgress = {
    current: 0,
    total: urls.length,
    isDownloading: true
  };

  downloadButton.setAttribute('disabled', 'true');
  downloadButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  downloadButton.setAttribute('data-tooltip', `Downloading 0/${urls.length}`);
  progressBar.style.display = 'block';
  progressBarInner.style.width = '0%';

  // 获取所有选中的种子信息
  const selectedTorrents = Array.from(document.querySelectorAll('div.torTopic')).map(div => {
    const link = div.querySelector('a.torTopic.bold, a.tt-text, a.gen.tt-text');
    const id = link?.getAttribute('href')?.match(/t=(\d+)/)?.[1];
    const title = link?.textContent?.trim() || 'Unknown Title';
    return { id, title };
  }).filter(({ id }) => urls.includes(`https://rutracker.org/forum/dl.php?t=${id}`));

  let hasError = false;

  for (const torrent of selectedTorrents) {
    try {
      const url = `https://rutracker.org/forum/dl.php?t=${torrent.id}`;
      await downloadTorrent(url, torrent.title);
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error('Failed to download torrent:', error);
      hasError = true;
    }
  }

  if (hasError) {
    alert('Some downloads failed. Please try again.');
  }

  // 恢复按钮状态
  downloadButton.innerHTML = '<i class="fas fa-download"></i>';
  downloadButton.removeAttribute('disabled');
  downloadButton.setAttribute('data-tooltip', 'Download Selected');
  progressBar.style.display = 'none';
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
  `;

  document.body.appendChild(toolbar);
  setupToolbarHandlers();
}

// 设置工具栏事件处理
function setupToolbarHandlers() {
  const checkboxes = new Map<string, HTMLInputElement>();

  // 为每个种子主题添加复选框
  document.querySelectorAll('div.torTopic').forEach(div => {
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
    
    checkboxes.set(id, checkbox);
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

  // 选择未读/已读
  document.getElementById('toggle-read-status')?.addEventListener('click', () => {
    document.querySelectorAll('div.torTopic').forEach(div => {
      const id = div.querySelector('a')?.getAttribute('href')?.match(/t=(\d+)/)?.[1];
      if (!id) return;

      const isUnread = div.innerHTML.includes('class="t-is-unread"');
      const checkbox = checkboxes.get(id);
      if (checkbox) {
        checkbox.checked = !isUnread;
      }
    });
    updateSelectedCount();
  });

  // 批量下载
  document.getElementById('batch-download')?.addEventListener('click', async () => {
    const selectedIds = Array.from(checkboxes.entries())
      .filter(([_, cb]) => cb.checked)
      .map(([id]) => id);

    if (selectedIds.length === 0) {
      alert('Please select at least one torrent to download');
      return;
    }

    const downloadButton = document.getElementById('batch-download');
    if (downloadButton) {
      downloadButton.textContent = `Downloading (0/${selectedIds.length})...`;
      downloadButton.setAttribute('disabled', 'true');
    }

    try {
      for (let i = 0; i < selectedIds.length; i++) {
        const id = selectedIds[i];
        const url = `https://rutracker.org/forum/dl.php?t=${id}`;
        await downloadTorrent(url);

        // 更新下载进度
        if (downloadButton) {
          downloadButton.textContent = `Downloading (${i + 1}/${selectedIds.length})...`;
        }

        // 添加延迟以避免过快下载
        if (i < selectedIds.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    } catch (error) {
      console.error('Failed to batch download torrents:', error);
      alert('Some downloads failed. Please try again.');
    } finally {
      // 恢复按钮状态
      if (downloadButton) {
        downloadButton.textContent = 'Download Selected';
        downloadButton.removeAttribute('disabled');
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
}

// 修改页面加载事件监听
// 将 DOMContentLoaded 改为 load，因为有些内容可能在 DOMContentLoaded 后才加载
window.addEventListener('load', () => {
  if (window.location.href.includes('viewforum.php')) {
    setTimeout(() => {
      injectToolbar();
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