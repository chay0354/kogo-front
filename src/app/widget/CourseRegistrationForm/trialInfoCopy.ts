/**
 * "What is worth knowing about the trial lesson" — the short explanation a
 * parent can open where they approve a trial registration. The words are the
 * owner's own (2.10.2026).
 */
export const TRIAL_INFO_LABEL = 'מה חשוב לדעת על שיעור הניסיון';

const ONE_TIME = 'שיעור הניסיון חד־פעמי לכל ילד. אישור ותזכורת יישלחו בוואטסאפ.';
const DETAILS_KEPT =
  'הפרטים נשמרים אצלנו, ובמקרה שתרצו להירשם לחוג נזהה אתכם לפי תעודת זהות וטלפון ונמלא אותם עבורכם.';
const PAID_IS_CREDITED = 'עלות שיעור ניסיון בתשלום תקוזז מהתשלום הראשון.';

/** The lines of the explanation. The last one is said only of a trial that costs money. */
export function trialInfoLines(paid: boolean): string[] {
  return paid ? [ONE_TIME, DETAILS_KEPT, PAID_IS_CREDITED] : [ONE_TIME, DETAILS_KEPT];
}

/** A press on the line opens the explanation and closes it; a press anywhere else closes it. */
export function trialInfoOpenAfter(open: boolean, press: 'line' | 'elsewhere'): boolean {
  return press === 'line' ? !open : false;
}
