/** Evaluation of Host Training Establishment (HTE): the ICS form a student fills in after the OJT. */
export interface HteCriterion {
  id: string;
  text: string;
  /** Max rating from the form, in percent. All weights add up to 100. */
  weight: number;
}

export interface HteSection {
  id: 'A' | 'B' | 'C' | 'D';
  title: string;
  criteria: HteCriterion[];
}

export const HTE_RATING_MIN = 1;
export const HTE_RATING_MAX = 5;
export const HTE_COMMENTS_MAX = 3000;

export const HTE_EVALUATION_SECTIONS: HteSection[] = [
  { id: 'A', title: 'Supervision and Guidance', criteria: [
    { id: 'A1', text: 'The supervisor provided clear instructions and guidance.', weight: 10 },
    { id: 'A2', text: 'The supervisor was approachable and supportive.', weight: 10 },
    { id: 'A3', text: 'Feedback and evaluations were given regularly.', weight: 10 },
  ] },
  { id: 'B', title: 'Learning Experience', criteria: [
    { id: 'B1', text: 'The tasks assigned were related to my course/program.', weight: 10 },
    { id: 'B2', text: 'I was given opportunities to apply what I learned in school.', weight: 10 },
    { id: 'B3', text: 'I gained new knowledge and skills from this training.', weight: 10 },
  ] },
  { id: 'C', title: 'Work Environment', criteria: [
    { id: 'C1', text: 'The workplace was safe and conducive for learning.', weight: 10 },
    { id: 'C2', text: 'The staff and employees were respectful and professional.', weight: 10 },
    { id: 'C3', text: 'The tools and resources were sufficient for the tasks.', weight: 10 },
  ] },
  { id: 'D', title: 'Overall Satisfaction', criteria: [
    { id: 'D1', text: 'The OJT met my expectations.', weight: 5 },
    { id: 'D2', text: 'I would recommend this company for future OJT students.', weight: 5 },
  ] },
];

const ALL_CRITERIA = HTE_EVALUATION_SECTIONS.flatMap(section => section.criteria);

export type HteRatings = Record<string, number>;

/** True only when every criterion has a whole rating from 1 to 5 and nothing else is present. */
export function isValidHteRatings(value: unknown): value is HteRatings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length === ALL_CRITERIA.length && ALL_CRITERIA.every(({ id }) => {
    const rating = (value as Record<string, unknown>)[id];
    return Number.isInteger(rating) && (rating as number) >= HTE_RATING_MIN && (rating as number) <= HTE_RATING_MAX;
  });
}

/** Points out of 100: each criterion contributes weight × rating / 5. Missing ratings count as 0. */
export function scoreHteEvaluation(ratings: Partial<HteRatings>): number {
  const points = ALL_CRITERIA.reduce((sum, { id, weight }) => sum + (weight * (ratings[id] ?? 0)) / HTE_RATING_MAX, 0);
  return Math.round(points * 100) / 100;
}

/** Share of a section's maximum points, 0 to 100. */
export function scoreHteSection(ratings: Partial<HteRatings>, sectionId: HteSection['id']): number {
  const section = HTE_EVALUATION_SECTIONS.find(s => s.id === sectionId);
  if (!section) return 0;
  const max = section.criteria.reduce((sum, c) => sum + c.weight, 0);
  const points = section.criteria.reduce((sum, { id, weight }) => sum + (weight * (ratings[id] ?? 0)) / HTE_RATING_MAX, 0);
  return Math.round((points / max) * 10000) / 100;
}
