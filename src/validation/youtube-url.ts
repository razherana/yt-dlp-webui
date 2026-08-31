const ALLOWED_DOMAINS = [
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com'
];

export function validateYouTubeUrl(input: string): string | null {
  try {
    // Trim whitespace
    const url = input.trim();
    
    if (!url) {
      return null;
    }
    
    // Parse URL
    const parsed = new URL(url);
    
    // Check protocol
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }
    
    // Check hostname
    if (!ALLOWED_DOMAINS.includes(parsed.hostname.toLowerCase())) {
      return null;
    }
    
    // Check for valid video ID
    let videoId: string | null = null;
    
    if (parsed.hostname === 'youtu.be') {
      // youtu.be/VIDEO_ID
      videoId = parsed.pathname.split('/')[1];
    } else {
      // youtube.com/watch?v=VIDEO_ID
      videoId = parsed.searchParams.get('v');
    }
    
    if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return null;
    }
    
    // Return normalized URL
    return `https://www.youtube.com/watch?v=${videoId}`;
  } catch {
    return null;
  }
}

export function sanitizeFilename(filename: string): string {
  // Remove path traversal characters
  const sanitized = filename
    .replace(/\.\./g, '')
    .replace(/[\/\\]/g, '')
    .replace(/[^\w\-\.\s]/g, '_')
    .trim()
    .slice(0, 200); // Limit length
  
  return sanitized || 'download';
}
