'use client';

import { useEffect, useState } from 'react';
import look from './newLook.module.css';
import { fetchTrialCalendarLinks, type TrialCalendarLinks } from './trialCalendar';

interface Props {
  lessonId: string;
  /** The day of the trial, YYYY-MM-DD. */
  date: string;
}

/**
 * Under a booked trial lesson: one button, "add to calendar", that opens into
 * two — Google Calendar, and Apple's. Both are plain links, so a phone opens
 * its own calendar on the press itself. Nothing is drawn until the server has
 * answered with the event, and nothing at all when it does not.
 */
export default function TrialCalendarButton({ lessonId, date }: Props) {
  const [links, setLinks] = useState<TrialCalendarLinks | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchTrialCalendarLinks(lessonId, date).then((found) => {
      if (!cancelled) setLinks(found);
    });
    return () => {
      cancelled = true;
    };
  }, [lessonId, date]);

  if (!links) return null;

  return (
    <div className={look.cal}>
      {open ? (
        <>
          <p className={look.calAsk}>לאיזה יומן?</p>
          <div className={look.calChoices}>
            <a className={look.calChoice} href={links.googleUrl} target="_blank" rel="noopener noreferrer">
              <span className={`${look.calMark} ${look.calMarkGoogle}`} aria-hidden="true">G</span>
              <span className={look.calChoiceText}>
                <b>Google</b>
                <span>יומן</span>
              </span>
            </a>
            <a className={look.calChoice} href={links.fileUrl} target="_blank" rel="noopener noreferrer">
              <span className={`${look.calMark} ${look.calMarkApple}`} aria-hidden="true">
                {/* The owner asked for Apple's own mark here (2.10.2026). */}
                <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9s-1.8-.8-3-.8c-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2.1-1.1 2.8-2.3.9-1.3 1.2-2.6 1.3-2.6-.1 0-2.5-1-2.5-3.8ZM14.1 5.8c.6-.8 1.1-1.9 1-3-.9 0-2.1.6-2.7 1.4-.6.7-1.1 1.8-1 2.9 1 .1 2.1-.5 2.7-1.3Z" />
                </svg>
              </span>
              <span className={look.calChoiceText}>
                <b>Apple</b>
                <span>יומן האייפון</span>
              </span>
            </a>
          </div>
        </>
      ) : (
        <button type="button" className={look.calButton} onClick={() => setOpen(true)} aria-expanded={open}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
            <path d="M3.5 10h17M8 3v4M16 3v4M12 13v4.5M9.75 15.25h4.5" />
          </svg>
          הוסיפו ליומן
        </button>
      )}
    </div>
  );
}
