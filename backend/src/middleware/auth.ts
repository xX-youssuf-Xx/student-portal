import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types';
import authService from '../services/authService';

export const authenticateToken = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'Access token required' });
    }

    const user = authService.verifyToken(token);
    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
};

export const requireStudent = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (req.user?.type !== 'student') {
    return res.status(403).json({ message: 'Access denied. Student access required.' });
  }
  next();
};

export const requireAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (req.user?.type !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Admin access required.' });
  }
  next();
}; 