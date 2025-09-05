import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';
import { promisify } from 'util';
import pdfService from '../services/pdfService';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const execAsync = promisify(exec);
const UPLOAD_DIR = path.join(__dirname, '../../uploads');
const CONVERTED_DIR = path.join(UPLOAD_DIR, 'converted');
const checkGhostscript = async () => {
    try {
        const { stdout, stderr } = await execAsync('gs --version');
        if (stderr) {
            console.warn('Ghostscript warning:', stderr);
        }
        const version = stdout.trim();
        console.log(`Ghostscript version: ${version}`);
        return { available: true, version };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Ghostscript check failed:', errorMessage);
        return {
            available: false,
            error: 'Ghostscript is required but not installed or not in PATH'
        };
    }
};
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024,
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
            return;
        }
        cb(new Error('Only PDF files are allowed'));
    },
});
export const uploadTestPdf = [
    upload.single('pdf'),
    async (req, res) => {
        const requestId = uuidv4();
        console.log(`[${requestId}] Starting PDF upload and processing`);
        try {
            const gsCheck = await checkGhostscript();
            if (!gsCheck.available) {
                console.error(`[${requestId}] Ghostscript not available:`, gsCheck.error);
                res.status(500).json({
                    error: 'PDF processing service unavailable',
                    details: gsCheck.error || 'Ghostscript is required for PDF processing'
                });
                return;
            }
            if (!req.file) {
                console.error(`[${requestId}] No file uploaded`);
                res.status(400).json({ error: 'No file uploaded' });
                return;
            }
            const testId = req.params.testId;
            if (!testId) {
                console.error(`[${requestId}] No test ID provided`);
                res.status(400).json({ error: 'Test ID is required' });
                return;
            }
            console.log(`[${requestId}] Processing PDF for test ${testId}, size: ${req.file.size} bytes`);
            const testDir = path.join(CONVERTED_DIR, testId);
            if (!fs.existsSync(testDir)) {
                fs.mkdirSync(testDir, { recursive: true });
                console.log(`[${requestId}] Created directory: ${testDir}`);
            }
            try {
                console.log(`[${requestId}] Saving PDF file`);
                const savedPdf = await pdfService.savePdf(req.file, testId);
                console.log(`[${requestId}] PDF saved: ${savedPdf.fileName}`);
                console.log(`[${requestId}] Starting PDF to image conversion`);
                const imageUrls = await pdfService.convertPdfToImages(req.file.buffer, testId);
                console.log(`[${requestId}] Converted PDF to ${imageUrls.length} pages`);
                if (imageUrls.length === 0) {
                    throw new Error('No pages were converted from the PDF');
                }
                res.status(200).json({
                    message: 'PDF uploaded and processed successfully',
                    testId,
                    pageCount: imageUrls.length,
                    imageUrls,
                    ghostscriptVersion: gsCheck.version
                });
                console.log(`[${requestId}] Request completed successfully`);
            }
            catch (error) {
                try {
                    if (fs.existsSync(testDir)) {
                        console.log(`[${requestId}] Cleaning up after failed conversion`);
                        fs.rmSync(testDir, { recursive: true, force: true });
                    }
                }
                catch (cleanupError) {
                    console.error(`[${requestId}] Error during cleanup:`, cleanupError);
                }
                throw error;
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`[${requestId}] Error processing PDF:`, error);
            res.status(500).json({
                error: 'Failed to process PDF',
                details: errorMessage,
                requestId
            });
        }
    },
];
export const getTestPage = async (req, res) => {
    const requestId = uuidv4();
    const { testId, pageNumber } = req.params;
    if (!testId || !pageNumber) {
        const error = {
            error: 'Missing required parameters',
            details: 'Test ID and page number are required',
            requestId
        };
        console.error(`[${requestId}] ${error.details}`);
        res.status(400).json(error);
        return;
    }
    console.log(`[${requestId}] Request for test ${testId}, page ${pageNumber}`);
    try {
        const pageNum = parseInt(pageNumber, 10);
        if (isNaN(pageNum) || pageNum < 1) {
            const error = {
                error: 'Invalid page number',
                details: `Page number must be a positive integer, got: ${pageNumber}`,
                requestId
            };
            console.error(`[${requestId}] ${error.details}`);
            res.status(400).json(error);
            return;
        }
        const testDir = path.join(CONVERTED_DIR, testId);
        const possiblePaths = [
            path.join(testDir, `page_${pageNum}.jpg`),
            path.join(testDir, `${pageNum}.jpg`),
            path.join(testDir, `page_${pageNum}.jpeg`),
            path.join(testDir, `${pageNum}.jpeg`),
            path.join(testDir, `page_${pageNum}.png`),
            path.join(testDir, `${pageNum}.png`)
        ];
        const pagePath = possiblePaths.find(p => fs.existsSync(p));
        if (!fs.existsSync(testDir)) {
            const error = {
                error: 'Test not found',
                details: `No test found with ID: ${testId}`,
                requestId
            };
            console.error(`[${requestId}] ${error.details}`);
            res.status(404).json(error);
            return;
        }
        if (!pagePath) {
            const files = fs.readdirSync(testDir);
            const imageFiles = files.filter(file => /^(page_)?\d+\.(jpg|jpeg|png)$/i.test(file));
            console.error(`[${requestId}] Page ${pageNum} not found in ${testId}`);
            console.error(`[${requestId}] Available pages:`, imageFiles);
            const availablePages = imageFiles.map(file => {
                const match = file.match(/^(?:page_)?(\d+)\./i);
                return match ? match[1] : file;
            });
            res.status(404).json({
                error: 'Page not found',
                details: `Page ${pageNum} not found in test ${testId}`,
                availablePages,
                requestId
            });
            return;
        }
        console.log(`[${requestId}] Serving page: ${pagePath}`);
        const ext = path.extname(pagePath).toLowerCase();
        const contentType = ext === '.png' ? 'image/png' :
            (ext === '.jpeg' || ext === '.jpg') ? 'image/jpeg' :
                'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=31536000');
        res.setHeader('Expires', new Date(Date.now() + 31536000000).toUTCString());
        const stream = fs.createReadStream(pagePath);
        stream.on('error', (error) => {
            console.error(`[${requestId}] Error reading file ${pagePath}:`, error);
            if (!res.headersSent) {
                res.status(500).json({
                    error: 'Error reading page',
                    details: 'Failed to read the requested page',
                    requestId
                });
            }
        });
        stream.pipe(res);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[${requestId}] Error serving page:`, error);
        if (!res.headersSent) {
            res.status(500).json({
                error: 'Failed to serve page',
                details: errorMessage,
                requestId
            });
        }
    }
};
export const getTestPageCount = async (req, res) => {
    const requestId = uuidv4();
    const { testId } = req.params;
    if (!testId) {
        const error = {
            error: 'Missing required parameter',
            details: 'Test ID is required',
            requestId
        };
        console.error(`[${requestId}] ${error.details}`);
        res.status(400).json(error);
        return;
    }
    console.log(`[${requestId}] Request for page count of test ${testId}`);
    try {
        const testDir = path.join(CONVERTED_DIR, testId);
        if (!fs.existsSync(testDir)) {
            const error = {
                error: 'Test not found',
                details: `No test found with ID: ${testId}`,
                requestId
            };
            console.error(`[${requestId}] ${error.details}`);
            res.status(404).json(error);
            return;
        }
        const files = fs.readdirSync(testDir);
        const pageFiles = files.filter(file => /^(?:page_)?\d+\.(jpg|jpeg|png)$/i.test(file)).sort((a, b) => {
            const getPageNum = (f) => {
                const match = f.match(/^(?:page_)?(\d+)\./i);
                return match && match[1] ? parseInt(match[1], 10) : 0;
            };
            return getPageNum(a) - getPageNum(b);
        });
        const pageCount = pageFiles.length;
        console.log(`[${requestId}] Found ${pageCount} pages for test ${testId}`);
        if (pageCount === 0) {
            console.warn(`[${requestId}] No page images found in ${testDir}`);
            console.warn(`[${requestId}] All files in directory:`, files);
            res.status(404).json({
                error: 'No pages found',
                details: 'This test exists but contains no page images',
                testId,
                requestId,
                filesInDirectory: files
            });
            return;
        }
        const pages = pageFiles.map(file => {
            const match = file.match(/^(?:page_)?(\d+)\./i);
            return match ? match[1] : file.replace(/\.[^/.]+$/, '');
        });
        res.json({
            testId,
            pageCount,
            pages,
            requestId
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[${requestId}] Error getting page count:`, error);
        res.status(500).json({
            error: 'Failed to get page count',
            details: errorMessage,
            testId,
            requestId
        });
    }
};
//# sourceMappingURL=pdfController.js.map