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
 *
 * A paid trial is the exception and uses `trial_charge` throughout, including
 * across the charge → verify hand-off. It is one small payment, not a
 * subscription being set up, so it gets one unchanging state with no step list:
 * the same ring and bar, and the single line "מעבד פרטי תשלום". Narrating three
 * stages of work a parent is not buying makes a short wait feel like a long
 * procedure, and a title that changes mid-wait reads as something going wrong.
 */
export type ProcessingPhase = 'register' | 'charge' | 'verify' | 'trial_charge';

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
  trial_charge: [],
};

const STEPS: Record<ProcessingPhase, string[]> = {
  // Deliberately none. A trial is a single small payment, over in a moment —
  // a three-step list narrating a subscription's work makes a short wait feel
  // like a long procedure, and the steps would be describing something the
  // parent is not buying.
  trial_charge: [],
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
  trial_charge: 'מעבד פרטי תשלום',
  register: 'רושמים את הפרטים',
  charge: 'מבצעים את התשלום',
  verify: 'מאמתים את אישור התשלום',
};

const SUBTITLES: Record<ProcessingPhase, string> = {
  // Kept to one line. The warning itself stays: a parent who closes the page or
  // presses again mid-charge can be charged twice, and that is true of a trial
  // exactly as it is of a subscription.
  trial_charge: 'אל תסגרו את הדף ואל תלחצו שוב.',
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
