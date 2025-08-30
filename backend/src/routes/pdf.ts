import { Router } from 'express';
import { uploadTestPdf, getTestPage, getTestPageCount } from '../controllers/pdfController';

const router = Router();

// Upload and process test PDF
router.post('/:testId/upload', uploadTestPdf);

// Get test page image
router.get('/:testId/pages/:pageNumber', getTestPage);

// Get test page count
router.get('/:testId/pages/count', getTestPageCount);

export default router;
