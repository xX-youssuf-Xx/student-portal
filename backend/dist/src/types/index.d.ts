import type { Request } from 'express';
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
export interface Test {
    id: number;
    title: string;
    grade: string;
    student_group?: string;
    test_type: 'MCQ' | 'BUBBLE_SHEET' | 'PHYSICAL_SHEET';
    start_time: Date;
    end_time: Date;
    duration_minutes?: number;
    pdf_file_path?: string;
    correct_answers?: any;
    view_type: 'IMMEDIATE' | 'TEACHER_CONTROLLED';
    view_permission: boolean;
    show_grade_outside?: boolean;
    test_group?: number | null;
    created_at: Date;
    updated_at: Date;
    submission_count?: number;
    graded_count?: number;
    is_submitted?: boolean;
}
export interface TestAnswer {
    id: number;
    test_id: number;
    student_id: number;
    answers: any;
    score?: number;
    graded: boolean;
    teacher_comment?: string;
    created_at: Date;
    updated_at: Date;
}
export interface TestImage {
    id: number;
    test_id: number;
    image_path: string;
    display_order: number;
    created_at: Date;
    updated_at: Date;
}
//# sourceMappingURL=index.d.ts.map