-- Drop existing foreign key constraints that reference tests.pdf_file_path
-- (if any exist)

-- Create test_images table
CREATE TABLE test_images (
    id SERIAL PRIMARY KEY,
    test_id INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
    image_path TEXT NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(test_id, image_path)
);

-- Create index for faster lookups
CREATE INDEX idx_test_images_test_id ON test_images(test_id);

-- Add trigger for updated_at
CREATE TRIGGER update_test_images_updated_at 
    BEFORE UPDATE ON test_images 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Migration to move data from pdf_file_path to test_images (if needed)
-- INSERT INTO test_images (test_id, image_path, display_order)
-- SELECT id, pdf_file_path, 0 
-- FROM tests 
-- WHERE pdf_file_path IS NOT NULL;

-- Drop the pdf_file_path column after migration
-- ALTER TABLE tests DROP COLUMN IF EXISTS pdf_file_path;
