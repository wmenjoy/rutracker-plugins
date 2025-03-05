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
  action: string;
  url?: string;
  urls?: string[];
  status?: string;
  error?: string;
  filename?: string;
} 