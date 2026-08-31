# yt-dlp-webui

A lightweight YouTube video downloader web UI built with [Bun](https://bun.sh) and [yt-dlp](https://github.com/yt-dlp/yt-dlp).

Paste one or more YouTube URLs, pick a format, and download them — all through a clean browser interface. Downloads run in the background with per-file progress tracking.

## Features

- 🎯 Paste up to 20 YouTube URLs at once
- 🎬 Multiple output formats (best quality, video-only, audio-only, MP4, WebM, MP3)
- 📊 Live download progress per item
- 📁 Browse and download finished files
- 🤖 Finished jobs download automatically (single file, or a ZIP for multiple files)
- 🗜️ Manual "Download ZIP" button per job
- �🔒 URL validation (YouTube domains + valid video IDs only)
- ⏱️ Concurrent download queue with configurable limits

## Requirements

- [Bun](https://bun.sh) v1.x
- [yt-dlp](https://github.com/yt-dlp/yt-dlp#installation) (on the `PATH`)
- [FFmpeg](https://ffmpeg.org/) — required for merging video+audio and audio conversion

## Quick Start

```bash
# 1. Install dependencies
bun install

# 2. Start the server
bun run dev
```

Open http://localhost:3000 in your browser.

## Configuration

All configuration lives in `src/config.ts` and can be overridden with environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port the server listens on |
| `DOWNLOAD_DIR` | `./downloads` | Where downloaded files are saved |
| `MAX_CONCURRENT_DOWNLOADS` | `2` | Max parallel downloads |
| `YTDLP_BINARY` | `yt-dlp` | Path to the `yt-dlp` binary |
| `MAX_DOWNLOAD_TIMEOUT` | `3600000` | Max download timeout (ms) |

## Scripts

| Command | Description |
| --- | --- |
| `bun run dev` | Start the development server |
| `bun run start` | Start the server (alias of dev) |
| `bun test` | Run the test suite |
| `./deploy.sh` | Push to GitHub and deploy to the VPS |

## API

### `GET /api/formats`
Returns the list of available download formats.

### `POST /api/download`
Create a download job.

```json
{
  "urls": ["https://www.youtube.com/watch?v=..."],
  "format": "best"
}
```

Returns a `jobId` plus any invalid URLs that were rejected.

### `GET /api/download/:jobId`
Returns the status and per-item progress of a job.

### `GET /api/jobs`
Returns all jobs (download history) with per-item progress and the names of
downloaded files.

### `GET /api/download/:jobId/files`
Lists the finished files for a job.

### `GET /api/download/:jobId/zip`
Streams a ZIP archive containing all completed files of a job.

### `GET /api/download/:jobId/files/:filename`
Streams a finished file for download.

## Project Structure

```
yt-dlp-webui/
├── public/            # Static frontend (HTML/CSS/JS)
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── src/
│   ├── server.ts      # Bun HTTP server + API routes
│   ├── config.ts      # Configuration & format presets
│   ├── types.ts       # Shared TypeScript types
│   ├── services/
│   │   ├── downloader.ts    # yt-dlp process orchestration
│   │   ├── job-manager.ts   # Download queue & job state
│   │   └── zip.ts           # Per-job ZIP archive streaming
│   └── validation/
│       └── youtube-url.ts   # URL validation & filename sanitizing
├── deploy.sh          # Deploy script (GitHub -> VPS)
└── package.json
```

## Deployment

See [deploy.sh](deploy.sh). The script pushes the current branch to GitHub and then
SSHs into the VPS to clone (or pull) the repo and install dependencies.

1. Edit the variables at the top of `deploy.sh` (repo URL, SSH target, remote path).
2. Make sure the VPS has `bun` and `yt-dlp` installed.
3. Run:

```bash
./deploy.sh
```

> **Note:** The `downloads/` and `node_modules/` directories are git-ignored, so they
> are never pushed. Any files already in `downloads/` on the server are preserved.

## License

MIT
