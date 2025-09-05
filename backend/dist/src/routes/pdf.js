import { Router } from 'express';
import { uploadTestPdf, getTestPage, getTestPageCount } from '../controllers/pdfController';
const router = Router();
router.post('/:testId/upload', uploadTestPdf);
router.get('/:testId/pages/:pageNumber', getTestPage);
router.get('/:testId/pages/count', getTestPageCount);
export default router;
//# sourceMappingURL=pdf.js.map