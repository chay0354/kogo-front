'use client';

import { useState } from 'react';
import { Bot, FlaskConical, UserRound } from 'lucide-react';
import { DEMO_SENDERS, type DemoSender } from '@/lib/wahub/demo';
import type { WahubContact } from '@/types/wahub';
import { Spinner } from '../shared/bits';
import { cx } from '../shared/tones';
import s from '../wahub.module.css';

interface DemoComposerProps {
  contact: WahubContact;
  busy: boolean;
  /** Resolves true when the server took the message; it then arrives through the live update. */
  onSimulate: (text: string, sender: DemoSender) => Promise<boolean>;
}

/**
 * Under the (locked) writing box of a demo conversation: type what the customer
 * "sent", or what the old bot "answered". Nothing goes to WhatsApp — the
 * message lands in this conversation only, and the new bot then proposes its
 * own answer underneath.
 */
export default function DemoComposer({ contact, busy, onSimulate }: DemoComposerProps) {
  const [texts, setTexts] = useState<Record<DemoSender, string>>({ customer: '', bot: '' });
  const [sending, setSending] = useState<DemoSender | null>(null);
  const name = contact.name || contact.phone_display || contact.phone;

  async function send(sender: DemoSender) {
    const text = texts[sender].trim();
    if (!text || sending) return;
    setSending(sender);
    try {
      const taken = await onSimulate(text, sender);
      if (taken) setTexts((prev) => ({ ...prev, [sender]: '' }));
    } finally {
      setSending(null);
    }
  }

  return (
    <section className={s.demoBox} aria-label="הדמיה: כתוב כלקוח או כבוט הישן">
      <p className={cx(s.t1, 'm-0 flex items-center gap-1.5')}>
        <FlaskConical className="h-4 w-4" aria-hidden="true" />
        הדמיה · {name} הוא לקוח דמו
        <span className={cx(s.t2, 'font-medium')}>— מה שנכתב כאן נכנס לשיחה הזו בלבד; שום דבר לא נשלח בוואטסאפ.</span>
      </p>
      <div className={s.pair}>
        {DEMO_SENDERS.map((def) => {
          const Icon = def.key === 'customer' ? UserRound : Bot;
          const value = texts[def.key];
          const isSending = sending === def.key;
          return (
            <form
              key={def.key}
              onSubmit={(event) => {
                event.preventDefault();
                void send(def.key);
              }}
              className={cx(s.pairCol, 'flex flex-col gap-2')}
              aria-label={def.label}
            >
              <h4 className="!mb-0 flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {def.label}
                <span className="font-medium">· {def.hint}</span>
              </h4>
              <textarea
                value={value}
                onChange={(event) => setTexts((prev) => ({ ...prev, [def.key]: event.target.value }))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    void send(def.key);
                  }
                }}
                rows={2}
                maxLength={4096}
                dir="auto"
                placeholder={def.key === 'customer' ? 'היי, יש חוג קפוארה לבן 5 בראש העין?' : 'מה הבוט הישן היה עונה…'}
                aria-label={def.label}
                className={s.field}
              />
              <button type="submit" disabled={!value.trim() || busy || Boolean(sending)} className={cx(s.btn, s.btnSm, def.key === 'customer' ? s.btnP : '', 'self-start')}>
                {isSending && <Spinner className="h-3.5 w-3.5" />}
                {def.button}
              </button>
            </form>
          );
        })}
      </div>
    </section>
  );
}
