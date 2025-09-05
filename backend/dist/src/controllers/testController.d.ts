import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types';
import multer from 'multer';
declare global {
    namespace Express {
        interface Request {
            files?: {
                [fieldname: string]: Express.Multer.File[];
            } | Express.Multer.File[] | undefined;
        }
    }
}
declare const handleArrayUpload: (req: Request, res: Response, next: NextFunction) => void;
export { handleArrayUpload };
export declare const upload: multer.Multer;
declare class TestController {
    createTest(req: AuthenticatedRequest, res: Response): Promise<void>;
    getAllTests(req: AuthenticatedRequest, res: Response): Promise<void>;
    getTestById(req: AuthenticatedRequest, res: Response): Promise<void>;
    updateTest(req: AuthenticatedRequest, res: Response): Promise<void>;
    deleteTest(req: AuthenticatedRequest, res: Response): Promise<void>;
    updateViewPermission(req: AuthenticatedRequest, res: Response): Promise<void>;
    getTestSubmissions(req: AuthenticatedRequest, res: Response): Promise<void>;
    gradeSubmission(req: AuthenticatedRequest, res: Response): Promise<void>;
    getSubmissionWithTest(req: AuthenticatedRequest, res: Response): Promise<void>;
    setManualGrades(req: AuthenticatedRequest, res: Response): Promise<void>;
    getAvailableTests(req: AuthenticatedRequest, res: Response): Promise<void>;
    getStudentTestHistory(req: AuthenticatedRequest, res: Response): Promise<void>;
    startTest(req: AuthenticatedRequest, res: Response): Promise<void>;
    getTestImages(req: AuthenticatedRequest, res: Response): Promise<void>;
    getTestQuestions(req: AuthenticatedRequest, res: Response): Promise<void>;
    submitTest(req: AuthenticatedRequest, res: Response): Promise<void>;
    getTestResult(req: AuthenticatedRequest, res: Response): Promise<void>;
    uploadBubbleSheet(req: AuthenticatedRequest, res: Response): Promise<void>;
    getStudentRank(req: AuthenticatedRequest, res: Response): Promise<void>;
    gradePhysicalBatch(req: AuthenticatedRequest, res: Response): Promise<void>;
    updateBubbleAnswers(req: AuthenticatedRequest, res: Response): Promise<void>;
}
declare const _default: TestController;
export default _default;
//# sourceMappingURL=testController.d.ts.map