import database from './database';
import type { Test, TestAnswer, Student, TestImage } from '../types';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { promisify } from 'util';

const unlinkAsync = promisify(fs.unlink);

// Helper: format Date (from DB) as local wall-time string 'YYYY-MM-DDTHH:mm'
const pad = (n: number) => String(n).padStart(2, '0');
const formatLocal = (d: Date | string | null) => {
  if (!d) return null;
  const date = (d instanceof Date) ? d : new Date(d as string);
  // Use local fields to preserve wall time
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
};

// Helper: return current local timestamp string compatible with DB comparisons
const nowLocalString = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
};

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
}

class TestService {
  // Helper to normalize submission rows returned from DB
  private normalizeSubmission(submission: any) {
    if (!submission) return null;
    const s = { ...submission };
    // Format timestamps to local wall-time strings
    if (s.created_at) s.created_at = formatLocal(s.created_at);
    if (s.updated_at) s.updated_at = formatLocal(s.updated_at);
    if (s.submitted_at) s.submitted_at = formatLocal(s.submitted_at);
    // Parse answers if stored as JSON string
    try {
      if (s.answers && typeof s.answers === 'string') {
        s.answers = JSON.parse(s.answers);
      }
      if (s.visible_answers && typeof s.visible_answers === 'string') {
        s.visible_answers = JSON.parse(s.visible_answers);
      }
      if (s.correct_answers_visible && typeof s.correct_answers_visible === 'string') {
        s.correct_answers_visible = JSON.parse(s.correct_answers_visible);
      }
    } catch (e) {
      // If parsing fails, leave as-is and log for debugging
      console.error('Failed to parse submission JSON fields', e);
    }
    return s;
  }

