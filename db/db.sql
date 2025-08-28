-- Student Portal Database Schema
-- PostgreSQL Database Design

-- Create ENUM types for grade and group
CREATE TYPE grade_enum AS ENUM ('3MIDDLE', '1HIGH', '2HIGH', '3HIGH');
CREATE TYPE group_enum AS ENUM ('MINYAT-EL-NASR', 'RIYAD', 'MEET-HADID');

-- Create ENUM for test type
CREATE TYPE test_type_enum AS ENUM ('MCQ', 'BUBBLE_SHEET', 'PHYSICAL_SHEET');

-- Create ENUM for view type
CREATE TYPE view_type_enum AS ENUM ('IMMEDIATE', 'TEACHER_CONTROLLED');

-- Students table
CREATE TABLE students (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    parent_phone TEXT NULL,
    grade grade_enum NOT NULL,
    student_group group_enum NULL,
    password TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tests table
CREATE TABLE tests (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    grade grade_enum NOT NULL,
    student_group group_enum NULL,  -- NULL = entire grade

    test_type test_type_enum NOT NULL,

    -- Test availability
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    duration_minutes INT NULL, -- per student time limit if applicable

    -- For bubble sheet / physical sheet
    pdf_file_path TEXT NULL,

    -- JSONB for questions/answers
    -- MCQ: { "questions": [ { "id": 1, "text": "...", "media": "url", "type": "MCQ", "options": [...], "correct": "..." } ] }
    -- BUBBLE_SHEET: { "answers": { "1": "A", "2": "C", ... } }
    -- PHYSICAL_SHEET: { "answers": { "1": "A", "2": "C", ... } }
    correct_answers JSONB NULL,

    -- Grading release control
    view_type view_type_enum NOT NULL DEFAULT 'IMMEDIATE',
    view_permission BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Test answers table
CREATE TABLE test_answers (
    id SERIAL PRIMARY KEY,
    test_id INT REFERENCES tests(id) ON DELETE CASCADE,
    student_id INT REFERENCES students(id) ON DELETE CASCADE,

    -- Student’s submission
    -- MCQ: { "answers": [ { "id": 1, "answer": "4" }, ... ] }
    -- BUBBLE_SHEET: { "answers": { "1": "A", "2": "B", ... } }
    -- PHYSICAL_SHEET: { "extracted_answers": { "1": "A", "2": "B", ... }, "file_path": "/uploads/student123.png", "notes": "Processed by OCR" }
    answers JSONB NOT NULL,

    score NUMERIC(5,2) NULL,
    graded BOOLEAN DEFAULT FALSE,
    teacher_comment TEXT NULL, -- for open-ended/manual grading

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(test_id, student_id) -- one attempt per student
);

-- Indexes
CREATE INDEX idx_students_phone ON students(phone_number);
CREATE INDEX idx_students_grade ON students(grade);
CREATE INDEX idx_students_group ON students(student_group);

CREATE INDEX idx_tests_grade ON tests(grade);
CREATE INDEX idx_tests_group ON tests(student_group);
CREATE INDEX idx_tests_type ON tests(test_type);

CREATE INDEX idx_test_answers_student ON test_answers(student_id);
CREATE INDEX idx_test_answers_test ON test_answers(test_id);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_students_updated_at 
    BEFORE UPDATE ON students 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tests_updated_at 
    BEFORE UPDATE ON tests 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_test_answers_updated_at 
    BEFORE UPDATE ON test_answers 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
