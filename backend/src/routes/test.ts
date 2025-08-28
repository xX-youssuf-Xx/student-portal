import { Router } from 'express';
import testController, { upload } from '../controllers/testController';
import { authenticateToken, requireAdmin } from '../middleware/auth';

const router = Router();

// Admin/Teacher routes (protected)
router.post('/tests', authenticateToken, requireAdmin, upload.single('pdf'), testController.createTest);
router.get('/tests', authenticateToken, requireAdmin, testController.getAllTests);
router.get('/tests/:id', authenticateToken, requireAdmin, testController.getTestById);
router.put('/tests/:id', authenticateToken, requireAdmin, upload.single('pdf'), testController.updateTest);
router.delete('/tests/:id', authenticateToken, requireAdmin, testController.deleteTest);
router.patch('/tests/:id/view-permission', authenticateToken, requireAdmin, testController.updateViewPermission);
router.get('/tests/:id/submissions', authenticateToken, requireAdmin, testController.getTestSubmissions);
router.patch('/submissions/:id/grade', authenticateToken, requireAdmin, testController.gradeSubmission);

// Student routes (protected)
router.get('/available-tests', authenticateToken, testController.getAvailableTests);
router.get('/test-history', authenticateToken, testController.getStudentTestHistory);
router.get('/tests/:id/start', authenticateToken, testController.startTest);
router.get('/tests/:id/questions', authenticateToken, testController.getTestQuestions);
router.post('/tests/:id/submit', authenticateToken, testController.submitTest);
router.get('/tests/:id/result', authenticateToken, testController.getTestResult);
router.post('/tests/:id/upload-bubble-sheet', authenticateToken, upload.single('bubbleSheet'), testController.uploadBubbleSheet);

export default router;