  // Batch grade physical bubble sheets using external Python script
  async gradePhysicalBatch(params: {
    testId: number;
    nQuestions: number;
    studentsOrdered: number[];
    files: Array<{ path: string; originalname?: string; filename?: string }>;
    namesAsIds?: boolean;
  }): Promise<Array<{ student_id: number; submission_id: number; score: number | null; output_dir: string }>> {
    const { testId, nQuestions, studentsOrdered, files, namesAsIds } = params;

    // Determine python executable based on platform
    const pyExec = process.platform === 'win32' ? 'python' : 'python3';
    // Resolve script directory robustly (Windows dev runs from backend/, prod may vary)
    const candidates = [
      process.env.GRADING_SCRIPT_DIR,
      path.resolve(process.cwd(), '..', 'scripts', 'grading_service'), // if cwd = backend
      path.resolve(process.cwd(), 'scripts', 'grading_service'),       // if cwd = project root
      path.resolve(__dirname, '..', '..', '..', '..', 'scripts', 'grading_service'), // when compiled to dist/src/services
    ].filter(Boolean) as string[];
    let scriptDir: string = '';
    for (const cand of candidates) {
      try {
        if (typeof cand === 'string') {
          const stat = fs.existsSync(path.join(cand, 'app.py'));
          if (stat) { scriptDir = cand; break; }
        }
      } catch { /* ignore */ }
    }
    if (!scriptDir) {
      // Final fallback: assume backend is cwd and scripts is sibling
      scriptDir = path.resolve(process.cwd(), '..', 'scripts', 'grading_service');
    }
    const results: Array<{ student_id: number; submission_id: number; score: number | null; output_dir: string }> = [];

    // Build file lookup
    const indexedFiles: Record<number, { path: string; name: string }> = {};
    const fileByStudentId: Record<number, { path: string; name: string }> = {};
    files.forEach((f, idx) => {
      const name = (f.originalname ?? f.filename ?? `file_${idx}`) as string;
      const m = name.match(/(\d+)/);
      if (m) {
        const numStr = (m[1] ?? m[0]) as string;
        const num = parseInt(numStr, 10);
        if (!isNaN(num)) {
          indexedFiles[num] = { path: f.path, name };
          fileByStudentId[num] = { path: f.path, name };
        }
      }
      if (!indexedFiles[idx + 1]) {
        indexedFiles[idx + 1] = { path: f.path, name };
      }
    });

    // If using filenames as student IDs, validate strict 1:1 mapping before running
    if (namesAsIds) {
      const providedIds = studentsOrdered.map(Number).filter(n => Number.isFinite(n));
      const fileIds = Object.keys(fileByStudentId).map(k => Number(k)).filter(n => Number.isFinite(n));
      // Ensure counts match
      if (fileIds.length !== providedIds.length) {
        throw new Error(`Mismatch: provided ${providedIds.length} students but ${fileIds.length} identifiable files. Ensure each file is named exactly as the student ID.`);
      }
      // Ensure sets match exactly
      const missing = providedIds.filter(id => !fileByStudentId[id]);
      const extra = fileIds.filter(id => !providedIds.includes(id));
      if (missing.length > 0 || extra.length > 0) {
        throw new Error(`ID mismatch. Missing files for students: [${missing.join(', ')}], extra files not in list: [${extra.join(', ')}]`);
      }
    }

    for (let i = 0; i < studentsOrdered.length; i++) {
      const rawStudentId = studentsOrdered[i];
      const studentId = Number(rawStudentId);
      if (!Number.isFinite(studentId)) continue;
      const fileIdx = i + 1;
      const chosen = namesAsIds ? fileByStudentId[studentId] : indexedFiles[fileIdx];
      if (!chosen) continue; // skip if no file

      const outDir = path.resolve(scriptDir, 'tests', `${testId}-${studentId}`);
      fs.mkdirSync(outDir, { recursive: true });

      const args = ['app.py', '-n', String(nQuestions), '-t', String(testId), '-s', String(studentId), '-o', outDir, '-i', path.resolve(chosen.path)];

      await new Promise<void>((resolve) => {
        const child = spawn(pyExec, args, { cwd: scriptDir, stdio: 'inherit', shell: process.platform === 'win32' });
        child.on('close', () => resolve());
        child.on('error', () => resolve());
      });

      // After script finishes, read JSON and image
      const outJson = path.join(outDir, `${testId}-${studentId}.json`);
      let detected: Record<string, string> | null = null;
      try {
        const raw = fs.readFileSync(outJson, 'utf8');
        detected = JSON.parse(raw);
      } catch {
        detected = null;
      }

      // Upsert submission with answers and manual_grades copy
      const existingQ = 'SELECT * FROM test_answers WHERE test_id = $1 AND student_id = $2 LIMIT 1';
      const existing = await database.query(existingQ, [testId, studentId]);

      let score: number | null = null;
      let subId: number = -1;
      const answersPayload = detected ? { answers: detected, bubble_image_path: path.join('scripts', 'grading_service', 'tests', `${testId}-${studentId}`, `${testId}-${studentId}.jpg`).replace(/\\/g, '/') } : {};
      if (existing.rows.length > 0) {
        const sub = existing.rows[0];
        const test = await this.getTestById(testId);
        if (test && detected) {
          score = this.calculateScore({ answers: detected }, test.correct_answers, test.test_type);
        } else {
          score = sub.score ?? null;
        }
        const updQ = `
          UPDATE test_answers
          SET answers = $1, manual_grades = $2, score = $3, graded = true, updated_at = CURRENT_TIMESTAMP
          WHERE id = $4
          RETURNING id
        `;
        await database.query(updQ, [JSON.stringify(answersPayload), detected ? JSON.stringify({ grades: detected }) : null, score, sub.id]);
        subId = sub.id;
      } else {
        // Insert new submission
        const test = await this.getTestById(testId);
        if (test && detected) {
          score = this.calculateScore({ answers: detected }, test.correct_answers, test.test_type);
        }
        const insQ = `
          INSERT INTO test_answers (test_id, student_id, answers, manual_grades, score, graded, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
          RETURNING id
        `;
        const insRes = await database.query(insQ, [testId, studentId, JSON.stringify(answersPayload), detected ? JSON.stringify({ grades: detected }) : null, score, true]);
        subId = insRes.rows[0].id;
      }

      results.push({ student_id: studentId as number, submission_id: subId, score, output_dir: outDir });
    }

    return results;
  }

