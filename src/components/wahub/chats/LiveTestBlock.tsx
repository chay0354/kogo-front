'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Radio } from 'lucide-react';
import { displayName } from '@/lib/wahub/format';
import type { WahubContact } from '@/types/wahub';
import { InlineConfirm, Pill, Spinner } from '../shared/bits';
import { cx } from '../shared/tones';
import s from '../wahub.module.css';

export const LIVE_TEST_LABEL = 'בדיקה חיה: הבוט החדש עונה לו באמת';
export const LIVE_TEST_WARNING = 'הודעות יישלחו לאיש הקשר הזה בוואטסאפ.';

interface LiveTestViewProps {
  name: string;
  on: boolean;
  /** A manager may switch it; anyone else only sees the state. */
  canEdit: boolean;
  busy: boolean;
  /** Turning it on was pressed and waits for a yes. */
  asking: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onToggle: (on: boolean) => void;
}

/**
 * The block as it is drawn; what was pressed is held by the caller. Turning
 * the test on asks first — from that moment real messages go out to this
 * person — and turning it off is done at once.
 */
export function LiveTestView({ name, on, canEdit, busy, asking, onAsk, onCancel, onToggle }: LiveTestViewProps) {
  return (
    <div className={cx(s.liveBox, on && s.liveBoxOn)} role="group" aria-label="בדיקה חיה">
      <div className="flex items-center justify-between gap-2">
        <span className={cx(s.t1, 'inline-flex min-w-0 items-center gap-1.5 !text-[13px]')}>
          <Radio className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{LIVE_TEST_LABEL}</span>
        </span>
        {canEdit ? (
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label={LIVE_TEST_LABEL}
            disabled={busy || asking}
            onClick={() => (on ? onToggle(false) : onAsk())}
            className={cx(s.switchRow, '!p-0')}
          >
            {busy ? <Spinner /> : <span className={s.switch} aria-hidden="true" />}
          </button>
        ) : (
          <Pill tone={on ? 'warning' : 'muted'} dot>
            {on ? 'פעילה' : 'כבויה'}
          </Pill>
        )}
      </div>
      <p className={cx(s.warnText, 'm-0 mt-1 flex items-center gap-1.5 text-[12.5px] font-bold')}>
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {LIVE_TEST_WARNING}
      </p>
      {asking && !on && (
        <div className="mt-2">
          <InlineConfirm
            text={
              <>
                להפעיל בדיקה חיה ל<strong className="font-extrabold" dir="auto">{name}</strong>? מעכשיו הבוט החדש עונה לו באמת
                בוואטסאפ, והבוט הישן מושתק לו.
              </>
            }
            confirmLabel="הפעל בדיקה חיה"
            busy={busy}
            onConfirm={() => onToggle(true)}
            onCancel={onCancel}
          />
        </div>
      )}
    </div>
  );
}

interface LiveTestBlockProps {
  contact: Pick<WahubContact, 'id' | 'name' | 'phone' | 'phone_display' | 'live_test'>;
  canEdit: boolean;
  busy: boolean;
  onToggle: (on: boolean) => void;
}

/**
 * "בדיקה חיה" in the contact's details (docs/WAHUB-CONTRACT-LIVE-TEST.md, ג):
 * one switch, one warning line. On, the new bot answers this person for real
 * through ManyChat and the old bot is silenced for them; everyone else is
 * untouched, and the general sending switch is not.
 */
export default function LiveTestBlock({ contact, canEdit, busy, onToggle }: LiveTestBlockProps) {
  const on = contact.live_test === true;
  const [asking, setAsking] = useState(false);

  // Another person, or the answer came back: the question is over.
  useEffect(() => {
    setAsking(false);
  }, [contact.id, on]);

  return (
    <LiveTestView
      name={displayName(contact)}
      on={on}
      canEdit={canEdit}
      busy={busy}
      asking={asking}
      onAsk={() => setAsking(true)}
      onCancel={() => setAsking(false)}
      onToggle={onToggle}
    />
  );
}
