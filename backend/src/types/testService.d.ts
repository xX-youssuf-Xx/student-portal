import { Test, TestAnswer, Student, TestImage } from './types';

declare class TestService {
  // ... other method signatures ...
  getStudentRank(testId: number, studentId: number): Promise<{ rank: number; total: number; score: number | null }>;
  getStudentTestHistory(studentId: number): Promise<any>;
  // ... other method signatures ...
}

export default TestService;
