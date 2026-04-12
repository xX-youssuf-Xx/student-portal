import authService from "../services/authService";
import logger from "../services/logger";
import studentService from "../services/studentService";
class AuthController {
    async studentLogin(req, res) {
        try {
            const { phone_number, password } = req.body;
            const student = await studentService.findByPhoneNumber(phone_number);
            if (!student) {
                return res.status(401).json({ message: "Invalid credentials" });
            }
            const isValidPassword = await authService.comparePassword(password, student.password);
            if (!isValidPassword) {
                return res.status(401).json({ message: "Invalid credentials" });
            }
            const token = authService.createStudentToken(student);
            const response = authService.createLoginResponse(token, {
                ...student,
                type: "student",
            });
            return res.json(response);
        }
        catch (error) {
            logger.error("Student login error:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    }
    async adminLogin(req, res) {
        try {
            const { phone_number, password } = req.body;
            const adminPhone = process.env.ADMIN_PHONE_NUMBER;
            const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
            const isValidPassword = await authService.comparePassword(password, adminPasswordHash || "");
            if (phone_number === adminPhone && isValidPassword) {
                const admin = {
                    id: 1,
                    phone_number: "admin",
                    name: "Admin",
                    type: "admin",
                };
                const token = authService.createAdminToken(admin);
                const response = authService.createLoginResponse(token, admin);
                return res.json(response);
            }
            else {
                return res.status(401).json({ message: "Invalid credentials" });
            }
        }
        catch (error) {
            logger.error("Admin login error:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    }
}
export default new AuthController();
//# sourceMappingURL=authController.js.map