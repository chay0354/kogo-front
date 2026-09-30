'use client';

/**
 * A credit note in the document's detail: what it credits, and whether the
 * customer confirmed receiving it (הוראה 23א(3)) — a credit reduces the output
 * VAT only once they have (audit M4). A manager records the confirmation:
 * the day it arrived and how (a signature on the copy, registered mail, a
 * signed reply). Recorded once; the server keeps the first.
 */
import { useState } from 'react';
import { CheckCircle2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { readableError } from '@/lib/apiError';
import { formatCardDate } from '@/lib/businessCustomerApi';
import { recordCustomerAck } from '@/lib/documentsApi';
import { ackDateProblem } from '@/lib/draftsAndCredits';
import { formatIsraelMoment } from '@/lib/settlements';
import type { FormalDocument } from '@/types/document';
import { israelToday } from '@/components/dialogs/NewDocumentDialog/utils';

export default function CreditNoteAckSection({
  doc,
  isManager,
  onRecorded,
}: {
  doc: FormalDocument;
  isManager: boolean;
  /** After the confirmation was recorded (or found recorded already): reload the document. */
  onRecorded: () => void;
}) {
  const today = israelToday();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const ackAt = doc.customer_ack_at ?? null;
  // An older server does not say; nothing is claimed either way.
  const known = doc.customer_ack_at !== undefined;
  const dateProblem = ackDateProblem(date, doc.document_date, today);
  const original = doc.linked_document_number || '';
  const originalDate = doc.linked_document_date ? formatCardDate(doc.linked_document_date) : '';

  async function submit() {
    if (dateProblem || !note.trim()) return;
    setBusy(true);
    setError('');
    try {
      // Today's confirmation is stamped now by the server; an earlier one keeps its day.
      await recordCustomerAck(doc.id, { note, date: date === today ? undefined : date });
      setOpen(false);
      setNote('');
      onRecorded();
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setError(readableError(err, 'רישום האישור נכשל'));
      // 409: someone recorded it meanwhile — show theirs.
      if (status === 409) onRecorded();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-semibold mb-1">זיכוי</h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">זיכוי עבור</dt>
          <dd dir="auto">
            {original ? <span dir="ltr" className="font-mono">{original}</span> : '—'}
            {originalDate && ` · ${originalDate}`}
          </dd>
          {doc.credit_reason && (
            <>
              <dt className="text-muted-foreground">סיבה</dt>
              <dd>{doc.credit_reason}</dd>
            </>
          )}
        </dl>
      </div>

      {known && (
        <div
          className={`rounded-lg border p-3 text-sm ${ackAt ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/60'}`}
        >
          {ackAt ? (
            <p className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-700 shrink-0" aria-hidden="true" />
              <span>
                הלקוח אישר את קבלת הזיכוי · {formatIsraelMoment(ackAt)}
                {doc.customer_ack_note && ` · ${doc.customer_ack_note}`}
              </span>
            </p>
          ) : (
            <div className="space-y-2">
              <p className="flex items-start gap-2">
                <Clock className="h-4 w-4 mt-0.5 text-amber-700 shrink-0" aria-hidden="true" />
                <span>
                  טרם נרשם אישור הלקוח. לפי הוראה 23א(3), הזיכוי מקטין את המע״מ רק אחרי שהלקוח אישר שקיבל אותו.
                </span>
              </p>
              {isManager && !open && (
                <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
                  רישום אישור הלקוח
                </Button>
              )}
              {isManager && open && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-3">
                    <label className="text-sm flex flex-col gap-1">
                      <span>תאריך האישור</span>
                      <input
                        type="date"
                        className="rounded-md border p-1.5 text-sm"
                        value={date}
                        min={doc.document_date?.slice(0, 10) || undefined}
                        max={today}
                        onChange={(e) => setDate(e.target.value)}
                        aria-invalid={dateProblem !== null}
                      />
                    </label>
                    <label className="text-sm flex flex-col gap-1 grow min-w-[12rem]">
                      <span>
                        איך אישר <span className="text-rose-700">*</span>
                      </span>
                      <input
                        type="text"
                        className="rounded-md border p-1.5 text-sm"
                        maxLength={300}
                        value={note}
                        placeholder="חתימה על העתק / דואר רשום / תשובה חתומה במייל"
                        onChange={(e) => setNote(e.target.value)}
                      />
                    </label>
                  </div>
                  {dateProblem && <p className="text-sm text-rose-700">{dateProblem}</p>}
                  {error && <p className="text-sm text-rose-700" role="alert">{error}</p>}
                  <div className="flex justify-end gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
                      חזרה
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy || dateProblem !== null || !note.trim()}
                      onClick={() => void submit()}
                    >
                      {busy ? 'רושם…' : 'רישום האישור'}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">האישור נרשם פעם אחת ואינו ניתן לשינוי.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
