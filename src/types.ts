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

export interface JobSummary {
  id: string;
  status: DownloadStatus;
  createdAt: number;
  updatedAt: number;
  /** Aggregate progress (0-100) across all items in the job. */
  progress: number;
  items: DownloadItem[];
  /** Names of successfully downloaded files for this job. */
  files: string[];
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}
