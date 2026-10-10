'use client';

import { useState } from 'react';
import { Flag } from 'lucide-react';
import { toast } from 'sonner';
import { readableError } from '@/lib/apiError';
import { postWahubReviewNote } from '@/lib/wahubApi';
import { useProposalsCache } from '../hooks/useBotQueries';
import { Spinner } from '../shared/bits';
import { cx } from '../shared/tones';
import s from '../wahub.module.css';

interface ServiceNoteBoxProps {
  contactId: number;
}

/**
 * "הבוט טעה כאן": a short line from the office about this conversation.
 * The reviewer turns it into a proposal; when it does so at once, the
 * floating button lights up.
 */
export default function ServiceNoteBox({ contactId }: ServiceNoteBoxProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const proposals = useProposalsCache();

  async function send() {
    const clean = text.trim();
    if (!clean || sending) return;
    setSending(true);
    try {
      const result = await postWahubReviewNote({ text: clean, contact_id: contactId });
      setText('');
      setOpen(false);
      proposals.invalidate();
      toast.success(result.proposal_id ? 'נרשם. נוצרה הצעת עדכון – ראו את הכפתור הצף.' : 'נרשם. הסורק יעבור על זה ויציע תיקון.');
    } catch (error) {
      toast.error(readableError(error, 'ההערה לא נשמרה'));
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={cx(s.btn, s.btnSm)}>
        <Flag aria-hidden="true" />
        הבוט טעה כאן
      </button>
    );
  }

  return (
    <div className={cx(s.inset, 'flex flex-col gap-2')} role="group" aria-label="הבוט טעה כאן">
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={3}
        maxLength={2000}
        autoFocus
        placeholder="מה הבוט עשה, ומה היה צריך? למשל: ענה שאין קבוצת וואטסאפ, אבל אצל המדריכה יש."
        aria-label="מה הבוט עשה לא נכון"
        className={s.field}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void send()} disabled={!text.trim() || sending} className={cx(s.btn, s.btnSm, s.btnP)}>
          {sending && <Spinner className="h-3.5 w-3.5" />}
          שלח לביקורת
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={sending} className={cx(s.btn, s.btnSm)}>
          ביטול
        </button>
        <span className={cx(s.t2, '!text-[12px]')}>לא נשלח ללקוח. נכנס לרשימת ההצעות לאישור.</span>
      </div>
    </div>
  );
}
