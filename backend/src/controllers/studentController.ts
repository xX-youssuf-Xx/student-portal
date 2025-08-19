import type { Response } from 'express';
import type { AuthenticatedRequest } from '../types';
import studentService from '../services/studentService';

class StudentController {
  async getDashboard(req: AuthenticatedRequest, res: Response) {
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
    } catch (error) {
      console.error('Error getting student dashboard:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async getProfile(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user?.id) {
        return res.status(400).json({ message: 'User ID not found' });
      }

      const student = await studentService.findById(req.user.id);
      
      if (!student) {
        return res.status(404).json({ message: 'Student not found' });
      }

      res.json({ student });
    } catch (error) {
      console.error('Error getting student profile:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async getAllStudents(req: AuthenticatedRequest, res: Response) {
    try {
      const students = await studentService.getAllStudents();
      res.json({ students });
    } catch (error) {
      console.error('Error getting all students:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async getStudentById(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({ message: 'Student ID is required' });
      }

      const studentId = parseInt(id);

      if (isNaN(studentId)) {
        return res.status(400).json({ message: 'Invalid student ID' });
      }

      const student = await studentService.findById(studentId);
      
      if (!student) {
        return res.status(404).json({ message: 'Student not found' });
      }

      res.json({ student });
    } catch (error) {
      console.error('Error getting student by ID:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async createStudent(req: AuthenticatedRequest, res: Response) {
    try {
      const student = await studentService.createStudent(req.body);
      res.status(201).json({ student });
    } catch (error) {
      console.error('Error creating student:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async updateStudent(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const studentId = parseInt(id);
      const student = await studentService.updateStudent(studentId, req.body);
      if (!student) {
        return res.status(404).json({ message: 'Student not found' });
      }
      res.json({ student });
    } catch (error) {
      console.error('Error updating student:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async deleteStudent(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const studentId = parseInt(id);
      const success = await studentService.deleteStudent(studentId);
      if (!success) {
        return res.status(404).json({ message: 'Student not found' });
      }
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting student:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
}

export default new StudentController(); 