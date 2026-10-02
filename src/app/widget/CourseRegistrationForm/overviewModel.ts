/**
 * "In this registration" — what the form holds, for the short list above
 * "continue": a line for each child, with the child's classes. Display only;
 * what is sent to the server is built elsewhere (registrationPlan.ts).
 */
import { lessonLineParts, lessonNameForCard } from './formHeading';

export interface OverviewKid {
  /** 'primary', or the id of a child added in the form. */
  key: string;
  /** The first name, or what stands for it until there is one ("ילד/ה 2"). */
  name: string;
  /** In the round mark beside the name: the name's first letter, or the child's number until there is a name. */
  mark: string;
  /** A short tag for each class: its name and its day. */
  lessons: string[];
  /** What is still missing: a class, or details. Empty when nothing is. */
  missing: '' | 'lesson' | 'details';
}

/** A class as a short tag: "קפוארה ג׳–ד׳ · יום שלישי". The hours and the place are on the class's own card. */
export function lessonTag(name: string, line: string): string {
  const day = lessonLineParts(line).find((part) => !/^\d/.test(part) && /^(יום|ימי)\s/.test(part));
  return [lessonNameForCard(name), day].filter(Boolean).join(' · ');
}

/** The list is worth showing once the form holds more than one thing. */
export function overviewIsShown(kids: OverviewKid[]): boolean {
  return kids.length > 1 || (kids[0]?.lessons.length ?? 0) > 1;
}

/** "2 ילדים · 3 חוגים" — and for one child, the classes alone. */
export function overviewCount(kids: OverviewKid[]): string {
  const lessons = kids.reduce((sum, kid) => sum + kid.lessons.length, 0);
  const lessonsText = lessons === 1 ? 'חוג אחד' : `${lessons} חוגים`;
  if (kids.length < 2) return lessonsText;
  return `${kids.length} ילדים · ${lessonsText}`;
}

/** The words of the soft mark on a line that is not complete yet. */
export function missingLabel(missing: OverviewKid['missing']): string {
  if (missing === 'lesson') return 'חסר חוג';
  if (missing === 'details') return 'חסרים פרטים';
  return '';
}

/** The round mark of a child: the first letter of the name, or the child's number until there is one. */
export function kidMark(number: number, firstName: string): string {
  const name = firstName.trim();
  return name ? name.slice(0, 1) : String(number);
}
