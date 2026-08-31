import type { DownloadJob, DownloadItem, DownloadStatus } from '../types';
import { config } from '../config';
import { sanitizeFilename } from '../validation/youtube-url';

class JobManager {
  private jobs: Map<string, DownloadJob> = new Map();
  private activeDownloads: Set<string> = new Set();
  private downloadQueue: Array<{ jobId: string; itemId: string }> = [];

  createJob(urls: string[], format: string): DownloadJob {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const items: DownloadItem[] = urls.map((url, index) => ({
      id: `item_${index}_${Math.random().toString(36).slice(2, 6)}`,
      url,
      format,
      status: 'queued' as DownloadStatus,
      progress: 0
    }));

    const job: DownloadJob = {
      id: jobId,
      items,
      status: 'queued',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.jobs.set(jobId, job);
    
    // Queue all items
    items.forEach(item => {
      this.downloadQueue.push({ jobId, itemId: item.id });
    });

    // Start processing queue
    this.processQueue();

    return job;
  }

  getJob(jobId: string): DownloadJob | null {
    return this.jobs.get(jobId) || null;
  }

  getAllJobs(): DownloadJob[] {
    return Array.from(this.jobs.values());
  }

  getDownloadedFiles(jobId: string): Array<{ filename: string; path: string }> {
    const job = this.jobs.get(jobId);
    if (!job) return [];

    return job.items
      .filter(item => item.status === 'completed' && item.filename)
      .map(item => ({
        filename: sanitizeFilename(item.filename!),
        path: `${config.downloadDir}/${sanitizeFilename(item.filename!)}`
      }));
  }

  private async processQueue() {
    if (this.activeDownloads.size >= config.maxConcurrentDownloads) {
      return;
    }

    const next = this.downloadQueue.shift();
    if (!next) return;

    const { jobId, itemId } = next;
    const job = this.jobs.get(jobId);
    if (!job) return;

    const item = job.items.find(i => i.id === itemId);
    if (!item || item.status !== 'queued') {
      this.processQueue();
      return;
    }

    this.activeDownloads.add(itemId);
    
    try {
      // Import downloader dynamically to avoid circular dependency
      const { downloadVideo } = await import('./downloader');
      await downloadVideo(jobId, item);
    } finally {
      this.activeDownloads.delete(itemId);
      this.processQueue();
    }
  }

  updateItemStatus(jobId: string, itemId: string, status: DownloadStatus, data?: Partial<DownloadItem>) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const item = job.items.find(i => i.id === itemId);
    if (!item) return;

    Object.assign(item, { status, ...data });
    job.updatedAt = Date.now();
    
    // Update job status
    const allCompleted = job.items.every(i => i.status === 'completed');
    const allDone = job.items.every(i => ['completed', 'failed'].includes(i.status));
    
    if (allCompleted) {
      job.status = 'completed';
    } else if (allDone) {
      job.status = 'failed';
    } else if (job.items.some(i => i.status === 'downloading' || i.status === 'queued')) {
      job.status = 'downloading';
    }
  }
}

export const jobManager = new JobManager();
