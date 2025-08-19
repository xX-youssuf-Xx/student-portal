import type { Response } from 'express';
import type { AuthenticatedRequest } from '../types';
declare class AdminController {
    getDashboard(req: AuthenticatedRequest, res: Response): Promise<void>;
    getSystemStats(req: AuthenticatedRequest, res: Response): Promise<void>;
}
declare const _default: AdminController;
export default _default;
//# sourceMappingURL=adminController.d.ts.map