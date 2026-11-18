import { getWebBff, postWebBff } from '../lib/webBff';
import type { HteRatings } from '@ojt/shared';

export interface HteEvaluationState {
  /** True once the student's Required Hours are complete. */
  unlocked: boolean;
  completedHours: number;
  requiredHours: number;
  student: { name: string; program: string };
  placement: { companyName: string; branchName: string; startDate: string; endDate: string | null } | null;
  submitted: {
    department_assigned: string;
    field_of_training: string;
    ratings: HteRatings;
    total_score: number;
    comments: string | null;
    submitted_at: string;
  } | null;
}

export interface HteEvaluationInput {
  department_assigned: string;
  field_of_training: string;
  ratings: HteRatings;
  comments: string;
  certified: boolean;
}

export const getHteEvaluation = () => getWebBff<HteEvaluationState>('/api/mobile/hte-evaluation');
export const submitHteEvaluation = (input: HteEvaluationInput) => postWebBff<null>('/api/mobile/hte-evaluation', input);
