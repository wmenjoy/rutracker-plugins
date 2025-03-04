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
  }
});

// 扫描页面上的种子链接
function scanPage() {
  // 选择带有特定 class 的链接
  const torrentLinks = document.querySelectorAll('a.torTopic.t-is-unread');
  const torrents: TorrentItem[] = [];

  torrentLinks.forEach((link) => {
    const url = link.getAttribute('href');
    if (!url) return;

    const id = url.match(/t=(\d+)/)?.[1];
    if (!id) return;

    // 查找种子下载链接
    const row = link.closest('tr');
    const dlLink = row?.querySelector('a[href*="dl.php?t="]')?.getAttribute('href');

    torrents.push({
      id,
      title: link.textContent?.trim() || 'Unknown Title',
      url: url.startsWith('http') ? url : `https://rutracker.org${url}`,
      downloadUrl: dlLink ? (dlLink.startsWith('http') ? dlLink : `https://rutracker.org${dlLink}`) : '',
      isVisited: false
    });
  });

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

// 下载种子文件
async function downloadTorrent(url: string) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const filename = url.split('/').pop() || 'torrent.torrent';
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (error) {
    console.error('Failed to download torrent:', error);
  }
}

// 监听下载消息
chrome.runtime.onMessage.addListener((message: Message) => {
  if (message.action === 'download' && message.url) {
    downloadTorrent(message.url);
  }
});