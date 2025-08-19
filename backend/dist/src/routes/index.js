import { Router } from 'express';
import authRoutes from './auth';
import studentRoutes from './student';
import adminRoutes from './admin';
const router = Router();
router.get('/', (req, res) => {
    res.json({ message: 'Student Portal API' });
});
router.use('/api', authRoutes);
router.use('/api/student', studentRoutes);
router.use('/api/admin', adminRoutes);
export default router;
//# sourceMappingURL=index.js.map