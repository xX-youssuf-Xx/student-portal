-- Add manual per-question grading storage to test_answers
ALTER TABLE test_answers
  ADD COLUMN IF NOT EXISTS manual_grades JSONB NULL;
