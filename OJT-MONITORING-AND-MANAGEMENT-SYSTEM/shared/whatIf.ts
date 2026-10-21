export interface CompletionScenario {
  completedHours: number;
  requiredHours: number;
  plannedWeeklyHours: number;
  missedWeeks: number;
  asOfDate: string;
}

export type CompletionScenarioResult =
  | { ok: true; weeksToCompletion: number; projectedFinishDate: string | null; remainingHours: number }
  | { ok: false; message: string };

/** Estimates a completion date from verified hours and a hypothetical weekly pace; it never persists data. */
export function simulateCompletion(input: CompletionScenario): CompletionScenarioResult {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(input.asOfDate) ? new Date(`${input.asOfDate}T00:00:00.000Z`) : null;
  if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== input.asOfDate)
    return { ok: false, message: 'Choose a valid scenario start date.' };
  if (!Number.isFinite(input.completedHours) || input.completedHours < 0 ||
      !Number.isFinite(input.requiredHours) || input.requiredHours <= 0 ||
      !Number.isFinite(input.plannedWeeklyHours) || input.plannedWeeklyHours <= 0 || input.plannedWeeklyHours > 40 ||
      !Number.isInteger(input.missedWeeks) || input.missedWeeks < 0 || input.missedWeeks > 52)
    return { ok: false, message: 'Use valid hours, a weekly pace from 0 to 40, and 0 to 52 missed weeks.' };
  const remainingHours = Math.max(0, input.requiredHours - input.completedHours);
  const weeksToCompletion = remainingHours === 0 ? 0 : Math.ceil(remainingHours / input.plannedWeeklyHours) + input.missedWeeks;
  if (remainingHours === 0) return { ok: true, weeksToCompletion: 0, projectedFinishDate: input.asOfDate, remainingHours };
  date.setUTCDate(date.getUTCDate() + weeksToCompletion * 7);
  return { ok: true, weeksToCompletion, projectedFinishDate: date.toISOString().slice(0, 10), remainingHours };
}
