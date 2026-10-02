'use client';

import look from './newLook.module.css';
import { missingLabel, overviewCount, overviewIsShown, type OverviewKid } from './overviewModel';

interface Props {
  kids: OverviewKid[];
  /** A line was pressed: the page goes to that child. */
  onGo: (key: string) => void;
}

/**
 * "In this registration": one glance at everything the form holds before
 * "continue" — each child with their classes, and a soft mark on what is not
 * complete yet. No prices; those are on the summary screen.
 */
export default function RegistrationOverview({ kids, onGo }: Props) {
  if (!overviewIsShown(kids)) return null;
  return (
    <div className={look.inForm} aria-label="בהרשמה הזאת">
      <div className={look.inFormHead}>
        <b>בהרשמה הזאת</b>
        <span>{overviewCount(kids)}</span>
      </div>
      <div className={look.inFormRows}>
        {kids.map((kid) => (
          <button key={kid.key} type="button" className={look.inFormRow} onClick={() => onGo(kid.key)}>
            <span className={look.inFormAvatar} aria-hidden="true">{kid.mark}</span>
            <span className={look.inFormText}>
              <span className={look.inFormName}>
                <b>{kid.name}</b>
                {kid.missing === 'details' ? <i>{missingLabel(kid.missing)}</i> : null}
              </span>
              <span className={look.inFormTags}>
                {kid.lessons.map((lesson, lessonIndex) => (
                  <span key={`${lesson}-${lessonIndex}`}>{lesson}</span>
                ))}
                {kid.missing === 'lesson' ? <i>{missingLabel(kid.missing)}</i> : null}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
