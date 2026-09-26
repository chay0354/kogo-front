'use client';

import { useEffect, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { sendSignedOriginal, type SendOriginalResult, type SignedOriginalRow } from '@/lib/signingApi';
import {
  nextSendEdition,
  sendConfirmMessage,
  sendEmailError,
  sendFailureMessage,
  sendResultMessage,
} from './manualDelivery';
import styles from './manualDelivery.module.css';

type SendableRow = Pick<SignedOriginalRow, 'id' | 'number' | 'purpose' | 'sent_at' | 'paper_original_printed_at'>;

interface SendOriginalDialogProps {
  /** The row to send, or null while the dialog is closed. */
  row: SendableRow | null;
  onClose: () => void;
  /** Called after the server answered that it sent — the list is read again. */
  onSent?: (result: Extract<SendOriginalResult, { outcome: 'sent' }>) => void;
}

/**
 * "שלח / שלח שוב": says first what will go — the signed original, once, or a
 * copy — and takes an address for this send when the card has none or the
 * customer asked for another. The server decides what actually goes and
 * refuses what may not go by mail (18ב(ד)); its answer is shown as it is.
 */
export default function SendOriginalDialog({ row, onClose, onSent }: SendOriginalDialogProps) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    // A new row starts clean.
    setEmail('');
    setError('');
    setSending(false);
  }, [row?.id]);

  if (!row) return null;
  const original = nextSendEdition(row) === 'original';

  async function send() {
    if (!row || sending) return;
    const invalid = sendEmailError(email);
    if (invalid) {
      setError(invalid);
      return;
    }
    setSending(true);
    setError('');
    try {
      const result = await sendSignedOriginal(row.id, email);
      const { ok, text } = sendResultMessage(result);
      if (!ok) {
        // An answer the office can act on (no address, cash, waiting): keep the dialog open with it.
        setError(text);
        return;
      }
      toast.success(text);
      if (result.outcome === 'sent') onSent?.(result);
      onClose();
    } catch (err) {
      setError(sendFailureMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !sending) onClose(); }}>
      <DialogContent className="max-w-md" overlayClassName="z-[60]">
        <DialogHeader>
          <DialogTitle className="text-lg">
            {original ? `שליחת ${row.number} ללקוח` : `שליחה חוזרת של ${row.number}`}
          </DialogTitle>
          <DialogDescription>{sendConfirmMessage(row)}</DialogDescription>
          <div className={styles.dialogField}>
            <label htmlFor="send-original-email" className={styles.dialogLabel}>כתובת מייל (לא חובה)</label>
            <input
              id="send-original-email"
              type="email"
              dir="ltr"
              inputMode="email"
              autoComplete="off"
              className={styles.allocationInput}
              style={{ width: '100%' }}
              value={email}
              disabled={sending}
              aria-invalid={error ? true : undefined}
              aria-describedby="send-original-hint"
              onChange={(event) => setEmail(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void send();
              }}
            />
            <span id="send-original-hint" className={styles.dialogHint}>
              ריק — לכתובת שבכרטיס הלקוח. כתובת כאן — לשליחה הזאת בלבד.
            </span>
            {error && <span className={styles.fieldError} role="alert">{error}</span>}
          </div>
        </DialogHeader>
        <div className="flex gap-3 justify-center p-4 sm:px-6 border-t mt-4">
          <Button variant="outline" onClick={onClose} disabled={sending} className="min-w-[110px]">
            ביטול
          </Button>
          <Button onClick={() => void send()} disabled={sending} className="min-w-[110px] flex items-center justify-center gap-2">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
            {original ? 'שלח מקור' : 'שלח העתק'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
