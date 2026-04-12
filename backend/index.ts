import express from 'express';
import cors from 'cors';
import path from 'path';
import routes from './src/routes';
import database from './src/services/database';

const app = express();

// Middleware 
app.use(cors());
app.use(express.json());

// Serve static files from uploads directory (use cwd for Docker compatibility)
const UPLOADS_ROOT = path.resolve(process.cwd(), 'uploads');
app.use('/uploads', express.static(UPLOADS_ROOT, {
  index: false,
  fallthrough: true,
  maxAge: '1d'
}));
console.log(`📁 Serving uploads from: ${UPLOADS_ROOT} at /uploads`);

// Serve grading images (annotated bubble outputs) from grading_service directory
// Try multiple possible locations for Docker/local dev compatibility
const possibleGradingPaths = [
  process.env.GRADING_SCRIPT_DIR,
  path.resolve(process.cwd(), 'grading_service'),
  path.resolve(__dirname, 'grading_service'),
  path.resolve(__dirname, '..', 'grading_service'),
].filter(Boolean) as string[];

let GRADING_ROOT = possibleGradingPaths[0]!;
for (const p of possibleGradingPaths) {
  const fs = require('fs');
  if (fs.existsSync(p)) {
    GRADING_ROOT = p;
    break;
  }
}

app.use('/grading_service', express.static(GRADING_ROOT, {
  index: false,
  fallthrough: true,
  maxAge: '1d'
}));
console.log(`🖼️  Serving grading images from: ${GRADING_ROOT} at /grading_service`);

// Routes
app.use('/', routes);

const PORT = process.env.PORT || 3016;
 
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 API available at http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  server.close(async () => {
    console.log('🔌 HTTP server closed');
    await database.close();
    console.log('🗄️ Database connection closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  server.close(async () => {
    console.log('🔌 HTTP server closed');
    await database.close();
    console.log('🗄️ Database connection closed');
    process.exit(0);
  });
});