-- Add columns for split visibility and test grouping
-- 1) show_grade_outside: whether students can see percentage from outside (without full details)
-- 2) test_group: nullable integer to group tests for combined ranking/export

ALTER TABLE tests
  ADD COLUMN IF NOT EXISTS show_grade_outside BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS test_group INTEGER NULL;

-- Backfill logic (optional): if view_type is IMMEDIATE or view_permission true, enable show_grade_outside
-- This keeps behavior consistent for existing data
UPDATE tests
SET show_grade_outside = TRUE
WHERE view_type = 'IMMEDIATE' OR view_permission = TRUE;


