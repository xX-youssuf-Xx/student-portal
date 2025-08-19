import studentService from '../services/studentService';
class AdminController {
    async getDashboard(req, res) {
        try {
            res.json({
                message: 'Admin dashboard',
                user: req.user,
                data: {
                    students: [],
                    tests: [],
                    reports: []
                }
            });
        }
        catch (error) {
            console.error('Error getting admin dashboard:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
    async getSystemStats(req, res) {
        try {
            const students = await studentService.getAllStudents();
            const stats = {
                totalStudents: students.length,
                studentsByGrade: students.reduce((acc, student) => {
                    acc[student.grade] = (acc[student.grade] || 0) + 1;
                    return acc;
                }, {}),
                studentsByGroup: students.reduce((acc, student) => {
                    const group = student.student_group || 'No Group';
                    acc[group] = (acc[group] || 0) + 1;
                    return acc;
                }, {})
            };
            res.json({ stats });
        }
        catch (error) {
            console.error('Error getting system stats:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
}
export default new AdminController();
//# sourceMappingURL=adminController.js.map