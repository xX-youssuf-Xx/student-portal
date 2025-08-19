import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
class AuthService {
    JWT_SECRET;
    constructor() {
        this.JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    }
    async hashPassword(password) {
        const saltRounds = 10;
        return bcrypt.hash(password, saltRounds);
    }
    async comparePassword(password, hashedPassword) {
        return bcrypt.compare(password, hashedPassword);
    }
    generateToken(payload) {
        return jwt.sign(payload, this.JWT_SECRET, { expiresIn: '24h' });
    }
    verifyToken(token) {
        try {
            return jwt.verify(token, this.JWT_SECRET);
        }
        catch (error) {
            throw new Error('Invalid or expired token');
        }
    }
    createStudentToken(student) {
        return this.generateToken({
            id: student.id,
            phone_number: student.phone_number,
            grade: student.grade,
            type: 'student'
        });
    }
    createAdminToken(admin) {
        return this.generateToken({
            id: admin.id,
            phone_number: admin.phone_number,
            type: 'admin'
        });
    }
    createLoginResponse(token, user) {
        return {
            token,
            user: {
                id: user.id,
                name: user.name,
                phone_number: user.phone_number,
                parent_phone: user.parent_phone,
                grade: user.grade,
                student_group: user.student_group,
                type: user.type
            }
        };
    }
}
export default new AuthService();
//# sourceMappingURL=authService.js.map