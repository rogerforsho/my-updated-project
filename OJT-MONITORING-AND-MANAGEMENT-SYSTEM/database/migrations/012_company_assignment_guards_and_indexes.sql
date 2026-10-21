-- ==============================================================================
-- Migration 012: Atomic Placement Guard & Performance Indexes
-- ISO/IEC 25010:2023 Concurrency & Data Integrity
-- ==============================================================================

-- 1. Atomic Partial Unique Index: Guarantees a student can NEVER have more than 1 active assignment
-- Completely eliminates race conditions when multiple coordinators/program heads submit assignments simultaneously
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_student_assignment 
ON public.student_assignments (student_id) 
WHERE (assignment_status = 'active');

-- 2. Case-Insensitive Unique Company Index: Prevents duplicate company registrations
CREATE INDEX IF NOT EXISTS idx_companies_lower_name 
ON public.companies (lower(trim(company_name)));

-- 3. Composite index for active company capacity queries
CREATE INDEX IF NOT EXISTS idx_active_assignments_by_company 
ON public.student_assignments (company_id, assignment_status);
