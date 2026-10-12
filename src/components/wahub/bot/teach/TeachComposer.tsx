'use client';

import { forwardRef, useImperativeHandle, useRef } from 'react';
import { AlertCircle, Send } from 'lucide-react';
import { sendOnEnter } from '@/lib/wahub/demo';
import { TEACH_MAX_LENGTH, TEACH_TEXT } from '@/lib/wahub/teach';
import { cx } from '../../shared/tones';
import s from '../../wahub.module.css';
import { useAutoGrow } from './parts';
import t from './teach.module.css';

/** From here on the box says how much room is left. */
const NEAR_LIMIT = TEACH_MAX_LENGTH - 400;

export interface TeachComposerHandle {
  focus: () => void;
}

interface TeachComposerProps {
  value: string;
  /** Why the last send did not go through; what he wrote is back in the box. */
  error: string;
  onChange: (text: string) => void;
  onSend: () => void;
}

/**
 * The one big box: "מה תרצה להסביר לבוט?". Free writing — and dictation: a
 * long, untidy text is taken as it is. Enter sends, Shift+Enter breaks the
 * line. It grows with what is written in it, up to a part of the screen.
 */
const TeachComposer = forwardRef<TeachComposerHandle, TeachComposerProps>(function TeachComposer({ value, error, onChange, onSend }, ref) {
  const box = useRef<HTMLTextAreaElement | null>(null);
  useImperativeHandle(ref, () => ({
    focus() {
      const element = box.current;
      if (!element) return;
      element.focus();
      // The cursor at the end: words handed in from a failed check are there to be finished.
      element.setSelectionRange(element.value.length, element.value.length);
    },
  }));

  useAutoGrow(box, value);

  const ready = value.trim().length > 0;
  const left = TEACH_MAX_LENGTH - value.length;

  return (
    <form
      className={t.composer}
      aria-label={TEACH_TEXT.title}
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) onSend();
      }}
    >
      <textarea
        id="wahub-teach-box"
        ref={box}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) =>
          sendOnEnter(event, () => {
            if (ready) onSend();
          })
        }
        rows={1}
        maxLength={TEACH_MAX_LENGTH}
        placeholder={TEACH_TEXT.example}
        aria-label={TEACH_TEXT.title}
        aria-describedby={error ? 'wahub-teach-error' : undefined}
        className={t.box}
        dir="auto"
      />
      {error && (
        <p id="wahub-teach-error" className={t.sendError} role="alert">
          <AlertCircle aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
      <div className={t.composerFoot}>
        <span className={t.keys}>{TEACH_TEXT.keys}</span>
        {value.length >= NEAR_LIMIT && (
          <span className={cx(t.left, s.num)} role="status">
            נשארו {left} תווים
          </span>
        )}
        <button type="submit" disabled={!ready} className={cx(s.btn, s.btnP, t.big)}>
          <Send className="-scale-x-100" aria-hidden="true" />
          {TEACH_TEXT.send}
        </button>
      </div>
    </form>
  );
});

export default TeachComposer;
