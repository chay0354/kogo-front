'use client';

import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../widgetMotion';
import type { KnownChild } from './identification';
import styles from './newLook.module.css';

const USER = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c1.5-3.6 4.4-5.4 8-5.4s6.5 1.8 8 5.4" />
  </svg>
);
const GO = (
  <svg className={styles.kidGo} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m15 18-6-6 6-6" />
  </svg>
);
const TICK = (size: number) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5 10 17.5 19 7" />
  </svg>
);

interface CardProps {
  title: string;
  kids: KnownChild[];
  /** The parent was told on WhatsApp — shown only when it really happened. */
  noticeSent?: boolean;
  /** Under "another child". */
  newHint: string;
  fine?: string;
  /** "I'll fill it in myself": drops the identification. */
  onManual?: () => void;
  onChoose: (kid: KnownChild | 'new') => void;
}

/**
 * "We found you. Who are we registering?" — the children's first names and
 * nothing else about them, always with a way to register another child.
 * The chosen row lifts and gets a tick, the rest fades, and then the choice is
 * handed on.
 */
export function KnownParentCard({ title, kids, noticeSent = false, newHint, fine, onManual, onChoose }: CardProps) {
  const [picked, setPicked] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(false);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);

  const choose = (index: number) => {
    if (picked !== null) return;
    const choice = index < kids.length ? kids[index] : 'new';
    if (prefersReducedMotion()) {
      onChoose(choice);
      return;
    }
    setPicked(index);
    timers.current.push(window.setTimeout(() => setLeaving(true), 420));
    timers.current.push(window.setTimeout(() => onChoose(choice), 650));
  };

  const rowClass = (index: number, extra = '') => [
    styles.kid,
    extra,
    picked === index ? styles.kidPicked : '',
    picked !== null && picked !== index ? styles.fadeOut : '',
  ].filter(Boolean).join(' ');
  const faded = picked !== null ? ` ${styles.fadeOut}` : '';

  return (
    <div className={`${styles.knownCard}${leaving ? ` ${styles.knownCardLeaving}` : ''}`} aria-live="polite">
      <div className={styles.knownHead}>
        <span className={styles.knownMark}>{USER}</span>
        <b>{title}</b>
      </div>
      {noticeSent ? (
        <div className={`${styles.secLine}${faded}`}>
          <span className={styles.secIcon} aria-hidden="true">
            <span className={styles.secFly} />
            <span className={styles.secWa}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20.5l1.7-5.2A8.5 8.5 0 1 1 21 11.5z" />
                <path d="M9.3 8.8c.5 2.6 2.3 4.5 5 5.2" strokeWidth="2.2" />
              </svg>
            </span>
            <span className={styles.secShield}>
              <svg viewBox="0 0 24 24">
                <path d="M12 1.8 3.8 4.9v6.3c0 5.2 3.5 9.6 8.2 11.2 4.7-1.6 8.2-6 8.2-11.2V4.9z" fill="#2B3090" stroke="#fff" strokeWidth="1.8" />
                <path d="M8.3 12.1 11 14.8 15.9 9.5" fill="none" stroke="#F5C518" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </span>
          <span className={styles.secText}>עדכנו את ההורה בוואטסאפ לאבטחה, בלי קוד</span>
        </div>
      ) : null}
      <div className={styles.kids}>
        {kids.map((kid, index) => (
          <button key={kid.id} type="button" className={rowClass(index)} onClick={() => choose(index)}>
            <span className={styles.kidAvatar}>{picked === index ? TICK(20) : kid.firstName.slice(0, 1)}</span>
            <span className={styles.kidText}><b>{kid.firstName}</b></span>
            {GO}
          </button>
        ))}
        <button type="button" className={rowClass(kids.length, styles.kidNew)} onClick={() => choose(kids.length)}>
          <span className={styles.kidAvatar}>{picked === kids.length ? TICK(20) : '+'}</span>
          <span className={styles.kidText}>
            <b>ילד/ה אחר/ת</b>
            <small>{newHint}</small>
          </span>
          {GO}
        </button>
      </div>
      {fine || onManual ? (
        <p className={`${styles.knownFine}${faded}`}>
          <span>{fine}</span>
          {onManual ? <button type="button" className={styles.textButton} onClick={onManual}>אמלא לבד</button> : null}
        </p>
      ) : null}
    </div>
  );
}

interface StripProps {
  title: string;
  note?: string;
  actionLabel: string;
  onAction: () => void;
}

/** What the card folds into once a choice was made. */
export function KnownStrip({ title, note, actionLabel, onAction }: StripProps) {
  return (
    <div className={styles.strip}>
      <span className={styles.stripDot}>{TICK(13)}</span>
      <div className={styles.stripText}>
        <b>{title}</b>
        {note ? <small>{note}</small> : null}
      </div>
      <button type="button" className={styles.textButton} onClick={onAction}>{actionLabel}</button>
    </div>
  );
}
