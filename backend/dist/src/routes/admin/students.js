import { Router } from "express";
import studentController from "../../controllers/studentController";
import { authenticateToken, requireAdmin } from "../../middleware/auth";
import { validateStudentId } from "../../middleware/validation";
const router = Router();
router.use(authenticateToken);
router.use(requireAdmin);
router.get("/", studentController.getAllStudents);
router.get("/:id", validateStudentId, studentController.getStudentById);
router.post("/", studentController.createStudent);
router.put("/:id", validateStudentId, studentController.updateStudent);
router.delete("/:id", validateStudentId, studentController.deleteStudent);
router.get("/:id/results", validateStudentId, studentController.getStudentResults);
router.post("/:id/login-token", validateStudentId, studentController.generateLoginToken);
export default router;
//# sourceMappingURL=students.js.map