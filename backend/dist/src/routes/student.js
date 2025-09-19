import { Router } from 'express';
import studentController from '../controllers/studentController';
import { authenticateToken, requireStudent, requireAdmin } from '../middleware/auth';
import { validateStudentId } from '../middleware/validation';
const router = Router();
router.use(authenticateToken);
router.get('/dashboard', requireStudent, studentController.getDashboard);
router.get('/profile', requireStudent, studentController.getProfile);
router.get('/results', requireStudent, studentController.getStudentResults);
export default router;
//# sourceMappingURL=student.js.map