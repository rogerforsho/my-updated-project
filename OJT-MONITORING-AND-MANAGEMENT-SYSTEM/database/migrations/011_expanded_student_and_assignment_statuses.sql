-- ==============================================================================
-- Migration 011: Expanded Trainee & Placement Statuses
-- Colegio de Montalban OJT System (ICS & IBE Practicum)
-- ==============================================================================

-- 1. Ensure students.status supports granular academic lifecycle
-- Allowed: 'active', 'completed', 'dropped', 'failed', 'withdrawn'
COMMENT ON COLUMN public.students.status IS 'Academic status: active, completed, dropped, failed, withdrawn';

-- 2. Ensure student_assignments.assignment_status supports lifecycle & reassignment
-- Allowed: 'active', 'completed', 'terminated', 'reassigned'
COMMENT ON COLUMN public.student_assignments.assignment_status IS 'Placement status: active, completed, terminated, reassigned';

-- 3. Trigger index optimizations for quick filtering by Coordinator & Program Head
CREATE INDEX IF NOT EXISTS idx_students_status ON public.students(status);
CREATE INDEX IF NOT EXISTS idx_assignments_status ON public.student_assignments(assignment_status);
