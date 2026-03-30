import { Router } from "express";
import studentController from "../../controllers/studentController";
import { authenticateToken, requireAdmin } from "../../middleware/auth";
import { validateStudentId } from "../../middleware/validation";

const router = Router();

// All admin student routes require auth
router.use(authenticateToken);
router.use(requireAdmin);

// GET /api/admin/students - Get all students
router.get("/", studentController.getAllStudents);

// GET /api/admin/students/:id - Get student by ID
router.get("/:id", validateStudentId, studentController.getStudentById);

// POST /api/admin/students - Create a new student
router.post("/", studentController.createStudent);

// PUT /api/admin/students/:id - Update a student
router.put("/:id", validateStudentId, studentController.updateStudent);

// DELETE /api/admin/students/:id - Delete a student
router.delete("/:id", validateStudentId, studentController.deleteStudent);

// GET /api/admin/students/:id/results - student's results timeseries for graph
router.get(
	"/:id/results",
	validateStudentId,
	studentController.getStudentResults,
);

// POST /api/admin/students/:id/login-token - Generate login token for student (admin only)
router.post(
	"/:id/login-token",
	validateStudentId,
	studentController.generateLoginToken,
);

export default router;
