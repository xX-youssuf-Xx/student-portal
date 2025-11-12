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

// Helper: format Date as UTC ISO and epoch ms
// If the incoming value is a timezone-naive string like "2025-09-12T03:35"
// many JS engines interpret it as local time. To remove ambiguity when
// admins save naive local timestamps, we explicitly append the server's
// timezone offset (e.g. "+02:00") before parsing when no timezone is present.
const hasTimezoneSuffix = (s: string) => /[zZ]$|[+\-]\d{2}:?\d{2}$/.test(s);
// By default we parse timezone-naive timestamps as Cairo time (UTC+03:00).
// This can be overridden by setting PARSE_TIMEZONE environment variable
// to a value like "+02:00" or "+03:00".
const parseTimezoneSuffix = () => {
  const env = process.env.PARSE_TIMEZONE;
  if (env && typeof env === 'string' && /^[+-]\d{2}:?\d{2}$/.test(env)) {
    // normalize to +HH:MM
    const cleaned = env.includes(':') ? env : `${env.slice(0,3)}:${env.slice(3)}`;
    return cleaned;
  }
  return '+03:00'; // Cairo (UTC+3)
};

const formatUtc = (d: Date | string | null) => {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString();
  const s = String(d);
  try {
    if (hasTimezoneSuffix(s)) {
      return new Date(s).toISOString();
    }
    // Append configured parse timezone (default: Cairo +03:00) and parse
    return new Date(s + parseTimezoneSuffix()).toISOString();
  } catch (e) {
    // Fallback: let Date try parsing whatever it can
    return new Date(s).toISOString();
  }
};

const formatMs = (d: Date | string | null) => {
  if (!d) return null;
  if (d instanceof Date) return d.getTime();
  const s = String(d);
  try {
    if (hasTimezoneSuffix(s)) {
      return new Date(s).getTime();
    }
    return new Date(s + parseTimezoneSuffix()).getTime();
  } catch (e) {
    return new Date(s).getTime();
  }
};

