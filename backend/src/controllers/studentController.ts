import type { Response } from 'express';
import type { AuthenticatedRequest } from '../types';
import studentService from '../services/studentService';

class StudentController {
  async getDashboard(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      res.json({
        message: 'Student dashboard',
        user: req.user,
        data: {
          tests: [],
          grades: [],
          announcements: []
        }
      });
      return;
    } catch (error) {
      console.error('Error getting student dashboard:', error);
      res.status(500).json({ message: 'Internal server error' });
      return;
    }
  }

  async getProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        res.status(400).json({ message: 'User ID not found' });
        return;
      }

      const student = await studentService.findById(req.user.id);
      
      if (!student) {
        res.status(404).json({ message: 'Student not found' });
        return;
      }

      res.json({ student });
      return;
    } catch (error) {
      console.error('Error getting student profile:', error);
      res.status(500).json({ message: 'Internal server error' });
      return;
    }
  }

  async getAllStudents(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const students = await studentService.getAllStudents();
      res.json({ students });
      return;
    } catch (error) {
      console.error('Error getting all students:', error);
      res.status(500).json({ message: 'Internal server error' });
      return;
    }
  }

  // Admin/student: get student's results time series for graph
  async getStudentResults(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const targetIdRaw = (req.params as any)?.id;
      const targetId = targetIdRaw ? parseInt(targetIdRaw as any, 10) : (req.user?.id ?? 0);
      if (!targetId || isNaN(targetId)) {
        res.status(400).json({ message: 'Invalid student ID' });
        return;
      }
      // Students can only view their own results; admins can view any
      if (req.user?.type === 'student' && targetId !== req.user.id) {
        res.status(403).json({ message: 'Access denied' });
        return;
      }
      const results = await (await import('../services/testService')).default.getStudentResults(targetId);
      res.json({ results });
    } catch (error) {
      console.error('Error getting student results:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async getStudentById(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      
      if (!id) {
        res.status(400).json({ message: 'Student ID is required' });
        return;
      }

      const studentId = parseInt(id as string, 10);

      if (isNaN(studentId)) {
        res.status(400).json({ message: 'Invalid student ID' });
        return;
      }

      const student = await studentService.findById(studentId);
      
      if (!student) {
        res.status(404).json({ message: 'Student not found' });
        return;
      }

      res.json({ student });
      return;
    } catch (error) {
      console.error('Error getting student by ID:', error);
      res.status(500).json({ message: 'Internal server error' });
      return;
    }
  }

  async createStudent(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const student = await studentService.createStudent(req.body);
      res.status(201).json({ student });
      return;
    } catch (error) {
      console.error('Error creating student:', error);
      res.status(500).json({ message: 'Internal server error' });
      return;
    }
  }

  async updateStudent(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ message: 'Student ID is required' });
        return;
      }
      const studentId = parseInt(id as string, 10);
      if (isNaN(studentId)) {
        res.status(400).json({ message: 'Invalid student ID' });
        return;
      }
      const student = await studentService.updateStudent(studentId, req.body);
      if (!student) {
        res.status(404).json({ message: 'Student not found' });
        return;
      }
      res.json({ student });
      return;
    } catch (error) {
      console.error('Error updating student:', error);
      res.status(500).json({ message: 'Internal server error' });
      return;
    }
  }

  async deleteStudent(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ message: 'Student ID is required' });
        return;
      }
      const studentId = parseInt(id as string, 10);
      if (isNaN(studentId)) {
        res.status(400).json({ message: 'Invalid student ID' });
        return;
      }
      const success = await studentService.deleteStudent(studentId);
      if (!success) {
        res.status(404).json({ message: 'Student not found' });
        return;
      }
      res.status(204).send();
      return;
    } catch (error) {
      console.error('Error deleting student:', error);
      res.status(500).json({ message: 'Internal server error' });
      return;
    }
  }
}

export default new StudentController();
 