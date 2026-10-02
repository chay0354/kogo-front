/**
 * "Worth knowing" — the short explanation a parent can open where they
 * approve a trial registration. One short line for each fact; the words are
 * the owner's own (2.10.2026).
 */
export const TRIAL_INFO_LABEL = 'חשוב לדעת';

const ONE_PER_CHILD = 'שיעור ניסיון אחד לכל ילד.';
const SENT_ON_WHATSAPP = 'אישור ותזכורת יישלחו בוואטסאפ.';
const KNOWN_NEXT_TIME = 'בהרשמה לחוג נזהה אתכם לפי ת.ז. וטלפון ונמלא את הפרטים.';
const PAID_IS_CREDITED = 'עלות שיעור הניסיון תקוזז מהתשלום הראשון.';

/** The lines of the explanation. The last one is said only of a trial that costs money. */
export function trialInfoLines(paid: boolean): string[] {
  const lines = [ONE_PER_CHILD, SENT_ON_WHATSAPP, KNOWN_NEXT_TIME];
  return paid ? [...lines, PAID_IS_CREDITED] : lines;
}

/** A press on the words opens the explanation and closes it; a press anywhere else closes it. */
export function trialInfoOpenAfter(open: boolean, press: 'line' | 'elsewhere'): boolean {
  return press === 'line' ? !open : false;
}

/**
 * Where the explanation's little arrow sits, in pixels from its right edge, so
 * that it points at the words that opened it wherever they stand in the line.
 * Kept inside the box's rounded corners.
 */
export function trialInfoArrow(popRight: number, popWidth: number, wordsLeft: number, wordsWidth: number): number {
  const wanted = popRight - (wordsLeft + wordsWidth / 2) - 6;
  return Math.round(Math.max(14, Math.min(wanted, popWidth - 26)));
}
