import type { Student } from '../types';
declare class StudentService {
    findByPhoneNumber(phoneNumber: string): Promise<Student | null>;
    findById(id: number): Promise<Student | null>;
    getAllStudents(): Promise<Student[]>;
    createStudent(studentData: Omit<Student, 'id' | 'created_at' | 'updated_at'>): Promise<Student>;
    updateStudent(id: number, updateData: Partial<Student>): Promise<Student | null>;
    deleteStudent(id: number): Promise<boolean>;
}
declare const _default: StudentService;
export default _default;
//# sourceMappingURL=studentService.d.ts.map