import database from './database';
import authService from './authService';
class StudentService {
    async findByPhoneNumber(phoneNumber) {
        try {
            const result = await database.query('SELECT * FROM students WHERE phone_number = $1', [phoneNumber]);
            return result.rows.length > 0 ? result.rows[0] : null;
        }
        catch (error) {
            console.error('Error finding student by phone number:', error);
            throw new Error('Database error while finding student');
        }
    }
    async findById(id) {
        try {
            const result = await database.query('SELECT id, name, phone_number, parent_phone, grade, student_group, created_at FROM students WHERE id = $1', [id]);
            return result.rows.length > 0 ? result.rows[0] : null;
        }
        catch (error) {
            console.error('Error finding student by ID:', error);
            throw new Error('Database error while finding student');
        }
    }
    async getAllStudents() {
        try {
            const result = await database.query('SELECT id, name, phone_number, parent_phone, grade, student_group, created_at FROM students ORDER BY created_at DESC');
            return result.rows;
        }
        catch (error) {
            console.error('Error getting all students:', error);
            throw new Error('Database error while getting students');
        }
    }
    async createStudent(studentData) {
        try {
            const hashedPassword = await authService.hashPassword(studentData.password);
            const studentGroup = studentData.grade === '3MIDDLE' ? null : (studentData.student_group ?? null);
            const result = await database.query('INSERT INTO students (name, phone_number, parent_phone, grade, student_group, password) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *', [studentData.name, studentData.phone_number, studentData.parent_phone ?? null, studentData.grade, studentGroup, hashedPassword]);
            return result.rows[0];
        }
        catch (error) {
            console.error('Error creating student:', error);
            throw new Error('Database error while creating student');
        }
    }
    async updateStudent(id, updateData) {
        try {
            if (updateData.grade === '3MIDDLE') {
                updateData.student_group = null;
            }
            const fields = Object.keys(updateData).filter(key => key !== 'id' && key !== 'created_at' && key !== 'updated_at');
            const values = fields.map((field, index) => {
                const placeholder = `$${index + 2}`;
                if (field === 'grade')
                    return `${field} = ${placeholder}::grade_enum`;
                if (field === 'student_group')
                    return `${field} = ${placeholder}::group_enum`;
                return `${field} = ${placeholder}`;
            });
            const query = `UPDATE students SET ${values.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`;
            const params = [id, ...fields.map(field => updateData[field])];
            const result = await database.query(query, params);
            return result.rows.length > 0 ? result.rows[0] : null;
        }
        catch (error) {
            console.error('Error updating student:', error);
            throw new Error('Database error while updating student');
        }
    }
    async deleteStudent(id) {
        try {
            const result = await database.query('DELETE FROM students WHERE id = $1 RETURNING id', [id]);
            return result.rows.length > 0;
        }
        catch (error) {
            console.error('Error deleting student:', error);
            throw new Error('Database error while deleting student');
        }
    }
}
export default new StudentService();
//# sourceMappingURL=studentService.js.map