import { Router } from 'express';
import studentController from '../../controllers/studentController';
import { validateStudentId } from '../../middleware/validation';

const router = Router();

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

export default router;