  // Update bubble answers for a submission and recalculate score
  async updateSubmissionAnswers(submissionId: number, answersMap: Record<string, string>, teacherComment?: string): Promise<any | null> {
    const subQ = 'SELECT * FROM test_answers WHERE id = $1';
    const subRes = await database.query(subQ, [submissionId]);
    if (subRes.rows.length === 0) return null;
    const submission = this.normalizeSubmission(subRes.rows[0]);
    const test = await this.getTestById(submission.test_id);
    if (!test) return null;

    // Preserve bubble image path if present in existing answers
    let bubbleImagePath = undefined;
    try {
      const ansObj = typeof submission.answers === 'string' ? JSON.parse(submission.answers) : submission.answers;
      bubbleImagePath = ansObj?.bubble_image_path;
    } catch {}

    const answersPayload = bubbleImagePath ? { answers: answersMap, bubble_image_path: bubbleImagePath } : { answers: answersMap };
    const score = this.calculateScore({ answers: answersMap }, test.correct_answers, test.test_type);

    const updQ = `
      UPDATE test_answers
      SET answers = $1, score = $2, graded = true, teacher_comment = COALESCE($3, teacher_comment), updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *
    `;
    const updRes = await database.query(updQ, [JSON.stringify(answersPayload), score, teacherComment || null, submissionId]);
    return this.normalizeSubmission(updRes.rows[0]);
  }
  async createTest(testData: CreateTestData): Promise<Test> {
    const query = `
      INSERT INTO tests (
        title, grade, student_group, test_type, start_time, end_time, 
        duration_minutes, correct_answers, view_type, view_permission
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
      testData.correct_answers || null,
      testData.view_type,
      testData.view_type === 'IMMEDIATE' ? true : (testData.view_permission || false)
    ];

    const result = await database.query(query, values);
    // Format timestamps as local wall-time strings before returning
    const row = result.rows[0];
    if (row) {
      row.start_time = formatLocal(row.start_time);
      row.end_time = formatLocal(row.end_time);
    }
    return row;
  }

  async getAllTests(): Promise<Test[]> {
    const query = `
      SELECT t.*, 
             COUNT(DISTINCT ta.id) as submission_count,
             COUNT(DISTINCT CASE WHEN ta.graded = true THEN ta.id END) as graded_count
      FROM tests t
      LEFT JOIN test_answers ta ON t.id = ta.test_id
      GROUP BY t.id
      ORDER BY t.created_at DESC
    `;
    
    const result = await database.query(query);
    // Format timestamps to preserve wall-time when serializing
    return (result.rows || []).map(r => ({
      ...r,
      start_time: formatLocal(r.start_time),
      end_time: formatLocal(r.end_time)
    }));
  }

  async getTestById(testId: number): Promise<(Test & { images?: Array<{ id: number; image_path: string; display_order: number }> }) | null> {
    try {
      // Get test details with proper count distinct to avoid duplicates
      const testQuery = `
        SELECT t.*, 
               COUNT(DISTINCT ta.id) as submission_count,
               COUNT(DISTINCT CASE WHEN ta.graded = true THEN ta.id END) as graded_count
        FROM tests t
        LEFT JOIN test_answers ta ON t.id = ta.test_id
        WHERE t.id = $1
        GROUP BY t.id
      `;
      
      const testResult = await database.query(testQuery, [testId]);
      if (!testResult.rows[0]) return null;
      
      // Get test images using the getTestImages method
      const images = await this.getTestImages(testId);
      // Format timestamps as local wall-time strings before returning
      const row = testResult.rows[0];
      if (row) {
        row.start_time = formatLocal(row.start_time);
        row.end_time = formatLocal(row.end_time);
      }
      return {
        ...row,
        images
      };
    } catch (error) {
      console.error('Error in getTestById:', error);
      throw error;
    }
  }
  
  async getTestImages(testId: number | string): Promise<Array<{ id: number; image_path: string; display_order: number }>> {
    // Check if testId is valid
    if (!this.isValidTestId(testId)) {
      return [];
    }
    
    const id = Number(testId);
    const query = `
      SELECT id, image_path, display_order
      FROM test_images
      WHERE test_id = $1
      ORDER BY display_order ASC, id ASC
    `;
    
    const result = await database.query(query, [id]);
    return result.rows || [];
  }

  async updateTest(testId: number, testData: Partial<CreateTestData>): Promise<Test | null> {
    // Only allow updating known columns. Map common client keys to DB column names.
    const allowedFields = new Set([
      'title', 'grade', 'student_group', 'test_type', 'start_time', 'end_time',
      'duration_minutes', 'pdf_file_path', 'correct_answers', 'view_type', 'view_permission'
    ]);

    const keyMap: Record<string, string> = {
      // client may send 'pdf' or 'pdf_file' — map to actual DB column
      pdf: 'pdf_file_path',
      pdf_file: 'pdf_file_path'
    };

    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    Object.entries(testData).forEach(([key, value]) => {
      if (value === undefined) return;
      const mappedKey = (keyMap[key] as string) || key;
      // Ignore unknown fields to prevent SQL errors
      if (!allowedFields.has(mappedKey)) return;

      if (mappedKey === 'view_permission' && testData.view_type === 'IMMEDIATE') {
        // For IMMEDIATE tests, always set view_permission to true
        fields.push(`${mappedKey} = $${paramCount}`);
        values.push(true);
      } else {
        fields.push(`${mappedKey} = $${paramCount}`);
        values.push(value);
      }
      paramCount++;
    });

    // If view_type is being set to IMMEDIATE, ensure view_permission is true
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

  async deleteTest(testId: number): Promise<boolean> {
    const query = 'DELETE FROM tests WHERE id = $1';
    const result = await database.query(query, [testId]);
    return (result.rowCount ?? 0) > 0;
  }

  async updateViewPermission(testId: number, viewPermission: boolean): Promise<Test | null> {
    const query = `
      UPDATE tests 
      SET view_permission = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;
    
    const result = await database.query(query, [viewPermission, testId]);
    return result.rows[0] || null;
  }

