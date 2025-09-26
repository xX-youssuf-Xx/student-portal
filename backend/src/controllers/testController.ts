import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types';
import testService from '../services/testService';
import type { FileFilterCallback } from 'multer';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';

declare global {
  namespace Express {
    interface Request {
      files?: { [fieldname: string]: Express.Multer.File[] } | Express.Multer.File[] | undefined;
    }
  }
}

type FileCallback = (error: Error | null, acceptFile: boolean) => void;

const unlinkAsync = promisify(fs.unlink);

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/tests/';
    // Create directory if it doesn't exist
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

// File filter for images only
const imageFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
) => {
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
  } catch (error) {
    cb(error as Error);
  }
};

// Custom middleware to handle array uploads with bracket notation
const handleArrayUpload = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Convert fields with pattern images[0], images[1], etc. to a single images array
    if (req.body.images) {
      try {
        if (typeof req.body.images === 'string') {
          req.body.images = JSON.parse(req.body.images);
        }
        if (Array.isArray(req.body.images)) {
          // If images is already an array, use it
          return next();
        }
      } catch (e) {
        console.error('Error parsing images array:', e);
        // If parsing fails, continue with the original request
      }
    }
    
    // Handle bracket notation fields (images[0], images[1], etc.)
    const imageFields = Object.keys(req.body)
      .filter(key => key.startsWith('images[') && key.endsWith(']'));
      
    if (imageFields.length > 0) {
      if (!req.files) {
        req.files = [];
      }
      
      // Sort the fields to maintain order
      imageFields.sort((a, b) => {
        const aMatch = a.match(/[[\](\d+)[[\]]/);
        const bMatch = b.match(/[[\](\d+)[[\]]/);
        const aNum = aMatch ? parseInt(aMatch[1] || '0', 10) : 0;
        const bNum = bMatch ? parseInt(bMatch[1] || '0', 10) : 0;
        return aNum - bNum;
      });
      
      imageFields.forEach(field => {
        const file = req.body[field];
        if (file && typeof file === 'object' && 'originalname' in file) {
          (req.files as Express.Multer.File[]).push(file as Express.Multer.File);
        }
      });
      
      // Clean up the original fields
      imageFields.forEach(field => {
        delete req.body[field];
      });
    }
    
    next();
  } catch (error) {
    console.error('Error in handleArrayUpload:', error);
    next(error);
  }
};

// Create multer instance with configuration
const multerInstance = multer({
  storage,
  fileFilter: imageFilter,
  limits: { fileSize: 1024 * 1024 * 1024 } // 1GB limit
});

// Export both multer instance and our custom middleware
export { handleArrayUpload };
export const upload = multerInstance;

