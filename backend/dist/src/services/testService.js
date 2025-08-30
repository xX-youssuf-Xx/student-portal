import database from './database';
class TestService {
    async createTest(testData) {
        const query = `
      INSERT INTO tests (
        title, grade, student_group, test_type, start_time, end_time, 
        duration_minutes, pdf_file_path, correct_answers, view_type, view_permission
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;
        const values = [
            testData.title,
            testData.grade,
            testData.student_group || null,
            testData.test_type,
            testData.start_time,
            testData.end_time,
            testData.duration_minutes || null,
            testData.pdf_file_path || null,
            testData.correct_answers || null,
            testData.view_type,
            testData.view_type === 'IMMEDIATE' ? true : (testData.view_permission || false)
        ];
        const result = await database.query(query, values);
        return result.rows[0];
    }
    async getAllTests() {
        const query = `
      SELECT t.*, 
             COUNT(ta.id) as submission_count,
             COUNT(CASE WHEN ta.graded = true THEN 1 END) as graded_count
      FROM tests t
      LEFT JOIN test_answers ta ON t.id = ta.test_id
      GROUP BY t.id
      ORDER BY t.created_at DESC
    `;
        const result = await database.query(query);
        return result.rows;
    }
    async getTestById(testId) {
        const query = `
      SELECT t.*, 
             COUNT(ta.id) as submission_count,
             COUNT(CASE WHEN ta.graded = true THEN 1 END) as graded_count
      FROM tests t
      LEFT JOIN test_answers ta ON t.id = ta.test_id
      WHERE t.id = $1
      GROUP BY t.id
    `;
        const result = await database.query(query, [testId]);
        return result.rows[0] || null;
    }
    async updateTest(testId, testData) {
        const fields = [];
        const values = [];
        let paramCount = 1;
        Object.entries(testData).forEach(([key, value]) => {
            if (value !== undefined) {
                if (key === 'view_permission' && testData.view_type === 'IMMEDIATE') {
                    fields.push(`${key} = $${paramCount}`);
                    values.push(true);
                }
                else {
                    fields.push(`${key} = $${paramCount}`);
                    values.push(value);
                }
                paramCount++;
            }
        });
        if (testData.view_type === 'IMMEDIATE' && !fields.some(f => f.includes('view_permission'))) {
            fields.push(`view_permission = $${paramCount}`);
            values.push(true);
            paramCount++;
        }
        if (fields.length === 0) {
            return this.getTestById(testId);
        }
        const query = `
      UPDATE tests 
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount}
      RETURNING *
    `;
        values.push(testId);
        const result = await database.query(query, values);
        return result.rows[0] || null;
    }
    async deleteTest(testId) {
        const query = 'DELETE FROM tests WHERE id = $1';
        const result = await database.query(query, [testId]);
        return (result.rowCount ?? 0) > 0;
    }
    async updateViewPermission(testId, viewPermission) {
        const query = `
      UPDATE tests 
      SET view_permission = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;
        const result = await database.query(query, [viewPermission, testId]);
        return result.rows[0] || null;
    }
    async getTestSubmissions(testId) {
        const query = `
      SELECT ta.*, s.name as student_name, s.phone_number, s.grade, s.student_group
      FROM test_answers ta
      JOIN students s ON ta.student_id = s.id
      WHERE ta.test_id = $1 AND ta.submitted = true
      ORDER BY ta.score DESC NULLS LAST, ta.updated_at ASC
    `;
        const result = await database.query(query, [testId]);
        return result.rows;
    }
    async gradeSubmission(submissionId, score, teacherComment) {
        const query = `
      UPDATE test_answers 
      SET score = $1, teacher_comment = $2, graded = true, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `;
        const result = await database.query(query, [score, teacherComment, submissionId]);
        return result.rows[0] || null;
    }
    async getAvailableTestsForStudent(studentId) {
        const studentQuery = 'SELECT grade, student_group FROM students WHERE id = $1';
        const studentResult = await database.query(studentQuery, [studentId]);
        if (studentResult.rows.length === 0) {
            return [];
        }
        const student = studentResult.rows[0];
        const now = new Date().toISOString();
        console.log('Student info:', student);
        console.log('Current time:', now);
        const query = `
      SELECT t.*, 
             CASE WHEN ta.id IS NOT NULL THEN true ELSE false END as is_submitted
      FROM tests t
      LEFT JOIN test_answers ta ON t.id = ta.test_id AND ta.student_id = $1
      WHERE t.start_time <= $2 
        AND t.end_time >= $2
        AND (t.grade = $3)
        AND (t.student_group IS NULL OR t.student_group = $4)
      ORDER BY t.start_time ASC
    `;
        const result = await database.query(query, [studentId, now, student.grade, student.student_group]);
        console.log('Available tests query result:', result.rows.length);
        console.log('Query parameters:', [studentId, now, student.grade, student.student_group]);
        return result.rows;
    }
    async getStudentTestHistory(studentId) {
        const query = `
      SELECT t.*, ta.score, ta.graded, ta.teacher_comment, ta.created_at as submitted_at,
             CASE 
               WHEN t.view_type = 'IMMEDIATE' OR t.view_permission = true THEN ta.score
               ELSE NULL
             END as visible_score
      FROM tests t
      JOIN test_answers ta ON t.id = ta.test_id
      WHERE ta.student_id = $1
      ORDER BY ta.created_at DESC
    `;
        const result = await database.query(query, [studentId]);
        return result.rows;
    }
    async getTestQuestions(testId, studentId) {
        const availableTests = await this.getAvailableTestsForStudent(studentId);
        const availableTest = availableTests.find(t => t.id === testId);
        if (!availableTest) {
            return null;
        }
        if (availableTest.is_submitted) {
            return null;
        }
        const fullTest = await this.getTestById(testId);
        if (!fullTest) {
            return null;
        }
        if (fullTest.test_type === 'MCQ') {
            const testData = { ...fullTest };
            if (testData.correct_answers) {
                let questions;
                if (typeof testData.correct_answers === 'string') {
                    try {
                        questions = JSON.parse(testData.correct_answers);
                    }
                    catch (error) {
                        console.error('Error parsing string correct_answers:', error);
                        questions = { questions: [] };
                    }
                }
                else {
                    questions = testData.correct_answers;
                }
                console.log('Questions from JSONB:', questions);
                console.log('Questions array length:', questions?.questions?.length);
                if (questions && questions.questions && Array.isArray(questions.questions)) {
                    const questionsWithoutAnswers = questions.questions.map((q) => {
                        const { correct, ...questionWithoutAnswer } = q;
                        return questionWithoutAnswer;
                    });
                    testData.questions = questionsWithoutAnswers;
                }
                else {
                    testData.questions = [];
                }
            }
            else {
                testData.questions = [];
            }
            delete testData.correct_answers;
            testData.is_submitted = availableTest.is_submitted;
            return testData;
        }
        return fullTest;
    }
    async startTest(testId, studentId) {
        const availableTests = await this.getAvailableTestsForStudent(studentId);
        const test = availableTests.find(t => t.id === testId);
        if (!test) {
            return null;
        }
        if (test.is_submitted) {
            return null;
        }
        const testData = { ...test };
        delete testData.correct_answers;
        return testData;
    }
    async submitTest(testId, studentId, answers, isDraft = false) {
        const existingQuery = 'SELECT id FROM test_answers WHERE test_id = $1 AND student_id = $2';
        const existingResult = await database.query(existingQuery, [testId, studentId]);
        if (existingResult.rows.length > 0 && !isDraft) {
            return null;
        }
        if (isDraft) {
            return { id: 0, test_id: testId, student_id: studentId, answers: JSON.stringify(answers), score: null, graded: false };
        }
        const test = await this.getTestById(testId);
        if (!test) {
            return null;
        }
        let score = null;
        let graded = false;
        if ((test.test_type === 'MCQ' || test.test_type === 'BUBBLE_SHEET') && test.correct_answers) {
            const correctAnswers = typeof test.correct_answers === 'string'
                ? JSON.parse(test.correct_answers)
                : test.correct_answers;
            score = this.calculateScore(answers, correctAnswers, test.test_type);
            graded = true;
        }
        const query = `
      INSERT INTO test_answers (test_id, student_id, answers, score, graded)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
        const result = await database.query(query, [
            testId,
            studentId,
            JSON.stringify(answers),
            score,
            graded
        ]);
        return result.rows[0];
    }
    async getTestResult(testId, studentId) {
        const query = `
      SELECT t.*, ta.score, ta.graded, ta.teacher_comment, ta.answers, ta.created_at as submitted_at,
             CASE 
               WHEN t.view_type = 'IMMEDIATE' OR t.view_permission = true THEN ta.score
               ELSE NULL
             END as visible_score,
             CASE 
               WHEN t.view_type = 'IMMEDIATE' OR t.view_permission = true THEN ta.answers
               ELSE NULL
             END as visible_answers
      FROM tests t
      JOIN test_answers ta ON t.id = ta.test_id
      WHERE t.id = $1 AND ta.student_id = $2
    `;
        const result = await database.query(query, [testId, studentId]);
        if (result.rows.length === 0) {
            return null;
        }
        const testResult = result.rows[0];
        if (testResult.visible_score !== null && testResult.correct_answers) {
            testResult.correct_answers_visible = typeof testResult.correct_answers === 'string'
                ? JSON.parse(testResult.correct_answers)
                : testResult.correct_answers;
        }
        return testResult;
    }
    async uploadBubbleSheet(testId, studentId, filePath) {
        const answers = {
            file_path: filePath,
            extracted_answers: {},
            notes: "Bubble sheet uploaded, awaiting processing"
        };
        return this.submitTest(testId, studentId, answers);
    }
    calculateScore(studentAnswers, correctAnswers, testType) {
        if (testType === 'MCQ') {
            if (!correctAnswers.questions || !studentAnswers.answers) {
                return 0;
            }
            let correct = 0;
            const total = correctAnswers.questions.length;
            correctAnswers.questions.forEach((question) => {
                const studentAnswer = studentAnswers.answers.find((ans) => ans.id === question.id);
                if (studentAnswer && studentAnswer.answer === question.correct) {
                    correct++;
                }
            });
            return Math.round((correct / total) * 100 * 100) / 100;
        }
        if (testType === 'BUBBLE_SHEET') {
            if (!correctAnswers.answers || !studentAnswers.answers) {
                return 0;
            }
            let correct = 0;
            const totalQuestions = Object.keys(correctAnswers.answers).length;
            Object.entries(correctAnswers.answers).forEach(([questionId, correctAnswer]) => {
                if (studentAnswers.answers[questionId] === correctAnswer) {
                    correct++;
                }
            });
            return Math.round((correct / totalQuestions) * 100 * 100) / 100;
        }
        return 0;
    }
}
export default new TestService();
//# sourceMappingURL=testService.js.map