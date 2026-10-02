'use client';

import look from './newLook.module.css';
import { lessonLineParts, lessonNameForCard, lessonNameSize } from './formHeading';

interface Props {
  /** The class as the office named it. */
  name: string;
  /** When it meets and where — "יום שני · 16:45-17:30 · פתח תקווה". Empty when there is no single day to show. */
  line: string;
}

const NAME_SIZE = {
  regular: '',
  long: look.lessonHeadLong,
  veryLong: look.lessonHeadVeryLong,
} as const;

/**
 * The class the form was opened for, at the head of every details form: its
 * name, and the day, the hours and the place in small tags under it. One card
 * in the look of the trial summary's head, so the two read as one family.
 */
export default function LessonHead({ name, line }: Props) {
  const facts = lessonLineParts(line);
  return (
    <div className={`${look.lessonHead} ${NAME_SIZE[lessonNameSize(name)]}`}>
      <span className={look.lessonHeadIcon} aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
          <path d="M3.5 10h17M8 3v4M16 3v4" />
        </svg>
      </span>
      <div className={look.lessonHeadText}>
        <b>{lessonNameForCard(name)}</b>
        {facts.length > 0 ? (
          <div className={look.lessonHeadFacts}>
            {facts.map((fact) => (
              // Hours read left to right, also inside a Hebrew line.
              <span key={fact} dir={/^\d/.test(fact) ? 'ltr' : undefined}>{fact}</span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
