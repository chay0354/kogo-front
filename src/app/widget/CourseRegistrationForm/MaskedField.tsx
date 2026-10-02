'use client';

import { useRef } from 'react';
import styles from './newLook.module.css';

interface Props {
  /** The hidden version the server sent — one character and dots. Empty: an ordinary field. */
  mask: string;
  /** The parent pressed the field to retype it. */
  open: boolean;
  onOpen: () => void;
  /** Left empty and left: the field goes back to its hidden value. */
  onClose: () => void;
  /** How much of the hidden value has typed itself in so far. Undefined: all of it. */
  shown?: string;
  filling?: boolean;
  /** The hidden value is fully in: the tick shows. False while the form is still filling earlier fields. */
  settled?: boolean;
  value: string;
  onChange: (value: string) => void;
  className: string;
  ltr?: boolean;
  type?: 'text' | 'tel' | 'date';
  /** Classes for the date input when it is an ordinary date field. */
  dateClassName?: string;
  /** The stored value is shown in full (a child's first name): opening keeps it, selected. */
  keepsValue?: boolean;
  inputMode?: 'numeric' | 'email' | 'text';
  autoComplete?: string;
  maxLength?: number;
  ariaLabel?: string;
}

const TICK = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5 10 17.5 19 7" />
  </svg>
);

/**
 * A form field that the system may have filled from the family's card.
 *
 * Filled, it shows the hidden value with a green tick and cannot be typed in;
 * a press opens it empty, to be retyped — the stored value never reached this
 * browser, so there is nothing to edit. Without a mask it is the form's
 * ordinary input.
 */
export default function MaskedField({
  mask, open, onOpen, onClose, shown, filling = false, settled = true, value, onChange, className,
  ltr = false, type = 'text', dateClassName = '', keepsValue = false, inputMode, autoComplete, maxLength, ariaLabel,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const locked = Boolean(mask) && !open;
  const wrapClass = [
    styles.field,
    ltr || (locked && type === 'date') ? styles.fieldLtr : '',
    locked ? styles.fieldLocked : '',
    locked && filling ? styles.fieldFilling : '',
    locked && !filling && settled ? styles.fieldFilled : '',
  ].filter(Boolean).join(' ');

  const openField = () => {
    if (!locked) return;
    onOpen();
    // After the field re-renders as an ordinary input: the cursor is in it, a kept value selected.
    window.setTimeout(() => {
      inputRef.current?.focus({ preventScroll: true });
      if (keepsValue) inputRef.current?.select();
    }, 0);
  };

  if (locked) {
    return (
      <div className={wrapClass}>
        <input
          ref={inputRef}
          type="text"
          readOnly
          value={shown ?? mask}
          onFocus={openField}
          onClick={openField}
          className={className}
          dir={ltr || type === 'date' ? 'ltr' : undefined}
          aria-label={ariaLabel}
          // Hidden values are not something a password manager should offer to save.
          autoComplete="off"
        />
        <span className={styles.fieldTick}>{TICK}</span>
      </div>
    );
  }

  return (
    <div className={wrapClass}>
      <input
        ref={inputRef}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => {
          if (mask && (keepsValue ? value === mask : !value.trim())) onClose();
        }}
        className={type === 'date' ? `${className} ${dateClassName}`.trim() : className}
        dir={ltr ? 'ltr' : undefined}
        inputMode={inputMode}
        autoComplete={autoComplete}
        maxLength={maxLength}
        placeholder={mask && !keepsValue && type !== 'date' ? 'הקלידו מחדש' : undefined}
        aria-label={ariaLabel}
      />
    </div>
  );
}
