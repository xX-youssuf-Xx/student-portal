-- Sample Data for Student Portal
-- This script adds sample students with hashed passwords

-- First, let's add some sample students
-- Note: These passwords are hashed versions of 'password123'
-- In production, use proper password hashing

INSERT INTO students (name, phone_number, grade, student_group, password) VALUES 
    ('أحمد محمد علي', '01234567890', '3MIDDLE', 'MINYAT-EL-NASR', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.'),
    ('سارة أحمد حسن', '01987654321', '1HIGH', 'RIYAD', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.'),
    ('محمد حسن إبراهيم', '01555666777', '2HIGH', 'MEET-HADID', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.'),
    ('فاطمة علي محمد', '01122334455', '3MIDDLE', 'MINYAT-EL-NASR', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.'),
    ('علي أحمد سعيد', '01234567891', '1HIGH', 'RIYAD', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.'),
    ('مريم حسن علي', '01987654322', '2HIGH', 'MEET-HADID', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.'),
    ('يوسف محمد أحمد', '01555666778', '3HIGH', 'MINYAT-EL-NASR', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.'),
    ('نورا علي حسن', '01122334456', '1HIGH', 'RIYAD', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.'),
    ('خالد أحمد محمد', '01234567892', '2HIGH', 'MEET-HADID', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.'),
    ('آية حسن علي', '01987654323', '3MIDDLE', 'MINYAT-EL-NASR', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.');

-- Note: The password hash above is for 'password123'
-- You can test login with any of these phone numbers and password: password123

-- To verify the data was inserted correctly:
-- SELECT id, name, phone_number, grade, student_group FROM students; 