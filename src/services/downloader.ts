import { spawn } from 'bun';
import { mkdir, readdir, stat } from 'fs/promises';
import { join } from 'path';
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

  let output = '';
  let errorOutput = '';
  let lastProgress = 0;

  // Snapshot the download directory so we can identify the exact file(s) this
  // download produced (parsing yt-dlp's output is unreliable for merged files).
  const filesBefore = new Set(await readdir(config.downloadDir).catch(() => []));

  // Parse progress from stdout
  const progressRegex = /\[download\]\s+(\d+\.?\d*)%/;

  const child = spawn({
    cmd: [config.ytdlpBinary, ...args],
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      LANG: 'en_US.UTF-8',
    },
  });

  // Note: Bun's spawn() silently ignores onStdout/onStderr options, so the
  // child's stdout/stderr ReadableStreams must be consumed directly.
  const stdoutReader = child.stdout.getReader();
  const stderrReader = child.stderr.getReader();

  // Consume stdout in the background (progress + destination lines).
  const stdoutPromise = (async () => {
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await stdoutReader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      output += text;

      const match = text.match(progressRegex);
      if (match) {
        const progress = parseFloat(match[1]);
        if (!isNaN(progress)) {
          lastProgress = progress;
          jobManager.updateItemStatus(jobId, item.id, 'downloading', { progress });
        }
      }
    }
  })();

  // Consume stderr in the background (error messages).
  const stderrPromise = (async () => {
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await stderrReader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
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
    }
  })();

  const exitCode = await child.exited;

  // Make sure all buffered output is consumed before parsing filenames.
  await Promise.all([stdoutPromise, stderrPromise]);

  if (exitCode === 0) {
    // Candidate name from yt-dlp's output. For merged downloads this can be an
    // intermediate part name that gets deleted after merging, so we cross-check
    // against the actual files on disk.
    const destinationMatch = output.match(/\[download\] Destination: (.+)/);
    const parsedName = destinationMatch?.[1]?.split('/').pop()
      ?? output.match(/\[Merger\] Merging formats into "(.+)"/)?.[1]?.split('/').pop();

    const filename = await resolveDownloadedFilename(filesBefore, parsedName);

    if (filename) {
      jobManager.updateItemStatus(jobId, item.id, 'completed', {
        progress: 100,
        filename: sanitizeFilename(filename),
        completedAt: Date.now()
      });
    } else {
      jobManager.updateItemStatus(jobId, item.id, 'failed', {
        error: 'Downloaded file could not be located',
        completedAt: Date.now()
      });
    }
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

/**
 * Determines the actual file this download produced by looking at the files
 * that appeared in the download directory while the process was running.
 *
 * yt-dlp's printed "Destination"/"Merger" name isn't always the final on-disk
 * name: merged downloads delete their intermediate parts, and long titles can
 * be truncated. Prefer the parsed name when it exists on disk, otherwise pick
 * the newest file created during the download.
 */
async function resolveDownloadedFilename(
  filesBefore: Set<string>,
  preferredName?: string,
): Promise<string | null> {
  const entries = await readdir(config.downloadDir, { withFileTypes: true }).catch(() => []);
  const candidates: { name: string; mtimeMs: number }[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const name = entry.name;
    if (name.endsWith('.part')) continue;      // still in progress
    if (filesBefore.has(name)) continue;       // not from this download

    const fullPath = join(config.downloadDir, name);
    const st = await stat(fullPath).catch(() => null);
    if (!st) continue;

    candidates.push({ name, mtimeMs: st.mtimeMs });
  }

  if (preferredName) {
    const exact = candidates.find(c => c.name === preferredName);
    if (exact) return exact.name;
  }

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0]?.name ?? null;
}
