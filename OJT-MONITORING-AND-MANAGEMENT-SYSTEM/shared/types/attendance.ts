export interface DbWorkSchedule {
  schedule_id: string;
  company_id: string;
  day_of_week: number;
  time_in_start: string;
  time_in_cutoff: string;
  time_out: string;
  created_at: string;
}
