import { Router } from 'express';
import adminController from '../controllers/adminController';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import studentAdminRoutes from './admin/students';
const router = Router();
router.use(authenticateToken);
router.use(requireAdmin);
router.get('/dashboard', adminController.getDashboard);
router.get('/stats', adminController.getSystemStats);
router.use('/students', studentAdminRoutes);
export default router;
//# sourceMappingURL=admin.js.map