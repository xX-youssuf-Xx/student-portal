-- Student Portal Database Schema
-- PostgreSQL Database Design

-- Create ENUM types for grade and group
CREATE TYPE grade_enum AS ENUM ('3MIDDLE', '1HIGH', '2HIGH', '3HIGH');
CREATE TYPE group_enum AS ENUM ('MINYAT-EL-NASR', 'RIYAD', 'MEET-HADID');

-- Create students table
CREATE TABLE students (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    grade grade_enum NOT NULL,
    student_group group_enum NULL,
    password TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on phone_number for faster lookups (assuming it might be used for login)
CREATE INDEX idx_students_phone ON students(phone_number);

-- Create index on grade for filtering students by grade
CREATE INDEX idx_students_grade ON students(grade);

-- Create index on student_group for filtering students by group
CREATE INDEX idx_students_group ON students(student_group);

-- Optional: Create a trigger to automatically update the updated_at timestamp
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

-- Sample insert statements to test the schema
-- INSERT INTO students (name, phone_number, grade, student_group, password) 
-- VALUES 
--     ('Ahmed Mohamed', '01234567890', '3MIDDLE', 'MINYAT-EL-NASR', 'hashed_password_here'),
--     ('Sara Ali', '01987654321', '1HIGH', 'RIYAD', 'hashed_password_here'),
--     ('Mohamed Hassan', '01555666777', '2HIGH', NULL, 'hashed_password_here');

-- Query to view the table structure
-- \d students