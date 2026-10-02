'use client';

import look from './newLook.module.css';
import { lessonLineParts, lessonNameForCard, lessonNameSize } from './formHeading';

interface SelectedLessonCardProps {
  /** Which of the child's classes this is — "חוג 2" — or "החוג שנבחר" when it is the only one. */
  caption: string;
  /** The class as the office named it. */
  name: string;
  /** When it meets and where — "יום ראשון · 18:00-18:45 · כפר סבא". */
  line: string;
  /** It was chosen a moment ago: it lands, with a gold ring. */
  landed?: boolean;
  /** The list under it is open to choose what takes its place. */
  replacing?: boolean;
  onChange?: () => void;
  onRemove?: () => void;
}

const NAME_SIZE = {
  regular: '',
  long: look.pickedLessonLong,
  veryLong: look.pickedLessonVeryLong,
} as const;

/**
 * One class of one child, as a card: the small brother of the card at the top
 * of the form — the same navy, the same gold tile, the day, the hours and the
 * place in the same tags — with its number, and with what can be done to it.
 */
export default function SelectedLessonCard({
  caption,
  name,
  line,
  landed = false,
  replacing = false,
  onChange,
  onRemove,
}: SelectedLessonCardProps) {
  const facts = lessonLineParts(line);
  const className = [
    look.pickedLesson,
    NAME_SIZE[lessonNameSize(name)],
    landed ? look.pickedLessonLanded : '',
    replacing ? look.pickedLessonReplacing : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={className}>
      <span className={look.pickedLessonIcon} aria-hidden="true">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
          <path d="M3.5 10h17M8 3v4M16 3v4" />
        </svg>
      </span>
      <div className={look.pickedLessonText}>
        <div className={look.pickedLessonTop}>
          <span className={look.pickedLessonCaption}>{replacing ? 'מחליפים את החוג הזה' : caption}</span>
          {!replacing && (onChange || onRemove) ? (
            <span className={look.pickedLessonActions}>
              {onChange ? (
                <button type="button" onClick={onChange} aria-label={`החלפת ${name}`}>החלפה</button>
              ) : null}
              {onRemove ? (
                <button type="button" className={look.pickedLessonRemove} onClick={onRemove} aria-label={`הסרת ${name}`}>
                  הסרה
                </button>
              ) : null}
            </span>
          ) : null}
        </div>
        <b>{lessonNameForCard(name)}</b>
        {facts.length > 0 ? (
          <div className={look.pickedLessonFacts}>
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
