import type { Student, Admin, LoginResponse } from '../types';
declare class AuthService {
    private readonly JWT_SECRET;
    constructor();
    hashPassword(password: string): Promise<string>;
    comparePassword(password: string, hashedPassword: string): Promise<boolean>;
    generateToken(payload: any): string;
    verifyToken(token: string): any;
    createStudentToken(student: Student): string;
    createAdminToken(admin: Admin): string;
    createLoginResponse(token: string, user: any): LoginResponse;
}
declare const _default: AuthService;
export default _default;
//# sourceMappingURL=authService.d.ts.map