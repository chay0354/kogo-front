'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import type { Tone } from '@/lib/wahub/boxes';
import { initials } from '@/lib/wahub/format';
import type { WahubContact, WahubTag } from '@/types/wahub';
import s from '../wahub.module.css';
import { PILL_TONE, cx } from './tones';

/** The sketch's pill: a short word on a tinted ground. */
export function Pill({
  tone = 'neutral',
  wrap = false,
  dot = false,
  className,
  title,
  children,
}: {
  tone?: Tone | 'gold';
  /** Let a long label break onto a second line instead of running off the card. */
  wrap?: boolean;
  dot?: boolean;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      className={cx(s.pill, tone === 'gold' ? s.pGold : PILL_TONE[tone], wrap && s.pillWrap, className)}
    >
      {dot && <i className={s.pillDot} aria-hidden="true" />}
      {children}
    </span>
  );
}

/** "דמו" — an invented contact (stage 2, §ה). Gold, so it is never mistaken for a real one. */
export function DemoTag({ size = 'pill' }: { size?: 'pill' | 'row' }) {
  return (
    <span className={cx(size === 'row' ? s.rowTag : s.pill, s.pGold)} title="לקוח דמו – לא מקבל שום הודעה">
      דמו
    </span>
  );
}

/** A tag in the colour the office gave it. The name is always written, never the colour alone. */
export function TagChip({ tag, onRemove }: { tag: WahubTag; onRemove?: () => void }) {
  return (
    <span className={s.tag}>
      <span aria-hidden="true" className={s.tagDot} style={{ backgroundColor: tag.color || 'var(--faint)' }} />
      <span className="truncate">{tag.name}</span>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`הסר את התגית ${tag.name}`} className={s.tagX}>
          ×
        </button>
      )}
    </span>
  );
}

const AVATAR_SIZE = { sm: '', md: s.avMd, lg: s.avBig };

/**
 * The initials mark: a rounded square on lavender, as in the sketch. A red dot
 * on it means the person asks for a human.
 */
export function ContactAvatar({
  contact,
  size = 'md',
}: {
  contact: Pick<WahubContact, 'id' | 'name' | 'phone' | 'phone_display' | 'chat'>;
  size?: keyof typeof AVATAR_SIZE;
}) {
  return (
    <span className={cx(s.av, AVATAR_SIZE[size])}>
      <span aria-hidden="true">{initials(contact)}</span>
      {contact.chat?.needs_human && <span className={s.avDot} role="img" aria-label="מבקש נציג" title="מבקש נציג" />}
    </span>
  );
}

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return <Loader2 className={cx(s.spin, className)} aria-hidden="true" />;
}

/** A designed "nothing here": an icon, what, why, and what to do about it. */
export function EmptyState({
  icon,
  title,
  text,
  children,
  tight = false,
  className,
}: {
  icon: ReactNode;
  title: string;
  text?: string;
  children?: ReactNode;
  tight?: boolean;
  className?: string;
}) {
  return (
    <div className={cx(s.emptyState, tight && s.emptyTight, className)}>
      <div aria-hidden="true" className={s.emptyIc}>
        {icon}
      </div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {children && <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{children}</div>}
    </div>
  );
}

export function ErrorState({
  title,
  text,
  onRetry,
  tight = false,
  className,
}: {
  title: string;
  text?: string;
  onRetry?: () => void;
  tight?: boolean;
  className?: string;
}) {
  return (
    <div role="alert" className={cx(s.emptyState, tight && s.emptyTight, className)}>
      <div aria-hidden="true" className={cx(s.emptyIc, s.emptyIcBad)}>
        <AlertCircle />
      </div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {onRetry && (
        <button type="button" onClick={onRetry} className={cx(s.btn, s.btnP, 'mt-1')}>
          נסו שוב
        </button>
      )}
    </div>
  );
}

/** Close something when the user presses outside it, or Escape. */
export function useDismiss(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) closeRef.current();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return ref;
}

/**
 * "Are you sure?" asked inside the page, where the action was pressed — the
 * browser's own confirm box is not used anywhere in this section.
 */
export function InlineConfirm({
  text,
  confirmLabel,
  cancelLabel = 'ביטול',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  text: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div role="group" aria-label="אישור פעולה" className={cx(s.confirm, danger && s.confirmBad)}>
      <div>{text}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={cx(s.btn, s.btnSm, danger ? s.btnBad : s.btnP)}
        >
          {busy && <Spinner />}
          {confirmLabel}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className={cx(s.btn, s.btnSm)}>
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}

/** A panel section with a small heading, as the contact panel uses. */
export function PanelSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={s.sect}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className={s.sectTitle}>{title}</h4>
        {action}
      </div>
      {children}
    </section>
  );
}

/** The grey shape shown while something loads. */
export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <span aria-hidden="true" className={cx(s.skeleton, className)} style={style} />;
}
