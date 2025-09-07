import testService from '../services/testService';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
const unlinkAsync = promisify(fs.unlink);
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads/tests/';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, 'test-' + uniqueSuffix + ext);
    }
});
const imageFilter = (req, file, cb) => {
    try {
        const allowedTypes = ['.jpg', '.jpeg', '.png', '.webp'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (!file.originalname || !ext) {
            return cb(new Error('Invalid file name or extension'));
        }
        if (allowedTypes.includes(ext)) {
            return cb(null, true);
        }
        cb(new Error(`Unsupported file type. Allowed types: ${allowedTypes.join(', ')}`));
    }
    catch (error) {
        cb(error);
    }
};
const handleArrayUpload = (req, res, next) => {
    try {
        if (req.body.images) {
            try {
                if (typeof req.body.images === 'string') {
                    req.body.images = JSON.parse(req.body.images);
                }
                if (Array.isArray(req.body.images)) {
                    return next();
                }
            }
            catch (e) {
                console.error('Error parsing images array:', e);
            }
        }
        const imageFields = Object.keys(req.body)
            .filter(key => key.startsWith('images[') && key.endsWith(']'));
        if (imageFields.length > 0) {
            if (!req.files) {
                req.files = [];
            }
            imageFields.sort((a, b) => {
                const aMatch = a.match(/\[(\d+)\]/);
                const bMatch = b.match(/\[(\d+)\]/);
                const aNum = aMatch ? parseInt(aMatch[1] || '0', 10) : 0;
                const bNum = bMatch ? parseInt(bMatch[1] || '0', 10) : 0;
                return aNum - bNum;
            });
            imageFields.forEach(field => {
                const file = req.body[field];
                if (file && typeof file === 'object' && 'originalname' in file) {
                    req.files.push(file);
                }
            });
            imageFields.forEach(field => {
                delete req.body[field];
            });
        }
        next();
    }
    catch (error) {
        console.error('Error in handleArrayUpload:', error);
        next(error);
    }
};
const multerInstance = multer({
    storage,
    fileFilter: imageFilter,
    limits: { fileSize: 10 * 1024 * 1024 }
});
export { handleArrayUpload };
export const upload = multerInstance;
class TestController {
    async createTest(req, res) {
        if (!req.files || !Array.isArray(req.files)) {
            res.status(400).json({ message: 'No files were uploaded' });
            return;
        }
        const files = req.files;
        const testData = typeof req.body === 'string'
            ? JSON.parse(req.body)
            : req.body;
        try {
            const test = await testService.createTest(testData);
            if (files && files.length > 0) {
                try {
                    const imagePaths = files.map((file, index) => ({
                        testId: test.id,
                        imagePath: file.path.replace(/\\/g, '/'),
                        displayOrder: index
                    }));
                    await testService.addTestImages(imagePaths);
                }
                catch (error) {
                    console.error('Error saving test images:', error);
                }
            }
            const updatedTest = await testService.getTestById(test.id);
            res.status(201).json({ test: updatedTest });
        }
        catch (error) {
            console.error('Error creating test:', error);
            if (req.files && Array.isArray(req.files)) {
                await Promise.all(req.files.map(file => unlinkAsync(file.path).catch(console.error)));
            }
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
            const testWithImageUrls = {
                ...test,
                images: test.images?.map(img => ({
                    ...img,
                    image_url: img.image_path.startsWith('http')
                        ? img.image_path
                        : `${process.env.API_BASE_URL || 'http://localhost:3000'}/${img.image_path.replace(/\\/g, '/')}`
                }))
            };
            res.json({ test: testWithImageUrls });
        }
        catch (error) {
            console.error('Error getting test by ID:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
    async updateTest(req, res) {
        const files = Array.isArray(req.files)
            ? req.files
            : [];
        const testData = typeof req.body === 'string'
            ? JSON.parse(req.body)
            : req.body;
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
        try {
            if (files.length > 0) {
                try {
                    if (testData.replaceImages) {
                        await testService.deleteTestImages(testId);
                    }
                    const imagePaths = files.map((file, index) => ({
                        testId,
                        imagePath: file.path.replace(/\\/g, '/'),
                        displayOrder: index
                    }));
                    await testService.addTestImages(imagePaths);
                }
                catch (error) {
                    console.error('Error updating test images:', error);
                    await Promise.all(files.map(file => unlinkAsync(file.path).catch(console.error)));
                    throw error;
                }
            }
            const updatedTest = await testService.updateTest(testId, testData);
            if (!updatedTest) {
                await Promise.all(files.map(file => unlinkAsync(file.path).catch(console.error)));
                res.status(404).json({ message: 'Test not found' });
                return;
            }
            const testWithImages = await testService.getTestById(testId);
            const testWithImageUrls = testWithImages ? {
                ...testWithImages,
                images: testWithImages.images?.map(img => ({
                    ...img,
                    image_url: img.image_path.startsWith('http')
                        ? img.image_path
                        : `${process.env.API_BASE_URL || 'http://localhost:3000'}/${img.image_path.replace(/\\/g, '/')}`
                }))
            } : null;
            res.json({ test: testWithImageUrls });
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
    async getSubmissionWithTest(req, res) {
        try {
            const { id, submissionId } = req.params;
            if (!id || !submissionId) {
                res.status(400).json({ message: 'Test ID and Submission ID are required' });
                return;
            }
            const testId = parseInt(id, 10);
            const subId = parseInt(submissionId, 10);
            if (isNaN(testId) || isNaN(subId)) {
                res.status(400).json({ message: 'Invalid test or submission ID' });
                return;
            }
            const data = await testService.getSubmissionWithTest(testId, subId);
            if (!data) {
                res.status(404).json({ message: 'Submission or test not found' });
                return;
            }
            res.json(data);
        }
        catch (error) {
            console.error('Error fetching submission with test:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
    async setManualGrades(req, res) {
        try {
            const { id } = req.params;
            if (!id) {
                res.status(400).json({ message: 'Submission ID is required' });
                return;
            }
            const submissionId = parseInt(id, 10);
            if (isNaN(submissionId)) {
                res.status(400).json({ message: 'Invalid submission ID' });
                return;
            }
            const { grades, teacher_comment } = req.body;
            if (!grades || typeof grades !== 'object') {
                res.status(400).json({ message: 'grades object is required' });
                return;
            }
            const updated = await testService.setManualGrades(submissionId, grades, teacher_comment);
            if (!updated) {
                res.status(404).json({ message: 'Submission not found' });
                return;
            }
            res.json({ submission: updated });
        }
        catch (error) {
            console.error('Error setting manual grades:', error);
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
    async getTestImages(req, res) {
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
            const images = await testService.getTestImages(testId);
            res.json(images);
        }
        catch (error) {
            console.error('Error fetching test images:', error);
            res.status(500).json({ message: 'Failed to fetch test images' });
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
    async gradePhysicalBatch(req, res) {
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
            const rawStudents = (req.body?.students ?? req.body?.students_json ?? '');
            const nQuestionsRaw = (req.body?.n_questions ?? req.body?.n ?? req.body?.num_questions);
            let studentsOrdered = [];
            try {
                if (Array.isArray(rawStudents)) {
                    studentsOrdered = rawStudents.map((v) => Number(v)).filter((v) => !isNaN(v));
                }
                else if (typeof rawStudents === 'string' && rawStudents.trim() !== '') {
                    const parsed = JSON.parse(rawStudents);
                    studentsOrdered = parsed.map((v) => Number(v)).filter((v) => !isNaN(v));
                }
            }
            catch (e) {
                res.status(400).json({ message: 'Invalid students list; expected JSON array of IDs' });
                return;
            }
            const nQuestions = Number(nQuestionsRaw);
            if (!nQuestions || isNaN(nQuestions) || nQuestions < 1 || nQuestions > 55) {
                res.status(400).json({ message: 'Invalid n_questions; must be between 1 and 55' });
                return;
            }
            if (!studentsOrdered.length) {
                res.status(400).json({ message: 'students array is required and must not be empty' });
                return;
            }
            const files = Array.isArray(req.files) ? req.files.map(f => ({ path: f.path, originalname: f.originalname, filename: f.filename })) : [];
            if (!files.length) {
                res.status(400).json({ message: 'No images uploaded' });
                return;
            }
            const namesAsIds = (() => {
                const raw = (req.body?.names_as_ids ?? req.body?.namesAsIds ?? req.body?.use_names_as_ids);
                if (typeof raw === 'string')
                    return raw === 'true' || raw === '1' || raw.toLowerCase() === 'yes';
                if (typeof raw === 'boolean')
                    return raw;
                return false;
            })();
            const results = await testService.gradePhysicalBatch({
                testId,
                nQuestions,
                studentsOrdered,
                files,
                namesAsIds
            });
            res.json({ results });
        }
        catch (error) {
            console.error('Error in gradePhysicalBatch:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
    async updateBubbleAnswers(req, res) {
        try {
            const { id } = req.params;
            if (!id) {
                res.status(400).json({ message: 'Submission ID is required' });
                return;
            }
            const submissionId = parseInt(id, 10);
            if (isNaN(submissionId)) {
                res.status(400).json({ message: 'Invalid submission ID' });
                return;
            }
            let answersMap = null;
            const rawAnswers = (req.body?.answers ?? req.body?.answers_map ?? req.body?.detected_answers);
            try {
                if (typeof rawAnswers === 'string') {
                    answersMap = JSON.parse(rawAnswers);
                }
                else if (typeof rawAnswers === 'object' && rawAnswers !== null) {
                    answersMap = rawAnswers;
                }
            }
            catch (e) {
                answersMap = null;
            }
            if (!answersMap || typeof answersMap !== 'object') {
                res.status(400).json({ message: 'answers object is required' });
                return;
            }
            const teacherComment = typeof req.body?.teacher_comment === 'string' ? req.body.teacher_comment : undefined;
            const updated = await testService.updateSubmissionAnswers(submissionId, answersMap, teacherComment);
            if (!updated) {
                res.status(404).json({ message: 'Submission not found' });
                return;
            }
            res.json({ submission: updated });
        }
        catch (error) {
            console.error('Error updating bubble answers:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
}
export default new TestController();
//# sourceMappingURL=testController.js.map