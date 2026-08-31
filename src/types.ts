export type DownloadStatus = 'queued' | 'downloading' | 'completed' | 'failed';

export interface DownloadItem {
  id: string;
  url: string;
  format: string;
  status: DownloadStatus;
  progress: number;
  filename?: string;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface DownloadJob {
  id: string;
  items: DownloadItem[];
  status: DownloadStatus;
  createdAt: number;
  updatedAt: number;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}
