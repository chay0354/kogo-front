'use client';

/**
 * Registering a customer who paid in cash.
 *
 * The money arrives once and the income belongs to the months it covers, so the
 * two documents have different dates: a receipt for the whole sum now, and a
 * document for the regular monthly price on the 1st of each month it buys.
 * The schedule is shown before anything is issued, because these are real tax
 * documents and the first one cannot be taken back.
 */
import { useCallback, useEffect, useState } from 'react';
import { Banknote } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogCloseButton } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { previewCashPlan, registerCashPlan } from '@/lib/documentsApi';
import type { ChildWithDetails } from '@/types/customer';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  child: ChildWithDetails;
  onRegistered?: () => void;
  /** Opened from the enrollment screen: the lesson is already decided there. */
  lockedLessonId?: string | null;
  /** The course's regular price, so the monthly figure is not retyped. */
  defaultMonthlyAmount?: string;
}

type Row = { due_date: string; label: string; amount: string };

const money = (raw: string) => `₪${Number(raw || 0).toLocaleString('he-IL')}`;

function thisMonthFirst(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

export default function RegisterCashDialog({
  open,
  onOpenChange,
  child,
  onRegistered,
  lockedLessonId = null,
  defaultMonthlyAmount = '',
}: Props) {
  const [total, setTotal] = useState('');
  const [monthly, setMonthly] = useState('');
  const [startMonth, setStartMonth] = useState(thisMonthFirst());
  const [lessonId, setLessonId] = useState('');
  const [docType, setDocType] = useState<'combined' | 'tax_invoice'>('combined');
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ receipt: string; months: number } | null>(null);

  const lessons = (child.enrollments ?? [])
    .map((e: { lesson_id?: string; course_name?: string; lesson?: string }) => ({
      id: String(e.lesson_id ?? e.lesson ?? ''),
      name: e.course_name ?? '',
    }))
    .filter((l) => l.id);

  useEffect(() => {
    if (!open) return;
    setTotal('');
    setMonthly(defaultMonthlyAmount || '');
    setStartMonth(thisMonthFirst());
    setLessonId(lockedLessonId || (lessons[0]?.id ?? ''));
    setRows([]);
    setError('');
    setDone(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lockedLessonId, defaultMonthlyAmount]);

  const loadPreview = useCallback(async () => {
    if (!total || !monthly) {
      setRows([]);
      return;
    }
    try {
      const data = await previewCashPlan({
        total_amount: total,
        monthly_amount: monthly,
        start_month: startMonth,
      });
      setRows(data.schedule);
      setError('');
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setRows([]);
      setError(msg || '');
    }
  }, [total, monthly, startMonth]);

  useEffect(() => {
    const t = setTimeout(() => void loadPreview(), 300);
    return () => clearTimeout(t);
  }, [loadPreview]);

  const submit = async () => {
    if (busy || rows.length === 0) return;
    setBusy(true);
    setError('');
    try {
      const plan = await registerCashPlan({
        child_id: child.id,
        lesson_id: lessonId || null,
        total_amount: total,
        monthly_amount: monthly,
        start_month: startMonth,
        monthly_document_type: docType,
      });
      setDone({ receipt: plan.receipt_number, months: plan.months_total });
      toast.success(`קבלה ${plan.receipt_number} הופקה על ${money(total)}`);
      onRegistered?.();
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'רישום המזומן נכשל');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="w-5 h-5 text-primary" aria-hidden="true" />
            רישום במזומן — {child.full_name}
          </DialogTitle>
          <DialogCloseButton />
        </DialogHeader>

        {done ? (
          <div className="space-y-3 text-sm">
            <p className="font-medium">הרישום הושלם.</p>
            <p>
              קבלה <strong>{done.receipt}</strong> הופקה על {money(total)}.
            </p>
            <p className="text-muted-foreground">
              {done.months} מסמכים חודשיים על {money(monthly)} יופקו ב־1 בכל חודש. מה שכבר עבר — הופק עכשיו.
            </p>
            <div className="flex justify-end">
              <Button type="button" onClick={() => onOpenChange(false)}>סגור</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block mb-1" htmlFor="cash-total">סכום ששולם במזומן</label>
                <input id="cash-total" className="input w-full" inputMode="decimal" placeholder="2400"
                  value={total} onChange={(e) => setTotal(e.target.value)} />
              </div>
              <div>
                <label className="block mb-1" htmlFor="cash-monthly">מחיר החוג לחודש</label>
                <input id="cash-monthly" className="input w-full" inputMode="decimal" placeholder="240"
                  value={monthly} onChange={(e) => setMonthly(e.target.value)} />
              </div>
              <div>
                <label className="block mb-1" htmlFor="cash-start">מאיזה חודש</label>
                <input id="cash-start" type="date" className="input w-full"
                  value={startMonth} onChange={(e) => setStartMonth(e.target.value)} />
              </div>
              {lessons.length > 0 && !lockedLessonId && (
                <div>
                  <label className="block mb-1" htmlFor="cash-lesson">חוג</label>
                  <select id="cash-lesson" className="input w-full" value={lessonId}
                    onChange={(e) => setLessonId(e.target.value)}>
                    <option value="">ללא שיוך לחוג</option>
                    {lessons.map((l) => (
                      <option key={l.id} value={l.id}>{l.name || 'חוג'}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div>
              <label className="block mb-1" htmlFor="cash-doctype">המסמך החודשי</label>
              <select id="cash-doctype" className="input w-full" value={docType}
                onChange={(e) => setDocType(e.target.value as 'combined' | 'tax_invoice')}>
                <option value="combined">חשבונית מס/קבלה</option>
                <option value="tax_invoice">חשבונית מס</option>
              </select>
            </div>

            {rows.length > 0 && (
              <div className="rounded-lg border p-3">
                <p className="font-medium mb-2">
                  קבלה על {money(total)} תופק עכשיו · {rows.length} מסמכים חודשיים
                </p>
                <div className="max-h-40 overflow-y-auto">
                  {rows.map((row) => (
                    <div key={row.due_date} className="flex justify-between py-0.5">
                      <span>{row.label}</span>
                      <span>{money(row.amount)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between border-t mt-2 pt-2 font-semibold">
                  <span>סה״כ</span>
                  <span>{money(total)}</span>
                </div>
              </div>
            )}

            {error && <p className="text-red-600">{error}</p>}

            <p className="text-xs text-muted-foreground">
              אלה מסמכי מס אמיתיים. הקבלה מופקת ברגע האישור ואי אפשר לבטל אותה — רק לזכות.
            </p>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
              <Button type="button" disabled={busy || rows.length === 0} onClick={() => void submit()}>
                {busy ? 'מפיק…' : `הפק קבלה על ${money(total || '0')}`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
