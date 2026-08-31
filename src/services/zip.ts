import { ZipArchive } from 'archiver';
import { createReadStream, existsSync } from 'fs';
import { PassThrough } from 'stream';
import { jobManager } from './job-manager';

export interface JobZipResult {
  /** Streaming ZIP bytes, ready to be sent as an HTTP response body. */
  stream: PassThrough;
  fileCount: number;
}

/**
 * Builds a ZIP archive of all completed files for a job, streaming the
 * result so large video files never have to be buffered fully in memory.
 *
 * Returns `null` when the job has no completed files to archive.
 */
export function createJobZip(jobId: string): JobZipResult | null {
  // Only archive files that actually exist on disk, so a missing file can't
  // abort the stream mid-response.
  const files = jobManager.getDownloadedFiles(jobId).filter(f => existsSync(f.path));
  if (files.length === 0) {
    return null;
  }

  const archive = new ZipArchive({ zlib: { level: 9 } });
  const stream = new PassThrough();

  // Swallow stream-level errors: destroy(err) emits 'error', which would
  // otherwise crash the process. Bun aborts the response if the stream
  // errors while it's being read.
  stream.on('error', () => {});

  // Forward any archiver errors to the response stream so the request
  // doesn't hang silently on a failed read.
  const fail = (err: Error) => stream.destroy(err);
  archive.on('error', fail);

  archive.pipe(stream);

  for (const file of files) {
    archive.append(createReadStream(file.path), { name: file.filename });
  }

  // Write the central directory / end-of-archive marker. Must be called
  // after all entries are appended.
  archive.finalize().catch(fail);

  return { stream, fileCount: files.length };
}
