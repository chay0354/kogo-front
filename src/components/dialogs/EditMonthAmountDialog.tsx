'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';
import type { UpcomingCharge } from '@/components/dialogs/upcomingCharges';

function money(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : '';
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
}

/** The first of the charge's month, which is the key the server files it under. */
function billingMonth(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${month}-01`;
}

/**
 * Bill one month at a different amount.
 *
 * Only that month moves: the standing order keeps its figure and every later
 * month goes back to it on its own. The reason is for the office — it is stored
 * with the change and never reaches the payer or any document.
 */
export default function EditMonthAmountDialog({
  charge,
  isOpen,
  onClose,
  onSaved,
}: {
  charge: UpcomingCharge | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!charge) return;
    setAmount(money(charge.amount));
    setReason(charge.override?.reason ?? '');
    setError('');
  }, [charge]);

  if (!charge) return null;

  const hasOverride = !!charge.override;
  const parsed = Number(amount);

  const fail = (err: unknown, fallback: string) => {
    const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
    const firstFieldError = data && typeof data === 'object'
      ? Object.values(data).flat().find((value) => typeof value === 'string')
      : null;
    setError(
      (typeof data?.error === 'string' && data.error)
      || (typeof firstFieldError === 'string' && firstFieldError)
      || fallback,
    );
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('הסכום חייב להיות גדול מ-0');
      return;
    }
    if (!reason.trim()) {
      setError('חובה לציין סיבה — היא נשמרת לצוות ולא מוצגת להורה');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.post(`/customers/recurring-payments/${charge.orderId}/set-month-amount/`, {
        billing_month: billingMonth(charge.date),
        amount: parsed,
        reason: reason.trim(),
      });
      onSaved();
      onClose();
    } catch (err: unknown) {
      fail(err, 'שגיאה בשמירת הסכום לחודש');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    setError('');
    try {
      await api.post(`/customers/recurring-payments/${charge.orderId}/clear-month-amount/`, {
        billing_month: billingMonth(charge.date),
      });
      onSaved();
      onClose();
    } catch (err: unknown) {
      fail(err, 'שגיאה בביטול השינוי');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md min-w-0 overflow-x-hidden" dir="rtl">
        <DialogHeader>
          <DialogTitle>סכום לחודש {monthLabel(charge.date)}</DialogTitle>
        </DialogHeader>
        <form className="box-border min-w-0 max-w-full overflow-x-hidden p-6 space-y-4" onSubmit={handleSubmit}>
          <p className="text-sm text-muted-foreground break-words">
            {charge.description}
            {' · '}
            הסכום הרגיל {money(charge.regularAmount)} ₪
          </p>

          <div className="min-w-0">
            <label htmlFor="month-amount" className="block text-sm font-medium mb-1">
              סכום לחודש זה (₪)
            </label>
            <input
              id="month-amount"
              type="number"
              step="0.01"
              min="0.01"
              inputMode="decimal"
              className="w-full max-w-full min-w-0 box-border rounded-md border px-3 py-2"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              disabled={saving}
            />
          </div>

          <div className="min-w-0">
            <label htmlFor="month-reason" className="block text-sm font-medium mb-1">
              סיבה <span className="text-muted-foreground font-normal">(פנימי, ההורה לא רואה)</span>
            </label>
            <textarea
              id="month-reason"
              rows={3}
              className="w-full max-w-full min-w-0 box-border rounded-md border px-3 py-2"
              placeholder="למשל: רק שני שיעורים בחודש הזה"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={saving}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            רק החודש הזה משתנה. שאר החודשים ממשיכים בסכום הרגיל.
          </p>

          {error && <p className="text-sm text-red-600 break-words">{error}</p>}

          <div className="flex flex-wrap gap-2 justify-end">
            {hasOverride && (
              <Button type="button" variant="outline" onClick={handleReset} disabled={saving}>
                החזר לסכום הרגיל
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              ביטול
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'שומר…' : 'שמירה'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
