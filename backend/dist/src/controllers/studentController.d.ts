import type { Response } from 'express';
import type { AuthenticatedRequest } from '../types';
declare class StudentController {
    getDashboard(req: AuthenticatedRequest, res: Response): Promise<void>;
    getProfile(req: AuthenticatedRequest, res: Response): Promise<void>;
    getAllStudents(req: AuthenticatedRequest, res: Response): Promise<void>;
    getStudentResults(req: AuthenticatedRequest, res: Response): Promise<void>;
    getStudentById(req: AuthenticatedRequest, res: Response): Promise<void>;
    createStudent(req: AuthenticatedRequest, res: Response): Promise<void>;
    updateStudent(req: AuthenticatedRequest, res: Response): Promise<void>;
    deleteStudent(req: AuthenticatedRequest, res: Response): Promise<void>;
}
declare const _default: StudentController;
export default _default;
//# sourceMappingURL=studentController.d.ts.map