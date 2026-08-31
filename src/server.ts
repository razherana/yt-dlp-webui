import { serve, file } from 'bun';
import { mkdir, readdir, stat } from 'fs/promises';
import { join, extname } from 'path';
import { config, FORMATS, type FormatKey } from './config';
import { jobManager } from './services/job-manager';
import { validateYouTubeUrl } from './validation/youtube-url';
import type { ApiResponse } from './types';

// Ensure download directory exists
await mkdir(config.downloadDir, { recursive: true });

const server = serve({
  port: config.port,
  hostname: config.hostname,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    
    // Handle OPTIONS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    try {
      // API Routes
      if (path === '/api/formats') {
        return handleGetFormats(corsHeaders);
      }
      
      if (path === '/api/download' && req.method === 'POST') {
        return await handleCreateDownload(req, corsHeaders);
      }
      
      if (path.startsWith('/api/download/')) {
        const parts = path.split('/').filter(Boolean);
        // /api/download/:jobId
        if (parts.length === 3) {
          return handleGetJobStatus(parts[2], corsHeaders);
        }
        // /api/download/:jobId/files
        if (parts.length === 4 && parts[3] === 'files') {
          return handleGetJobFiles(parts[2], corsHeaders);
        }
        // /api/download/:jobId/files/:filename
        if (parts.length === 5 && parts[3] === 'files') {
          return handleGetFile(parts[2], parts[4], corsHeaders);
        }
      }
      
      // Serve static files
      if (path === '/' || path === '/index.html') {
        return new Response(file('./public/index.html'), {
          headers: { 'Content-Type': 'text/html', ...corsHeaders }
        });
      }
      
      if (path.startsWith('/public/')) {
        const staticPath = `.${path}`;
        const staticFile = file(staticPath);
        if (staticFile) {
          const contentType = getContentType(staticPath);
          return new Response(staticFile, {
            headers: { 'Content-Type': contentType, ...corsHeaders }
          });
        }
      }
      
      // Serve app.js and styles.css
      if (path === '/app.js' || path === '/styles.css') {
        const staticFile = file(`./public${path}`);
        if (staticFile) {
          const contentType = path.endsWith('.js') ? 'application/javascript' : 'text/css';
          return new Response(staticFile, {
            headers: { 'Content-Type': contentType, ...corsHeaders }
          });
        }
      }
      
      return jsonResponse({ success: false, error: 'Not found' }, 404, corsHeaders);
      
    } catch (error) {
      console.error('Server error:', error);
      return jsonResponse(
        { success: false, error: 'Internal server error' },
        500,
        corsHeaders
      );
    }
  }
});

console.log(`🚀 YouTube Downloader running on http://localhost:${config.port}`);

function jsonResponse(data: any, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers }
  });
}

function getContentType(path: string): string {
  const ext = extname(path).toLowerCase();
  const types: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
  };
  return types[ext] || 'application/octet-stream';
}

function handleGetFormats(corsHeaders: any): Response {
  const formats = Object.entries(FORMATS).map(([key, value]) => ({
    id: key,
    label: value.label,
    extension: value.extension
  }));
  
  return jsonResponse({ success: true, data: formats }, 200, corsHeaders);
}

async function handleCreateDownload(req: Request, corsHeaders: any): Promise<Response> {
  const body = await req.json().catch(() => null);
  
  if (!body || !body.urls || !Array.isArray(body.urls) || body.urls.length === 0) {
    return jsonResponse(
      { success: false, error: 'Please provide at least one URL' },
      400,
      corsHeaders
    );
  }
  
  if (body.urls.length > 20) {
    return jsonResponse(
      { success: false, error: 'Too many URLs (max 20)' },
      400,
      corsHeaders
    );
  }
  
  const format = body.format || 'best';
  if (!FORMATS[format as FormatKey]) {
    return jsonResponse(
      { success: false, error: 'Invalid format specified' },
      400,
      corsHeaders
    );
  }
  
  // Validate all URLs
  const validatedUrls: string[] = [];
  const invalidUrls: string[] = [];
  
  for (const url of body.urls) {
    if (typeof url !== 'string') {
      invalidUrls.push(String(url));
      continue;
    }
    
    const validated = validateYouTubeUrl(url);
    if (validated) {
      validatedUrls.push(validated);
    } else {
      invalidUrls.push(url);
    }
  }
  
  if (validatedUrls.length === 0) {
    return jsonResponse(
      { success: false, error: 'No valid YouTube URLs provided', invalidUrls },
      400,
      corsHeaders
    );
  }
  
  const job = jobManager.createJob(validatedUrls, format);
  
  return jsonResponse(
    { 
      success: true, 
      data: { 
        jobId: job.id, 
        totalUrls: validatedUrls.length,
        invalidUrls 
      } 
    },
    201,
    corsHeaders
  );
}

function handleGetJobStatus(jobId: string, corsHeaders: any): Response {
  const job = jobManager.getJob(jobId);
  
  if (!job) {
    return jsonResponse({ success: false, error: 'Job not found' }, 404, corsHeaders);
  }
  
  return jsonResponse({ success: true, data: job }, 200, corsHeaders);
}

function handleGetJobFiles(jobId: string, corsHeaders: any): Response {
  const job = jobManager.getJob(jobId);
  
  if (!job) {
    return jsonResponse({ success: false, error: 'Job not found' }, 404, corsHeaders);
  }
  
  const files = jobManager.getDownloadedFiles(jobId);
  return jsonResponse({ success: true, data: files }, 200, corsHeaders);
}

function handleGetFile(jobId: string, filename: string, corsHeaders: any): Response {
  const job = jobManager.getJob(jobId);
  
  if (!job) {
    return jsonResponse({ success: false, error: 'Job not found' }, 404, corsHeaders);
  }
  
  const files = jobManager.getDownloadedFiles(jobId);
  const fileInfo = files.find(f => f.filename === filename);
  
  if (!fileInfo) {
    return jsonResponse({ success: false, error: 'File not found' }, 404, corsHeaders);
  }
  
  const fileContent = file(fileInfo.path);
  if (!fileContent) {
    return jsonResponse({ success: false, error: 'File not found' }, 404, corsHeaders);
  }
  
  return new Response(fileContent, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${filename}"`,
      ...corsHeaders
    }
  });
}
