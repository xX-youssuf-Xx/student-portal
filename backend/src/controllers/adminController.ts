import type { Response } from 'express';
import type { AuthenticatedRequest } from '../types';
import studentService from '../services/studentService';

class AdminController {
  async getDashboard(req: AuthenticatedRequest, res: Response) {
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
    } catch (error) {
      console.error('Error getting admin dashboard:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async getSystemStats(req: AuthenticatedRequest, res: Response) {
    try {
      const students = await studentService.getAllStudents();
      
      const stats = {
        totalStudents: students.length,
        studentsByGrade: students.reduce((acc, student) => {
          acc[student.grade] = (acc[student.grade] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        studentsByGroup: students.reduce((acc, student) => {
          const group = student.student_group || 'No Group';
          acc[group] = (acc[group] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      };

      res.json({ stats });
    } catch (error) {
      console.error('Error getting system stats:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
}

export default new AdminController(); 