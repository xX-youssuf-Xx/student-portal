import { Router } from 'express';
import studentController from '../../controllers/studentController';
import { validateStudentId } from '../../middleware/validation';
const router = Router();
router.get('/', studentController.getAllStudents);
router.get('/:id', validateStudentId, studentController.getStudentById);
router.post('/', studentController.createStudent);
router.put('/:id', validateStudentId, studentController.updateStudent);
router.delete('/:id', validateStudentId, studentController.deleteStudent);
export default router;
//# sourceMappingURL=students.js.map