import { Router } from 'express';
import testController, { upload, handleArrayUpload } from '../controllers/testController';
import { authenticateToken, requireAdmin } from '../middleware/auth';

const router = Router();

router.get('/tests/:id/submissions/rank', authenticateToken, testController.getStudentRank);

// Admin/Teacher routes (protected)
router.post('/tests', 
  authenticateToken, 
  requireAdmin, 
  upload.any(), // Handle any file uploads
  handleArrayUpload, // Process array uploads
  testController.createTest
);

router.get('/tests', authenticateToken, requireAdmin, testController.getAllTests);
router.get('/tests/:id', authenticateToken, requireAdmin, testController.getTestById);

router.put('/tests/:id', 
  authenticateToken, 
  requireAdmin, 
  upload.any(), // Handle any file uploads
  handleArrayUpload, // Process array uploads
  testController.updateTest
);
router.delete('/tests/:id', authenticateToken, requireAdmin, testController.deleteTest);
router.patch('/tests/:id/view-permission', authenticateToken, requireAdmin, testController.updateViewPermission);
router.patch('/tests/:id/show-grade-outside', authenticateToken, requireAdmin, testController.updateShowGradeOutside);
router.get('/tests/:id/submissions', authenticateToken, requireAdmin, testController.getTestSubmissions);
router.patch('/submissions/:id/grade', authenticateToken, requireAdmin, testController.gradeSubmission);
// Admin manual per-question grading
router.get('/tests/:id/submissions/:submissionId', authenticateToken, requireAdmin, testController.getSubmissionWithTest);
router.patch('/submissions/:id/manual-grades', authenticateToken, requireAdmin, testController.setManualGrades);
// Admin: delete a submission and associated files
router.delete('/submissions/:id', authenticateToken, requireAdmin, testController.deleteSubmission);

// Admin: Batch grade physical bubble sheets
// Expect: multipart/form-data with field 'n_questions', 'students' (JSON array of student IDs in order),
// and image files (named arbitrarily, the order will be inferred from filename numbers or upload order).
router.post(
  '/tests/:id/grade-physical-batch',
  authenticateToken,
  requireAdmin,
  upload.any(),
  testController.gradePhysicalBatch
);

// Admin: Get eligible students and include students for PHYSICAL_SHEET tests
router.get('/tests/:id/eligible-students', authenticateToken, requireAdmin, testController.getEligibleStudents);
router.post('/tests/:id/include-students', authenticateToken, requireAdmin, testController.includeStudents);

// Admin: export combined rankings for selected tests
router.post('/tests/export-rankings', authenticateToken, requireAdmin, testController.exportRankings);

// Admin: Edit detected answers for a single submission and recalculate score
router.patch(
  '/submissions/:id/answers',
  authenticateToken,
  requireAdmin,
  testController.updateBubbleAnswers
);

router.post('/tests/:id/regrade-all', authenticateToken, requireAdmin, testController.regradeAllSubmissions);

// Student routes (protected)
router.get('/available-tests', authenticateToken, testController.getAvailableTests);
router.get('/test-history', authenticateToken, testController.getStudentTestHistory);
router.get('/tests/:id/start', authenticateToken, testController.startTest);
router.get('/tests/:id/questions', authenticateToken, testController.getTestQuestions);
router.post('/tests/:id/submit', authenticateToken, testController.submitTest);
router.get('/tests/:id/result', authenticateToken, testController.getTestResult);
router.get('/tests/:id/images', authenticateToken, testController.getTestImages);
router.post('/tests/:id/upload-bubble-sheet', authenticateToken, upload.single('bubbleSheet'), testController.uploadBubbleSheet);

export default router;