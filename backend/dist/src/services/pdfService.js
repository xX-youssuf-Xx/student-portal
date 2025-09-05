import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { fromBuffer } from 'pdf2pic';
import sharp from 'sharp';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const UPLOAD_DIR = path.join(__dirname, '../../uploads');
const CONVERTED_DIR = path.join(UPLOAD_DIR, 'converted');
const ensureDirectories = () => {
    if (!fs.existsSync(UPLOAD_DIR)) {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
    if (!fs.existsSync(CONVERTED_DIR)) {
        fs.mkdirSync(CONVERTED_DIR, { recursive: true });
    }
};
const convertPdfToImages = async (pdfBuffer, testId) => {
    const requestId = uuidv4();
    console.log(`[${requestId}] Starting PDF to image conversion for test ${testId}`);
    ensureDirectories();
    const testDir = path.join(CONVERTED_DIR, testId);
    if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
    }
    const tempPdfPath = path.join(testDir, 'temp.pdf');
    try {
        await fs.promises.writeFile(tempPdfPath, pdfBuffer);
        console.log(`[${requestId}] Temporary PDF saved to ${tempPdfPath}`);
    }
    catch (error) {
        console.error(`[${requestId}] Error saving temporary PDF:`, error);
        throw new Error('Failed to save PDF file');
    }
    const images = [];
    try {
        const options = {
            density: 150,
            saveFilename: 'page',
            savePath: testDir,
            format: 'jpg',
            width: 1000,
            height: 1414,
            quality: 90
        };
        const convert = fromBuffer(pdfBuffer, options);
        const pageCount = await convert(1, { responseType: 'image' })
            .then(() => 1)
            .catch(() => 0);
        if (pageCount === 0) {
            throw new Error('Failed to convert any pages');
        }
        const pages = await convert.bulk(-1, { responseType: 'image' });
        for (let i = 0; i < pages.length; i++) {
            const page = pages[i];
            if (!page || !page.path)
                continue;
            const outputPath = path.join(testDir, `page_${i + 1}.jpg`);
            try {
                await sharp(page.path)
                    .jpeg({ quality: 90 })
                    .resize(1000, 1414, {
                    fit: 'inside',
                    withoutEnlargement: true
                })
                    .toFile(outputPath);
                await fs.promises.unlink(page.path);
                images.push(`/api/tests/${testId}/pages/${i + 1}`);
                console.log(`[${requestId}] Page ${i + 1} processed`);
            }
            catch (error) {
                console.error(`[${requestId}] Error processing page ${i + 1}:`, error);
            }
        }
        if (images.length === 0) {
            throw new Error('Failed to convert any pages');
        }
        console.log(`[${requestId}] Successfully converted ${images.length} pages`);
        return images;
    }
    catch (error) {
        console.error(`[${requestId}] Error in PDF conversion:`, error);
        throw new Error(`Failed to convert PDF to images: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    finally {
        try {
            if (fs.existsSync(tempPdfPath)) {
                await fs.promises.unlink(tempPdfPath);
                console.log(`[${requestId}] Cleaned up temporary PDF`);
            }
        }
        catch (cleanupError) {
            console.error(`[${requestId}] Error cleaning up temporary file:`, cleanupError);
        }
    }
};
const savePdf = async (file, testId) => {
    ensureDirectories();
    const testDir = path.join(UPLOAD_DIR, testId);
    if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
    }
    const filename = `test_${testId}.pdf`;
    const filePath = path.join(testDir, filename);
    await fs.promises.writeFile(filePath, file.buffer);
    return {
        originalName: file.originalname,
        fileName: filename,
        filePath: filePath,
        mimeType: file.mimetype,
        size: file.size
    };
};
const getImagePath = (testId, pageNumber) => {
    const imagePath = path.join(CONVERTED_DIR, testId, `page_${pageNumber}.jpg`);
    return fs.existsSync(imagePath) ? imagePath : null;
};
export default {
    convertPdfToImages,
    savePdf,
    getImagePath
};
//# sourceMappingURL=pdfService.js.map