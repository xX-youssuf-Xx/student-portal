import { Router } from 'express';
import studentController from '../../controllers/studentController';
import { validateStudentId } from '../../middleware/validation';
import { authenticateToken, requireAdmin } from '../../middleware/auth';

const router = Router();

// All admin student routes require auth
router.use(authenticateToken);
router.use(requireAdmin);

// GET /api/admin/students - Get all students
router.get('/', studentController.getAllStudents);

// GET /api/admin/students/:id - Get student by ID
router.get('/:id', validateStudentId, studentController.getStudentById);

// POST /api/admin/students - Create a new student
router.post('/', studentController.createStudent);

// PUT /api/admin/students/:id - Update a student
router.put('/:id', validateStudentId, studentController.updateStudent);

// DELETE /api/admin/students/:id - Delete a student
router.delete('/:id', validateStudentId, studentController.deleteStudent);

// GET /api/admin/students/:id/results - student's results timeseries for graph
router.get('/:id/results', validateStudentId, studentController.getStudentResults);

export default router;