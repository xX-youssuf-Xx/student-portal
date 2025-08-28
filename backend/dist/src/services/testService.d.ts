import type { Test, TestAnswer } from '../types';
interface CreateTestData {
    title: string;
    grade: string;
    student_group?: string;
    test_type: 'MCQ' | 'BUBBLE_SHEET' | 'PHYSICAL_SHEET';
    start_time: string;
    end_time: string;
    duration_minutes?: number;
    pdf_file_path?: string;
    correct_answers?: any;
    view_type: 'IMMEDIATE' | 'TEACHER_CONTROLLED';
    view_permission?: boolean;
}
declare class TestService {
    createTest(testData: CreateTestData): Promise<Test>;
    getAllTests(): Promise<Test[]>;
    getTestById(testId: number): Promise<Test | null>;
    updateTest(testId: number, testData: Partial<CreateTestData>): Promise<Test | null>;
    deleteTest(testId: number): Promise<boolean>;
    updateViewPermission(testId: number, viewPermission: boolean): Promise<Test | null>;
    getTestSubmissions(testId: number): Promise<any[]>;
    gradeSubmission(submissionId: number, score: number, teacherComment?: string): Promise<TestAnswer | null>;
    getAvailableTestsForStudent(studentId: number): Promise<Test[]>;
    getStudentTestHistory(studentId: number): Promise<any[]>;
    getTestQuestions(testId: number, studentId: number): Promise<any | null>;
    startTest(testId: number, studentId: number): Promise<any | null>;
    submitTest(testId: number, studentId: number, answers: any, isDraft?: boolean): Promise<TestAnswer | null>;
    getTestResult(testId: number, studentId: number): Promise<any | null>;
    uploadBubbleSheet(testId: number, studentId: number, filePath: string): Promise<TestAnswer | null>;
    private calculateScore;
}
declare const _default: TestService;
export default _default;
//# sourceMappingURL=testService.d.ts.map