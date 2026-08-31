export const config = {
  port: parseInt(process.env.PORT || '3000'),
  hostname: process.env.HOST || '0.0.0.0',
  downloadDir: process.env.DOWNLOAD_DIR || './downloads',
  maxConcurrentDownloads: parseInt(process.env.MAX_CONCURRENT_DOWNLOADS || '2'),
  ytdlpBinary: process.env.YTDLP_BINARY || 'yt-dlp',
  maxDownloadTimeout: parseInt(process.env.MAX_DOWNLOAD_TIMEOUT || '3600000'), // 1 hour
};

export const FORMATS = {
  'best': {
    label: 'Best video + audio',
    args: ['-f', 'bestvideo+bestaudio/best'],
    extension: '.mp4'
  },
  'video': {
    label: 'Best video only',
    args: ['-f', 'bestvideo'],
    extension: '.mp4'
  },
  'audio': {
    label: 'Best audio only',
    args: ['-f', 'bestaudio'],
    extension: '.m4a'
  },
  'mp4': {
    label: 'MP4 (video + audio)',
    args: ['-f', 'mp4'],
    extension: '.mp4'
  },
  'webm': {
    label: 'WebM (video + audio)',
    args: ['-f', 'webm'],
    extension: '.webm'
  },
  'mp3': {
    label: 'MP3 (audio)',
    args: ['-f', 'bestaudio', '--extract-audio', '--audio-format', 'mp3'],
    extension: '.mp3'
  }
} as const;

export type FormatKey = keyof typeof FORMATS;
