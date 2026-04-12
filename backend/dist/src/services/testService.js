import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import database from "./database";
import logger from "./logger";
const unlinkAsync = promisify(fs.unlink);
const pad = (n) => String(n).padStart(2, "0");
const formatLocal = (d) => {
    if (!d)
        return null;
    const date = d instanceof Date ? d : new Date(d);
    const yyyy = date.getFullYear();
    const mm = pad(date.getMonth() + 1);
    const dd = pad(date.getDate());
    const hh = pad(date.getHours());
    const mi = pad(date.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
};
const hasTimezoneSuffix = (s) => /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s);
const parseTimezoneSuffix = () => {
    const env = process.env.PARSE_TIMEZONE;
    if (env && typeof env === "string" && /^[+-]\d{2}:?\d{2}$/.test(env)) {
        const cleaned = env.includes(":")
            ? env
            : `${env.slice(0, 3)}:${env.slice(3)}`;
        return cleaned;
    }
    return "+02:00";
};
const formatUtc = (d) => {
    if (!d)
        return null;
    if (d instanceof Date)
        return d.toISOString();
    const s = String(d);
    try {
        if (hasTimezoneSuffix(s)) {
            return new Date(s).toISOString();
        }
        return new Date(s + parseTimezoneSuffix()).toISOString();
    }
    catch (e) {
        return new Date(s).toISOString();
    }
};
const formatMs = (d) => {
    if (!d)
        return null;
    if (d instanceof Date)
        return d.getTime();
    const s = String(d);
    try {
        if (hasTimezoneSuffix(s)) {
            return new Date(s).getTime();
        }
        return new Date(s + parseTimezoneSuffix()).getTime();
    }
    catch (e) {
        return new Date(s).getTime();
    }
};
const nowLocalString = () => {
    const d = new Date();
    const cairoOffsetMs = 2 * 60 * 60 * 1000;
    const cairoDate = new Date(d.getTime() + cairoOffsetMs);
    const yyyy = cairoDate.getFullYear();
    const mm = pad(cairoDate.getMonth() + 1);
    const dd = pad(cairoDate.getDate());
    const hh = pad(cairoDate.getHours());
    const mi = pad(cairoDate.getMinutes());
    const ss = pad(cairoDate.getSeconds());
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}+02:00`;
};
class TestService {
    normalizeSubmission(submission) {
        if (!submission)
            return null;
        const s = { ...submission };
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
        try {
            if (s.answers && typeof s.answers === "string") {
                s.answers = JSON.parse(s.answers);
            }
            if (s.visible_answers && typeof s.visible_answers === "string") {
                s.visible_answers = JSON.parse(s.visible_answers);
            }
            if (s.correct_answers_visible &&
                typeof s.correct_answers_visible === "string") {
                s.correct_answers_visible = JSON.parse(s.correct_answers_visible);
            }
        }
        catch (e) {
            logger.error("Failed to parse submission JSON fields", e);
        }
        return s;
    }
    async regradePhysicalSubmission(submissionId) {
        try {
            const subQuery = "SELECT * FROM test_answers WHERE id = $1";
            const subResult = await database.query(subQuery, [submissionId]);
            if (subResult.rows.length === 0) {
                return { success: false, score: null, message: "Submission not found" };
            }
            const submission = subResult.rows[0];
            const testId = submission.test_id;
            const studentId = submission.student_id;
            const test = await this.getTestById(testId);
            if (!test || test.test_type !== "PHYSICAL_SHEET") {
                return {
                    success: false,
                    score: null,
                    message: "Test not found or not a physical sheet test",
                };
            }
            const nQuestions = test.correct_answers?.answers
                ? Object.keys(test.correct_answers.answers).length
                : 50;
            let imagePath = null;
            let sourceImagePath = null;
            try {
                const answers = submission.answers;
                const answersObj = typeof answers === "string" ? JSON.parse(answers) : answers;
                sourceImagePath =
                    answersObj?.source_image_path ||
                        answersObj?.file_path ||
                        answersObj?.bubble_image_path ||
                        answersObj?.bubble_image ||
                        null;
                imagePath =
                    sourceImagePath ||
                        answersObj?.bubble_image_path ||
                        answersObj?.file_path ||
                        answersObj?.bubble_image ||
                        null;
            }
            catch (e) {
                return {
                    success: false,
                    score: null,
                    message: "Could not find original bubble image path",
                };
            }
            if (!imagePath) {
                return {
                    success: false,
                    score: null,
                    message: "No bubble image found for this submission",
                };
            }
            let fullImagePath;
            if (path.isAbsolute(imagePath)) {
                fullImagePath = imagePath;
            }
            else {
                const candidates = [
                    path.resolve(process.cwd(), "..", imagePath),
                    path.resolve(process.cwd(), imagePath),
                    path.resolve(__dirname, "..", "..", "..", "..", "..", imagePath),
                ];
                fullImagePath = "";
                for (const cand of candidates) {
                    if (fs.existsSync(cand)) {
                        fullImagePath = cand;
                        break;
                    }
                }
                if (!fullImagePath) {
                    fullImagePath = path.resolve(process.cwd(), "..", imagePath);
                }
            }
            if (!fs.existsSync(fullImagePath)) {
                return {
                    success: false,
                    score: null,
                    message: `Bubble image file not found on disk. Tried path: ${fullImagePath}`,
                };
            }
            console.log(`[REGRADE] Source image for submission ${submissionId}: ${fullImagePath}`);
            const pyExec = process.platform === "win32" ? "python" : "python3";
            const candidates = [
                process.env.GRADING_SCRIPT_DIR,
                path.resolve(process.cwd(), "grading_service"),
                path.resolve(__dirname, "..", "..", "..", "grading_service"),
                path.resolve(__dirname, "..", "..", "grading_service"),
            ].filter(Boolean);
            let scriptDir = "";
            for (const cand of candidates) {
                try {
                    if (typeof cand === "string") {
                        const stat = fs.existsSync(path.join(cand, "app.py"));
                        if (stat) {
                            scriptDir = cand;
                            break;
                        }
                    }
                }
                catch {
                }
            }
            if (!scriptDir) {
                scriptDir = path.resolve(process.cwd(), "grading_service");
            }
            const outDir = path.resolve(scriptDir, "tests", `${testId}-${studentId}`);
            fs.mkdirSync(outDir, { recursive: true });
            console.log(`[REGRADE] Script directory: ${scriptDir}`);
            console.log(`[REGRADE] Output directory: ${outDir}`);
            const args = [
                "app.py",
                "-n",
                String(nQuestions),
                "-t",
                String(testId),
                "-s",
                String(studentId),
                "-o",
                outDir,
                "-i",
                fullImagePath,
            ];
            console.log(`[REGRADE] Running grading script for submission ${submissionId}`);
            const outJsonPre = path.join(outDir, `${testId}-${studentId}.json`);
            const outImgPre = path.join(outDir, `${testId}-${studentId}.jpg`);
            const sameInputAsOutput = path.resolve(fullImagePath) === path.resolve(outImgPre);
            try {
                if (fs.existsSync(outJsonPre))
                    fs.unlinkSync(outJsonPre);
            }
            catch { }
            try {
                if (sameInputAsOutput) {
                    console.warn(`[REGRADE] Input image equals output image path; keeping existing file: ${outImgPre}`);
                }
                else if (fs.existsSync(outImgPre)) {
                    fs.unlinkSync(outImgPre);
                }
            }
            catch { }
            const exitCode = await new Promise((resolve) => {
                const child = spawn(pyExec, args, {
                    cwd: scriptDir,
                    stdio: ["ignore", "pipe", "pipe"],
                    shell: process.platform === "win32",
                });
                child.stdout?.on("data", (data) => {
                    const msg = data.toString().trim();
                    if (msg)
                        console.log(`[GRADING] ${msg}`);
                });
                child.stderr?.on("data", (data) => {
                    const msg = data.toString().trim();
                    if (msg)
                        console.error(`[GRADING ERROR] ${msg}`);
                });
                child.on("close", (code) => {
                    console.log(`[REGRADE] Script finished for submission ${submissionId} (exit ${code})`);
                    resolve(code);
                });
                child.on("error", (err) => {
                    console.error(`[REGRADE] Script error for submission ${submissionId}:`, err.message);
                    resolve(null);
                });
            });
            if (exitCode !== 0) {
                return {
                    success: false,
                    score: null,
                    message: `Grading script failed with exit code ${exitCode}`,
                };
            }
            const outJson = path.join(outDir, `${testId}-${studentId}.json`);
            const outImg = path.join(outDir, `${testId}-${studentId}.jpg`);
            console.log(`[REGRADE] Output status for submission ${submissionId}: json=${fs.existsSync(outJson)} image=${fs.existsSync(outImg)}`);
            let detected = null;
            try {
                const raw = fs.readFileSync(outJson, "utf8");
                detected = JSON.parse(raw);
            }
            catch (parseError) {
                console.error(`[REGRADE] Failed to parse output JSON for submission ${submissionId}:`, parseError instanceof Error ? parseError.message : parseError);
                detected = null;
            }
            if (!detected) {
                return {
                    success: false,
                    score: null,
                    message: "Grading script did not produce valid output",
                };
            }
            const score = this.calculateScore({ answers: detected }, test.correct_answers, test.test_type);
            const persistedSourcePath = (sourceImagePath || imagePath || fullImagePath).replace(/\\/g, "/");
            const answersPayload = {
                answers: detected,
                source_image_path: persistedSourcePath,
                file_path: persistedSourcePath,
                bubble_image_path: path
                    .join("grading_service", "tests", `${testId}-${studentId}`, `${testId}-${studentId}.jpg`)
                    .replace(/\\/g, "/"),
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
                submissionId,
            ]);
            return {
                success: true,
                score,
                message: "Submission regraded successfully",
            };
        }
        catch (error) {
            logger.error("Error regrading physical submission:", error);
            console.error(`[REGRADE] Error:`, error instanceof Error ? error.message : error);
            return {
                success: false,
                score: null,
                message: "Internal error during regrading",
            };
        }
    }
    async gradePhysicalBatch(params) {
        const { testId, nQuestions, studentsOrdered, files, namesAsIds } = params;
        console.log(`[GRADING] Starting batch grading for test ${testId} (${studentsOrdered.length} students, ${files.length} files, ${nQuestions} questions)`);
        const pyExec = process.platform === "win32" ? "python" : "python3";
        const candidates = [
            process.env.GRADING_SCRIPT_DIR,
            path.resolve(process.cwd(), "grading_service"),
            path.resolve(__dirname, "..", "..", "..", "grading_service"),
            path.resolve(__dirname, "..", "..", "grading_service"),
        ].filter(Boolean);
        let scriptDir = "";
        for (const cand of candidates) {
            try {
                if (typeof cand === "string") {
                    const stat = fs.existsSync(path.join(cand, "app.py"));
                    if (stat) {
                        scriptDir = cand;
                        break;
                    }
                }
            }
            catch {
            }
        }
        if (!scriptDir) {
            scriptDir = path.resolve(process.cwd(), "grading_service");
        }
        const results = [];
        const indexedFiles = {};
        const fileByStudentId = {};
        files.forEach((f, idx) => {
            const name = (f.originalname ?? f.filename ?? `file_${idx}`);
            const m = name.match(/(\d+)/);
            if (m) {
                const numStr = (m[1] ?? m[0]);
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
        if (namesAsIds) {
            const providedIds = studentsOrdered
                .map(Number)
                .filter((n) => Number.isFinite(n));
            const fileIds = Object.keys(fileByStudentId)
                .map((k) => Number(k))
                .filter((n) => Number.isFinite(n));
            if (fileIds.length !== providedIds.length) {
                throw new Error(`Mismatch: provided ${providedIds.length} students but ${fileIds.length} identifiable files. Ensure each file is named exactly as the student ID.`);
            }
            const missing = providedIds.filter((id) => !fileByStudentId[id]);
            const extra = fileIds.filter((id) => !providedIds.includes(id));
            if (missing.length > 0 || extra.length > 0) {
                throw new Error(`ID mismatch. Missing files for students: [${missing.join(", ")}], extra files not in list: [${extra.join(", ")}]`);
            }
        }
        for (let i = 0; i < studentsOrdered.length; i++) {
            const rawStudentId = studentsOrdered[i];
            const studentId = Number(rawStudentId);
            if (!Number.isFinite(studentId))
                continue;
            const fileIdx = i + 1;
            const chosen = namesAsIds
                ? fileByStudentId[studentId]
                : indexedFiles[fileIdx];
            if (!chosen)
                continue;
            const inputPath = path.resolve(chosen.path);
            if (!fs.existsSync(inputPath)) {
                console.error(`[GRADING ERROR] Source image missing for student ${studentId}: ${inputPath}`);
                results.push({
                    student_id: studentId,
                    submission_id: -1,
                    score: null,
                    output_dir: "",
                });
                continue;
            }
            const outDir = path.resolve(scriptDir, "tests", `${testId}-${studentId}`);
            fs.mkdirSync(outDir, { recursive: true });
            const sourceImagePath = chosen.path.replace(/\\/g, "/");
            const args = [
                "app.py",
                "-n",
                String(nQuestions),
                "-t",
                String(testId),
                "-s",
                String(studentId),
                "-o",
                outDir,
                "-i",
                inputPath,
            ];
            console.log(`[GRADING] Running script for student ${studentId}`);
            console.log(`[GRADING] Student ${studentId} input: ${inputPath}`);
            console.log(`[GRADING] Student ${studentId} output: ${outDir}`);
            const outJsonPre = path.join(outDir, `${testId}-${studentId}.json`);
            const outImgPre = path.join(outDir, `${testId}-${studentId}.jpg`);
            try {
                if (fs.existsSync(outJsonPre))
                    fs.unlinkSync(outJsonPre);
            }
            catch {
            }
            try {
                if (fs.existsSync(outImgPre))
                    fs.unlinkSync(outImgPre);
            }
            catch {
            }
            const exitCode = await new Promise((resolve) => {
                const child = spawn(pyExec, args, {
                    cwd: scriptDir,
                    stdio: ["ignore", "pipe", "pipe"],
                    shell: process.platform === "win32",
                });
                child.stdout?.on("data", (data) => {
                    const msg = data.toString().trim();
                    if (msg)
                        console.log(`[GRADING] ${msg}`);
                });
                child.stderr?.on("data", (data) => {
                    const msg = data.toString().trim();
                    if (msg)
                        console.error(`[GRADING ERROR] ${msg}`);
                });
                child.on("close", (code) => {
                    console.log(`[GRADING] Script finished for student ${studentId} (exit ${code})`);
                    resolve(code);
                });
                child.on("error", (err) => {
                    console.error(`[GRADING ERROR] Script error for student ${studentId}: ${err.message}`);
                    resolve(null);
                });
            });
            if (exitCode !== 0) {
                logger.error(`Batch grading script failed for student ${studentId} with exit code ${exitCode}`);
                results.push({
                    student_id: studentId,
                    submission_id: -1,
                    score: null,
                    output_dir: outDir,
                });
                continue;
            }
            const outJson = path.join(outDir, `${testId}-${studentId}.json`);
            const outImg = path.join(outDir, `${testId}-${studentId}.jpg`);
            console.log(`[GRADING] Student ${studentId} output status: json=${fs.existsSync(outJson)} image=${fs.existsSync(outImg)}`);
            let detected = null;
            try {
                const raw = fs.readFileSync(outJson, "utf8");
                detected = JSON.parse(raw);
            }
            catch (parseError) {
                console.error(`[GRADING ERROR] Failed to parse JSON for student ${studentId}:`, parseError instanceof Error ? parseError.message : parseError);
                detected = null;
            }
            if (!detected) {
                console.error(`[GRADING ERROR] No valid grading output JSON for student ${studentId}`);
                results.push({
                    student_id: studentId,
                    submission_id: -1,
                    score: null,
                    output_dir: outDir,
                });
                continue;
            }
            const existingQ = "SELECT * FROM test_answers WHERE test_id = $1 AND student_id = $2 LIMIT 1";
            const existing = await database.query(existingQ, [testId, studentId]);
            let score = null;
            let subId = -1;
            const answersPayload = detected
                ? {
                    answers: detected,
                    source_image_path: sourceImagePath,
                    file_path: sourceImagePath,
                    bubble_image_path: path
                        .join("grading_service", "tests", `${testId}-${studentId}`, `${testId}-${studentId}.jpg`)
                        .replace(/\\/g, "/"),
                }
                : {};
            if (existing.rows.length > 0) {
                const sub = existing.rows[0];
                const test = await this.getTestById(testId);
                if (test && detected) {
                    score = this.calculateScore({ answers: detected }, test.correct_answers, test.test_type);
                }
                else {
                    score = sub.score ?? null;
                }
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
                    sub.id,
                ]);
                subId = sub.id;
            }
            else {
                const test = await this.getTestById(testId);
                if (test && detected) {
                    score = this.calculateScore({ answers: detected }, test.correct_answers, test.test_type);
                }
                const insQ = `
          INSERT INTO test_answers (test_id, student_id, answers, manual_grades, score, graded, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
          RETURNING id
        `;
                const insRes = await database.query(insQ, [
                    testId,
                    studentId,
                    JSON.stringify(answersPayload),
                    detected ? JSON.stringify({ grades: detected }) : null,
                    score,
                    true,
                ]);
                subId = insRes.rows[0].id;
            }
            results.push({
                student_id: studentId,
                submission_id: subId,
                score,
                output_dir: outDir,
            });
        }
        console.log(`[GRADING] Finished batch grading for test ${testId}`);
        return results;
    }
    async updateSubmissionAnswers(submissionId, answersMap, teacherComment) {
        const subQ = "SELECT * FROM test_answers WHERE id = $1";
        const subRes = await database.query(subQ, [submissionId]);
        if (subRes.rows.length === 0)
            return null;
        const submission = this.normalizeSubmission(subRes.rows[0]);
        const test = await this.getTestById(submission.test_id);
        if (!test)
            return null;
        let bubbleImagePath;
        try {
            const ansObj = typeof submission.answers === "string"
                ? JSON.parse(submission.answers)
                : submission.answers;
            bubbleImagePath = ansObj?.bubble_image_path;
        }
        catch { }
        const answersPayload = bubbleImagePath
            ? { answers: answersMap, bubble_image_path: bubbleImagePath }
            : { answers: answersMap };
        const score = this.calculateScore({ answers: answersMap }, test.correct_answers, test.test_type);
        const updQ = `
      UPDATE test_answers
      SET answers = $1, score = $2, graded = true, teacher_comment = COALESCE($3, teacher_comment), updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *
    `;
        const updRes = await database.query(updQ, [
            JSON.stringify(answersPayload),
            score,
            teacherComment || null,
            submissionId,
        ]);
        return this.normalizeSubmission(updRes.rows[0]);
    }
    async createTest(testData) {
        const ensureCairoTimezone = (timeStr) => {
            if (!timeStr)
                return timeStr;
            if (hasTimezoneSuffix(timeStr))
                return timeStr;
            return timeStr + "+02:00";
        };
        const startTimeWithTz = ensureCairoTimezone(testData.start_time);
        const endTimeWithTz = ensureCairoTimezone(testData.end_time);
        logger.debug(`[createTest] Input start_time: ${testData.start_time} -> With TZ: ${startTimeWithTz}`);
        logger.debug(`[createTest] Input end_time: ${testData.end_time} -> With TZ: ${endTimeWithTz}`);
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
            startTimeWithTz,
            endTimeWithTz,
            testData.duration_minutes || null,
            testData.correct_answers || null,
            testData.view_type,
            testData.view_type === "IMMEDIATE"
                ? true
                : testData.view_permission || false,
            testData.view_type === "IMMEDIATE"
                ? true
                : (testData.show_grade_outside ?? false),
            testData.test_group ?? null,
        ];
        const result = await database.query(query, values);
        const row = result.rows[0];
        if (row) {
            logger.debug(`[createTest] DB returned start_time: ${row.start_time}, type: ${typeof row.start_time}, instanceof Date: ${row.start_time instanceof Date}`);
            row.start_time = formatLocal(row.start_time);
            row.end_time = formatLocal(row.end_time);
            row.start_time_utc = formatUtc(row.start_time);
            row.end_time_utc = formatUtc(row.end_time);
            row.start_time_ms = formatMs(row.start_time);
            row.end_time_ms = formatMs(row.end_time);
            logger.debug(`[createTest] Final: start_time=${row.start_time}, start_time_utc=${row.start_time_utc}, start_time_ms=${row.start_time_ms}`);
        }
        return row;
    }
    async getAllTests() {
        const query = `
      SELECT t.*, 
             COUNT(DISTINCT ta.id) as submission_count,
             COUNT(DISTINCT CASE WHEN ta.graded = true THEN ta.id END) as graded_count,
             ROUND(AVG(CASE WHEN ta.graded = true THEN ta.score ELSE NULL END)::numeric, 2) as average_score
      FROM tests t
      LEFT JOIN test_answers ta ON t.id = ta.test_id
      GROUP BY t.id
      ORDER BY t.created_at DESC
    `;
        const result = await database.query(query);
        const tests = result.rows || [];
        const withImages = await Promise.all(tests.map(async (r) => {
            const startTimeLocal = formatLocal(r.start_time);
            const endTimeLocal = formatLocal(r.end_time);
            logger.debug(`[getAllTests] Test ${r.id}: raw start_time=${r.start_time}, type=${typeof r.start_time}, instanceof Date=${r.start_time instanceof Date}`);
            logger.debug(`[getAllTests] Test ${r.id}: startTimeLocal=${startTimeLocal}, computed UTC=${formatUtc(startTimeLocal)}`);
            const formatted = {
                ...r,
                start_time: startTimeLocal,
                end_time: endTimeLocal,
                start_time_utc: formatUtc(startTimeLocal),
                end_time_utc: formatUtc(endTimeLocal),
                start_time_ms: formatMs(startTimeLocal),
                end_time_ms: formatMs(endTimeLocal),
            };
            const images = await this.getTestImages(r.id);
            return { ...formatted, images };
        }));
        return withImages;
    }
    async getTestById(testId) {
        try {
            const testQuery = `
        SELECT t.*, 
               COUNT(DISTINCT ta.id) as submission_count,
               COUNT(DISTINCT CASE WHEN ta.graded = true THEN ta.id END) as graded_count,
               ROUND(AVG(CASE WHEN ta.graded = true THEN ta.score ELSE NULL END)::numeric, 2) as average_score
        FROM tests t
        LEFT JOIN test_answers ta ON t.id = ta.test_id
        WHERE t.id = $1
        GROUP BY t.id
      `;
            const testResult = await database.query(testQuery, [testId]);
            if (!testResult.rows[0])
                return null;
            const images = await this.getTestImages(testId);
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
                images,
            };
        }
        catch (error) {
            logger.error("Error in getTestById:", error);
            throw error;
        }
    }
    async getTestImages(testId) {
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
    async getEligibleStudentsForTest(testId) {
        const test = await this.getTestById(testId);
        if (!test)
            return [];
        const grade = test.grade;
        const studentGroup = test.student_group || null;
        let query = "";
        let params = [];
        if (studentGroup) {
            query =
                "SELECT id, name, phone_number, grade, student_group FROM students WHERE grade = $1 AND student_group = $2 ORDER BY name ASC";
            params = [grade, studentGroup];
        }
        else {
            query =
                "SELECT id, name, phone_number, grade, student_group FROM students WHERE grade = $1 ORDER BY name ASC";
            params = [grade];
        }
        const result = await database.query(query, params);
        return result.rows || [];
    }
    async includeStudentsForTest(testId, studentIds) {
        const created = [];
        const skipped = [];
        const test = await this.getTestById(testId);
        if (!test)
            throw new Error("Test not found");
        if (test.test_type !== "PHYSICAL_SHEET")
            throw new Error("Can only include students for PHYSICAL_SHEET tests");
        for (const sidRaw of studentIds) {
            const sid = Number(sidRaw);
            if (!Number.isFinite(sid))
                continue;
            const existingQ = "SELECT id FROM test_answers WHERE test_id = $1 AND student_id = $2 LIMIT 1";
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
            const ins = await database.query(insertQ, [
                testId,
                sid,
                JSON.stringify({}),
                null,
                false,
            ]);
            const subId = ins.rows[0]?.id;
            created.push({ student_id: sid, submission_id: subId });
        }
        return { created, skipped };
    }
    async updateTest(testId, testData) {
        const ensureCairoTimezone = (timeStr) => {
            if (!timeStr)
                return timeStr;
            if (hasTimezoneSuffix(timeStr))
                return timeStr;
            return timeStr + "+02:00";
        };
        const processedData = { ...testData };
        if (processedData.start_time) {
            processedData.start_time = ensureCairoTimezone(processedData.start_time);
        }
        if (processedData.end_time) {
            processedData.end_time = ensureCairoTimezone(processedData.end_time);
        }
        const allowedFields = new Set([
            "title",
            "grade",
            "student_group",
            "test_type",
            "start_time",
            "end_time",
            "duration_minutes",
            "pdf_file_path",
            "correct_answers",
            "view_type",
            "view_permission",
            "show_grade_outside",
            "test_group",
        ]);
        const keyMap = {
            pdf: "pdf_file_path",
            pdf_file: "pdf_file_path",
        };
        const fields = [];
        const values = [];
        let paramCount = 1;
        let correctAnswersChanged = false;
        let newCorrectAnswers = null;
        Object.entries(processedData).forEach(([key, value]) => {
            if (value === undefined)
                return;
            const mappedKey = keyMap[key] || key;
            if (!allowedFields.has(mappedKey))
                return;
            if (mappedKey === "correct_answers") {
                correctAnswersChanged = true;
                newCorrectAnswers = value;
            }
            if (["test_type", "student_group", "grade", "view_type"].includes(mappedKey) &&
                (value === "" || value === null)) {
                return;
            }
            if (mappedKey === "view_permission" &&
                processedData.view_type === "IMMEDIATE") {
                fields.push(`${mappedKey} = $${paramCount}`);
                values.push(true);
            }
            else {
                fields.push(`${mappedKey} = $${paramCount}`);
                values.push(value);
            }
            paramCount++;
        });
        if (processedData.view_type === "IMMEDIATE" &&
            !fields.some((f) => f.includes("view_permission"))) {
            fields.push(`view_permission = $${paramCount}`);
            values.push(true);
            paramCount++;
        }
        if (fields.length === 0) {
            return this.getTestById(testId);
        }
        const query = `
      UPDATE tests 
      SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount}
      RETURNING *
    `;
        values.push(testId);
        const result = await database.query(query, values);
        const updatedTest = result.rows[0] || null;
        if (correctAnswersChanged && updatedTest) {
            try {
                await this.regradeSubmissionsForTest(testId, newCorrectAnswers);
            }
            catch (error) {
                logger.error("Error re-grading submissions after test update:", error);
            }
        }
        return updatedTest;
    }
    async regradeSubmissionsForTest(testId, correctAnswers) {
        try {
            const test = await this.getTestById(testId);
            if (!test)
                return;
            const submissionsQ = "SELECT * FROM test_answers WHERE test_id = $1";
            const submissionsRes = await database.query(submissionsQ, [testId]);
            const submissions = submissionsRes.rows || [];
            for (const submission of submissions) {
                try {
                    if (!submission.answers)
                        continue;
                    let newScore = 0;
                    if (test.test_type === "MCQ") {
                        newScore = this.computeScoreWithManual({ ...test, correct_answers: correctAnswers }, this.normalizeSubmission(submission));
                    }
                    else {
                        newScore = this.calculateScore(submission.answers, correctAnswers, test.test_type);
                    }
                    const updateQ = `
            UPDATE test_answers
            SET score = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
          `;
                    await database.query(updateQ, [newScore, submission.id]);
                }
                catch (error) {
                    logger.error(`Error re-grading submission ${submission.id}:`, error);
                }
            }
            logger.info(`Successfully re-graded ${submissions.length} submissions for test ${testId}`);
        }
        catch (error) {
            logger.error("Error in regradeSubmissionsForTest:", error);
            throw error;
        }
    }
    async deleteTest(testId) {
        const query = "DELETE FROM tests WHERE id = $1";
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
      WHERE ta.test_id = $1
      ORDER BY ta.score DESC NULLS LAST, ta.updated_at ASC
    `;
        const result = await database.query(query, [testId]);
        return (result.rows || []).map((r) => this.normalizeSubmission(r));
    }
    async gradeSubmission(submissionId, score, teacherComment) {
        const query = `
      UPDATE test_answers 
      SET score = $1, teacher_comment = $2, graded = true, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `;
        const result = await database.query(query, [
            score,
            teacherComment,
            submissionId,
        ]);
        return result.rows[0] || null;
    }
    async getAvailableTestsForStudent(studentId) {
        try {
            const studentQuery = "SELECT grade, student_group FROM students WHERE id = $1";
            const studentResult = await database.query(studentQuery, [studentId]);
            if (studentResult.rows.length === 0) {
                logger.info(`Student ${studentId} not found`);
                return [];
            }
            const student = studentResult.rows[0];
            logger.debug(`Fetching tests for student ${studentId} (grade: ${student.grade}, group: ${student.student_group})`);
            const query = `
        WITH student_submissions AS (
          SELECT test_id, true as is_submitted, created_at as submitted_at
          FROM test_answers 
          WHERE student_id = $1
        )
        SELECT 
          t.*, 
          COALESCE(ss.is_submitted, false) as is_submitted,
          ss.submitted_at,
          CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Cairo' as cairo_now,
          CASE 
            WHEN t.start_time > (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Cairo') THEN 'upcoming'
            WHEN t.end_time < (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Cairo') THEN 'ended'
            ELSE 'active'
          END as test_status
        FROM tests t
        LEFT JOIN student_submissions ss ON t.id = ss.test_id
        WHERE t.grade = $2
          AND (t.student_group IS NULL OR t.student_group = $3)
          AND t.end_time >= (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Cairo')
        ORDER BY t.start_time ASC
      `;
            const result = await database.query(query, [
                studentId,
                student.grade,
                student.student_group,
            ]);
            const tests = result.rows || [];
            logger.info(`Found ${tests.length} available tests for student ${studentId}`);
            return tests.map((test) => {
                const startTimeLocal = formatLocal(test.start_time);
                const endTimeLocal = formatLocal(test.end_time);
                logger.debug(`[getAvailableTests] Test ${test.id}: status=${test.test_status}, raw start_time=${test.start_time}, startTimeLocal=${startTimeLocal}`);
                return {
                    ...test,
                    start_time: startTimeLocal,
                    end_time: endTimeLocal,
                    start_time_utc: formatUtc(startTimeLocal),
                    end_time_utc: formatUtc(endTimeLocal),
                    start_time_ms: formatMs(startTimeLocal),
                    end_time_ms: formatMs(endTimeLocal),
                    is_submitted: test.is_submitted || false,
                    test_status: test.test_status,
                };
            });
        }
        catch (error) {
            logger.error("Error in getAvailableTestsForStudent:", error);
            return [];
        }
    }
    async getStudentTestHistory(studentId) {
        const query = `
      SELECT t.*, ta.score, ta.graded, ta.teacher_comment, ta.created_at as submitted_at,
             CASE 
               WHEN t.view_type = 'IMMEDIATE' OR t.view_permission = true OR t.show_grade_outside = true THEN ta.score
               ELSE NULL
             END as visible_score,
             (SELECT ROUND(AVG(ta2.score)::numeric, 2) 
              FROM test_answers ta2 
              WHERE ta2.test_id = t.id AND ta2.graded = true) as average_score
      FROM tests t
      JOIN test_answers ta ON t.id = ta.test_id
      WHERE ta.student_id = $1
      ORDER BY ta.created_at DESC
    `;
        const result = await database.query(query, [studentId]);
        return (result.rows || []).map((r) => ({
            ...r,
            start_time: formatLocal(r.start_time),
            end_time: formatLocal(r.end_time),
        }));
    }
    async getTestQuestions(testId, studentId) {
        const availableTests = await this.getAvailableTestsForStudent(studentId);
        const availableTest = availableTests.find((t) => t.id === testId);
        if (!availableTest) {
            return null;
        }
        const submissionResult = await database.query("SELECT * FROM test_answers WHERE test_id = $1 AND student_id = $2 LIMIT 1", [testId, studentId]);
        const submissionRow = submissionResult.rows[0] ?? null;
        const submission = submissionRow
            ? this.normalizeSubmission(submissionRow)
            : null;
        const hasFinalSubmission = submission
            ? submission.graded === true || submission.score !== null
            : false;
        if (hasFinalSubmission) {
            const canView = availableTest.view_type === "IMMEDIATE" ||
                availableTest.view_permission === true;
            if (!canView) {
                return null;
            }
        }
        const fullTest = await this.getTestById(testId);
        if (!fullTest) {
            return null;
        }
        if (fullTest.test_type === "MCQ") {
            const testData = { ...fullTest };
            if (testData.correct_answers) {
                let questions;
                if (typeof testData.correct_answers === "string") {
                    try {
                        questions = JSON.parse(testData.correct_answers);
                    }
                    catch (error) {
                        logger.error("Error parsing string correct_answers:", error);
                        questions = { questions: [] };
                    }
                }
                else {
                    questions = testData.correct_answers;
                }
                if (questions &&
                    questions.questions &&
                    Array.isArray(questions.questions)) {
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
            testData.is_submitted = hasFinalSubmission;
            if (submission) {
                testData.submission = submission;
            }
            testData.start_time = formatLocal(testData.start_time);
            testData.end_time = formatLocal(testData.end_time);
            testData.start_time_utc = formatUtc(testData.start_time);
            testData.end_time_utc = formatUtc(testData.end_time);
            testData.start_time_ms = formatMs(testData.start_time);
            testData.end_time_ms = formatMs(testData.end_time);
            return testData;
        }
        if (fullTest) {
            fullTest.start_time = formatLocal(fullTest.start_time);
            fullTest.end_time = formatLocal(fullTest.end_time);
            fullTest.start_time_utc = formatUtc(fullTest.start_time);
            fullTest.end_time_utc = formatUtc(fullTest.end_time);
            fullTest.start_time_ms = formatMs(fullTest.start_time);
            fullTest.end_time_ms = formatMs(fullTest.end_time);
            if (submission) {
                fullTest.submission = submission;
            }
            fullTest.is_submitted = hasFinalSubmission;
        }
        return fullTest;
    }
    async startTest(testId, studentId) {
        const availableTests = await this.getAvailableTestsForStudent(studentId);
        const test = availableTests.find((t) => t.id === testId);
        if (!test) {
            return null;
        }
        const existingQuery = "SELECT * FROM test_answers WHERE test_id = $1 AND student_id = $2 LIMIT 1";
        const existingResult = await database.query(existingQuery, [
            testId,
            studentId,
        ]);
        let submission = null;
        if (existingResult.rows.length > 0) {
            submission = existingResult.rows[0];
        }
        else {
            const insertQuery = `
        INSERT INTO test_answers (test_id, student_id, answers, score, graded, created_at)
        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
        RETURNING *
      `;
            const insertResult = await database.query(insertQuery, [
                testId,
                studentId,
                JSON.stringify({}),
                null,
                false,
            ]);
            submission = insertResult.rows[0];
        }
        const testData = { ...test };
        delete testData.correct_answers;
        return {
            ...testData,
            start_time_utc: formatUtc(testData.start_time),
            end_time_utc: formatUtc(testData.end_time),
            start_time_ms: formatMs(testData.start_time),
            end_time_ms: formatMs(testData.end_time),
            submission: submission ? this.normalizeSubmission(submission) : null,
            server_time_ms: new Date().getTime(),
        };
    }
    async submitTest(testId, studentId, answers, isDraft = false) {
        const existingQuery = "SELECT * FROM test_answers WHERE test_id = $1 AND student_id = $2 LIMIT 1";
        const existingResult = await database.query(existingQuery, [
            testId,
            studentId,
        ]);
        if (isDraft && existingResult.rows.length === 0) {
            const insertDraftQuery = `
        INSERT INTO test_answers (test_id, student_id, answers, score, graded)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;
            const draftResult = await database.query(insertDraftQuery, [
                testId,
                studentId,
                JSON.stringify(answers),
                null,
                false,
            ]);
            return this.normalizeSubmission(draftResult.rows[0]);
        }
        if (existingResult.rows.length > 0) {
            const existing = existingResult.rows[0];
            const test = await this.getTestById(testId);
            let score = existing.score;
            let graded = existing.graded;
            if (test &&
                !isDraft &&
                (test.test_type === "MCQ" || test.test_type === "BUBBLE_SHEET") &&
                test.correct_answers) {
                const correctAnswers = typeof test.correct_answers === "string"
                    ? JSON.parse(test.correct_answers)
                    : test.correct_answers;
                score = this.calculateScore(answers, correctAnswers, test.test_type);
                graded = true;
            }
            const updateQuery = `
        UPDATE test_answers
        SET answers = $1, score = $2, graded = $3, updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
        RETURNING *
      `;
            const updateResult = await database.query(updateQuery, [
                JSON.stringify(answers),
                score,
                graded,
                existing.id,
            ]);
            return updateResult.rows[0];
        }
        const query = `
      INSERT INTO test_answers (test_id, student_id, answers, score, graded)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
        const testForGrading = await this.getTestById(testId);
        let score = null;
        let graded = false;
        if (testForGrading &&
            !isDraft &&
            (testForGrading.test_type === "MCQ" ||
                testForGrading.test_type === "BUBBLE_SHEET") &&
            testForGrading.correct_answers) {
            const correctAnswers = typeof testForGrading.correct_answers === "string"
                ? JSON.parse(testForGrading.correct_answers)
                : testForGrading.correct_answers;
            score = this.calculateScore(answers, correctAnswers, testForGrading.test_type);
            graded = true;
        }
        const result = await database.query(query, [
            testId,
            studentId,
            JSON.stringify(answers),
            score,
            graded,
        ]);
        return this.normalizeSubmission(result.rows[0]);
    }
    async getTestResult(testId, studentId) {
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
             END as visible_answers,
             (SELECT ROUND(AVG(ta2.score)::numeric, 2) 
              FROM test_answers ta2 
              WHERE ta2.test_id = t.id AND ta2.graded = true) as average_score
      FROM tests t
      JOIN test_answers ta ON t.id = ta.test_id
      WHERE t.id = $1 AND ta.student_id = $2
    `;
        const result = await database.query(query, [testId, studentId]);
        if (result.rows.length === 0) {
            return null;
        }
        const testResult = result.rows[0];
        if (testResult) {
            testResult.start_time = formatLocal(testResult.start_time);
            testResult.end_time = formatLocal(testResult.end_time);
            if (testResult.submitted_at)
                testResult.submitted_at = formatLocal(testResult.submitted_at);
            try {
                if (testResult.answers && typeof testResult.answers === "string") {
                    testResult.answers = JSON.parse(testResult.answers);
                }
                if (testResult.visible_answers &&
                    typeof testResult.visible_answers === "string") {
                    testResult.visible_answers = JSON.parse(testResult.visible_answers);
                }
                if (testResult.correct_answers &&
                    typeof testResult.correct_answers === "string") {
                    try {
                        testResult._parsed_correct_answers = JSON.parse(testResult.correct_answers);
                    }
                    catch (e) {
                        testResult._parsed_correct_answers = null;
                    }
                }
                else if (testResult.correct_answers) {
                    testResult._parsed_correct_answers = testResult.correct_answers;
                }
                else {
                    testResult._parsed_correct_answers = null;
                }
            }
            catch (e) {
                logger.error("Failed to parse result JSON fields", e);
            }
            if (testResult.visible_score !== null &&
                testResult._parsed_correct_answers) {
                testResult.correct_answers_visible = testResult._parsed_correct_answers;
            }
            if (testResult.visible_score !== null) {
                try {
                    const testType = testResult.test_type;
                    const ca = testResult.correct_answers_visible;
                    let ans = testResult.visible_answers ?? testResult.answers;
                    if (typeof ans === "string") {
                        try {
                            ans = JSON.parse(ans);
                        }
                        catch {
                            ans = null;
                        }
                    }
                    if (testType === "MCQ") {
                        const questions = ca && ca.questions ? ca.questions : [];
                        const total = questions.length;
                        let correct = 0;
                        const stuAnsArr = ans && (ans.answers || ans) ? ans.answers || ans : [];
                        for (const q of questions) {
                            const sa = (stuAnsArr || []).find((a) => a.id === q.id);
                            if (sa && sa.answer === q.correct)
                                correct++;
                        }
                        testResult.visible_correct = correct;
                        testResult.visible_total = total;
                    }
                    else {
                        const correctMap = ca && (ca.answers || ca);
                        const studentMap = ans && (ans.answers || ans) ? ans.answers || ans : {};
                        const keys = Object.keys(correctMap || {});
                        let correct = 0;
                        for (const k of keys) {
                            const expected = (correctMap[k] || "").toString();
                            const given = (studentMap && (studentMap[k] || "")).toString();
                            if (given && expected && given === expected)
                                correct++;
                        }
                        testResult.visible_correct = correct;
                        testResult.visible_total = keys.length;
                    }
                }
                catch { }
            }
            if (testResult.visible_score !== null && testResult.manual_grades) {
                try {
                    if (typeof testResult.manual_grades === "string") {
                        testResult.manual_grades_visible = JSON.parse(testResult.manual_grades);
                    }
                    else {
                        testResult.manual_grades_visible = testResult.manual_grades;
                    }
                }
                catch (e) {
                    testResult.manual_grades_visible = null;
                }
            }
            delete testResult.correct_answers;
            delete testResult._parsed_correct_answers;
        }
        return testResult;
    }
    async getSubmissionWithTest(testId, submissionId) {
        const submissionQuery = `
      SELECT ta.*
      FROM test_answers ta
      WHERE ta.id = $1 AND ta.test_id = $2
      LIMIT 1
    `;
        const subRes = await database.query(submissionQuery, [
            submissionId,
            testId,
        ]);
        if (subRes.rows.length === 0)
            return null;
        const submission = this.normalizeSubmission(subRes.rows[0]);
        const test = await this.getTestById(testId);
        if (!test)
            return null;
        let parsedCorrect = null;
        if (test.correct_answers) {
            parsedCorrect =
                typeof test.correct_answers === "string"
                    ? (() => {
                        try {
                            return JSON.parse(test.correct_answers);
                        }
                        catch {
                            return null;
                        }
                    })()
                    : test.correct_answers;
        }
        return {
            test,
            submission,
            correct_answers: parsedCorrect,
        };
    }
    computeScoreWithManual(test, submission) {
        try {
            const testType = test.test_type;
            if (testType === "MCQ") {
                const ca = typeof test.correct_answers === "string"
                    ? (() => {
                        try {
                            return JSON.parse(test.correct_answers);
                        }
                        catch {
                            return null;
                        }
                    })()
                    : test.correct_answers;
                const questions = ca && ca.questions ? ca.questions : [];
                if (!questions.length)
                    return 0;
                const studentAns = submission?.answers && submission.answers.answers
                    ? submission.answers.answers
                    : [];
                let gradesMap = {};
                if (submission?.manual_grades) {
                    try {
                        const mg = typeof submission.manual_grades === "string"
                            ? JSON.parse(submission.manual_grades)
                            : submission.manual_grades;
                        if (mg && mg.grades && typeof mg.grades === "object") {
                            gradesMap = mg.grades;
                        }
                        else if (mg && typeof mg === "object") {
                            gradesMap = mg;
                        }
                    }
                    catch (e) {
                    }
                }
                let totalPoints = 0;
                for (const q of questions) {
                    if (q.type === "OPEN") {
                        const val = gradesMap[String(q.id)] ?? gradesMap[q.id] ?? 0;
                        const clamped = Math.max(0, Math.min(1, Number(val) || 0));
                        totalPoints += clamped;
                    }
                    else {
                        const sa = studentAns.find((a) => a.id === q.id);
                        if (sa && sa.answer === q.correct)
                            totalPoints += 1;
                    }
                }
                return Math.round((totalPoints / questions.length) * 100 * 100) / 100;
            }
            return this.calculateScore(submission?.answers, test.correct_answers, test.test_type);
        }
        catch (e) {
            logger.error("Error computeScoreWithManual:", e);
            return 0;
        }
    }
    async setManualGrades(submissionId, grades, teacherComment) {
        const subQuery = "SELECT * FROM test_answers WHERE id = $1";
        const subRes = await database.query(subQuery, [submissionId]);
        if (subRes.rows.length === 0)
            return null;
        const submission = this.normalizeSubmission(subRes.rows[0]);
        const test = await this.getTestById(submission.test_id);
        if (!test)
            return null;
        const manualGrades = { grades };
        const newScore = this.computeScoreWithManual(test, {
            ...submission,
            manual_grades: manualGrades,
        });
        const updateQuery = `
      UPDATE test_answers
      SET manual_grades = $1, score = $2, graded = true, teacher_comment = COALESCE($3, teacher_comment), updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *
    `;
        const updateRes = await database.query(updateQuery, [
            JSON.stringify(manualGrades),
            newScore,
            teacherComment || null,
            submissionId,
        ]);
        return this.normalizeSubmission(updateRes.rows[0]);
    }
    async uploadBubbleSheet(testId, studentId, filePath) {
        try {
            const existingQ = "SELECT * FROM test_answers WHERE test_id = $1 AND student_id = $2 LIMIT 1";
            const existingRes = await database.query(existingQ, [testId, studentId]);
            if (existingRes.rows.length > 0) {
                const existing = existingRes.rows[0];
                try {
                    const ans = existing.answers && typeof existing.answers === "string"
                        ? JSON.parse(existing.answers)
                        : existing.answers;
                    const candidates = [];
                    if (ans) {
                        if (ans.file_path)
                            candidates.push(ans.file_path);
                        if (ans.bubble_image_path)
                            candidates.push(ans.bubble_image_path);
                        if (ans.bubble_image)
                            candidates.push(ans.bubble_image);
                    }
                    const uniq = Array.from(new Set(candidates.filter(Boolean)));
                    for (const p of uniq) {
                        try {
                            if (typeof p === "string" && p && !p.startsWith("http")) {
                                await unlinkAsync(p).catch(() => { });
                            }
                        }
                        catch (e) {
                        }
                    }
                }
                catch (e) {
                }
            }
            const answers = {
                file_path: filePath,
                extracted_answers: {},
                notes: "Bubble sheet uploaded, awaiting processing",
            };
            return this.submitTest(testId, studentId, answers);
        }
        catch (error) {
            logger.error("Error in uploadBubbleSheet:", error);
            const answers = {
                file_path: filePath,
                extracted_answers: {},
                notes: "Bubble sheet uploaded, awaiting processing",
            };
            return this.submitTest(testId, studentId, answers);
        }
    }
    async deleteSubmission(submissionId) {
        const client = await database.getClient();
        try {
            await client.query("BEGIN");
            const q = "SELECT * FROM test_answers WHERE id = $1 FOR UPDATE";
            const res = await client.query(q, [submissionId]);
            if (res.rows.length === 0) {
                await client.query("ROLLBACK");
                return false;
            }
            const submission = res.rows[0];
            const testId = submission.test_id;
            const studentId = submission.student_id;
            const test = await this.getTestById(testId);
            const isPhysicalSheet = test?.test_type === "PHYSICAL_SHEET";
            const filesToDelete = [];
            try {
                const ans = submission.answers && typeof submission.answers === "string"
                    ? JSON.parse(submission.answers)
                    : submission.answers;
                if (ans) {
                    if (ans.file_path)
                        filesToDelete.push(ans.file_path);
                    if (ans.bubble_image_path)
                        filesToDelete.push(ans.bubble_image_path);
                    if (ans.bubble_image)
                        filesToDelete.push(ans.bubble_image);
                    if (ans.image_path)
                        filesToDelete.push(ans.image_path);
                }
            }
            catch (e) {
            }
            await client.query("DELETE FROM test_answers WHERE id = $1", [
                submissionId,
            ]);
            await client.query("COMMIT");
            for (const f of Array.from(new Set(filesToDelete.filter(Boolean)))) {
                try {
                    if (typeof f === "string" && f && !f.startsWith("http")) {
                        await unlinkAsync(f).catch((err) => logger.error("Failed deleting submission file", f, err));
                    }
                }
                catch (e) {
                    logger.error("Error unlinking file", f, e);
                }
            }
            if (isPhysicalSheet && testId && studentId) {
                try {
                    const candidates = [
                        process.env.GRADING_SCRIPT_DIR,
                        path.resolve(process.cwd(), "grading_service"),
                        path.resolve(__dirname, "..", "..", "..", "grading_service"),
                        path.resolve(__dirname, "..", "..", "grading_service"),
                    ].filter(Boolean);
                    let scriptDir = "";
                    for (const cand of candidates) {
                        try {
                            if (typeof cand === "string") {
                                const stat = fs.existsSync(path.join(cand, "app.py"));
                                if (stat) {
                                    scriptDir = cand;
                                    break;
                                }
                            }
                        }
                        catch {
                        }
                    }
                    if (!scriptDir) {
                        scriptDir = path.resolve(process.cwd(), "grading_service");
                    }
                    const outDir = path.resolve(scriptDir, "tests", `${testId}-${studentId}`);
                    if (fs.existsSync(outDir)) {
                        fs.rmSync(outDir, { recursive: true, force: true });
                        logger.info(`Deleted grading output directory: ${outDir}`);
                    }
                }
                catch (e) {
                    logger.error("Error deleting grading output directory:", e);
                }
            }
            return true;
        }
        catch (error) {
            await client.query("ROLLBACK");
            logger.error("Error deleting submission:", error);
            throw error;
        }
        finally {
            client.release();
        }
    }
    calculateScore(studentAnswers, correctAnswers, testType) {
        try {
            if (testType === "MCQ") {
                if (!correctAnswers ||
                    !correctAnswers.questions ||
                    !studentAnswers ||
                    !studentAnswers.answers) {
                    return 0;
                }
                let correct = 0;
                const totalQuestions = correctAnswers.questions.length;
                if (totalQuestions === 0)
                    return 0;
                correctAnswers.questions.forEach((question) => {
                    const studentAnswer = (studentAnswers.answers || []).find((ans) => ans.id === question.id);
                    if (studentAnswer && studentAnswer.answer === question.correct) {
                        correct++;
                    }
                });
                return Math.round((correct / totalQuestions) * 100 * 100) / 100;
            }
            if (testType === "BUBBLE_SHEET" || testType === "PHYSICAL_SHEET") {
                const correctMap = correctAnswers && (correctAnswers.answers || correctAnswers);
                const studentMap = studentAnswers && (studentAnswers.answers || studentAnswers);
                if (!correctMap || Object.keys(correctMap).length === 0)
                    return 0;
                let correct = 0;
                const keys = Object.keys(correctMap);
                for (const q of keys) {
                    const expected = (correctMap[q] || "").toString();
                    const given = (studentMap && (studentMap[q] || "")).toString();
                    if (given && expected && given === expected)
                        correct++;
                }
                return Math.round((correct / keys.length) * 100 * 100) / 100;
            }
        }
        catch (e) {
            logger.error("Error calculating score:", e);
        }
        return 0;
    }
    async addTestImages(images) {
        if (images.length === 0)
            return [];
        try {
            const orderQuery = `
        SELECT COALESCE(MAX(display_order), -1) + 1 as next_order 
        FROM test_images 
        WHERE test_id = $1
      `;
            const orderResult = await database.query(orderQuery, [images[0]?.testId]);
            let nextOrder = orderResult.rows[0]?.next_order
                ? Number(orderResult.rows[0].next_order)
                : 0;
            const queries = images.map((img) => ({
                text: `
          INSERT INTO test_images (test_id, image_path, display_order)
          VALUES ($1, $2, $3)
          RETURNING *
        `,
                params: [img.testId, img.imagePath, nextOrder++],
            }));
            const client = await database.getClient();
            try {
                await client.query("BEGIN");
                const results = [];
                for (const query of queries) {
                    const result = await client.query(query.text, query.params);
                    results.push(result.rows[0]);
                }
                await client.query("COMMIT");
                return results;
            }
            catch (error) {
                await client.query("ROLLBACK");
                throw error;
            }
            finally {
                client.release();
            }
        }
        catch (error) {
            await Promise.all(images.map((img) => unlinkAsync(img.imagePath).catch((unlinkError) => logger.error("Failed deleting uploaded image during rollback:", img.imagePath, unlinkError))));
            throw error;
        }
    }
    isValidTestId(id) {
        if (id == null) {
            return false;
        }
        switch (typeof id) {
            case "number":
                return !isNaN(id) && id > 0;
            case "string": {
                const num = Number(id);
                return id.trim() !== "" && !isNaN(num) && num > 0;
            }
            default:
                return false;
        }
    }
    async updateTestImageOrder(testId, imageIds) {
        const client = await database.getClient();
        try {
            await client.query("BEGIN");
            for (let i = 0; i < imageIds.length; i++) {
                await client.query("UPDATE test_images SET display_order = $1 WHERE id = $2 AND test_id = $3", [i, imageIds[i], testId]);
            }
            await client.query("COMMIT");
        }
        catch (error) {
            await client.query("ROLLBACK");
            throw error;
        }
        finally {
            client.release();
        }
    }
    async deleteTestImage(imageId) {
        const client = await database.getClient();
        try {
            await client.query("BEGIN");
            const getQuery = "SELECT image_path FROM test_images WHERE id = $1";
            const getResult = await client.query(getQuery, [imageId]);
            if (getResult.rows.length === 0) {
                await client.query("ROLLBACK");
                return false;
            }
            const imagePath = getResult.rows[0].image_path;
            const deleteQuery = "DELETE FROM test_images WHERE id = $1 RETURNING *";
            const deleteResult = await client.query(deleteQuery, [imageId]);
            if (deleteResult.rowCount && deleteResult.rowCount > 0) {
                try {
                    await unlinkAsync(imagePath);
                }
                catch (error) {
                    logger.error(`Failed to delete image file: ${imagePath}`, error);
                }
                await client.query("COMMIT");
                return true;
            }
            await client.query("ROLLBACK");
            return false;
        }
        catch (error) {
            await client.query("ROLLBACK");
            throw error;
        }
        finally {
            client.release();
        }
    }
    async deleteTestImages(testId) {
        const client = await database.getClient();
        try {
            await client.query("BEGIN");
            const getQuery = "SELECT image_path FROM test_images WHERE test_id = $1";
            const getResult = await client.query(getQuery, [testId]);
            const deleteQuery = "DELETE FROM test_images WHERE test_id = $1";
            const deleteResult = await client.query(deleteQuery, [testId]);
            if (deleteResult.rowCount && deleteResult.rowCount > 0) {
                const deletePromises = getResult.rows.map((row) => unlinkAsync(row.image_path).catch((error) => logger.error(`Failed to delete image file: ${row.image_path}`, error)));
                await Promise.all(deletePromises);
                await client.query("COMMIT");
                return true;
            }
            await client.query("ROLLBACK");
            return false;
        }
        catch (error) {
            await client.query("ROLLBACK");
            logger.error("Error deleting test images:", error);
            throw error;
        }
        finally {
            client.release();
        }
    }
    async exportCombinedRankings(testIds) {
        if (!Array.isArray(testIds) || testIds.length === 0)
            return "";
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
        const header = [
            "معرف المشاركة",
            "معرف الاختبار",
            "عنوان الاختبار",
            "معرف الطالب",
            "اسم الطالب",
            "الهاتف",
            "الصف",
            "المجموعة",
            "عدد الصحيح",
            "النسبة",
            "مصحح",
        ];
        const escape = (v) => {
            if (v === null || v === undefined)
                return "";
            const s = String(v);
            if (s.includes(",") || s.includes('"') || s.includes("\n")) {
                return '"' + s.replace(/"/g, '""') + '"';
            }
            return s;
        };
        const translateGrade = (g) => {
            switch (g) {
                case "3MIDDLE":
                    return "الثالث الإعدادي";
                case "1HIGH":
                    return "الأول الثانوي";
                case "2HIGH":
                    return "الثاني الثانوي";
                case "3HIGH":
                    return "الثالث الثانوي";
                default:
                    return g || "";
            }
        };
        const translateGroup = (gr) => {
            switch (gr) {
                case "MINYAT-EL-NASR":
                    return "منية النصر";
                case "RIYAD":
                    return "الرياض";
                case "MEET-HADID":
                    return "ميت حديد";
                default:
                    return gr || "";
            }
        };
        const computeCorrect = (testType, correctAnswersRaw, studentAnswersRaw) => {
            try {
                let correctAnswers = correctAnswersRaw;
                if (typeof correctAnswersRaw === "string") {
                    try {
                        correctAnswers = JSON.parse(correctAnswersRaw);
                    }
                    catch {
                        correctAnswers = null;
                    }
                }
                let studentAnswers = studentAnswersRaw;
                if (typeof studentAnswersRaw === "string") {
                    try {
                        studentAnswers = JSON.parse(studentAnswersRaw);
                    }
                    catch {
                        studentAnswers = null;
                    }
                }
                if (!correctAnswers)
                    return { correct: 0, total: 0 };
                if (testType === "MCQ") {
                    const questions = correctAnswers.questions || [];
                    const total = questions.length;
                    let correct = 0;
                    const stuAnsArr = studentAnswers && (studentAnswers.answers || studentAnswers)
                        ? studentAnswers.answers || studentAnswers
                        : [];
                    for (const q of questions) {
                        const sa = (stuAnsArr || []).find((a) => a.id === q.id);
                        if (sa && sa.answer === q.correct)
                            correct++;
                        if (q.type === "OPEN") {
                        }
                    }
                    return { correct, total };
                }
                if (testType === "BUBBLE_SHEET" || testType === "PHYSICAL_SHEET") {
                    const correctMap = correctAnswers.answers || correctAnswers;
                    const studentMap = studentAnswers && (studentAnswers.answers || studentAnswers)
                        ? studentAnswers.answers || studentAnswers
                        : {};
                    const keys = Object.keys(correctMap || {});
                    const total = keys.length;
                    let correct = 0;
                    for (const k of keys) {
                        const expected = (correctMap[k] || "").toString();
                        const given = (studentMap && (studentMap[k] || "")).toString();
                        if (given && expected && given === expected)
                            correct++;
                    }
                    return { correct, total };
                }
            }
            catch (e) {
            }
            return { correct: 0, total: 0 };
        };
        const lines = [header.map(escape).join(",")];
        for (const r of rows) {
            const testType = r.test_type || "";
            const ca = r.correct_answers || null;
            const answers = r.answers || null;
            const { correct, total } = computeCorrect(testType, ca, answers);
            const pct = total > 0
                ? Math.round((correct / total) * 10000) / 100
                : (r.score ?? "");
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
                r.graded ? "نعم" : "لا",
            ];
            lines.push(vals.map(escape).join(","));
        }
        return lines.join("\n");
    }
    async exportCombinedRankingsRows(testIds) {
        if (!Array.isArray(testIds) || testIds.length === 0)
            return { header: [], rows: [] };
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
            "معرف المشاركة",
            "معرف الاختبار",
            "عنوان الاختبار",
            "معرف الطالب",
            "اسم الطالب",
            "الهاتف",
            "هاتف ولي الأمر",
            "الصف",
            "المجموعة",
            "عدد الصحيح",
            "النسبة",
            "مصحح",
        ];
        const translateGrade = (g) => {
            switch (g) {
                case "3MIDDLE":
                    return "الثالث الإعدادي";
                case "1HIGH":
                    return "الأول الثانوي";
                case "2HIGH":
                    return "الثاني الثانوي";
                case "3HIGH":
                    return "الثالث الثانوي";
                default:
                    return g || "";
            }
        };
        const translateGroup = (gr) => {
            switch (gr) {
                case "MINYAT-EL-NASR":
                    return "منية النصر";
                case "RIYAD":
                    return "الرياض";
                case "MEET-HADID":
                    return "ميت حديد";
                default:
                    return gr || "";
            }
        };
        const computeCorrect = (testType, correctAnswersRaw, studentAnswersRaw) => {
            try {
                let correctAnswers = correctAnswersRaw;
                if (typeof correctAnswersRaw === "string") {
                    try {
                        correctAnswers = JSON.parse(correctAnswersRaw);
                    }
                    catch {
                        correctAnswers = null;
                    }
                }
                let studentAnswers = studentAnswersRaw;
                if (typeof studentAnswersRaw === "string") {
                    try {
                        studentAnswers = JSON.parse(studentAnswersRaw);
                    }
                    catch {
                        studentAnswers = null;
                    }
                }
                if (!correctAnswers)
                    return { correct: 0, total: 0 };
                if (testType === "MCQ") {
                    const questions = correctAnswers.questions || [];
                    const total = questions.length;
                    let correct = 0;
                    const stuAnsArr = studentAnswers && (studentAnswers.answers || studentAnswers)
                        ? studentAnswers.answers || studentAnswers
                        : [];
                    for (const q of questions) {
                        const sa = (stuAnsArr || []).find((a) => a.id === q.id);
                        if (sa && sa.answer === q.correct)
                            correct++;
                    }
                    return { correct, total };
                }
                if (testType === "BUBBLE_SHEET" || testType === "PHYSICAL_SHEET") {
                    const correctMap = correctAnswers.answers || correctAnswers;
                    const studentMap = studentAnswers && (studentAnswers.answers || studentAnswers)
                        ? studentAnswers.answers || studentAnswers
                        : {};
                    const keys = Object.keys(correctMap || {});
                    const total = keys.length;
                    let correct = 0;
                    for (const k of keys) {
                        const expected = (correctMap[k] || "").toString();
                        const given = (studentMap && (studentMap[k] || "")).toString();
                        if (given && expected && given === expected)
                            correct++;
                    }
                    return { correct, total };
                }
            }
            catch (e) {
            }
            return { correct: 0, total: 0 };
        };
        const outRows = [];
        for (const r of rows) {
            const testType = r.test_type || "";
            const ca = r.correct_answers || null;
            const answers = r.answers || null;
            const { correct, total } = computeCorrect(testType, ca, answers);
            const pct = total > 0
                ? Math.round((correct / total) * 10000) / 100
                : (r.score ?? "");
            const gradeLabel = translateGrade(r.grade);
            const groupLabel = translateGroup(r.student_group);
            outRows.push([
                r.submission_id,
                r.test_id,
                r.test_title,
                r.student_id,
                r.student_name,
                r.phone_number,
                r.parent_phone || "",
                gradeLabel,
                groupLabel,
                correct,
                pct,
                r.graded ? "نعم" : "لا",
            ]);
        }
        return { header, rows: outRows };
    }
    async getStudentRank(testId, studentId) {
        try {
            const testResult = await database.query("SELECT test_group FROM tests WHERE id = $1", [testId]);
            if (testResult.rows.length === 0) {
                return { rank: -1, total: 0, score: null };
            }
            const testGroup = testResult.rows[0].test_group;
            let query = `
        SELECT ta.student_id, ta.score, t.test_group 
        FROM test_answers ta
        JOIN tests t ON ta.test_id = t.id
        WHERE ta.score IS NOT NULL
      `;
            const queryParams = [];
            if (testGroup !== null) {
                query += ` AND t.test_group = $1`;
                queryParams.push(testGroup);
            }
            else {
                query += ` AND t.id = $1`;
                queryParams.push(testId);
            }
            query += ` ORDER BY ta.score DESC`;
            const submissions = await database.query(query, queryParams);
            if (submissions.rows.length === 0) {
                return { rank: -1, total: 0, score: null };
            }
            const studentSubmission = submissions.rows.find((row) => row.student_id === studentId);
            if (!studentSubmission) {
                return { rank: -1, total: submissions.rows.length, score: null };
            }
            const studentScore = parseFloat(studentSubmission.score);
            const rank = 1;
            let prevScore = null;
            let currentRank = 1;
            let found = false;
            for (let i = 0; i < submissions.rows.length; i++) {
                const row = submissions.rows[i];
                const score = parseFloat(row.score);
                if (prevScore !== null && score !== prevScore) {
                    currentRank = i + 1;
                }
                if (row.student_id === studentId) {
                    found = true;
                    return {
                        rank: currentRank,
                        total: submissions.rows.length,
                        score: studentScore,
                    };
                }
                prevScore = score;
            }
            return { rank: -1, total: submissions.rows.length, score: null };
        }
        catch (error) {
            logger.error("Error calculating student rank:", error);
            return { rank: -1, total: 0, score: null };
        }
    }
    async regradeAllSubmissions(testId) {
        logger.info(`Starting regrading process for test ${testId}`);
        try {
            const test = await this.getTestById(testId);
            if (!test) {
                logger.error(`Regrading failed: test ${testId} not found.`);
                return;
            }
            const supported = new Set(["MCQ", "BUBBLE_SHEET", "PHYSICAL_SHEET"]);
            if (!supported.has(test.test_type)) {
                logger.error(`Regrading failed: test ${testId} type "${test.test_type}" is not supported.`);
                return;
            }
            if (!test.correct_answers) {
                logger.error(`Regrading skipped: test ${testId} has no correct_answers configured.`);
                return;
            }
            let parsedCorrect = test.correct_answers;
            if (typeof parsedCorrect === "string") {
                try {
                    parsedCorrect = JSON.parse(parsedCorrect);
                }
                catch (e) {
                    logger.error(`Regrading failed: invalid correct_answers JSON for test ${testId}.`, e);
                    return;
                }
            }
            const submissions = await this.getTestSubmissions(testId);
            if (!submissions || submissions.length === 0) {
                logger.info(`No submissions found for test ${testId}. Nothing to regrade.`);
                return;
            }
            let updatedCount = 0;
            for (const submission of submissions) {
                try {
                    let newScore = 0;
                    if (test.test_type === "MCQ") {
                        newScore = this.computeScoreWithManual({ ...test, correct_answers: parsedCorrect }, submission);
                    }
                    else {
                        newScore = this.calculateScore(submission.answers, parsedCorrect, test.test_type);
                    }
                    const oldScore = submission.score === null || submission.score === undefined
                        ? null
                        : Number(submission.score);
                    const needsUpdate = oldScore === null ||
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
                }
                catch (e) {
                    logger.error(`Failed to regrade submission ${submission.id} for test ${testId}:`, e);
                }
            }
            logger.info(`Successfully regraded test ${testId}. Updated ${updatedCount}/${submissions.length} submissions.`);
        }
        catch (error) {
            logger.error(`An error occurred during the regrading process for test ${testId}:`, error);
        }
    }
    async overrideGrade(submissionId, score, teacherComment) {
        const query = `
      UPDATE test_answers
      SET score = $1, teacher_comment = COALESCE($2, teacher_comment), graded = true, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `;
        const result = await database.query(query, [
            score,
            teacherComment,
            submissionId,
        ]);
        return this.normalizeSubmission(result.rows[0] || null);
    }
}
export default new TestService();
//# sourceMappingURL=testService.js.map