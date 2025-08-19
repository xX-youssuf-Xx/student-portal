import type { Request, Response, NextFunction } from 'express';

export const validateLoginRequest = (req: Request, res: Response, next: NextFunction): void => {
  const { phone_number, password } = req.body;

  if (!phone_number || !password) {
    res.status(400).json({ 
      message: 'Phone number and password are required' 
    });
    return;
  }

  if (typeof phone_number !== 'string' || typeof password !== 'string') {
    res.status(400).json({ 
      message: 'Phone number and password must be strings' 
    });
    return;
  }

  if (phone_number.trim().length === 0 || password.trim().length === 0) {
    res.status(400).json({ 
      message: 'Phone number and password cannot be empty' 
    });
    return;
  }

  next();
};

export const validateStudentId = (req: Request, res: Response, next: NextFunction): void => {
  const { id } = req.params;
  
  if (!id) {
    res.status(400).json({ 
      message: 'Student ID is required' 
    });
    return;
  }

  const studentId = parseInt(id as string, 10);

  if (isNaN(studentId) || studentId <= 0) {
    res.status(400).json({ 
      message: 'Invalid student ID' 
    });
    return;
  }

  next();
};