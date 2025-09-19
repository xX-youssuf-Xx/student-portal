import { Router } from 'express';
import studentController from '../../controllers/studentController';
import { validateStudentId } from '../../middleware/validation';
import { authenticateToken, requireAdmin } from '../../middleware/auth';
const router = Router();
router.use(authenticateToken);
router.use(requireAdmin);
router.get('/', studentController.getAllStudents);
router.get('/:id', validateStudentId, studentController.getStudentById);
router.post('/', studentController.createStudent);
router.put('/:id', validateStudentId, studentController.updateStudent);
router.delete('/:id', validateStudentId, studentController.deleteStudent);
router.get('/:id/results', validateStudentId, studentController.getStudentResults);
export default router;
//# sourceMappingURL=students.js.map