  async getTestSubmissions(testId: number): Promise<any[]> {
    const query = `
      SELECT ta.*, s.name as student_name, s.phone_number, s.grade, s.student_group
      FROM test_answers ta
      JOIN students s ON ta.student_id = s.id
      WHERE ta.test_id = $1
      ORDER BY ta.score DESC NULLS LAST, ta.updated_at ASC
    `;
    
    const result = await database.query(query, [testId]);
    return (result.rows || []).map(r => this.normalizeSubmission(r));
  }

  async gradeSubmission(submissionId: number, score: number, teacherComment?: string): Promise<TestAnswer | null> {
    const query = `
      UPDATE test_answers 
      SET score = $1, teacher_comment = $2, graded = true, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `;
    
    const result = await database.query(query, [score, teacherComment, submissionId]);
    return result.rows[0] || null;
  }

  async getAvailableTestsForStudent(studentId: number): Promise<Test[]> {
    // First get student info
    const studentQuery = 'SELECT grade, student_group FROM students WHERE id = $1';
    const studentResult = await database.query(studentQuery, [studentId]);
    
    if (studentResult.rows.length === 0) {
      return [];
    }

    const student = studentResult.rows[0];
    // Use local timestamp string without timezone to match DB TIMESTAMP values
    const now = nowLocalString();

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
    return (result.rows || []).map(r => ({
      ...r,
      start_time: formatLocal(r.start_time),
      end_time: formatLocal(r.end_time)
    }));
  }

  async getStudentTestHistory(studentId: number): Promise<any[]> {
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
    return (result.rows || []).map(r => ({
      ...r,
      start_time: formatLocal(r.start_time),
      end_time: formatLocal(r.end_time)
    }));
  }

  async getTestQuestions(testId: number, studentId: number): Promise<any | null> {
    // First check if test is available for student (time window and access constraints)
    const availableTests = await this.getAvailableTestsForStudent(studentId);
    const availableTest = availableTests.find(t => t.id === testId);
    
    if (!availableTest) {
      return null;
    }

    // If already submitted, allow viewing questions only if viewing is permitted
    if (availableTest.is_submitted) {
      const canView = (availableTest as any).view_type === 'IMMEDIATE' || (availableTest as any).view_permission === true;
      if (!canView) {
        return null;
      }
    }

    // Get full test data including correct_answers
    const fullTest = await this.getTestById(testId);
    if (!fullTest) {
      return null;
    }

    // Return test data based on type
    if (fullTest.test_type === 'MCQ') {
      // Return questions without correct answers
      const testData = { ...fullTest };
      if (testData.correct_answers) {
        // Handle both old double-encoded data and new proper JSONB data
        let questions;
        if (typeof testData.correct_answers === 'string') {
          // Old double-encoded data - parse the string
          try {
            questions = JSON.parse(testData.correct_answers);
          } catch (error) {
            console.error('Error parsing string correct_answers:', error);
            questions = { questions: [] };
          }
        } else {
          // New proper JSONB data - use directly
          questions = testData.correct_answers;
        }
        
        // Remove correct answers from questions
        if (questions && questions.questions && Array.isArray(questions.questions)) {
          const questionsWithoutAnswers = questions.questions.map((q: any) => {
            const { correct, ...questionWithoutAnswer } = q;
            return questionWithoutAnswer;
          });
          (testData as any).questions = questionsWithoutAnswers;
        } else {
          (testData as any).questions = [];
        }
      } else {
        (testData as any).questions = [];
      }
      delete (testData as any).correct_answers;
      // Add submission status from available test
      (testData as any).is_submitted = availableTest.is_submitted;
      // Ensure start/end times are local wall-time strings
      (testData as any).start_time = formatLocal((testData as any).start_time);
      (testData as any).end_time = formatLocal((testData as any).end_time);
      return testData;
    }

    // Ensure start/end times are local wall-time strings for non-MCQ
    if (fullTest) {
      (fullTest as any).start_time = formatLocal((fullTest as any).start_time);
      (fullTest as any).end_time = formatLocal((fullTest as any).end_time);
    }
    return fullTest;
  }

