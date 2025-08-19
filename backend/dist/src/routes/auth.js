import { Router } from 'express';
import authController from '../controllers/authController';
import { validateLoginRequest } from '../middleware/validation';
const router = Router();
router.post('/student/login', validateLoginRequest, authController.studentLogin);
router.post('/admin/login', validateLoginRequest, authController.adminLogin);
export default router;
//# sourceMappingURL=auth.js.map