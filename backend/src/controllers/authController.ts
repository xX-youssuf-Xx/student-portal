import type { Request, Response } from 'express';
import authService from '../services/authService';
import studentService from '../services/studentService';

class AuthController {
  async studentLogin(req: Request, res: Response) {
    try {
      const { phone_number, password } = req.body;

      // Find student by phone number
      const student = await studentService.findByPhoneNumber(phone_number);
      
      if (!student) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      // Verify password
      const isValidPassword = await authService.comparePassword(password, student.password);
      
      if (!isValidPassword) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      // Generate token
      const token = authService.createStudentToken(student);
      
      // Create response
      const response = authService.createLoginResponse(token, {
        ...student,
        type: 'student'
      });

      return res.json(response);
    } catch (error) {
      console.error('Student login error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  async adminLogin(req: Request, res: Response) {
    try {
      const { phone_number, password } = req.body;

      // Placeholder admin credentials - replace with database lookup
      if (phone_number === '01009577656' && password === 'admin7656') {
        const admin = {
          id: 1,
          phone_number: 'admin',
          name: 'Admin',
          type: 'admin' as const
        };

        // Generate token
        const token = authService.createAdminToken(admin);
        
        // Create response
        const response = authService.createLoginResponse(token, admin);

        return res.json(response);
      } else {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
    } catch (error) {
      console.error('Admin login error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
}

export default new AuthController(); 