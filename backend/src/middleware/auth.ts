import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types';
import authService from '../services/authService';

export const authenticateToken = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      res.status(401).json({ message: 'Access token required' });
      return;
    }

    const user = authService.verifyToken(token);
    req.user = user;
    next();
  } catch (error) {
    res.status(403).json({ message: 'Invalid or expired token' });
    return;
  }
};

export const requireStudent = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  if (req.user?.type !== 'student') {
    res.status(403).json({ message: 'Access denied. Student access required.' });
    return;
  }
  next();
};

export const requireAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  if (req.user?.type !== 'admin') {
    res.status(403).json({ message: 'Access denied. Admin access required.' });
    return;
  }
  next();
};