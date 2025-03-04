export interface TorrentItem {
  id: string;
  title: string;
  url: string;
  downloadUrl: string;
  isVisited: boolean;
}

export type Message = {
  action: 'scan';
} | {
  action: 'download';
  url: string;
}; 