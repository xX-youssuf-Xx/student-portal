import type { Request } from 'express';

// Extend Request interface to include user property
export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    phone_number: string;
    parent_phone?: string;
    grade?: string;
    type: 'student' | 'admin';
  };
}

export interface Student {
  id: number;
  name: string;
  phone_number: string;
  parent_phone?: string;
  grade: string;
  student_group?: string;
  password: string;
  created_at: Date;
  updated_at: Date;
}

export interface Admin {
  id: number;
  phone_number: string;
  name: string;
  type: 'admin';
}

export interface LoginRequest {
  phone_number: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: {
    id: number;
    name: string;
    phone_number: string;
    parent_phone?: string;
    grade?: string;
    student_group?: string;
    type: 'student' | 'admin';
  };
}