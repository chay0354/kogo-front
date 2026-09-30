'use client';

/**
 * A child's cash plans (WS-3, D1), in the payments tab of the child's card.
 *
 * A plan registered since 30.9.2026 has one חשבונית מס/קבלה for the whole
 * sum; the months are the schedule it covers. Cancelling stops the months
 * not yet begun and credits the invoice-receipt for what is given back — a
 * credit note that is signed and emailed to the customer (0: none). A plan
 * registered before that has a receipt and a document a month; it has nothing
 * to credit, and the server says what to tell the accountant — shown as it
 * comes.
 *
 * Renders nothing until the child has a plan, so the card is unchanged for
 * everyone who never paid in cash.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Banknote } from 'lucide-react';
import BodyPortal from '@/app/(crm)/invoices/BodyPortal';
import { Dialog, DialogCloseButton, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { readableError } from '@/lib/apiError';
import { cancelCashPlan, fetchCashPlans, type CashPlan } from '@/lib/documentsApi';
import {
  canCancelCashPlan,
  cashPlanCancelSummary,
  cashPlanDocumentLabel,
  cashPlanMonthsLine,
  cashPlanStatusLabel,
  defaultRefundAmount,
  isUpfrontCashPlan,
  refundAmountError,
  unusedAgorot,
} from '@/lib/cashPlans';
import { formatAgorotShekels, formatIsraelMoment, parseTypedAmount, toAgorot } from '@/lib/settlements';

const shekels = (value: unknown) => formatAgorotShekels(toAgorot(value));

function israelToday(): string {
  const parts: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())) parts[part.type] = part.value;
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function CancelCashPlanDialog({
  plan,
  onClose,
  onDone,
}: {
  plan: CashPlan | null;
  onClose: () => void;
  onDone: (plan: CashPlan, lines: string[]) => void;
}) {
  const [refund, setRefund] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!plan) return;
    setRefund(defaultRefundAmount(plan));
    setReason('');
    setError('');
  }, [plan]);

  const upfront = plan ? isUpfrontCashPlan(plan) : false;
  const label = plan ? cashPlanDocumentLabel(plan) : '';
  const total = plan ? toAgorot(plan.total_amount) : 0;
  const refundError = upfront ? refundAmountError(refund, total) : '';
  const refundAgorot = upfront ? parseTypedAmount(refund) : null;
  // Left empty, the server credits the months not yet begun.
  const creditAgorot = refundAgorot ?? (plan ? unusedAgorot(plan) : 0);

  async function submit() {
    if (!plan || saving || refundError) return;
    setSaving(true);
    setError('');
    try {
      const answer = await cancelCashPlan(plan.id, {
        reason,
        refund_amount: upfront && refund.trim() ? (Number(refundAgorot) / 100).toFixed(2) : null,
      });
      onDone(answer.plan, cashPlanCancelSummary(answer, plan.receipt_number));
      onClose();
    } catch (err) {
      setError(readableError(err, 'ביטול התוכנית נכשל'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={plan !== null} onOpenChange={(open) => (open || saving ? undefined : onClose())}>
      <DialogContent className="max-w-lg" dir="rtl" overlayClassName="z-[60]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="w-5 h-5 text-primary" aria-hidden="true" />
            ביטול מנוי במזומן — {plan?.course_name ? `${plan.child_name} · ${plan.course_name}` : plan?.child_name}
          </DialogTitle>
          <DialogCloseButton />
        </DialogHeader>
        {plan && (
          <div className="space-y-4 text-sm px-4 pb-4 sm:px-6 sm:pb-6">
            <p>
              {label} <strong dir="ltr">{plan.receipt_number || '—'}</strong> על {shekels(plan.total_amount)}.
              החודשים שעוד לא התחילו ({shekels(plan.unused_amount ?? 0)}) לא יינתנו.
            </p>

            {upfront ? (
              <>
                <div>
                  <label className="block mb-1" htmlFor="cash-refund">סכום ההחזר (₪)</label>
                  <input
                    id="cash-refund"
                    className="input w-full"
                    inputMode="decimal"
                    value={refund}
                    onChange={(e) => setRefund(e.target.value)}
                    aria-invalid={Boolean(refundError) || undefined}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    ברירת המחדל: החודשים שלא התחילו. 0 — בלי זיכוי (למשל כשהכסף לא הוחזר).
                  </p>
                  {refundError && <p className="mt-1 text-rose-700">{refundError}</p>}
                </div>
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-orange-900">
                  {creditAgorot > 0 ? (
                    <>
                      <strong>תופק חשבונית מס זיכוי על {formatAgorotShekels(creditAgorot)} ל־
                        <span dir="ltr">{plan.receipt_number}</span>, והיא תיחתם ותישלח במייל ללקוח.</strong>{' '}
                      את זה אי אפשר לבטל.
                    </>
                  ) : (
                    <>לא יופק זיכוי. התוכנית תסומן כמבוטלת.</>
                  )}
                </div>
              </>
            ) : (
              <p className="rounded-lg bg-muted/60 p-3">
                בתוכנית שנרשמה לפני 30.9.2026 לא הופקה חשבונית לחודשים שלא התחילו, ולכן אין מה לזכות ולא יופק
                מסמך. אם הוחזר מזומן — יש לדווח לרואה החשבון מול הקבלה <span dir="ltr">{plan.receipt_number}</span>.
              </p>
            )}

            <div>
              <label className="block mb-1" htmlFor="cash-cancel-reason">
                סיבה <span className="text-muted-foreground">(אופציונלי)</span>
              </label>
              <input
                id="cash-cancel-reason"
                className="input w-full"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="למשל: הילד עזב את החוג"
              />
            </div>

            {error && <p className="text-rose-700" role="alert">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>חזרה</Button>
              <Button
                type="button"
                className="bg-red-600 hover:bg-red-700 text-white"
                disabled={saving || Boolean(refundError)}
                onClick={() => void submit()}
              >
                {saving
                  ? 'מבטל…'
                  : upfront && creditAgorot > 0
                    ? `ביטול והפקת זיכוי על ${formatAgorotShekels(creditAgorot)}`
                    : 'ביטול התוכנית'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function CashPlansSection({
  childId,
  reloadKey = 0,
}: {
  childId: string;
  /** Bumped after a plan was registered, so the new one shows. */
  reloadKey?: number;
}) {
  const [plans, setPlans] = useState<CashPlan[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [cancelling, setCancelling] = useState<CashPlan | null>(null);
  const [notice, setNotice] = useState<string[]>([]);
  const request = useRef(0);

  const load = useCallback(async () => {
    const mine = ++request.current;
    try {
      const rows = await fetchCashPlans(childId);
      if (mine !== request.current) return;
      setPlans(Array.isArray(rows) ? rows : []);
      setStatus('ready');
    } catch {
      if (mine !== request.current) return;
      setStatus('error');
    }
  }, [childId]);

  useEffect(() => {
    void load();
    return () => {
      request.current += 1;
    };
  }, [load, reloadKey]);

  if (status === 'loading' || (status === 'ready' && plans.length === 0)) return null;

  const today = israelToday();

  return (
    <div>
      <h3 className="font-semibold text-lg mb-1">מנויים במזומן</h3>
      <p className="text-sm text-muted-foreground mb-3">
        חשבונית מס/קבלה אחת על כל הסכום ברגע התשלום; החודשים הם לוח השיעורים שהסכום מכסה
      </p>
      {status === 'error' ? (
        <div className="border rounded-lg px-4 py-6 text-center text-muted-foreground">
          לא ניתן היה לטעון את המנויים במזומן.{' '}
          <button type="button" className="underline" onClick={() => void load()}>נסו שוב</button>
        </div>
      ) : (
        <>
          {notice.length > 0 && (
            <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900" role="status">
              {notice.map((line) => <p key={line}>{line}</p>)}
              <button type="button" className="mt-1 text-xs underline" onClick={() => setNotice([])}>סגירה</button>
            </div>
          )}
          <div className="border rounded-lg divide-y">
            {plans.map((plan) => {
              const upfront = isUpfrontCashPlan(plan);
              const unused = unusedAgorot(plan);
              return (
                <div key={plan.id} className="p-3 flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{plan.course_name || plan.description || 'מנוי במזומן'}</span>
                      <Badge variant={plan.status === 'active' ? 'default' : 'outline'}>
                        {cashPlanStatusLabel(plan.status)}
                      </Badge>
                    </div>
                    <div className="text-sm">
                      {cashPlanDocumentLabel(plan)} <span dir="ltr" className="font-mono">{plan.receipt_number || '—'}</span>
                      {' '}על {shekels(plan.total_amount)} · {shekels(plan.monthly_amount)} לחודש
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {cashPlanMonthsLine(plan, today)}
                      {!upfront && ' · תוכנית מלפני 30.9.2026: מסמך בכל חודש'}
                    </div>
                    {plan.status === 'active' && unused > 0 && (
                      <div className="text-xs text-muted-foreground">
                        לא נוצל עדיין: {formatAgorotShekels(unused)} (חודשים שלא התחילו)
                      </div>
                    )}
                    {plan.cancelled_at && (
                      <div className="text-xs text-muted-foreground">
                        בוטלה {formatIsraelMoment(plan.cancelled_at)}
                        {plan.cancelled_by_name ? ` · ${plan.cancelled_by_name}` : ''}
                      </div>
                    )}
                  </div>
                  {canCancelCashPlan(plan) && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => setCancelling(plan)}
                    >
                      ביטול
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
      {/* Out at the end of <body>: the card's panel is animated, and a fixed
          overlay inside a transformed ancestor would be pulled off the viewport. */}
      <BodyPortal>
        <CancelCashPlanDialog
          plan={cancelling}
          onClose={() => setCancelling(null)}
          onDone={(updated, lines) => {
            if (updated?.id) setPlans((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
            else void load();
            setNotice(lines);
          }}
        />
      </BodyPortal>
    </div>
  );
}
