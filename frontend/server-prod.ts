// @ts-nocheck
// Production server for serving built Vite app with Bun
// This file runs exclusively with Bun runtime

const dist = "./dist/";

const server = Bun.serve({
  port: 3010,
  async fetch(request) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Reject API and uploads requests - these should be routed to backend via Traefik
    if (pathname.startsWith("/api") || pathname.startsWith("/uploads") || pathname.startsWith("/grading_service")) {
      return new Response("Not Found", { status: 404 });
    }

    // Try to serve the requested file
    const filePath = dist + pathname.slice(1); // Remove leading slash
    const requestedFile = Bun.file(filePath);
    
    if (await requestedFile.exists()) {
      // Determine content type based on extension
      const ext = pathname.split('.').pop()?.toLowerCase();
      const contentTypes = {
        'html': 'text/html',
        'css': 'text/css',
        'js': 'application/javascript',
        'json': 'application/json',
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'gif': 'image/gif',
        'svg': 'image/svg+xml',
        'ico': 'image/x-icon',
        'woff': 'font/woff',
        'woff2': 'font/woff2',
        'ttf': 'font/ttf',
        'eot': 'application/vnd.ms-fontobject',
      };
      
      const contentType = ext ? contentTypes[ext] : undefined;
      
      return new Response(requestedFile, {
        headers: contentType ? { 'Content-Type': contentType } : undefined,
      });
    }

    // SPA fallback - serve index.html for all other routes
    const indexHtml = Bun.file(dist + "index.html");
    return new Response(indexHtml, {
      headers: { 'Content-Type': 'text/html' },
    });
  },
});

console.log(`Frontend running on http://localhost:${server.port}`);
