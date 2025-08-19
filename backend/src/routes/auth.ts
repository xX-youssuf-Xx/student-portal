import { Router } from 'express';
import authController from '../controllers/authController';
import { validateLoginRequest } from '../middleware/validation';

const router = Router();

// Student login
router.post('/student/login', validateLoginRequest, authController.studentLogin);

// Admin login
router.post('/admin/login', validateLoginRequest, authController.adminLogin);

export default router; 