import { Router } from 'express';
import authRoutes from './auth';
import studentRoutes from './student';
import adminRoutes from './admin';
import testRoutes from './test';

const router = Router();

// Health check endpoints
router.get('/', (req, res) => {
  res.json({ message: 'Student Portal API' });
});

router.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
router.use('/api', authRoutes);
router.use('/api/student', studentRoutes);
router.use('/api/admin', adminRoutes);
router.use('/api', testRoutes);

export default router;