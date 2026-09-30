'use client';

/**
 * פירוט מסמך — a document kogo issued, with what it owes and what closed it
 * (receipts against invoices, WS-3):
 *
 *   - a tax or transaction invoice: its balance (total, paid, credited, open)
 *     and "נסגרה על ידי" — the receipts that paid it;
 *   - a receipt or an invoice-receipt: "סוגר את" — the invoices it paid.
 *
 * A manager can void a settlement recorded by mistake, with a reason and a
 * confirmation: the row stays (voided, with who and when) and the invoice
 * opens again. Nothing is issued and no document changes. Lines an older
 * record implies (a receipt that named the invoice, a check plan, an old cash
 * plan) carry no row and cannot be voided.
 *
 * On a server from before settlements the answer has none of these fields;
 * the dialog then shows the document alone and says so.
 *
 * A credit note shows what it credits and whether the customer confirmed it
 * (הוראה 23א(3)), with the manager's "רישום אישור הלקוח" (CreditNoteAckSection).
 * A tax invoice or an invoice-receipt offers "זיכוי" when the page can open a
 * credit note for it (onCredit, audit #10).
 */
import { useEffect, useRef, useState } from 'react';
import { FileMinus, FileText, RefreshCw, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogCloseButton, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useAuth } from '@/components/AuthProvider';
import { readableError } from '@/lib/apiError';
import { formatCardDate } from '@/lib/businessCustomerApi';
import { fetchDocument, voidSettlement } from '@/lib/documentsApi';
import { creditPrefillFromDocument, type CreditPrefill } from '@/lib/draftsAndCredits';
import CreditNoteAckSection from '@/components/dialogs/CreditNoteAckSection';
import {
  canVoidSettlement,
  formatAgorotShekels,
  formatIsraelMoment,
  readDocumentSettlements,
  settlementSourceLabel,
  toAgorot,
  type DocumentSettlements,
  type InvoiceBalance,
  type SettlementLine,
} from '@/lib/settlements';
import type { FormalDocument } from '@/types/document';

interface DocumentSettlementsDialogProps {
  documentId: string | null;
  isOpen: boolean;
  onClose: () => void;
  /** Shown until the document loads — the number the opening row already knows. */
  fallbackNumber?: string;
  /**
   * Called once the dialog closes after a settlement was voided, so the list
   * behind reloads its balances — not at once: a list that reloads unmounts
   * the row this dialog opened from, and the dialog with it.
   */
  onChanged?: () => void;
  /** Open a credit note for this document (a tax invoice or invoice-receipt); the dialog closes first. */
  onCredit?: (prefill: CreditPrefill) => void;
}

type LoadStatus = 'loading' | 'ready' | 'error';

const INVOICE_TYPES = new Set(['tax_invoice', 'transaction_invoice']);
const PAYER_TYPES = new Set(['receipt', 'combined']);

const shekels = (amount: number | string | null | undefined) => formatAgorotShekels(toAgorot(amount ?? 0));

function balanceBadgeClass(status: string): string {
  if (status === 'paid') return 'bg-emerald-100 text-emerald-800';
  if (status === 'credited') return 'bg-slate-100 text-slate-700';
  if (status === 'partial') return 'bg-amber-100 text-amber-800';
  return 'bg-rose-100 text-rose-800';
}

