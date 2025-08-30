import testService from '../services/testService';
import multer from 'multer';
import path from 'path';
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
export const upload = multer({ storage });
class TestController {
    async createTest(req, res) {
        try {
            const testData = req.body;
            const pdfFile = req.file;
            if (pdfFile) {
                testData.pdf_file_path = pdfFile.path;
            }
            const test = await testService.createTest(testData);
            res.status(201).json({ test });
        }
        catch (error) {
            console.error('Error creating test:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
    async getAllTests(req, res) {
        try {
            const tests = await testService.getAllTests();
            res.json({ tests });
        }
        catch (error) {
            console.error('Error getting all tests:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
    async getTestById(req, res) {
        try {
            const { id } = req.params;
            if (!id) {
                res.status(400).json({ message: 'Test ID is required' });
                return;
            }
            const testId = parseInt(id, 10);
            if (isNaN(testId)) {
                res.status(400).json({ message: 'Invalid test ID' });
                return;
            }
            const test = await testService.getTestById(testId);
            if (!test) {
                res.status(404).json({ message: 'Test not found' });
                return;
            }
            res.json({ test });
        }
        catch (error) {
            console.error('Error getting test by ID:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
    async updateTest(req, res) {
        try {
            const { id } = req.params;
            if (!id) {
                res.status(400).json({ message: 'Test ID is required' });
                return;
            }
            const testId = parseInt(id, 10);
            if (isNaN(testId)) {
                res.status(400).json({ message: 'Invalid test ID' });
                return;
            }
            const testData = req.body;
            const pdfFile = req.file;
            if (pdfFile) {
                testData.pdf_file_path = pdfFile.path;
            }
            const test = await testService.updateTest(testId, testData);
            if (!test) {
                res.status(404).json({ message: 'Test not found' });
                return;
            }
            res.json({ test });
        }
        catch (error) {
            console.error('Error updating test:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
    async deleteTest(req, res) {
        try {
            const { id } = req.params;
            if (!id) {
                res.status(400).json({ message: 'Test ID is required' });
                return;
            }
            const testId = parseInt(id, 10);
            if (isNaN(testId)) {
                res.status(400).json({ message: 'Invalid test ID' });
                return;
            }
            const success = await testService.deleteTest(testId);
            if (!success) {
                res.status(404).json({ message: 'Test not found' });
                return;
            }
            res.status(204).send();
        }
        catch (error) {
            console.error('Error deleting test:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
    async updateViewPermission(req, res) {
        try {
            const { id } = req.params;
            if (!id) {
                res.status(400).json({ message: 'Test ID is required' });
                return;
            }
            const { view_permission } = req.body;
            const testId = parseInt(id, 10);
            if (isNaN(testId)) {
                res.status(400).json({ message: 'Invalid test ID' });
                return;
            }
            const test = await testService.updateViewPermission(testId, view_permission);
            if (!test) {
                res.status(404).json({ message: 'Test not found' });
                return;
            }
            res.json({ test });
        }
        catch (error) {
            console.error('Error updating view permission:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
    async getTestSubmissions(req, res) {
        try {
            const { id } = req.params;
            if (!id) {
                res.status(400).json({ message: 'Test ID is required' });
                return;
            }
            const testId = parseInt(id, 10);
            if (isNaN(testId)) {
                res.status(400).json({ message: 'Invalid test ID' });
                return;
            }
            const submissions = await testService.getTestSubmissions(testId);
            res.json({ submissions });
        }
        catch (error) {
            console.error('Error getting test submissions:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
    async gradeSubmission(req, res) {
        try {
            const { id } = req.params;
            if (!id) {
                res.status(400).json({ message: 'Submission ID is required' });
                return;
            }
            const { score, teacher_comment } = req.body;
            const submissionId = parseInt(id, 10);
            if (isNaN(submissionId)) {
                res.status(400).json({ message: 'Invalid submission ID' });
                return;
            }
            const submission = await testService.gradeSubmission(submissionId, score, teacher_comment);
            if (!submission) {
                res.status(404).json({ message: 'Submission not found' });
                return;
            }
            res.json({ submission });
        }
        catch (error) {
            console.error('Error grading submission:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
    async getAvailableTests(req, res) {
        try {
            if (!req.user?.id) {
                res.status(400).json({ message: 'User ID not found' });
                return;
            }
            const tests = await testService.getAvailableTestsForStudent(req.user.id);
            res.json({ tests });
        }
        catch (error) {
            console.error('Error getting available tests:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
    async getStudentTestHistory(req, res) {
        try {
            if (!req.user?.id) {
                res.status(400).json({ message: 'User ID not found' });
                return;
            }
            const history = await testService.getStudentTestHistory(req.user.id);
            res.json({ history });
        }
        catch (error) {
            console.error('Error getting student test history:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
    async startTest(req, res) {
        try {
            const { id } = req.params;
            if (!id) {
                res.status(400).json({ message: 'Test ID is required' });
                return;
            }
            const testId = parseInt(id, 10);
            if (isNaN(testId) || !req.user?.id) {
                res.status(400).json({ message: 'Invalid test ID or user ID' });
                return;
            }
            const testData = await testService.startTest(testId, req.user.id);
            if (!testData) {
                res.status(404).json({ message: 'Test not found or not available' });
                return;
            }
            res.json({ test: testData });
        }
        catch (error) {
            console.error('Error starting test:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
    async getTestQuestions(req, res) {
        try {
            const { id } = req.params;
            if (!id) {
                res.status(400).json({ message: 'Test ID is required' });
                return;
            }
            const testId = parseInt(id, 10);
            if (isNaN(testId) || !req.user?.id) {
                res.status(400).json({ message: 'Invalid test ID or user ID' });
                return;
            }
            const testData = await testService.getTestQuestions(testId, req.user.id);
            if (!testData) {
                res.status(404).json({ message: 'Test not found or not available' });
                return;
            }
            res.json({ test: testData });
        }
        catch (error) {
            console.error('Error getting test questions:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
    async submitTest(req, res) {
        try {
            const { id } = req.params;
            if (!id) {
                res.status(400).json({ message: 'Test ID is required' });
                return;
            }
            const { answers, is_draft } = req.body;
            const testId = parseInt(id, 10);
            if (isNaN(testId) || !req.user?.id) {
                res.status(400).json({ message: 'Invalid test ID or user ID' });
                return;
            }
            const submission = await testService.submitTest(testId, req.user.id, answers, is_draft);
            if (!submission) {
                res.status(400).json({ message: 'Failed to submit test' });
                return;
            }
            res.json({ submission });
        }
        catch (error) {
            console.error('Error submitting test:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
    async getTestResult(req, res) {
        try {
            const { id } = req.params;
            if (!id) {
                res.status(400).json({ message: 'Test ID is required' });
                return;
            }
            const testId = parseInt(id, 10);
            if (isNaN(testId) || !req.user?.id) {
                res.status(400).json({ message: 'Invalid test ID or user ID' });
                return;
            }
            const result = await testService.getTestResult(testId, req.user.id);
            if (!result) {
                res.status(404).json({ message: 'Test result not found' });
                return;
            }
            res.json({ result });
        }
        catch (error) {
            console.error('Error getting test result:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
    async uploadBubbleSheet(req, res) {
        try {
            const { id } = req.params;
            if (!id) {
                res.status(400).json({ message: 'Test ID is required' });
                return;
            }
            const testId = parseInt(id, 10);
            const bubbleSheetFile = req.file;
            if (isNaN(testId) || !req.user?.id || !bubbleSheetFile) {
                res.status(400).json({ message: 'Invalid test ID, user ID, or missing file' });
                return;
            }
            const submission = await testService.uploadBubbleSheet(testId, req.user.id, bubbleSheetFile.path);
            if (!submission) {
                res.status(400).json({ message: 'Failed to upload bubble sheet' });
                return;
            }
            res.json({ submission });
        }
        catch (error) {
            console.error('Error uploading bubble sheet:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
    async getStudentRank(req, res) {
        try {
            const { id } = req.params;
            if (!id) {
                res.status(400).json({ message: 'Test ID is required' });
                return;
            }
            const testId = parseInt(id, 10);
            if (isNaN(testId) || !req.user?.id) {
                res.status(400).json({ message: 'Invalid test ID or user ID' });
                return;
            }
            const submissions = await testService.getTestSubmissions(testId);
            const currentStudentSubmission = submissions.find((s) => s.student_id === req.user?.id && s.test_id === testId);
            if (!currentStudentSubmission) {
                res.status(404).json({ message: 'Submission not found for this test' });
                return;
            }
            let rank = 1;
            let prevScore = null;
            let sameScoreCount = 0;
            for (const [index, submission] of submissions.entries()) {
                if (index > 0 && submission.score !== prevScore) {
                    rank += sameScoreCount;
                    sameScoreCount = 0;
                }
                if (submission.student_id === req.user?.id) {
                    break;
                }
                if (submission.score === prevScore) {
                    sameScoreCount++;
                }
                else {
                    sameScoreCount = 1;
                    prevScore = submission.score;
                }
            }
            res.json({
                rank,
                totalStudents: submissions.length,
                score: currentStudentSubmission.score
            });
        }
        catch (error) {
            console.error('Error getting student rank:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
}
export default new TestController();
//# sourceMappingURL=testController.js.map