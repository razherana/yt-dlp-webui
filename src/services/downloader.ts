import { spawn } from 'bun';
import { mkdir, exists } from 'fs/promises';
import { config, FORMATS, type FormatKey } from '../config';
import { jobManager } from './job-manager';
import { sanitizeFilename } from '../validation/youtube-url';
import type { DownloadItem } from '../types';

export async function downloadVideo(jobId: string, item: DownloadItem): Promise<void> {
  const formatConfig = FORMATS[item.format as FormatKey];
  if (!formatConfig) {
    jobManager.updateItemStatus(jobId, item.id, 'failed', { 
      error: 'Invalid format specified' 
    });
    return;
  }

  // Ensure download directory exists
  await mkdir(config.downloadDir, { recursive: true });

  const outputTemplate = `${config.downloadDir}/%(title)s.%(ext)s`;
  
  const args = [
    ...formatConfig.args,
    '-o', outputTemplate,
    '--no-playlist',
    '--restrict-filenames',
    '--no-warnings',
    '--newline', // For progress parsing
    '--progress',
    item.url
  ];

  jobManager.updateItemStatus(jobId, item.id, 'downloading', { 
    startedAt: Date.now(),
    progress: 0 
  });

  const child = spawn({
    cmd: [config.ytdlpBinary, ...args],
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      LANG: 'en_US.UTF-8',
    }
  });

  let output = '';
  let errorOutput = '';
  let lastProgress = 0;

  // Parse progress from stdout
  const progressRegex = /\[download\]\s+(\d+\.?\d*)%/;
  
  child.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    output += text;
    
    const match = text.match(progressRegex);
    if (match) {
      const progress = parseFloat(match[1]);
      if (!isNaN(progress)) {
        lastProgress = progress;
        jobManager.updateItemStatus(jobId, item.id, 'downloading', { progress });
      }
    }
  });

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    errorOutput += text;
    
    // Check for common errors
    if (text.includes('ERROR:')) {
      let error = text.split('ERROR:')[1]?.trim() || 'Unknown error';
      
      if (text.includes('Private video')) {
        error = 'This video is private';
      } else if (text.includes('Video unavailable')) {
        error = 'Video is unavailable';
      } else if (text.includes('ffmpeg')) {
        error = 'FFmpeg is required but not installed';
      } else if (text.includes('timed out') || text.includes('Timeout')) {
        error = 'Download timed out';
      }
      
      jobManager.updateItemStatus(jobId, item.id, 'failed', { error });
    }
  });

  const exitCode = await child.exited;

  if (exitCode === 0) {
    // Extract filename from output
    const destinationMatch = output.match(/\[download\] Destination: (.+)/);
    let filename = destinationMatch?.[1]?.split('/').pop();
    
    if (!filename) {
      const mergedOutputMatch = output.match(/\[Merger\] Merging formats into "(.+)"/);
      filename = mergedOutputMatch?.[1]?.split('/').pop();
    }
    
    if (!filename) {
      filename = `video_${Date.now()}${formatConfig.extension}`;
    }
    
    filename = sanitizeFilename(filename);
    
    jobManager.updateItemStatus(jobId, item.id, 'completed', {
      progress: 100,
      filename,
      completedAt: Date.now()
    });
  } else {
    // Check if we already set an error
    const currentItem = jobManager.getJob(jobId)?.items.find(i => i.id === item.id);
    if (currentItem?.status !== 'failed') {
      jobManager.updateItemStatus(jobId, item.id, 'failed', {
        error: 'Download failed',
        completedAt: Date.now()
      });
    }
  }

  // Cleanup
  child.kill();
}