function BalanceBox({ balance }: { balance: InvoiceBalance }) {
  const cells: Array<[string, number, boolean]> = [
    ['סה״כ', balance.total, false],
    ['שולם', balance.paid, false],
    ['זוכה', balance.credited, false],
    ['יתרה פתוחה', balance.open, balance.open > 0],
  ];
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <h3 className="font-semibold">יתרה</h3>
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${balanceBadgeClass(String(balance.status))}`}>
          {balance.status_label}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {cells.map(([label, value, owed]) => (
          <div key={label} className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className={`mt-1 font-semibold tabular-nums ${owed ? 'text-rose-700' : ''}`} dir="ltr">
              {shekels(value)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LineRow({
  line,
  canVoid,
  onVoid,
}: {
  line: SettlementLine;
  canVoid: boolean;
  onVoid: (line: SettlementLine) => void;
}) {
  const voided = Boolean(line.voided_at);
  const when = formatIsraelMoment(line.created_at);
  return (
    <li className={`flex flex-wrap items-start justify-between gap-3 px-3 py-2 ${voided ? 'bg-muted/40' : ''}`}>
      <div className="min-w-0">
        <div className={`flex flex-wrap items-baseline gap-2 ${voided ? 'line-through text-muted-foreground' : ''}`}>
          <span dir="ltr" className="font-mono text-[13px]">{line.document_number || '—'}</span>
          {line.document_type_label && <span className="text-xs text-muted-foreground">{line.document_type_label}</span>}
          <span className="font-semibold tabular-nums" dir="ltr">{shekels(line.amount)}</span>
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {settlementSourceLabel(String(line.source))}
          {when && ` · ${when}`}
        </div>
        {voided && (
          <div className="text-xs text-rose-700 mt-0.5">
            הסגירה בוטלה {formatIsraelMoment(line.voided_at)}
            {line.voided_by && ` · ${line.voided_by}`}
          </div>
        )}
      </div>
      {canVoid && (
        <Button type="button" size="sm" variant="outline" onClick={() => onVoid(line)} title="ביטול סגירה שנרשמה בטעות">
          <Undo2 className="h-3 w-3 ml-1" aria-hidden="true" />
          ביטול סגירה
        </Button>
      )}
    </li>
  );
}

function LinesSection({
  title,
  hint,
  empty,
  lines,
  isManager,
  onVoid,
}: {
  title: string;
  hint: string;
  empty: string;
  lines: SettlementLine[];
  isManager: boolean;
  onVoid: (line: SettlementLine) => void;
}) {
  return (
    <div>
      <h3 className="font-semibold mb-0.5">{title}</h3>
      <p className="text-xs text-muted-foreground mb-2">{hint}</p>
      {lines.length === 0 ? (
        <div className="border rounded-lg px-4 py-5 text-center text-sm text-muted-foreground">{empty}</div>
      ) : (
        <ul className="border rounded-lg divide-y">
          {lines.map((line, index) => (
            <LineRow
              key={line.id ?? `${line.source}-${line.document_id ?? line.document_number}-${index}`}
              line={line}
              canVoid={canVoidSettlement(line, isManager)}
              onVoid={onVoid}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export default function DocumentSettlementsDialog({
  documentId,
  isOpen,
  onClose,
  fallbackNumber = '',
  onChanged,
  onCredit,
}: DocumentSettlementsDialogProps) {
  const { user } = useAuth();
  // The server lets a manager alone void a settlement; the button follows it.
  const isManager = user?.role === 'manager';
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [doc, setDoc] = useState<FormalDocument | null>(null);
  const [lines, setLines] = useState<DocumentSettlements | null>(null);
  const request = useRef(0);
  const changed = useRef(false);

  const close = () => {
    onClose();
    if (changed.current) {
      changed.current = false;
      onChanged?.();
    }
  };

  const [voiding, setVoiding] = useState<SettlementLine | null>(null);
  const [reason, setReason] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [voidError, setVoidError] = useState('');

  // A response that lands after the dialog moved to another document is dropped.
  const load = async (id: string) => {
    const mine = ++request.current;
    setStatus('loading');
    try {
      const data = await fetchDocument(id);
      if (mine !== request.current) return;
      setDoc(data);
      setLines(readDocumentSettlements(data));
      setStatus('ready');
    } catch {
      if (mine !== request.current) return;
      setStatus('error');
    }
  };

  useEffect(() => {
    if (!isOpen || !documentId) {
      request.current += 1;
      return;
    }
    setDoc(null);
    setLines(null);
    setVoiding(null);
    setReason('');
    setVoidError('');
    void load(documentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, documentId]);

  function startVoid(line: SettlementLine) {
    setVoiding(line);
    setReason('');
    setVoidError('');
  }

  async function confirmVoid(confirmed: boolean) {
    if (!confirmed || !voiding?.id || !documentId) return;
    try {
      const answer = await voidSettlement(voiding.id, reason.trim());
      const open = answer.invoice_balance ? ` — יתרת ${answer.invoice_number || 'החשבונית'} עכשיו ${shekels(answer.invoice_balance.open)}` : '';
      toast.success(`הסגירה בוטלה${open}`);
      setVoiding(null);
      setReason('');
      changed.current = true;
      await load(documentId);
    } catch (error) {
      setVoidError(readableError(error, 'ביטול הסגירה נכשל'));
    }
  }

  const type = doc?.document_type ?? '';
  const isInvoice = INVOICE_TYPES.has(type);
  const isPayer = PAYER_TYPES.has(type);
  const isCredit = type === 'credit_invoice';
  const creditPrefill = onCredit && doc ? creditPrefillFromDocument(doc) : null;
  const title = doc ? `${doc.document_type_display || 'מסמך'} ${doc.document_number}` : fallbackNumber || 'מסמך';
  const voidTarget = voiding
    ? isInvoice
      ? { invoice: doc?.document_number ?? '', payer: voiding.document_number }
      : { invoice: voiding.document_number, payer: doc?.document_number ?? '' }
    : null;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => (open ? undefined : close())}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b">
            <DialogHeader className="p-0">
              <DialogTitle className="flex flex-wrap items-center gap-2 text-xl">
                <FileText className="h-5 w-5" aria-hidden="true" />
                <span dir="auto">{title}</span>
              </DialogTitle>
              <DialogDescription>
                {doc
                  ? [formatCardDate(doc.document_date), shekels(doc.total_amount), doc.description].filter(Boolean).join(' · ')
                  : 'פירוט המסמך, היתרה ומה שסגר אותו'}
              </DialogDescription>
            </DialogHeader>
            <DialogCloseButton />
          </div>

          <div className="px-6 py-5 space-y-6">
            {status === 'loading' && (
              <div className="space-y-3" aria-busy="true">
                <span className="sr-only">טוען את המסמך</span>
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            )}

            {status === 'error' && (
              <div className="py-6 text-center" role="alert">
                <p className="text-sm text-muted-foreground">לא ניתן היה לטעון את המסמך</p>
                {documentId && (
                  <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => void load(documentId)}>
                    <RefreshCw className="h-3 w-3 ml-1" aria-hidden="true" />
                    נסה שוב
                  </Button>
                )}
              </div>
            )}

            {status === 'ready' && doc && lines && (
              <>
                {!lines.supported && (
                  <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                    השרת עוד לא מחזיר יתרות וסגירות למסמכים. הפירוט יופיע כאן אחרי העדכון שלו.
                  </p>
                )}

                {creditPrefill && onCredit && (
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      title="חשבונית זיכוי למסמך הזה, מקושרת אליו וללקוח שלו"
                      onClick={() => {
                        close();
                        onCredit(creditPrefill);
                      }}
                    >
                      <FileMinus className="h-3 w-3 ml-1" aria-hidden="true" />
                      זיכוי
                    </Button>
                  </div>
                )}

                {isCredit && (
                  <CreditNoteAckSection
                    doc={doc}
                    isManager={isManager}
                    onRecorded={() => {
                      changed.current = true;
                      if (documentId) void load(documentId);
                    }}
                  />
                )}

                {lines.balance && <BalanceBox balance={lines.balance} />}

                {lines.supported && isInvoice && (
                  <LinesSection
                    title="נסגרה על ידי"
                    hint={type === 'transaction_invoice'
                      ? 'חשבוניות המס/קבלה ששילמו את חשבונית העסקה. זיכוי סוגר אותה דרך הקישור שלו ואינו מופיע כאן.'
                      : 'הקבלות ששילמו את החשבונית. זיכוי סוגר אותה דרך הקישור שלו ואינו מופיע כאן.'}
                    empty="עוד לא נרשם תשלום על החשבונית"
                    lines={lines.settledBy}
                    isManager={isManager}
                    onVoid={startVoid}
                  />
                )}

                {lines.supported && isPayer && (
                  <LinesSection
                    title="סוגר את"
                    hint={type === 'combined' ? 'חשבוניות העסקה שהמסמך שילם.' : 'חשבוניות המס שהקבלה שילמה.'}
                    empty="המסמך לא סוגר חשבוניות"
                    lines={lines.settles}
                    isManager={isManager}
                    onVoid={startVoid}
                  />
                )}

                {voiding && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-4 space-y-2">
                    <p className="font-medium text-sm">
                      ביטול הסגירה של <span dir="ltr">{shekels(voiding.amount)}</span> בין{' '}
                      <span dir="ltr" className="font-mono">{voidTarget?.payer}</span> ל־
                      <span dir="ltr" className="font-mono">{voidTarget?.invoice}</span>
                    </p>
                    <label htmlFor="settlement-void-reason" className="block text-sm">
                      למה הסגירה מבוטלת? <span className="text-rose-700">*</span>
                    </label>
                    <textarea
                      id="settlement-void-reason"
                      className="w-full rounded-md border p-2 text-sm"
                      rows={2}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="למשל: הקבלה שויכה לחשבונית הלא נכונה"
                    />
                    {voidError && <p className="text-sm text-rose-700" role="alert">{voidError}</p>}
                    <div className="flex justify-end gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => setVoiding(null)}>
                        חזרה
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={!reason.trim()}
                        onClick={() => setConfirmOpen(true)}
                      >
                        המשך לביטול
                      </Button>
                    </div>
                  </div>
                )}
                {doc.document_type && !isInvoice && !isPayer && !isCredit && lines.supported && (
                  <Badge variant="outline">למסמך הזה אין יתרה וסגירות</Badge>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={confirmVoid}
        title="ביטול סגירה"
        message={voiding && voidTarget
          ? `הסגירה של ${shekels(voiding.amount)} בין ${voidTarget.payer} ל־${voidTarget.invoice} תבוטל.\n`
            + `החשבונית ${voidTarget.invoice} תיפתח שוב ב־${shekels(voiding.amount)} ותחזור לגבייה.\n`
            + 'אף מסמך לא משתנה ולא מופק; הסגירה נשמרת כמבוטלת, עם מי ביטל ומתי.\n'
            + `הסיבה: ${reason.trim()}`
          : ''}
        confirmText="בטל את הסגירה"
        cancelText="חזרה"
        type="warning"
      />
    </>
  );
}
