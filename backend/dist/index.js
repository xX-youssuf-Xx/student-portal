import express from 'express';
import cors from 'cors';
import routes from './src/routes';
import database from './src/services/database';
const app = express();
app.use(cors());
app.use(express.json());
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