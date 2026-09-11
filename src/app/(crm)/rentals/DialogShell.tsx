'use client';

import { useEffect, useRef, type FormEvent, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { X } from 'lucide-react';
import theme from '@/components/dashboard/theme/dashboard.module.css';
import motion from '@/components/ui/motion.module.css';
import BodyPortal from '@/app/(crm)/invoices/BodyPortal';
import styles from './rentalsDialog.module.css';

interface DialogShellProps {
  /** Unique per dialog; the title takes `${id}-title` and labels the panel. */
  id: string;
  title: ReactNode;
  hint?: ReactNode;
  /** From useDialogExit: the exit animation is playing. */
  closing: boolean;
  /** From useDialogExit: dismiss, with the exit animation. */
  onRequestClose: () => void;
  /**
   * While a request is in flight the dialog stays: closing it then would hide
   * how the request ended, and a saved half would go unnoticed.
   */
  busy?: boolean;
  /** Makes the panel a form, so Enter in a field submits it. */
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  wide?: boolean;
  footer: ReactNode;
  /** The scrolling body, so a dialog can bring a message at its top into view. */
  bodyRef?: RefObject<HTMLDivElement>;
  children: ReactNode;
}

function keepInside(event: MouseEvent) {
  event.stopPropagation();
}

/**
 * The frame the tenants view's dialogs share: the overlay, the panel in the
 * dashboard's palette, the header, a scrolling body and the footer.
 *
 * It renders into <body>. The page sits under the shell's entrance motion,
 * whose transform would pin a fixed overlay to the page instead of the
 * viewport, and under the theme's token bridge, which would re-tint it —
 * the reasons invoices' BodyPortal exists.
 */
export default function DialogShell({
  id,
  title,
  hint,
  closing,
  onRequestClose,
  busy = false,
  onSubmit,
  wide = false,
  footer,
  bodyRef,
  children,
}: DialogShellProps) {
  const titleId = `${id}-title`;
  // Read by the key listener, which is attached once.
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const closeRef = useRef(onRequestClose);
  closeRef.current = onRequestClose;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) closeRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  function dismiss() {
    if (!busy) onRequestClose();
  }

  const panelClass = [
    theme.scope,
    styles.panel,
    wide ? styles.panelWide : '',
    motion.panel,
    motion.sheet,
    closing ? motion.panelClosing : '',
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
      <header className={styles.head}>
        <div className={styles.headText}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {hint ? <p className={styles.hint}>{hint}</p> : null}
        </div>
        <button type="button" className={styles.close} onClick={dismiss} disabled={busy} aria-label="סגירה">
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <div ref={bodyRef} className={styles.body}>
        {children}
      </div>
      <footer className={styles.foot}>{footer}</footer>
    </>
  );

  return (
    <BodyPortal>
      <div
        className={`${styles.overlay} ${motion.overlay} ${closing ? motion.overlayClosing : ''}`}
        onMouseDown={dismiss}
      >
        <div
          dir="rtl"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={panelClass}
          onMouseDown={keepInside}
        >
          {/* The form sits inside the dialog rather than being it: a form may not take the dialog role. */}
          {onSubmit ? (
            <form className={styles.frame} onSubmit={onSubmit} noValidate>
              {content}
            </form>
          ) : (
            <div className={styles.frame}>{content}</div>
          )}
        </div>
      </div>
    </BodyPortal>
  );
}
