export interface TorrentItem {
  id: string;
  title: string;
  url: string;
  downloadUrl: string;
  isVisited: boolean;
  updateDate: string;
  isUnread: boolean;
}

export interface Message {
  action: 'scan' | 'download' | 'batchDownload' | 'goToNextPage' | 'injectToolbar';
  url?: string;
  urls?: string[];
} 