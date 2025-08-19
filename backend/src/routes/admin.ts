import { Router } from 'express';
import adminController from '../controllers/adminController';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import studentAdminRoutes from './admin/students';

const router = Router();

// All admin routes require authentication and admin privileges
router.use(authenticateToken);
router.use(requireAdmin);

// Admin dashboard
router.get('/dashboard', adminController.getDashboard);

// System statistics
router.get('/stats', adminController.getSystemStats);

// Student management routes
router.use('/students', studentAdminRoutes);

export default router; 


