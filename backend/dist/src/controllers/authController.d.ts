import type { Request, Response } from 'express';
declare class AuthController {
    studentLogin(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    adminLogin(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
}
declare const _default: AuthController;
export default _default;
//# sourceMappingURL=authController.d.ts.map