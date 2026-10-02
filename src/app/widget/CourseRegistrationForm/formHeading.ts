/**
 * The top of the registration form, written once.
 *
 * Beside "back" stand a few words that say what the parent is doing — never
 * which class. A class name is the office's own wording and can be long
 * ("קפוארה 3-4.5 בוי יום שני"); beside the button it broke into two crooked
 * lines. The class has a card of its own under the title, where a long name
 * has room: it is set a size smaller, and wraps as a whole.
 */
export function formTitle(isTrial: boolean): string {
  return isTrial ? 'הרשמה לשיעור ניסיון' : 'הרשמה לחוג';
}

export type LessonNameSize = 'regular' | 'long' | 'veryLong';

/** How large a class name is set in its card: the longer the name, the smaller. */
export function lessonNameSize(name: string): LessonNameSize {
  const length = name.trim().length;
  if (length > 44) return 'veryLong';
  if (length > 26) return 'long';
  return 'regular';
}

/**
 * The line under the class name. A trial that can be taken on more than one
 * of the class's days has no single day and hour to show, so only the name stands.
 */
export function lessonCardLine(line: string, isTrial: boolean, trialLessonCount: number): string {
  if (isTrial && trialLessonCount !== 1) return '';
  return line.trim();
}

/**
 * A class name as it is written in a card. A browser may break a line after a
 * dash, which split "ג׳–ד׳" across two lines; a dash between two characters is
 * tied to what follows it, so a name breaks between words only.
 */
export function lessonNameForCard(name: string): string {
  return name.trim().replace(/(\S)([-–—])(?=\S)/g, '$1$2\u2060');
}

/**
 * The line under a class name — "יום שני · 16:45-17:30 · פתח תקווה" — as the
 * separate facts it is made of, each to stand in a small tag of its own.
 */
export function lessonLineParts(line: string): string[] {
  return line.split('·').map((part) => part.trim()).filter(Boolean);
}

/**
 * The line of a class chosen inside the form, in the words of the card at the
 * top: "ראשון · 18:00-18:45" and the city it was found under become
 * "יום ראשון · 18:00-18:45 · כפר סבא". A track of two days reads "ימי".
 */
export function pickedLessonLine(schedule: string, place?: string | null): string {
  const text = schedule.trim();
  const days = text.split('·')[0] ?? '';
  const when = text ? `${days.includes('/') ? 'ימי' : 'יום'} ${text}` : '';
  return [when, (place || '').trim()].filter(Boolean).join(' · ');
}

/** What a child added in the form is called: the first name once there is one, "ילד/ה 2" until then. */
export function childTitle(number: number, firstName: string): string {
  return firstName.trim() || `ילד/ה ${number}`;
}
