import express from 'express';
import cors from 'cors';
import path from 'path';
import routes from './src/routes';
import database from './src/services/database';
const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
const GRADING_ROOT = process.env.GRADING_SCRIPT_DIR
    || path.resolve(process.cwd(), '..', 'scripts', 'grading_service');
app.use('/scripts/grading_service', express.static(GRADING_ROOT, {
    index: false,
    fallthrough: true,
    maxAge: '1d'
}));
console.log(`🖼️  Serving grading images from: ${GRADING_ROOT} at /scripts/grading_service`);
app.use('/', routes);
const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 API available at http://localhost:${PORT}`);
});
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
//# sourceMappingURL=index.js.map