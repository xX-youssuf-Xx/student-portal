import type { Test, TestAnswer, TestImage } from '../types';
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
    show_grade_outside?: boolean;
    test_group?: number | null;
}
declare class TestService {
    private normalizeSubmission;
    gradePhysicalBatch(params: {
        testId: number;
        nQuestions: number;
        studentsOrdered: number[];
        files: Array<{
            path: string;
            originalname?: string;
            filename?: string;
        }>;
        namesAsIds?: boolean;
    }): Promise<Array<{
        student_id: number;
        submission_id: number;
        score: number | null;
        output_dir: string;
    }>>;
    updateSubmissionAnswers(submissionId: number, answersMap: Record<string, string>, teacherComment?: string): Promise<any | null>;
    createTest(testData: CreateTestData): Promise<Test>;
    getAllTests(): Promise<Test[]>;
    getTestById(testId: number): Promise<(Test & {
        images?: Array<{
            id: number;
            image_path: string;
            display_order: number;
        }>;
    }) | null>;
    getTestImages(testId: number | string): Promise<Array<{
        id: number;
        image_path: string;
        display_order: number;
    }>>;
    getEligibleStudentsForTest(testId: number): Promise<Array<{
        id: number;
        name: string;
        phone_number: string;
        grade: string;
        student_group: string | null;
    }>>;
    includeStudentsForTest(testId: number, studentIds: number[]): Promise<{
        created: Array<{
            student_id: number;
            submission_id: number;
        }>;
        skipped: number[];
    }>;
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
    getSubmissionWithTest(testId: number, submissionId: number): Promise<any | null>;
    private computeScoreWithManual;
    setManualGrades(submissionId: number, grades: Record<string, number>, teacherComment?: string): Promise<any | null>;
    uploadBubbleSheet(testId: number, studentId: number, filePath: string): Promise<TestAnswer | null>;
    deleteSubmission(submissionId: number): Promise<boolean>;
    private calculateScore;
    addTestImages(images: Array<{
        testId: number;
        imagePath: string;
        displayOrder: number;
    }>): Promise<TestImage[]>;
    private isValidTestId;
    updateTestImageOrder(testId: number, imageIds: number[]): Promise<void>;
    deleteTestImage(imageId: number): Promise<boolean>;
    deleteTestImages(testId: number): Promise<boolean>;
    exportCombinedRankings(testIds: number[]): Promise<string>;
    exportCombinedRankingsRows(testIds: number[]): Promise<{
        header: string[];
        rows: Array<any[]>;
    }>;
    getStudentRank(testId: number, studentId: number): Promise<{
        rank: number;
        total: number;
        score: number | null;
    }>;
}
declare const _default: TestService;
export default _default;
//# sourceMappingURL=testService.d.ts.map