import { Router } from 'express';
import studentController from '../controllers/studentController';
import { authenticateToken, requireStudent, requireAdmin } from '../middleware/auth';
import { validateStudentId } from '../middleware/validation';

const router = Router();

// All student routes require authentication
router.use(authenticateToken);

// Student dashboard (students only)
router.get('/dashboard', requireStudent, studentController.getDashboard);

// Student profile (students only)
router.get('/profile', requireStudent, studentController.getProfile);

// Results graph: student self
router.get('/results', requireStudent, studentController.getStudentResults);

export default router; 