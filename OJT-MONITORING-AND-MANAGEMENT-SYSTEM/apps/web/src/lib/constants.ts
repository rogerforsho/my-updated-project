/**
 * Shared Application Constants
 * Safe for both Client and Server Component execution.
 */

export const STANDARD_REPORT_TYPES = [
  { id: 'orientation_certificate', name: 'Pre-OJT Orientation Certificate' },
  { id: 'endorsement_letter', name: 'Endorsement Letter' },
  { id: 'weekly_journal', name: 'Weekly Accomplishment Journal' },
  { id: 'midterm_report', name: 'Midterm Progress Summary' },
  { id: 'final_report', name: 'Final Narrative Portfolio & Certificate' },
] as const;

export type StandardReportTypeId = (typeof STANDARD_REPORT_TYPES)[number]['id'];
