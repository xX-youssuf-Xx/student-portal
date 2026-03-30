import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import type { AuthenticatedRequest } from "../types";
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
    deleteTestImage(req: AuthenticatedRequest, res: Response): Promise<void>;
    deleteTest(req: AuthenticatedRequest, res: Response): Promise<void>;
    updateViewPermission(req: AuthenticatedRequest, res: Response): Promise<Response>;
    updateShowGradeOutside(req: AuthenticatedRequest, res: Response): Promise<Response>;
    getTestSubmissions(req: AuthenticatedRequest, res: Response): Promise<void>;
    gradeSubmission(req: AuthenticatedRequest, res: Response): Promise<void>;
    deleteSubmission(req: AuthenticatedRequest, res: Response): Promise<void>;
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
    getEligibleStudents(req: AuthenticatedRequest, res: Response): Promise<void>;
    includeStudents(req: AuthenticatedRequest, res: Response): Promise<void>;
    exportRankings(req: AuthenticatedRequest, res: Response): Promise<void>;
    updateBubbleAnswers(req: AuthenticatedRequest, res: Response): Promise<void>;
    regradeAllSubmissions(req: AuthenticatedRequest, res: Response): Promise<void>;
    overrideGrade(req: AuthenticatedRequest, res: Response): Promise<void>;
    regradePhysicalSubmission(req: AuthenticatedRequest, res: Response): Promise<void>;
}
declare const _default: TestController;
export default _default;
//# sourceMappingURL=testController.d.ts.map