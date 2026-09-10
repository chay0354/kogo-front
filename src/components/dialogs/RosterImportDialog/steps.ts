/**
 * The three stages of bringing a municipality sheet in.
 *
 * Kept beside the dialog rather than inside it so the stepper has one source of
 * truth about what comes after what, and so a step's status is decided by
 * position rather than by a chain of booleans.
 */

export type StepId = 'upload' | 'reading' | 'review' | 'done';

export interface StepDefinition {
  id: StepId;
  label: string;
}

export const STEPS: StepDefinition[] = [
  { id: 'upload', label: 'העלאה' },
  { id: 'reading', label: 'קריאה' },
  { id: 'review', label: 'בדיקה ואישור' },
];

export type StepState = 'completed' | 'active' | 'pending';

export function stepStatus(step: StepId, current: StepId): StepState {
  // 'done' is not a step in the bar; once applied every step is behind us.
  if (current === 'done') return 'completed';
  const order = STEPS.map((definition) => definition.id);
  const here = order.indexOf(step);
  const now = order.indexOf(current);
  if (here < now) return 'completed';
  return here === now ? 'active' : 'pending';
}
