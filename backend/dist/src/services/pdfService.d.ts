declare const _default: {
    convertPdfToImages: (pdfBuffer: Buffer, testId: string) => Promise<string[]>;
    savePdf: (file: Express.Multer.File, testId: string) => Promise<{
        originalName: string;
        fileName: string;
        filePath: string;
        mimeType: string;
        size: number;
    }>;
    getImagePath: (testId: string, pageNumber: number) => string | null;
};
export default _default;
//# sourceMappingURL=pdfService.d.ts.map