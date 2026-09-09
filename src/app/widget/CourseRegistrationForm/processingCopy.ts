/**
 * Copy for the "we are working on it" panel that replaces the form while a
 * request is in flight.
 *
 * Three moments can hold a parent for a while: saving the registration
 * (`register`), sending the card (`charge`, one round trip that also issues the
 * invoice and the WhatsApp confirmation on the server, so 5–10 seconds is
 * normal), and confirming a charge the gateway accepted but has not yet settled
 * (`verify`, polled for up to a minute). Each gets its own steps, and the step
 * list advances on elapsed time so the screen visibly moves even though the
 * server sends nothing until it is done.
 */
export type ProcessingPhase = 'register' | 'charge' | 'verify';

export interface ProcessingCopy {
  title: string;
  subtitle: string;
  steps: string[];
  /** Index of the step currently in progress; steps before it are done. */
  activeStep: number;
  /** Reassurance shown once a wait passes what a parent expects. Empty while fast. */
  slowNote: string;
}

/** Elapsed milliseconds after which each step becomes the active one. */
const STEP_STARTS_MS: Record<ProcessingPhase, number[]> = {
  register: [0, 2_500, 6_000],
  charge: [0, 3_000, 7_000],
  verify: [0, 0, 0],
};

const STEPS: Record<ProcessingPhase, string[]> = {
  register: [
    'שומרים את פרטי ההורה והילד',
    'מחשבים את המחיר וההנחות',
    'מכינים את התשלום',
  ],
  charge: [
    'שולחים את הכרטיס לחברת הסליקה',
    'ממתינים לאישור החיוב',
    'משלימים את ההרשמה ושולחים אישור',
  ],
  verify: [
    'הכרטיס התקבל אצל חברת הסליקה',
    'החיוב אושר',
    'מאמתים את האישור מולנו',
  ],
};

const TITLES: Record<ProcessingPhase, string> = {
  register: 'רושמים את הפרטים',
  charge: 'מבצעים את התשלום',
  verify: 'מאמתים את אישור התשלום',
};

const SUBTITLES: Record<ProcessingPhase, string> = {
  register: 'זה לוקח כמה שניות. אל תסגרו את הדף.',
  charge: 'הכרטיס נשלח לסליקה. אל תסגרו את הדף ואל תלחצו שוב.',
  verify: 'הכרטיס כבר נשלח. אל תשלמו שוב — ההרשמה תושלם ברגע שהאישור יגיע.',
};

export const SLOW_AFTER_MS = 10_000;
export const VERY_SLOW_AFTER_MS = 30_000;

export function processingCopy(phase: ProcessingPhase, elapsedMs: number): ProcessingCopy {
  const starts = STEP_STARTS_MS[phase];
  let activeStep = 0;
  for (let i = 0; i < starts.length; i += 1) {
    if (elapsedMs >= starts[i]) activeStep = i;
  }
  // While verifying, the first two steps are already behind us.
  if (phase === 'verify') activeStep = STEPS.verify.length - 1;

  let slowNote = '';
  if (elapsedMs >= VERY_SLOW_AFTER_MS) {
    slowNote = phase === 'register'
      ? 'עדיין עובדים על זה. אם המסך לא מתקדם עוד רגע, נציג הודעה ותוכלו לנסות שוב.'
      : 'עדיין ממתינים לחברת הסליקה. אם המסך לא מתקדם עוד רגע, נציג הודעה. בכל מקרה אל תשלמו שוב.';
  } else if (elapsedMs >= SLOW_AFTER_MS) {
    slowNote = 'לוקח קצת יותר זמן מהרגיל. זה בסדר — אל תסגרו את הדף.';
  }

  return {
    title: TITLES[phase],
    subtitle: SUBTITLES[phase],
    steps: STEPS[phase],
    activeStep,
    slowNote,
  };
}