class TestController {
  // Admin/Teacher endpoints
  async createTest(req: AuthenticatedRequest, res: Response): Promise<void> {
    const files = req.files as Express.Multer.File[];
    const testData = typeof req.body.testData === 'string' 
      ? JSON.parse(req.body.testData) 
      : req.body;
    
    try {
      // Create test first
      const test = await testService.createTest(testData);
      
      // Handle image uploads if any
      if (files && files.length > 0) {
        try {
          const imagePaths = files.map((file, index) => ({
            testId: test.id,
            imagePath: file.path.replace(/\\/g, '/'), // Convert to forward slashes for consistency
            displayOrder: index // Set display order based on array index
          }));
          
          await testService.addTestImages(imagePaths);
        } catch (error) {
          console.error('Error saving test images:', error);
          // Don't fail the whole request if image saving fails
        }
      }
      
      // Refresh test with images and return
      const updatedTest = await testService.getTestById(test.id);
      res.status(201).json({ test: updatedTest });
    } catch (error) {
      console.error('Error creating test:', error);
      // Clean up uploaded files if there was an error
      if (files && Array.isArray(files)) {
        await Promise.all(
          (files as Express.Multer.File[]).map(file => 
            unlinkAsync(file.path).catch(console.error)
          )
        );
      }
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async getAllTests(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const tests = await testService.getAllTests();
      res.json({ tests });
    } catch (error) {
      console.error('Error getting all tests:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async getTestById(req: AuthenticatedRequest, res: Response): Promise<void> {
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

      // Get test with images
      const test = await testService.getTestById(testId);
      if (!test) {
        res.status(404).json({ message: 'Test not found' });
        return;
      }

      // Convert image paths to URLs if needed
      const testWithImageUrls = {
        ...test,
        images: test.images?.map(img => ({
          ...img,
          // Convert relative paths to absolute URLs if needed
          image_url: img.image_path.startsWith('http')
            ? img.image_path
            : `${process.env.API_BASE_URL || 'https://studentportal.egypt-tech.com'}/${img.image_path.replace(/\\/g, '/')}`
        }))
      };

      res.json({ test: testWithImageUrls });
    } catch (error) {
      console.error('Error getting test by ID:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async updateTest(req: AuthenticatedRequest, res: Response): Promise<void> {
    const files = Array.isArray(req.files) 
      ? req.files as Express.Multer.File[] 
      : [];
      
    // Handle both JSON and form-data requests
    let testData;
    if (req.body.testData) {
      // Handle form-data with testData field
      testData = typeof req.body.testData === 'string' 
        ? JSON.parse(req.body.testData)
        : req.body.testData;
    } else {
      // Handle raw JSON or other formats
      testData = typeof req.body === 'string' 
        ? JSON.parse(req.body) 
        : req.body;
    }
      
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
      // Handle image uploads if any
      if (files.length > 0) {
        try {
          // Delete existing images if this is a replacement
          if (testData.replaceImages) {
            await testService.deleteTestImages(testId);
          }
          
          // Add new images
          const imagePaths = files.map((file, index) => ({
            testId,
            imagePath: file.path.replace(/\\/g, '/'),
            displayOrder: index
          }));
          
          await testService.addTestImages(imagePaths);
        } catch (error) {
          console.error('Error updating test images:', error);
          // Clean up uploaded files if there was an error
          await Promise.all(
            files.map(file => unlinkAsync(file.path).catch(console.error))
          );
          throw error;
        }
      }

      // Update test data
      const updatedTest = await testService.updateTest(testId, testData);
      if (!updatedTest) {
        // Clean up uploaded files if test not found
        await Promise.all(
          files.map(file => unlinkAsync(file.path).catch(console.error))
        );
        res.status(404).json({ message: 'Test not found' });
        return;
      }

      // Get the updated test with images
      const testWithImages = await testService.getTestById(testId);
      
      // Convert image paths to URLs
      const testWithImageUrls = testWithImages ? {
        ...testWithImages,
        images: testWithImages.images?.map(img => ({
          ...img,
          image_url: img.image_path.startsWith('http')
            ? img.image_path
            : `${process.env.API_BASE_URL || 'https://studentportal.egypt-tech.com'}/${img.image_path.replace(/\\/g, '/')}`
        }))
      } : null;
      
      res.json({ test: testWithImageUrls });
    } catch (error) {
      console.error('Error updating test:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async deleteTestImage(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ message: 'Image ID is required' });
        return;
      }
  
      const imageId = parseInt(id, 10);
      if (isNaN(imageId)) {
        res.status(400).json({ message: 'Invalid image ID' });
        return;
      }
  
      const success = await testService.deleteTestImage(imageId);
      if (!success) {
        res.status(404).json({ message: 'Test image not found' });
        return;
      }
  
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting test image:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
  
  async deleteTest(req: AuthenticatedRequest, res: Response): Promise<void> {
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
    } catch (error) {
      console.error('Error deleting test:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async updateViewPermission(req: AuthenticatedRequest, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const { view_permission } = req.body;
      
      if (typeof view_permission !== 'boolean') {
        return res.status(400).json({ message: 'view_permission is required and must be a boolean' });
      }
      
      const updatedTest = await testService.updateViewPermission(Number(id), view_permission);
      
      if (!updatedTest) {
        return res.status(404).json({ message: 'Test not found' });
      }
      
      return res.json({ test: updatedTest });
    } catch (error) {
      console.error('Error updating test view permission:', error);
      return res.status(500).json({ message: 'Error updating test view permission' });
    }
  }

  async updateShowGradeOutside(req: AuthenticatedRequest, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const { show_grade_outside } = req.body;
      
      if (typeof show_grade_outside !== 'boolean') {
        return res.status(400).json({ message: 'show_grade_outside is required and must be a boolean' });
      }
      
      const updatedTest = await testService.updateTest(Number(id), { show_grade_outside });
      
      if (!updatedTest) {
        return res.status(404).json({ message: 'Test not found' });
      }
      
      return res.json({ test: updatedTest });
    } catch (error) {
      console.error('Error updating show_grade_outside:', error);
      return res.status(500).json({ message: 'Error updating show_grade_outside setting' });
    }
  }

  async getTestSubmissions(req: AuthenticatedRequest, res: Response): Promise<void> {
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
    } catch (error) {
      console.error('Error getting test submissions:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async gradeSubmission(req: AuthenticatedRequest, res: Response): Promise<void> {
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
    } catch (error) {
      console.error('Error grading submission:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async deleteSubmission(req: AuthenticatedRequest, res: Response): Promise<void> {
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

      const success = await testService.deleteSubmission(submissionId);
      if (!success) {
        res.status(404).json({ message: 'Submission not found' });
        return;
      }

      res.status(204).send();
    } catch (error) {
      console.error('Error deleting submission:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async getSubmissionWithTest(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id, submissionId } = req.params as { id: string; submissionId: string };
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
    } catch (error) {
      console.error('Error fetching submission with test:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async setManualGrades(req: AuthenticatedRequest, res: Response): Promise<void> {
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

      const { grades, teacher_comment } = req.body as { grades: Record<string, number>; teacher_comment?: string };
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
    } catch (error) {
      console.error('Error setting manual grades:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  // Student endpoints
  async getAvailableTests(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        res.status(400).json({ message: 'User ID not found' });
        return;
      }

      const tests = await testService.getAvailableTestsForStudent(req.user.id);
      
      // Use UTC now and convert to Cairo time using toLocaleString with Africa/Cairo timezone
      const utcNow = new Date();
      const cairoNowString = utcNow.toLocaleString('en-US', { timeZone: 'Africa/Cairo' });
      const timezoneStr = 'GMT+3';
      const allStartTimes = (tests || []).map(t => ({
        id: (t as any).id,
        title: (t as any).title,
        start_time: (t as any).start_time,
        start_time_cairo: (t as any).start_time_utc ? new Date((t as any).start_time_utc).toLocaleString('en-US', { timeZone: 'Africa/Cairo' }) : null,
        start_time_ms: (t as any).start_time_ms
      }));

      res.json({
        now: {
          cairo: cairoNowString,
          utc: utcNow.toISOString(),
          ms: utcNow.getTime(),
          timezone: timezoneStr
        },
        available_count: (tests || []).length,
        all_start_times: allStartTimes,
        tests
      });
    } catch (error) {
      console.error('Error getting available tests:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async getStudentTestHistory(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        res.status(400).json({ message: 'User ID not found' });
        return;
      }

      const history = await testService.getStudentTestHistory(req.user.id);
      res.json({ history });
    } catch (error) {
      console.error('Error getting student test history:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async startTest(req: AuthenticatedRequest, res: Response): Promise<void> {
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
    } catch (error) {
      console.error('Error starting test:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async getTestImages(req: AuthenticatedRequest, res: Response): Promise<void> {
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
    } catch (error) {
      console.error('Error fetching test images:', error);
      res.status(500).json({ message: 'Failed to fetch test images' });
    }
  }

  async getTestQuestions(req: AuthenticatedRequest, res: Response): Promise<void> {
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
    } catch (error) {
      console.error('Error getting test questions:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async submitTest(req: AuthenticatedRequest, res: Response): Promise<void> {
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
    } catch (error) {
      console.error('Error submitting test:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async getTestResult(req: AuthenticatedRequest, res: Response): Promise<void> {
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
    } catch (error) {
      console.error('Error getting test result:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async uploadBubbleSheet(req: AuthenticatedRequest, res: Response): Promise<void> {
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
    } catch (error) {
      console.error('Error uploading bubble sheet:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async getStudentRank(req: AuthenticatedRequest, res: Response): Promise<void> {
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

      const data = await testService.getStudentRank(testId, req.user.id);
      res.json({ rank: data.rank, totalStudents: data.total, score: data.score });
    } catch (error) {
      console.error('Error getting student rank:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  // Admin: batch grade physical bubble tests by invoking Python script per student
  async gradePhysicalBatch(req: AuthenticatedRequest, res: Response): Promise<void> {
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

      // Expect multipart/form-data with fields: n_questions, students (JSON array), files (images)
      const rawStudents = (req.body?.students ?? req.body?.students_json ?? '') as unknown;
      const nQuestionsRaw = (req.body?.n_questions ?? req.body?.n ?? req.body?.num_questions) as unknown;

      let studentsOrdered: number[] = [];
      try {
        if (Array.isArray(rawStudents)) {
          studentsOrdered = (rawStudents as any[]).map((v) => Number(v)).filter((v) => !isNaN(v));
        } else if (typeof rawStudents === 'string' && rawStudents.trim() !== '') {
          const parsed = JSON.parse(rawStudents);
          studentsOrdered = (parsed as any[]).map((v) => Number(v)).filter((v) => !isNaN(v));
        }
      } catch (e) {
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

      const files = Array.isArray(req.files) ? (req.files as Express.Multer.File[]).map(f => ({ path: f.path, originalname: f.originalname, filename: f.filename })) : [];
      if (!files.length) {
        res.status(400).json({ message: 'No images uploaded' });
        return;
      }

      // Optional: filenames are the student IDs flag
      const namesAsIds = (() => {
        const raw = (req.body?.names_as_ids ?? req.body?.namesAsIds ?? req.body?.use_names_as_ids);
        if (typeof raw === 'string') return raw === 'true' || raw === '1' || raw.toLowerCase() === 'yes';
        if (typeof raw === 'boolean') return raw;
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
    } catch (error) {
      console.error('Error in gradePhysicalBatch:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  // Admin: get eligible students for a PHYSICAL_SHEET test (same grade and matching group)
  async getEligibleStudents(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) { res.status(400).json({ message: 'Test ID is required' }); return; }
      const testId = parseInt(id, 10);
      if (isNaN(testId)) { res.status(400).json({ message: 'Invalid test ID' }); return; }

      const students = await testService.getEligibleStudentsForTest(testId);
      res.json({ students });
    } catch (error) {
      console.error('Error fetching eligible students:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  // Admin: include selected students as placeholder submissions for a PHYSICAL_SHEET test
  async includeStudents(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) { res.status(400).json({ message: 'Test ID is required' }); return; }
      const testId = parseInt(id, 10);
      if (isNaN(testId)) { res.status(400).json({ message: 'Invalid test ID' }); return; }

      const raw = req.body?.student_ids ?? req.body?.students ?? req.body?.studentIds;
      let studentIds: number[] = [];
      if (Array.isArray(raw)) {
        studentIds = raw.map(Number).filter(n => !isNaN(n));
      } else if (typeof raw === 'string' && raw.trim() !== '') {
        try {
          const parsed = JSON.parse(raw) as Array<any>;
          studentIds = parsed.map((v: any) => Number(v)).filter((n: number) => !isNaN(n));
        } catch {
          studentIds = [];
        }
      }

      if (!studentIds.length) { res.status(400).json({ message: 'student_ids array is required' }); return; }

      const result = await testService.includeStudentsForTest(testId, studentIds);
      res.json(result);
    } catch (error) {
      console.error('Error including students:', error);
      if ((error as Error).message?.includes('PHYSICAL_SHEET')) {
        res.status(400).json({ message: (error as Error).message });
      } else {
        res.status(500).json({ message: 'Internal server error' });
      }
    }
  }

  // Admin: export combined rankings for selected tests (returns CSV)
  async exportRankings(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const raw = req.body?.test_ids ?? req.body?.tests ?? req.body?.testIds;
      let testIds: number[] = [];
      if (Array.isArray(raw)) testIds = raw.map(Number).filter(n => !isNaN(n));
      else if (typeof raw === 'string' && raw.trim() !== '') {
        try { const parsed = JSON.parse(raw) as unknown[]; testIds = parsed.map((v) => Number(v)).filter((n) => !isNaN(n)); } catch { testIds = []; }
      }

      if (!testIds.length) {
        res.status(400).json({ message: 'test_ids array is required' });
        return;
      }

      // Use service to get structured rows and create an XLSX workbook
      const { header, rows } = await testService.exportCombinedRankingsRows(testIds);

      // Lazy-require exceljs to avoid adding it at top-level if not needed during test runs
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('الترتيب');

      // Add header (Arabic) and rows
      sheet.addRow(header);
      for (const r of rows) {
        sheet.addRow(r);
      }

      // Auto-width columns
      sheet.columns.forEach((col) => {
        let max = 10;
        // eachCell may be undefined in ExcelJS typings, guard before calling
        col.eachCell?.({ includeEmpty: true }, (cell) => { 
          const val = cell && cell.value ? String(cell.value) : '';
          if (val.length > max) max = val.length;
        });
        col.width = Math.min(Math.max(max + 2, 10), 60);
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="rankings.xlsx"');

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error('Error exporting rankings:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  // Admin: edit/update detected answers for a submission and recalculate score
  async updateBubbleAnswers(req: AuthenticatedRequest, res: Response): Promise<void> {
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

      // answers can come as object or JSON string
      let answersMap: Record<string, string> | null = null;
      const rawAnswers = (req.body?.answers ?? req.body?.answers_map ?? req.body?.detected_answers) as unknown;
      try {
        if (typeof rawAnswers === 'string') {
          answersMap = JSON.parse(rawAnswers);
        } else if (typeof rawAnswers === 'object' && rawAnswers !== null) {
          answersMap = rawAnswers as Record<string, string>;
        }
      } catch (e) {
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
    } catch (error) {
      console.error('Error updating bubble answers:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async regradeAllSubmissions(req: AuthenticatedRequest, res: Response): Promise<void> {
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

      // Fire and forget, don't await
      testService.regradeAllSubmissions(testId);

      res.status(202).json({ message: 'Regrading process started in the background.' });
    } catch (error) {
      console.error('Error starting regrade process:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
}

export default new TestController();
