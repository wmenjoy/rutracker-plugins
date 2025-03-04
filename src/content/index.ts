import type { TorrentItem, Message } from '../types/types';

// 添加初始化标记到 window 对象
declare global {
  interface Window {
    RUTRACKER_HELPER_INITIALIZED?: boolean;
  }
}

window.RUTRACKER_HELPER_INITIALIZED = true;

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
async function downloadTorrent(url: string) {
  try {
    // 获取配置的下载路径
    const { downloadPath } = await chrome.storage.sync.get(['downloadPath']);
    
    // 创建一个隐藏的 iframe 来触发下载
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    
    if (iframe.contentWindow) {
      // 如果设置了下载路径，添加到 URL 参数中
      const downloadUrl = downloadPath 
        ? `${url}&savepath=${encodeURIComponent(downloadPath)}`
        : url;
      
      iframe.contentWindow.location.href = downloadUrl;
    }

    // 一段时间后移除 iframe
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 5000);
  } catch (error) {
    console.error('Failed to download torrent:', error);
  }
}

// 添加批量下载处理函数
async function handleBatchDownload(urls: string[]) {
  for (const url of urls) {
    await downloadTorrent(url);
    // 添加延迟以避免触发反爬虫机制
    await new Promise(resolve => setTimeout(resolve, 1000));
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

  // 创建工具栏容器
  const toolbar = document.createElement('div');
  toolbar.id = 'rutracker-helper-toolbar';
  toolbar.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    background: #2D3748;
    padding: 10px;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    z-index: 99999;
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-family: Arial, sans-serif;
    font-size: 12px;
    min-width: 200px;
  `;

  // 创建工具栏内容
  toolbar.innerHTML = `
    <style>
      #rutracker-helper-toolbar button {
        background: #4A5568;
        color: white;
        border: none;
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        white-space: nowrap;
        margin: 0;
        line-height: normal;
        transition: background-color 0.2s;
      }
      #rutracker-helper-toolbar button:hover:not([disabled]) {
        background: #2B6CB0;
      }
      #rutracker-helper-toolbar button[disabled] {
        opacity: 0.5;
        cursor: not-allowed;
      }
      #rutracker-helper-toolbar select {
        background: #4A5568;
        color: white;
        border: none;
        padding: 6px;
        border-radius: 4px;
        font-size: 12px;
        margin: 0;
        flex-grow: 1;
      }
      #rutracker-helper-toolbar .toolbar-group {
        display: flex;
        gap: 4px;
        align-items: center;
        margin: 0;
        width: 100%;
      }
      #rutracker-helper-toolbar .selected-count {
        color: white;
        font-size: 12px;
        margin-left: 8px;
        flex-grow: 1;
        text-align: right;
      }
      .torTopic input[type="checkbox"] {
        margin-right: 8px;
        vertical-align: middle;
        cursor: pointer;
        width: 14px;
        height: 14px;
      }
    </style>
    <div class="toolbar-group">
      <button id="toggle-select">Select All</button>
      <span class="selected-count">Selected: 0</span>
    </div>
    <div class="toolbar-group">
      <select id="days-filter">
        <option value="0">All time</option>
        <option value="1">Last 24h</option>
        <option value="3">Last 3 days</option>
        <option value="7">Last 7 days</option>
        <option value="30">Last 30 days</option>
      </select>
      <button id="apply-days-filter">Apply</button>
    </div>
    <div class="toolbar-group">
      <button id="toggle-read-status" style="width: 100%">Select Unread</button>
    </div>
    <div class="toolbar-group">
      <button id="batch-download" style="background: #48BB78; width: 100%">Download Selected</button>
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
    
    checkboxes.set(id, checkbox);
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