// Helper: return current Cairo local timestamp string (UTC+03:00)
const nowLocalString = () => {
  const d = new Date();
  const cairoOffsetMs = 3 * 60 * 60 * 1000; // +3 hours for Cairo (UTC+3)
  const cairoDate = new Date(d.getTime() + cairoOffsetMs);
  const yyyy = cairoDate.getFullYear();
  const mm = pad(cairoDate.getMonth() + 1);
  const dd = pad(cairoDate.getDate());
  const hh = pad(cairoDate.getHours());
  const mi = pad(cairoDate.getMinutes());
  const ss = pad(cairoDate.getSeconds());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}+03:00`; // Added explicit timezone (UTC+3)
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
  show_grade_outside?: boolean;
  test_group?: number | null;
}

class TestService {
  // Helper to normalize submission rows returned from DB
  private normalizeSubmission(submission: any) {
    if (!submission) return null;
    const s = { ...submission };
    // Format timestamps to local wall-time strings and include UTC/ms variants
    if (s.created_at) {
      const _d = s.created_at;
      s.created_at = formatLocal(_d);
      s.created_at_utc = formatUtc(_d);
      s.created_at_ms = formatMs(_d);
    }
    if (s.updated_at) {
      const _d = s.updated_at;
      s.updated_at = formatLocal(_d);
      s.updated_at_utc = formatUtc(_d);
      s.updated_at_ms = formatMs(_d);
    }
    if (s.submitted_at) {
      const _d = s.submitted_at;
      s.submitted_at = formatLocal(_d);
      s.submitted_at_utc = formatUtc(_d);
      s.submitted_at_ms = formatMs(_d);
    }
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

  // Regrade a single physical submission using the grading script
  async regradePhysicalSubmission(submissionId: number): Promise<{ success: boolean; score: number | null; message?: string }> {
    try {
      // Get submission details
      const subQuery = 'SELECT * FROM test_answers WHERE id = $1';
      const subResult = await database.query(subQuery, [submissionId]);
      if (subResult.rows.length === 0) {
        return { success: false, score: null, message: 'Submission not found' };
      }
      const submission = subResult.rows[0];
      const testId = submission.test_id;
      const studentId = submission.student_id;

      // Get test details to determine number of questions
      const test = await this.getTestById(testId);
      if (!test || test.test_type !== 'PHYSICAL_SHEET') {
        return { success: false, score: null, message: 'Test not found or not a physical sheet test' };
      }

      // Determine number of questions from correct_answers
      const nQuestions = test.correct_answers?.answers ? Object.keys(test.correct_answers.answers).length : 50;

      // Get the original bubble image path
      let imagePath: string | null = null;
      try {
        const answers = submission.answers;
        const answersObj = typeof answers === 'string' ? JSON.parse(answers) : answers;
        imagePath = answersObj?.bubble_image_path || answersObj?.file_path || answersObj?.bubble_image || null;
      } catch (e) {
        return { success: false, score: null, message: 'Could not find original bubble image path' };
      }

      if (!imagePath) {
        return { success: false, score: null, message: 'No bubble image found for this submission' };
      }

      // Resolve the full path to the image
      // The path is stored as relative (e.g., 'scripts/grading_service/tests/123-456/123-456.jpg')
      // We need to resolve it from the project root
      let fullImagePath: string;
      if (path.isAbsolute(imagePath)) {
        fullImagePath = imagePath;
      } else {
        // Try multiple candidates to find the project root
        const candidates = [
          path.resolve(process.cwd(), '..', imagePath), // if cwd = backend, go up to project root
          path.resolve(process.cwd(), imagePath),       // if cwd = project root
          path.resolve(__dirname, '..', '..', '..', '..', '..', imagePath), // when compiled to dist/src/services, go up to project root
        ];
        
        fullImagePath = '';
        for (const cand of candidates) {
          if (fs.existsSync(cand)) {
            fullImagePath = cand;
            break;
          }
        }
        
        if (!fullImagePath) {
          // Fallback: assume backend is cwd and go up one level
          fullImagePath = path.resolve(process.cwd(), '..', imagePath);
        }
      }
      
      if (!fs.existsSync(fullImagePath)) {
        return { success: false, score: null, message: `Bubble image file not found on disk. Tried path: ${fullImagePath}` };
      }

      // Determine python executable and script directory
      const pyExec = process.platform === 'win32' ? 'python' : 'python3';
      const candidates = [
        process.env.GRADING_SCRIPT_DIR,
        path.resolve(process.cwd(), '..', 'scripts', 'grading_service'),
        path.resolve(process.cwd(), 'scripts', 'grading_service'),
        path.resolve(__dirname, '..', '..', '..', '..', 'scripts', 'grading_service'),
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
        scriptDir = path.resolve(process.cwd(), '..', 'scripts', 'grading_service');
      }

      const outDir = path.resolve(scriptDir, 'tests', `${testId}-${studentId}`);
      fs.mkdirSync(outDir, { recursive: true });

      // Run the grading script
      const args = ['app.py', '-n', String(nQuestions), '-t', String(testId), '-s', String(studentId), '-o', outDir, '-i', fullImagePath];

      await new Promise<void>((resolve) => {
        const child = spawn(pyExec, args, { cwd: scriptDir, stdio: 'inherit', shell: process.platform === 'win32' });
        child.on('close', () => resolve());
        child.on('error', () => resolve());
      });

      // Read the output JSON
      const outJson = path.join(outDir, `${testId}-${studentId}.json`);
      let detected: Record<string, string> | null = null;
      try {
        const raw = fs.readFileSync(outJson, 'utf8');
        detected = JSON.parse(raw);
      } catch {
        detected = null;
      }

      if (!detected) {
        return { success: false, score: null, message: 'Grading script did not produce valid output' };
      }

      // Calculate score
      const score = this.calculateScore({ answers: detected }, test.correct_answers, test.test_type);

      // Update submission
      const answersPayload = {
        answers: detected,
        bubble_image_path: path.join('scripts', 'grading_service', 'tests', `${testId}-${studentId}`, `${testId}-${studentId}.jpg`).replace(/\\/g, '/')
      };

      const updQ = `
        UPDATE test_answers
        SET answers = $1, manual_grades = $2, score = $3, graded = true, updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
        RETURNING id
      `;
      await database.query(updQ, [
        JSON.stringify(answersPayload),
        detected ? JSON.stringify({ grades: detected }) : null,
        score,
        submissionId
      ]);

      return { success: true, score, message: 'Submission regraded successfully' };
    } catch (error) {
      console.error('Error regrading physical submission:', error);
      return { success: false, score: null, message: 'Internal error during regrading' };
    }
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
        duration_minutes, correct_answers, view_type, view_permission, show_grade_outside, test_group
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
      testData.view_type === 'IMMEDIATE' ? true : (testData.view_permission || false),
      testData.view_type === 'IMMEDIATE' ? true : (testData.show_grade_outside ?? false),
      testData.test_group ?? null
    ];

    const result = await database.query(query, values);
    // Format timestamps as local wall-time strings before returning
    const row = result.rows[0];
    if (row) {
  // keep local wall-time for backward compatibility
  row.start_time = formatLocal(row.start_time);
  row.end_time = formatLocal(row.end_time);
  // also include unambiguous UTC ISO and epoch ms
  row.start_time_utc = formatUtc(row.start_time);
  row.end_time_utc = formatUtc(row.end_time);
  row.start_time_ms = formatMs(row.start_time);
  row.end_time_ms = formatMs(row.end_time);
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
    const tests = result.rows || [];
  
    // For each test, fetch images
    const withImages = await Promise.all(
      tests.map(async (r) => {
        const formatted = {
          ...r,
          start_time: formatLocal(r.start_time),
          end_time: formatLocal(r.end_time),
          start_time_utc: formatUtc(r.start_time),
          end_time_utc: formatUtc(r.end_time),
          start_time_ms: formatMs(r.start_time),
          end_time_ms: formatMs(r.end_time),
        };
  
        const images = await this.getTestImages(r.id);
  
        return { ...formatted, images };
      })
    );
  
    return withImages;
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
  row.start_time_utc = formatUtc(row.start_time);
  row.end_time_utc = formatUtc(row.end_time);
  row.start_time_ms = formatMs(row.start_time);
  row.end_time_ms = formatMs(row.end_time);
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

  // Return eligible students for a given test (same grade and matching group if test has a student_group)
  async getEligibleStudentsForTest(testId: number): Promise<Array<{ id: number; name: string; phone_number: string; grade: string; student_group: string | null }>> {
    // Fetch test to read grade and student_group
    const test = await this.getTestById(testId);
    if (!test) return [];

    const grade = test.grade;
    const studentGroup = test.student_group || null;

    let query = '';
    let params: any[] = [];

    if (studentGroup) {
      query = 'SELECT id, name, phone_number, grade, student_group FROM students WHERE grade = $1 AND student_group = $2 ORDER BY name ASC';
      params = [grade, studentGroup];
    } else {
      query = 'SELECT id, name, phone_number, grade, student_group FROM students WHERE grade = $1 ORDER BY name ASC';
      params = [grade];
    }

    const result = await database.query(query, params);
    return result.rows || [];
  }

  // Create placeholder submissions for given students for a PHYSICAL_SHEET test.
  // Skips students that already have a submission for this test.
  async includeStudentsForTest(testId: number, studentIds: number[]): Promise<{ created: Array<{ student_id: number; submission_id: number }>; skipped: number[] }> {
    const created: Array<{ student_id: number; submission_id: number }> = [];
    const skipped: number[] = [];

    // Validate test exists and is PHYSICAL_SHEET
    const test = await this.getTestById(testId);
    if (!test) throw new Error('Test not found');
    if (test.test_type !== 'PHYSICAL_SHEET') throw new Error('Can only include students for PHYSICAL_SHEET tests');

    for (const sidRaw of studentIds) {
      const sid = Number(sidRaw);
      if (!Number.isFinite(sid)) continue;

      // Check existing
      const existingQ = 'SELECT id FROM test_answers WHERE test_id = $1 AND student_id = $2 LIMIT 1';
      const existing = await database.query(existingQ, [testId, sid]);
      if (existing.rows.length > 0) {
        skipped.push(sid);
        continue;
      }

      const insertQ = `
        INSERT INTO test_answers (test_id, student_id, answers, score, graded, created_at)
        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
        RETURNING id
      `;
      const ins = await database.query(insertQ, [testId, sid, JSON.stringify({}), null, false]);
      const subId = ins.rows[0]?.id;
      created.push({ student_id: sid, submission_id: subId });
    }

    return { created, skipped };
  }

  async updateTest(testId: number, testData: Partial<CreateTestData>): Promise<Test | null> {
    // Only allow updating known columns. Map common client keys to DB column names.
    const allowedFields = new Set([
      'title', 'grade', 'student_group', 'test_type', 'start_time', 'end_time',
      'duration_minutes', 'pdf_file_path', 'correct_answers', 'view_type', 'view_permission',
      'show_grade_outside', 'test_group'
    ]);

    const keyMap: Record<string, string> = {
      // client may send 'pdf' or 'pdf_file' — map to actual DB column
      pdf: 'pdf_file_path',
      pdf_file: 'pdf_file_path'
    };

    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;
    let correctAnswersChanged = false;
    let newCorrectAnswers: any = null;

    Object.entries(testData).forEach(([key, value]) => {
      if (value === undefined) return;
      const mappedKey = (keyMap[key] as string) || key;
      // Ignore unknown fields to prevent SQL errors
      if (!allowedFields.has(mappedKey)) return;
      
      // Track if correct_answers are being changed
      if (mappedKey === 'correct_answers') {
        correctAnswersChanged = true;
        newCorrectAnswers = value;
      }
      
      // Validate enum fields to prevent empty strings
      if (['test_type', 'student_group', 'grade', 'view_type'].includes(mappedKey) && (value === '' || value === null)) {
        return; // Skip updating enum fields if they're empty strings or null
      }

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
    const updatedTest = result.rows[0] || null;

    // If correct_answers were changed, re-evaluate all submissions for this test
    if (correctAnswersChanged && updatedTest) {
      try {
        await this.regradeSubmissionsForTest(testId, newCorrectAnswers);
      } catch (error) {
        console.error('Error re-grading submissions after test update:', error);
        // Don't throw - the test update was successful, grading is secondary
      }
    }

    return updatedTest;
  }

  // Re-grade all submissions for a test when correct answers change
  private async regradeSubmissionsForTest(testId: number, correctAnswers: any): Promise<void> {
    try {
      const test = await this.getTestById(testId);
      if (!test) return;

      // Get all submissions for this test
      const submissionsQ = 'SELECT * FROM test_answers WHERE test_id = $1';
      const submissionsRes = await database.query(submissionsQ, [testId]);
      const submissions = submissionsRes.rows || [];

      for (const submission of submissions) {
        try {
          // Only regrade if submission has answers
          if (!submission.answers) continue;

          // Calculate new score based on updated correct answers
          let newScore = 0;
          if (test.test_type === 'MCQ') {
            newScore = this.computeScoreWithManual(
              { ...test, correct_answers: correctAnswers },
              this.normalizeSubmission(submission)
            );
          } else {
            newScore = this.calculateScore(
              submission.answers,
              correctAnswers,
              test.test_type
            );
          }

          // Update the submission with new score
          const updateQ = `
            UPDATE test_answers
            SET score = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
          `;
          await database.query(updateQ, [newScore, submission.id]);
        } catch (error) {
          console.error(`Error re-grading submission ${submission.id}:`, error);
          // Continue with next submission
        }
      }

      console.log(`Successfully re-graded ${submissions.length} submissions for test ${testId}`);
    } catch (error) {
      console.error('Error in regradeSubmissionsForTest:', error);
      throw error;
    }
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
    try {
      // First get student info
      const studentQuery = 'SELECT grade, student_group FROM students WHERE id = $1';
      const studentResult = await database.query(studentQuery, [studentId]);
      
      if (studentResult.rows.length === 0) {
        console.log(`Student ${studentId} not found`);
        return [];
      }

      const student = studentResult.rows[0];
      console.log(`Fetching tests for student ${studentId} (grade: ${student.grade}, group: ${student.student_group})`);
      
      // Get current time in Cairo timezone (UTC+3)
      const cairoOffsetMs = 3 * 60 * 60 * 1000; // +3 hours for Cairo (UTC+3)
      const nowCairoMs = Date.now() + cairoOffsetMs;
      const nowCairoDate = new Date(nowCairoMs);
      
      // Format current time for SQL query (YYYY-MM-DDTHH:MM:SS+03:00)
      const nowCairoString = `${nowCairoDate.getUTCFullYear()}-${pad(nowCairoDate.getUTCMonth() + 1)}-${pad(nowCairoDate.getUTCDate())}T${pad(nowCairoDate.getUTCHours())}:${pad(nowCairoDate.getUTCMinutes())}:${pad(nowCairoDate.getUTCSeconds())}+03:00`;
      
      // Fetch tests that match student's grade/group and are within the time window
      const query = `
        WITH student_submissions AS (
          SELECT test_id, true as is_submitted, created_at as submitted_at
          FROM test_answers 
          WHERE student_id = $1
        )
        SELECT 
          t.*, 
          COALESCE(ss.is_submitted, false) as is_submitted,
          ss.submitted_at
        FROM tests t
        LEFT JOIN student_submissions ss ON t.id = ss.test_id
        WHERE t.grade = $2
          AND (t.student_group IS NULL OR t.student_group = $3)
          AND t.start_time <= $4
          AND t.end_time >= $4
        ORDER BY t.start_time ASC
      `;

      console.log('Executing query with params:', [studentId, student.grade, student.student_group, nowCairoString]);
      const result = await database.query(query, [
        studentId, 
        student.grade, 
        student.student_group,
        nowCairoString
      ]);
      
      const tests = result.rows || [];
      console.log(`Found ${tests.length} available tests for student ${studentId}`);
      
      // Format the test data with consistent time fields
      return tests.map((test: any) => {
        const startTime = new Date(test.start_time);
        const endTime = new Date(test.end_time);
        
        // Use the exact times as set by admin, no timezone shifting
        // The start_time and end_time from DB should be displayed as-is
        return {
          ...test,
          start_time: formatLocal(startTime),
          end_time: formatLocal(endTime),
          start_time_utc: startTime.toISOString(),
          end_time_utc: endTime.toISOString(),
          start_time_ms: startTime.getTime(),
          end_time_ms: endTime.getTime(),
          is_submitted: test.is_submitted || false
        };
      });
    } catch (error) {
      console.error('Error in getAvailableTestsForStudent:', error);
      return [];
    }
  }

  async getStudentTestHistory(studentId: number): Promise<any[]> {
    const query = `
      SELECT t.*, ta.score, ta.graded, ta.teacher_comment, ta.created_at as submitted_at,
             CASE 
               WHEN t.view_type = 'IMMEDIATE' OR t.view_permission = true OR t.show_grade_outside = true THEN ta.score
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

    // Load the student's submission (draft or final) for finer-grained decisions
    const submissionResult = await database.query(
      'SELECT * FROM test_answers WHERE test_id = $1 AND student_id = $2 LIMIT 1',
      [testId, studentId]
    );
    const submissionRow = submissionResult.rows[0] ?? null;
    const submission = submissionRow ? this.normalizeSubmission(submissionRow) : null;

    const hasFinalSubmission = submission
      ? (submission.graded === true || submission.score !== null)
      : false;

    // If there is a final submission and viewing is restricted, deny access
    if (hasFinalSubmission) {
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
      (testData as any).is_submitted = hasFinalSubmission;
      if (submission) {
        (testData as any).submission = submission;
      }
      // Ensure start/end times are local wall-time strings
  (testData as any).start_time = formatLocal((testData as any).start_time);
  (testData as any).end_time = formatLocal((testData as any).end_time);
  (testData as any).start_time_utc = formatUtc((testData as any).start_time);
  (testData as any).end_time_utc = formatUtc((testData as any).end_time);
  (testData as any).start_time_ms = formatMs((testData as any).start_time);
  (testData as any).end_time_ms = formatMs((testData as any).end_time);
      return testData;
    }

    // Ensure start/end times are local wall-time strings for non-MCQ
    if (fullTest) {
  (fullTest as any).start_time = formatLocal((fullTest as any).start_time);
  (fullTest as any).end_time = formatLocal((fullTest as any).end_time);
  (fullTest as any).start_time_utc = formatUtc((fullTest as any).start_time);
  (fullTest as any).end_time_utc = formatUtc((fullTest as any).end_time);
  (fullTest as any).start_time_ms = formatMs((fullTest as any).start_time);
  (fullTest as any).end_time_ms = formatMs((fullTest as any).end_time);
      if (submission) {
        (fullTest as any).submission = submission;
      }
      (fullTest as any).is_submitted = hasFinalSubmission;
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
  // also include UTC/ms for test times to avoid ambiguity on frontend
  start_time_utc: formatUtc((testData as any).start_time),
  end_time_utc: formatUtc((testData as any).end_time),
  start_time_ms: formatMs((testData as any).start_time),
  end_time_ms: formatMs((testData as any).end_time),
  submission: submission ? this.normalizeSubmission(submission) : null,
  server_time_ms: new Date().getTime()
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
               WHEN t.view_type = 'IMMEDIATE' OR t.view_permission = true OR t.show_grade_outside = true THEN ta.score
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
      // If score is visible, include derived correct/total
      if (testResult.visible_score !== null) {
        try {
          const testType = testResult.test_type;
          let ca = testResult.correct_answers_visible; // already parsed sanitized
          let ans = testResult.visible_answers ?? testResult.answers;
          if (typeof ans === 'string') { try { ans = JSON.parse(ans); } catch { ans = null; } }
          if (testType === 'MCQ') {
            const questions = ca && ca.questions ? ca.questions : [];
            const total = questions.length;
            let correct = 0;
            const stuAnsArr = ans && (ans.answers || ans) ? (ans.answers || ans) : [];
            for (const q of questions) {
              const sa = (stuAnsArr || []).find((a: any) => a.id === q.id);
              if (sa && sa.answer === q.correct) correct++;
            }
            testResult.visible_correct = correct;
            testResult.visible_total = total;
          } else {
            const correctMap = ca && (ca.answers || ca);
            const studentMap = ans && (ans.answers || ans) ? (ans.answers || ans) : {};
            const keys = Object.keys(correctMap || {});
            let correct = 0;
            for (const k of keys) {
              const expected = (correctMap[k] || '').toString();
              const given = (studentMap && (studentMap[k] || '')).toString();
              if (given && expected && given === expected) correct++;
            }
            testResult.visible_correct = correct;
            testResult.visible_total = keys.length;
          }
        } catch {}
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
    // For physical sheet tests, store the file path and delete any previous uploaded file recorded on the submission
    // Check for existing submission
    try {
      const existingQ = 'SELECT * FROM test_answers WHERE test_id = $1 AND student_id = $2 LIMIT 1';
      const existingRes = await database.query(existingQ, [testId, studentId]);
      if (existingRes.rows.length > 0) {
        const existing = existingRes.rows[0];
        // Try to parse answers and remove previous file paths if present
        try {
          const ans = existing.answers && typeof existing.answers === 'string' ? JSON.parse(existing.answers) : existing.answers;
          const candidates = [];
          if (ans) {
            if (ans.file_path) candidates.push(ans.file_path);
            if (ans.bubble_image_path) candidates.push(ans.bubble_image_path);
            if (ans.bubble_image) candidates.push(ans.bubble_image);
          }
          // Remove duplicates and falsy
          const uniq = Array.from(new Set(candidates.filter(Boolean)));
          for (const p of uniq) {
            try {
              // Only unlink local filesystem paths
              if (typeof p === 'string' && p && !p.startsWith('http')) {
                await unlinkAsync(p).catch(() => {});
              }
            } catch (e) {
              // ignore individual unlink errors
            }
          }
        } catch (e) {
          // ignore parse errors
        }
      }

      const answers = {
        file_path: filePath,
        extracted_answers: {}, // This would be filled by OCR processing
        notes: 'Bubble sheet uploaded, awaiting processing'
      };

      // Use submitTest which will insert or update existing submission
      return this.submitTest(testId, studentId, answers);
    } catch (error) {
      console.error('Error in uploadBubbleSheet:', error);
      // Fallback: still attempt to submit with the provided path
      const answers = {
        file_path: filePath,
        extracted_answers: {},
        notes: 'Bubble sheet uploaded, awaiting processing'
      };
      return this.submitTest(testId, studentId, answers);
    }
  }

  // Delete a submission and any associated files referenced in its answers
  async deleteSubmission(submissionId: number): Promise<boolean> {
    const client = await database.getClient();
    try {
      await client.query('BEGIN');
      const q = 'SELECT * FROM test_answers WHERE id = $1 FOR UPDATE';
      const res = await client.query(q, [submissionId]);
      if (res.rows.length === 0) {
        await client.query('ROLLBACK');
        return false;
      }
      const submission = res.rows[0];
      const testId = submission.test_id;
      const studentId = submission.student_id;

      // Get test details to check if it's a physical sheet
      const test = await this.getTestById(testId);
      const isPhysicalSheet = test?.test_type === 'PHYSICAL_SHEET';

      // Parse answers and collect file paths
      const filesToDelete: string[] = [];
      try {
        const ans = submission.answers && typeof submission.answers === 'string' ? JSON.parse(submission.answers) : submission.answers;
        if (ans) {
          if (ans.file_path) filesToDelete.push(ans.file_path);
          if (ans.bubble_image_path) filesToDelete.push(ans.bubble_image_path);
          if (ans.bubble_image) filesToDelete.push(ans.bubble_image);
          // Also look for nested objects (manual_grades or extracted answers) that might carry paths
          if (ans.image_path) filesToDelete.push(ans.image_path);
        }
      } catch (e) {
        // ignore
      }

      // Delete DB row
      await client.query('DELETE FROM test_answers WHERE id = $1', [submissionId]);

      // Commit DB delete before unlinking files to avoid partial state
      await client.query('COMMIT');

      // Unlink files (best-effort)
      for (const f of Array.from(new Set(filesToDelete.filter(Boolean)))) {
        try {
          if (typeof f === 'string' && f && !f.startsWith('http')) {
            await unlinkAsync(f).catch((err) => console.error('Failed deleting submission file', f, err));
          }
        } catch (e) {
          console.error('Error unlinking file', f, e);
        }
      }

      // For physical bubble sheets, also delete the grading script output directory
      if (isPhysicalSheet && testId && studentId) {
        try {
          // Find the script directory
          const candidates = [
            process.env.GRADING_SCRIPT_DIR,
            path.resolve(process.cwd(), '..', 'scripts', 'grading_service'),
            path.resolve(process.cwd(), 'scripts', 'grading_service'),
            path.resolve(__dirname, '..', '..', '..', '..', 'scripts', 'grading_service'),
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
            scriptDir = path.resolve(process.cwd(), '..', 'scripts', 'grading_service');
          }

          // Delete the output directory for this submission
          const outDir = path.resolve(scriptDir, 'tests', `${testId}-${studentId}`);
          if (fs.existsSync(outDir)) {
            // Recursively delete the directory
            fs.rmSync(outDir, { recursive: true, force: true });
            console.log(`Deleted grading output directory: ${outDir}`);
          }
        } catch (e) {
          console.error('Error deleting grading output directory:', e);
          // Don't throw - this is best-effort cleanup
        }
      }

      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error deleting submission:', error);
      throw error;
    } finally {
      client.release();
    }
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

  // Export combined rankings for multiple tests as CSV (Arabic headers)
  async exportCombinedRankings(testIds: number[]): Promise<string> {
    if (!Array.isArray(testIds) || testIds.length === 0) return '';
    // Fetch submissions across provided tests, include test.correct_answers and answers for accurate counts
    const q = `
      SELECT ta.id as submission_id, ta.test_id, t.title as test_title, t.test_type, t.correct_answers, ta.student_id, s.name as student_name, s.phone_number, s.grade, s.student_group, ta.score, ta.graded, ta.answers
      FROM test_answers ta
      JOIN students s ON ta.student_id = s.id
      JOIN tests t ON ta.test_id = t.id
      WHERE ta.test_id = ANY($1)
      ORDER BY ta.score DESC NULLS LAST, ta.updated_at ASC
    `;
    const res = await database.query(q, [testIds]);
    const rows = res.rows || [];

    // Arabic header: remove submitted_at, add correct count and percentage, translate labels
    const header = [
      'معرف المشاركة',
      'معرف الاختبار',
      'عنوان الاختبار',
      'معرف الطالب',
      'اسم الطالب',
      'الهاتف',
      'الصف',
      'المجموعة',
      'عدد الصحيح',
      'النسبة',
      'مصحح'
    ];

    const escape = (v: unknown): string => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    };

    // Helpers for translating grade/group values
    const translateGrade = (g: any) => {
      switch (g) {
        case '3MIDDLE': return 'الثالث الإعدادي';
        case '1HIGH': return 'الأول الثانوي';
        case '2HIGH': return 'الثاني الثانوي';
        case '3HIGH': return 'الثالث الثانوي';
        default: return g || '';
      }
    };

    const translateGroup = (gr: any) => {
      switch (gr) {
        case 'MINYAT-EL-NASR': return 'منية النصر';
        case 'RIYAD': return 'الرياض';
        case 'MEET-HADID': return 'ميت حديد';
        default: return gr || '';
      }
    };

    // Compute correct count by comparing student's answers to correct_answers
    const computeCorrect = (testType: string, correctAnswersRaw: any, studentAnswersRaw: any) => {
      try {
        let correctAnswers = correctAnswersRaw;
        if (typeof correctAnswersRaw === 'string') {
          try { correctAnswers = JSON.parse(correctAnswersRaw); } catch { correctAnswers = null; }
        }
        let studentAnswers = studentAnswersRaw;
        if (typeof studentAnswersRaw === 'string') {
          try { studentAnswers = JSON.parse(studentAnswersRaw); } catch { studentAnswers = null; }
        }

        if (!correctAnswers) return { correct: 0, total: 0 };

        if (testType === 'MCQ') {
          const questions = correctAnswers.questions || [];
          const total = questions.length;
          let correct = 0;
          const stuAnsArr = studentAnswers && (studentAnswers.answers || studentAnswers) ? (studentAnswers.answers || studentAnswers) : [];
          for (const q of questions) {
            const sa = (stuAnsArr || []).find((a: any) => a.id === q.id);
            if (sa && sa.answer === q.correct) correct++;
            // For OPEN questions, if manual grades were stored as numeric within studentAnswers.manual_grades or similar
            if (q.type === 'OPEN') {
              // try to read manual grade from studentAnswers.manual_grades (not common)
              // but MCQ OPEN grading is handled elsewhere; for export we'll consider OPEN correct only if manual grade > 0 exists in studentAnswers
              // nothing extra here for now
            }
          }
          return { correct, total };
        }

        if (testType === 'BUBBLE_SHEET' || testType === 'PHYSICAL_SHEET') {
          const correctMap = correctAnswers.answers || correctAnswers;
          const studentMap = studentAnswers && (studentAnswers.answers || studentAnswers) ? (studentAnswers.answers || studentAnswers) : {};
          const keys = Object.keys(correctMap || {});
          const total = keys.length;
          let correct = 0;
          for (const k of keys) {
            const expected = (correctMap[k] || '').toString();
            const given = (studentMap && (studentMap[k] || '')).toString();
            if (given && expected && given === expected) correct++;
          }
          return { correct, total };
        }
      } catch (e) {
        // fallthrough
      }
      return { correct: 0, total: 0 };
    };

    const lines = [header.map(escape).join(',')];
    for (const r of rows) {
      const testType = r.test_type || '';
      const ca = r.correct_answers || null;
      const answers = r.answers || null;
      const { correct, total } = computeCorrect(testType, ca, answers);
      const pct = (total > 0) ? (Math.round((correct / total) * 10000) / 100) : (r.score ?? '');

      const gradeLabel = translateGrade(r.grade);
      const groupLabel = translateGroup(r.student_group);

      const vals = [
        r.submission_id,
        r.test_id,
        r.test_title,
        r.student_id,
        r.student_name,
        r.phone_number,
        gradeLabel,
        groupLabel,
        correct,
        pct,
        r.graded ? 'نعم' : 'لا'
      ];

      lines.push(vals.map(escape).join(','));
    }

    return lines.join('\n');
  }

  // New: return structured rows and header (Arabic) for XLSX export
  async exportCombinedRankingsRows(testIds: number[]): Promise<{ header: string[]; rows: Array<any[]> }> {
    if (!Array.isArray(testIds) || testIds.length === 0) return { header: [], rows: [] };
    const q = `
      SELECT ta.id as submission_id, ta.test_id, t.title as test_title, t.test_type, t.correct_answers, ta.student_id, s.name as student_name, s.phone_number, s.parent_phone, s.grade, s.student_group, ta.score, ta.graded, ta.answers
      FROM test_answers ta
      JOIN students s ON ta.student_id = s.id
      JOIN tests t ON ta.test_id = t.id
      WHERE ta.test_id = ANY($1)
      ORDER BY ta.score DESC NULLS LAST, ta.updated_at ASC
    `;
    const res = await database.query(q, [testIds]);
    const rows = res.rows || [];

    const header = [
      'معرف المشاركة',
      'معرف الاختبار',
      'عنوان الاختبار',
      'معرف الطالب',
      'اسم الطالب',
      'الهاتف',
      'هاتف ولي الأمر',
      'الصف',
      'المجموعة',
      'عدد الصحيح',
      'النسبة',
      'مصحح'
    ];

    const translateGrade = (g: any) => {
      switch (g) {
        case '3MIDDLE': return 'الثالث الإعدادي';
        case '1HIGH': return 'الأول الثانوي';
        case '2HIGH': return 'الثاني الثانوي';
        case '3HIGH': return 'الثالث الثانوي';
        default: return g || '';
      }
    };

    const translateGroup = (gr: any) => {
      switch (gr) {
        case 'MINYAT-EL-NASR': return 'منية النصر';
        case 'RIYAD': return 'الرياض';
        case 'MEET-HADID': return 'ميت حديد';
        default: return gr || '';
      }
    };

    const computeCorrect = (testType: string, correctAnswersRaw: any, studentAnswersRaw: any) => {
      try {
        let correctAnswers = correctAnswersRaw;
        if (typeof correctAnswersRaw === 'string') {
          try { correctAnswers = JSON.parse(correctAnswersRaw); } catch { correctAnswers = null; }
        }
        let studentAnswers = studentAnswersRaw;
        if (typeof studentAnswersRaw === 'string') {
          try { studentAnswers = JSON.parse(studentAnswersRaw); } catch { studentAnswers = null; }
        }

        if (!correctAnswers) return { correct: 0, total: 0 };

        if (testType === 'MCQ') {
          const questions = correctAnswers.questions || [];
          const total = questions.length;
          let correct = 0;
          const stuAnsArr = studentAnswers && (studentAnswers.answers || studentAnswers) ? (studentAnswers.answers || studentAnswers) : [];
          for (const q of questions) {
            const sa = (stuAnsArr || []).find((a: any) => a.id === q.id);
            if (sa && sa.answer === q.correct) correct++;
          }
          return { correct, total };
        }

        if (testType === 'BUBBLE_SHEET' || testType === 'PHYSICAL_SHEET') {
          const correctMap = correctAnswers.answers || correctAnswers;
          const studentMap = studentAnswers && (studentAnswers.answers || studentAnswers) ? (studentAnswers.answers || studentAnswers) : {};
          const keys = Object.keys(correctMap || {});
          const total = keys.length;
          let correct = 0;
          for (const k of keys) {
            const expected = (correctMap[k] || '').toString();
            const given = (studentMap && (studentMap[k] || '')).toString();
            if (given && expected && given === expected) correct++;
          }
          return { correct, total };
        }
      } catch (e) {
        // ignore
      }
      return { correct: 0, total: 0 };
    };

    const outRows: Array<any[]> = [];
    for (const r of rows) {
      const testType = r.test_type || '';
      const ca = r.correct_answers || null;
      const answers = r.answers || null;
      const { correct, total } = computeCorrect(testType, ca, answers);
      const pct = (total > 0) ? (Math.round((correct / total) * 10000) / 100) : (r.score ?? '');

      const gradeLabel = translateGrade(r.grade);
      const groupLabel = translateGroup(r.student_group);

      outRows.push([
        r.submission_id,
        r.test_id,
        r.test_title,
        r.student_id,
        r.student_name,
        r.phone_number,
        r.parent_phone || '',
        gradeLabel,
        groupLabel,
        correct,
        pct,
        r.graded ? 'نعم' : 'لا'
      ]);
    }

    return { header, rows: outRows };
  }

  // Get student's rank across all tests in the same test group
  async getStudentRank(testId: number, studentId: number): Promise<{ rank: number; total: number; score: number | null }> {
    try {
      // First, get the test to find its test_group
      const testResult = await database.query(
        'SELECT test_group FROM tests WHERE id = $1',
        [testId]
      );
      
      if (testResult.rows.length === 0) {
        return { rank: -1, total: 0, score: null };
      }
      
      const testGroup = testResult.rows[0].test_group;
      
      // Get all submissions for tests in the same group (or just this test if no group)
      let query = `
        SELECT ta.student_id, ta.score, t.test_group 
        FROM test_answers ta
        JOIN tests t ON ta.test_id = t.id
        WHERE ta.score IS NOT NULL
      `;
      
      const queryParams: any[] = [];
      
      if (testGroup !== null) {
        query += ` AND t.test_group = $1`;
        queryParams.push(testGroup);
      } else {
        query += ` AND t.id = $1`;
        queryParams.push(testId);
      }
      
      query += ` ORDER BY ta.score DESC`;
      
      const submissions = await database.query(query, queryParams);

      if (submissions.rows.length === 0) {
        return { rank: -1, total: 0, score: null };
      }

      // Find the student's submission
      const studentSubmission = submissions.rows.find(row => row.student_id === studentId);
      if (!studentSubmission) {
        return { rank: -1, total: submissions.rows.length, score: null };
      }

      // Calculate rank (1-based index of first occurrence of this score)
      const studentScore = parseFloat(studentSubmission.score);
      let rank = 1;
      let prevScore: number | null = null;
      let currentRank = 1;
      let found = false;

      for (let i = 0; i < submissions.rows.length; i++) {
        const row = submissions.rows[i];
        const score = parseFloat(row.score);
        
        if (prevScore !== null && score !== prevScore) {
          currentRank = i + 1; // 1-based rank
        }
        
        if (row.student_id === studentId) {
          found = true;
          return {
            rank: currentRank,
            total: submissions.rows.length,
            score: studentScore
          };
        }
        
        prevScore = score;
      }

      // This should not happen if we found the student's submission
      return { rank: -1, total: submissions.rows.length, score: null };
    } catch (error) {
      console.error('Error calculating student rank:', error);
      return { rank: -1, total: 0, score: null };
    }
  }

  async regradeAllSubmissions(testId: number): Promise<void> {
    console.log(`Starting regrading process for test ${testId}`);
    try {
      // Load test and validate
      const test = await this.getTestById(testId);
      if (!test) {
        console.error(`Regrading failed: test ${testId} not found.`);
        return;
      }
  
      const supported = new Set(['MCQ', 'BUBBLE_SHEET', 'PHYSICAL_SHEET']);
      if (!supported.has(test.test_type)) {
        console.error(
          `Regrading failed: test ${testId} type "${test.test_type}" is not supported.`
        );
        return;
      }
  
      if (!test.correct_answers) {
        console.error(
          `Regrading skipped: test ${testId} has no correct_answers configured.`
        );
        return;
      }
  
      // Parse correct_answers if it is a string
      let parsedCorrect: any = test.correct_answers as any;
      if (typeof parsedCorrect === 'string') {
        try {
          parsedCorrect = JSON.parse(parsedCorrect);
        } catch (e) {
          console.error(
            `Regrading failed: invalid correct_answers JSON for test ${testId}.`,
            e
          );
          return;
        }
      }
  
      // Fetch all submissions
      const submissions = await this.getTestSubmissions(testId);
      if (!submissions || submissions.length === 0) {
        console.log(`No submissions found for test ${testId}. Nothing to regrade.`);
        return;
      }
  
      let updatedCount = 0;
  
      for (const submission of submissions) {
        try {
          // Compute new score
          let newScore = 0;
  
          if (test.test_type === 'MCQ') {
            // Use manual grades for OPEN questions if present
            newScore = this.computeScoreWithManual(
              { ...test, correct_answers: parsedCorrect },
              submission
            );
          } else {
            newScore = this.calculateScore(
              submission.answers,
              parsedCorrect,
              test.test_type
            );
          }
  
          const oldScore =
            submission.score === null || submission.score === undefined
              ? null
              : Number(submission.score);
  
          const needsUpdate =
            oldScore === null ||
            Number(newScore) !== oldScore ||
            submission.graded !== true;
  
          if (needsUpdate) {
            const query = `
              UPDATE test_answers 
              SET score = $1, graded = true, updated_at = CURRENT_TIMESTAMP
              WHERE id = $2
            `;
            await database.query(query, [newScore, submission.id]);
            updatedCount++;
          }
        } catch (e) {
          console.error(
            `Failed to regrade submission ${submission.id} for test ${testId}:`,
            e
          );
        }
      }
  
      console.log(
        `Successfully regraded test ${testId}. Updated ${updatedCount}/${submissions.length} submissions.`
      );
    } catch (error) {
      console.error(
        `An error occurred during the regrading process for test ${testId}:`,
        error
      );
    }
  }

  // Admin: override grade for physical sheet test submission
  async overrideGrade(submissionId: number, score: number, teacherComment?: string): Promise<any | null> {
    const query = `
      UPDATE test_answers
      SET score = $1, teacher_comment = COALESCE($2, teacher_comment), graded = true, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `;

    const result = await database.query(query, [score, teacherComment, submissionId]);
    return this.normalizeSubmission(result.rows[0] || null);
  }
}

export default new TestService();
