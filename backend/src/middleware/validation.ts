import type { Request, Response, NextFunction } from 'express';

export const validateLoginRequest = (req: Request, res: Response, next: NextFunction) => {
  const { phone_number, password } = req.body;

  if (!phone_number || !password) {
    return res.status(400).json({ 
      message: 'Phone number and password are required' 
    });
  }

  if (typeof phone_number !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ 
      message: 'Phone number and password must be strings' 
    });
  }

  if (phone_number.trim().length === 0 || password.trim().length === 0) {
    return res.status(400).json({ 
      message: 'Phone number and password cannot be empty' 
    });
  }

  next();
};

export const validateStudentId = (req: Request, res: Response, next: NextFunction) => {
  const { id } = req.params;
  
  if (!id) {
    return res.status(400).json({ 
      message: 'Student ID is required' 
    });
  }

  const studentId = parseInt(id);

  if (isNaN(studentId) || studentId <= 0) {
    return res.status(400).json({ 
      message: 'Invalid student ID' 
    });
  }

  next();
}; 