  async startTest(testId: number, studentId: number): Promise<any | null> {
    // Just return basic test info, questions will be fetched separately
    const availableTests = await this.getAvailableTestsForStudent(studentId);
    const test = availableTests.find(t => t.id === testId);
    
    if (!test) {
      return null;
    }

    // Check for existing submission record (started but not necessarily submitted)
    const existingQuery = 'SELECT * FROM test_answers WHERE test_id = $1 AND student_id = $2 LIMIT 1';
    const existingResult = await database.query(existingQuery, [testId, studentId]);

    let submission = null;

    if (existingResult.rows.length > 0) {
      submission = existingResult.rows[0];
    } else {
      // Create a draft/test start record so timer persists
      const insertQuery = `
        INSERT INTO test_answers (test_id, student_id, answers, score, graded, created_at)
        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
        RETURNING *
      `;
      const insertResult = await database.query(insertQuery, [testId, studentId, JSON.stringify({}), null, false]);
      submission = insertResult.rows[0];
    }

    // Return basic test data along with submission metadata
    const testData = { ...test };
    delete testData.correct_answers;

    return {
      ...testData,
      submission: submission ? this.normalizeSubmission(submission) : null
    };
  }

  async submitTest(testId: number, studentId: number, answers: any, isDraft: boolean = false): Promise<TestAnswer | null> {
    // Check if already submitted (only for non-draft submissions)
    const existingQuery = 'SELECT * FROM test_answers WHERE test_id = $1 AND student_id = $2 LIMIT 1';
    const existingResult = await database.query(existingQuery, [testId, studentId]);
    
    // If draft and no existing, create a new draft
    if (isDraft && existingResult.rows.length === 0) {
      const insertDraftQuery = `
        INSERT INTO test_answers (test_id, student_id, answers, score, graded)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;
      const draftResult = await database.query(insertDraftQuery, [testId, studentId, JSON.stringify(answers), null, false]);
      return this.normalizeSubmission(draftResult.rows[0]);
    }
    
    // If there is an existing record, update it instead of refusing
    if (existingResult.rows.length > 0) {
      const existing = existingResult.rows[0];

      // Determine score/graded based on test type
      const test = await this.getTestById(testId);
      let score = existing.score;
      let graded = existing.graded;

      if (test && !isDraft && (test.test_type === 'MCQ' || test.test_type === 'BUBBLE_SHEET') && test.correct_answers) {
        const correctAnswers = typeof test.correct_answers === 'string' ? JSON.parse(test.correct_answers) : test.correct_answers;
        score = this.calculateScore(answers, correctAnswers, test.test_type);
        graded = true;
      }

      // If this is a final submission (not draft), update answers/score/graded
      const updateQuery = `
        UPDATE test_answers
        SET answers = $1, score = $2, graded = $3, updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
        RETURNING *
      `;

      const updateResult = await database.query(updateQuery, [JSON.stringify(answers), score, graded, existing.id]);
      return updateResult.rows[0];
    }

    // No existing record and not a draft -> insert new submission
    const query = `
      INSERT INTO test_answers (test_id, student_id, answers, score, graded)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    
    // Get test info for auto-grading
    const testForGrading = await this.getTestById(testId);
    let score = null;
    let graded = false;

    if (testForGrading && !isDraft && (testForGrading.test_type === 'MCQ' || testForGrading.test_type === 'BUBBLE_SHEET') && testForGrading.correct_answers) {
      const correctAnswers = typeof testForGrading.correct_answers === 'string' ? JSON.parse(testForGrading.correct_answers) : testForGrading.correct_answers;
      score = this.calculateScore(answers, correctAnswers, testForGrading.test_type);
      graded = true;
    }

    const result = await database.query(query, [
      testId, 
      studentId, 
      JSON.stringify(answers), 
      score, 
      graded
    ]); 
    
    return this.normalizeSubmission(result.rows[0]);
  }

  async getTestResult(testId: number, studentId: number): Promise<any | null> {
    const query = `
      SELECT t.*, ta.score, ta.graded, ta.teacher_comment, ta.answers, ta.created_at as submitted_at,
             ta.manual_grades,
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

    let testResult = result.rows[0];
     
     // Format start/end and submitted timestamps to local wall-time
     if (testResult) {
       testResult.start_time = formatLocal(testResult.start_time);
       testResult.end_time = formatLocal(testResult.end_time);
       if (testResult.submitted_at) testResult.submitted_at = formatLocal(testResult.submitted_at);

       // Parse answers fields if stored as strings
       try {
         if (testResult.answers && typeof testResult.answers === 'string') {
           testResult.answers = JSON.parse(testResult.answers);
         }
         if (testResult.visible_answers && typeof testResult.visible_answers === 'string') {
           testResult.visible_answers = JSON.parse(testResult.visible_answers);
         }
        if (testResult.correct_answers && typeof testResult.correct_answers === 'string') {
          // parse into a temp var but DO NOT expose raw correct_answers to students
          try {
            testResult._parsed_correct_answers = JSON.parse(testResult.correct_answers);
          } catch (e) {
            testResult._parsed_correct_answers = null;
          }
        } else if (testResult.correct_answers) {
          testResult._parsed_correct_answers = testResult.correct_answers;
        } else {
          testResult._parsed_correct_answers = null;
        }
       } catch (e) {
         console.error('Failed to parse result JSON fields', e);
       }

       // If score is visible, also include correct answers for comparison
      if (testResult.visible_score !== null && testResult._parsed_correct_answers) {
        // Expose a sanitized version for students to compare, do not leak any extra metadata
        testResult.correct_answers_visible = testResult._parsed_correct_answers;
      }
      // If score is visible, include manual grades map for per-question open grading display
      if (testResult.visible_score !== null && testResult.manual_grades) {
        try {
          if (typeof testResult.manual_grades === 'string') {
            testResult.manual_grades_visible = JSON.parse(testResult.manual_grades);
          } else {
            testResult.manual_grades_visible = testResult.manual_grades;
          }
        } catch (e) {
          testResult.manual_grades_visible = null;
        }
      }
      // Remove any raw correct_answers field before returning to student
      delete (testResult as any).correct_answers;
      delete (testResult as any)._parsed_correct_answers;
     }

     return testResult;
   }

  // Admin: fetch a single submission with full test and answers for grading view
  async getSubmissionWithTest(testId: number, submissionId: number): Promise<any | null> {
    const submissionQuery = `
      SELECT ta.*
      FROM test_answers ta
      WHERE ta.id = $1 AND ta.test_id = $2
      LIMIT 1
    `;
    const subRes = await database.query(submissionQuery, [submissionId, testId]);
    if (subRes.rows.length === 0) return null;
    const submission = this.normalizeSubmission(subRes.rows[0]);

    const test = await this.getTestById(testId);
    if (!test) return null;

    // Parse correct answers for MCQ questions
    let parsedCorrect: any = null;
    if (test.correct_answers) {
      parsedCorrect = typeof test.correct_answers === 'string' ? (() => { try { return JSON.parse(test.correct_answers as any); } catch { return null; } })() : test.correct_answers;
    }

    return {
      test,
      submission,
      correct_answers: parsedCorrect
    };
  }

  // Compute total score with equal weight per question using auto and manual grades
  private computeScoreWithManual(test: any, submission: any): number {
    try {
      const testType = test.test_type;
      // If MCQ with questions array possibly containing OPEN questions
      if (testType === 'MCQ') {
        // Build questions array from correct_answers
        const ca = typeof test.correct_answers === 'string' ? (() => { try { return JSON.parse(test.correct_answers); } catch { return null; } })() : test.correct_answers;
        const questions: any[] = ca && ca.questions ? ca.questions : [];
        if (!questions.length) return 0;

        // Student answers array
        const studentAns = submission?.answers && submission.answers.answers ? submission.answers.answers : [];

        // Manual grades map: { grades: { [id]: number 0..1 } } or { [id]: number }
        let gradesMap: Record<string, number> = {};
        if (submission?.manual_grades) {
          try {
            const mg = typeof submission.manual_grades === 'string' ? JSON.parse(submission.manual_grades) : submission.manual_grades;
            if (mg && mg.grades && typeof mg.grades === 'object') {
              gradesMap = mg.grades;
            } else if (mg && typeof mg === 'object') {
              gradesMap = mg;
            }
          } catch (e) {
            // ignore parse error
          }
        }

        let totalPoints = 0;
        for (const q of questions) {
          if (q.type === 'OPEN') {
            // Use manual grade if provided; default 0
            const val = gradesMap[String(q.id)] ?? gradesMap[q.id] ?? 0;
            const clamped = Math.max(0, Math.min(1, Number(val) || 0));
            totalPoints += clamped;
          } else {
            // MCQ auto grading
            const sa = studentAns.find((a: any) => a.id === q.id);
            if (sa && sa.answer === q.correct) totalPoints += 1;
          }
        }
        return Math.round((totalPoints / questions.length) * 100 * 100) / 100;
      }

      // For BUBBLE_SHEET rely on existing calculation
      return this.calculateScore(submission?.answers, test.correct_answers, test.test_type);
    } catch (e) {
      console.error('Error computeScoreWithManual:', e);
      return 0;
    }
  }

  // Admin: set manual grades for a submission and recompute score
  async setManualGrades(submissionId: number, grades: Record<string, number>, teacherComment?: string): Promise<any | null> {
    // Load submission and related test
    const subQuery = 'SELECT * FROM test_answers WHERE id = $1';
    const subRes = await database.query(subQuery, [submissionId]);
    if (subRes.rows.length === 0) return null;
    const submission = this.normalizeSubmission(subRes.rows[0]);
    const test = await this.getTestById(submission.test_id);
    if (!test) return null;

    // Prepare manual_grades JSON structure
    const manualGrades = { grades };

    // Recompute score with equal weight
    const newScore = this.computeScoreWithManual(test, { ...submission, manual_grades: manualGrades });

    const updateQuery = `
      UPDATE test_answers
      SET manual_grades = $1, score = $2, graded = true, teacher_comment = COALESCE($3, teacher_comment), updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *
    `;
    const updateRes = await database.query(updateQuery, [JSON.stringify(manualGrades), newScore, teacherComment || null, submissionId]);
    return this.normalizeSubmission(updateRes.rows[0]);
  }

  async uploadBubbleSheet(testId: number, studentId: number, filePath: string): Promise<TestAnswer | null> {
    // For physical sheet tests, just store the file path
    const answers = {
      file_path: filePath,
      extracted_answers: {}, // This would be filled by OCR processing
      notes: "Bubble sheet uploaded, awaiting processing"
    };

    return this.submitTest(testId, studentId, answers);
  }

  private calculateScore(studentAnswers: any, correctAnswers: any, testType: string): number {
    // Support MCQ (questions array) and BUBBLE_SHEET (answers map)
    try {
      if (testType === 'MCQ') {
        if (!correctAnswers || !correctAnswers.questions || !studentAnswers || !studentAnswers.answers) {
          return 0;
        }

        let correct = 0;
        const totalQuestions = correctAnswers.questions.length;
        if (totalQuestions === 0) return 0;

        correctAnswers.questions.forEach((question: any) => {
          const studentAnswer = (studentAnswers.answers || []).find((ans: any) => ans.id === question.id);
          if (studentAnswer && studentAnswer.answer === question.correct) {
            correct++;
          }
        });

        return Math.round((correct / totalQuestions) * 100 * 100) / 100;
      }

      if (testType === 'BUBBLE_SHEET' || testType === 'PHYSICAL_SHEET') {
        // Expected shape for correctAnswers: { answers: { "1": "A", "2": "C", ... } }
        // Expected shape for studentAnswers: { answers: { "1": "A", ... } } or similar
        const correctMap = correctAnswers && (correctAnswers.answers || correctAnswers);
        const studentMap = studentAnswers && (studentAnswers.answers || studentAnswers);

        if (!correctMap || Object.keys(correctMap).length === 0) return 0;

        let correct = 0;
        const keys = Object.keys(correctMap);
        for (const q of keys) {
          const expected = (correctMap[q] || '').toString();
          const given = (studentMap && (studentMap[q] || '')).toString();
          if (given && expected && given === expected) correct++;
        }

        return Math.round((correct / keys.length) * 100 * 100) / 100;
      }
    } catch (e) {
      console.error('Error calculating score:', e);
    }

    return 0;
  }

  async addTestImages(images: Array<{ testId: number; imagePath: string; displayOrder: number }>): Promise<TestImage[]> {
    if (images.length === 0) return [];
    
    try {
      // Get the next display order for this test
      const orderQuery = `
        SELECT COALESCE(MAX(display_order), -1) + 1 as next_order 
        FROM test_images 
        WHERE test_id = $1
      `;
      const orderResult = await database.query(orderQuery, [images[0]?.testId]);
      let nextOrder = orderResult.rows[0]?.next_order ? Number(orderResult.rows[0].next_order) : 0; // Fixed: Added nullish coalescing for images[0]
      
      // Prepare insert queries
      const queries = images.map(img => ({ 
        text: `
          INSERT INTO test_images (test_id, image_path, display_order)
          VALUES ($1, $2, $3)
          RETURNING *
        `,
        params: [img.testId, img.imagePath, nextOrder++]
      }));
      
      // Execute all inserts in a transaction
      const client = await database.getClient();
      try {
        await client.query('BEGIN');
        const results = [];
        
        for (const query of queries) {
          const result = await client.query(query.text, query.params);
          results.push(result.rows[0]);
        }
        
        await client.query('COMMIT');
        return results;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      // Clean up uploaded files on error
      await Promise.all(
        images.map(img => 
          unlinkAsync(img.imagePath).catch(console.error)
        )
      );
      throw error; // Re-throw after cleanup
    }
  }

  private isValidTestId(id: unknown): id is number | string {
    if (id == null) { // Handles both null and undefined
      return false;
    }
    
    switch (typeof id) {
      case 'number':
        return !isNaN(id) && id > 0;
      case 'string':
        const num = Number(id);
        return id.trim() !== '' && !isNaN(num) && num > 0;
      default:
        return false;
    }
  }


  async updateTestImageOrder(testId: number, imageIds: number[]): Promise<void> {
    const client = await database.getClient();
    try {
      await client.query('BEGIN');
      
      // Update display order for each image
      for (let i = 0; i < imageIds.length; i++) {
        await client.query(
          'UPDATE test_images SET display_order = $1 WHERE id = $2 AND test_id = $3',
          [i, imageIds[i], testId]
        );
      }
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteTestImage(imageId: number): Promise<boolean> {
    const client = await database.getClient();
    try {
      await client.query('BEGIN');
      
      // Get image path before deleting
      const getQuery = 'SELECT image_path FROM test_images WHERE id = $1';
      const getResult = await client.query(getQuery, [imageId]);
      
      if (getResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return false;
      }
      
      const imagePath = getResult.rows[0].image_path;
      
      // Delete from database
      const deleteQuery = 'DELETE FROM test_images WHERE id = $1 RETURNING *';
      const deleteResult = await client.query(deleteQuery, [imageId]);
      
      if (deleteResult.rowCount && deleteResult.rowCount > 0) {
        // Delete the file
        try {
          await unlinkAsync(imagePath);
        } catch (error) {
          console.error(`Failed to delete image file: ${imagePath}`, error);
          // Continue even if file deletion fails
        }
        await client.query('COMMIT');
        return true;
      }
      
      await client.query('ROLLBACK');
      return false;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  async deleteTestImages(testId: number): Promise<boolean> {
    const client = await database.getClient();
    try {
      await client.query('BEGIN');
      
      // Get all image paths before deleting
      const getQuery = 'SELECT image_path FROM test_images WHERE test_id = $1';
      const getResult = await client.query(getQuery, [testId]);
      
      // Delete from database
      const deleteQuery = 'DELETE FROM test_images WHERE test_id = $1';
      const deleteResult = await client.query(deleteQuery, [testId]);
      
      if (deleteResult.rowCount && deleteResult.rowCount > 0) {
        // Delete all image files
        const deletePromises = getResult.rows.map(row => 
          unlinkAsync(row.image_path).catch(error => 
            console.error(`Failed to delete image file: ${row.image_path}`, error)
          )
        );
        
        await Promise.all(deletePromises);
        await client.query('COMMIT');
        return true;
      }
      
      await client.query('ROLLBACK');
      return false;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error deleting test images:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}

export default new TestService();
