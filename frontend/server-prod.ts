import { serve } from "bun";

const dist = new URL("./dist/", import.meta.url);

serve({
  port: 3017,
  async fetch(request: Request) {
    const url = new URL(request.url);
    let path = url.pathname;
    
    // Don't serve /api, /uploads, or /grading_service from frontend - these are backend routes
    if (path.startsWith("/api") || path.startsWith("/uploads") || path.startsWith("/grading_service")) {
      return new Response("Not Found", { status: 404 });
    }
    
    // Remove leading slash and trailing slash for file resolution
    const cleanPath = path.replace(/^\/|\/$/g, "");
    const filePath = new URL(cleanPath || "index.html", dist).pathname;
    
    // Check if file exists, otherwise serve index.html for SPA routing
    const file = Bun.file(filePath);
    if (await file.exists()) {
      return new Response(file);
    }

    // Serve index.html for SPA routing
    return new Response(Bun.file(new URL("index.html", dist).pathname));
  },
});

console.log("Student Portal Frontend running on http://localhost:3017");
