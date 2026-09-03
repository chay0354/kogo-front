'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';

type StandingOrderDraft = {
  id: string;
  amount: unknown;
  child_name?: string | null;
  pending_amount?: unknown;
  pending_amount_effective_date?: string | null;
  next_billing_date?: string | null;
  end_date?: string | null;
  initial_payment_details?: {
    lesson_name?: string | null;
    description?: string | null;
  } | null;
  course_name?: string | null;
};

function ymd(value: string | null | undefined): string {
  return value ? String(value).slice(0, 10) : '';
}

function money(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : '';
}

export default function EditStandingOrderDialog({
  order,
  isOpen,
  onClose,
  onSaved,
}: {
  order: StandingOrderDraft | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [nextBillingDate, setNextBillingDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [applyWhen, setApplyWhen] = useState<'this_month' | 'next_month'>('this_month');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!order || !isOpen) return;
    const hasPending = order.pending_amount != null && Number(order.pending_amount) > 0;
    setAmount(money(hasPending ? order.pending_amount : order.amount));
    setNextBillingDate(ymd(order.next_billing_date));
    setEndDate(ymd(order.end_date));
    setApplyWhen(hasPending ? 'next_month' : 'this_month');
    setError('');
  }, [order, isOpen]);

  const lessonName =
    order?.initial_payment_details?.lesson_name
    || order?.course_name
    || order?.initial_payment_details?.description
    || 'הוראת קבע';

  const handleClose = () => {
    if (!saving) onClose();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!order) return;
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('יש להזין סכום גדול מ-0');
      return;
    }
    if (endDate && nextBillingDate && endDate < nextBillingDate) {
      setError('תאריך הסיום לא יכול להיות לפני תאריך החיוב הבא');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const dates = {
        next_billing_date: nextBillingDate || null,
        end_date: endDate || null,
      };
      if (applyWhen === 'this_month') {
        await api.patch(`/customers/recurring-payments/${order.id}/`, {
          amount: parsed,
          ...dates,
        });
      } else {
        await api.post(`/customers/recurring-payments/${order.id}/schedule-amount/`, {
          amount: parsed,
        });
        await api.patch(`/customers/recurring-payments/${order.id}/`, dates);
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
      const firstFieldError = data && typeof data === 'object'
        ? Object.values(data).flat().find((value) => typeof value === 'string')
        : null;
      setError(
        (typeof data?.error === 'string' && data.error)
        || (typeof firstFieldError === 'string' && firstFieldError)
        || 'שגיאה בשמירת הוראת הקבע',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="max-w-md min-w-0 overflow-x-hidden" dir="rtl">
        <DialogHeader>
          <DialogTitle>עריכת הוראת קבע</DialogTitle>
        </DialogHeader>
        <form className="box-border min-w-0 max-w-full overflow-x-hidden p-6 space-y-4" onSubmit={handleSubmit}>
          <p className="text-sm text-muted-foreground break-words">
            {order?.child_name ? `${order.child_name} · ` : ''}
            {lessonName}
          </p>
          <div className="min-w-0">
            <label htmlFor="sto-amount" className="block text-sm font-medium mb-1">סכום לחודש (₪)</label>
            <input
              id="sto-amount"
              type="number"
              min="0"
              step="0.01"
              required
              className="box-border w-full min-w-0 max-w-full rounded-lg border border-gray-200 px-3 py-2"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <fieldset className="min-w-0 space-y-2">
            <legend className="block text-sm font-medium mb-1">מתי יחול שינוי הסכום</legend>
            <label className="flex min-w-0 items-start gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="sto-apply-when"
                className="mt-1 shrink-0"
                checked={applyWhen === 'this_month'}
                onChange={() => setApplyWhen('this_month')}
              />
              <span className="min-w-0">
                <span className="font-medium">מהחודש הזה</span>
                <span className="block text-muted-foreground">הסכום משתנה מיד. החיוב הבא כבר יהיה בסכום החדש.</span>
              </span>
            </label>
            <label className="flex min-w-0 items-start gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="sto-apply-when"
                className="mt-1 shrink-0"
                checked={applyWhen === 'next_month'}
                onChange={() => setApplyWhen('next_month')}
              />
              <span className="min-w-0">
                <span className="font-medium">רק מהחודש הבא</span>
                <span className="block text-muted-foreground">החיוב הקרוב נשאר כמו שהוא. השינוי ממחזור החיוב שאחריו.</span>
              </span>
            </label>
          </fieldset>
          <div className="min-w-0">
            <label htmlFor="sto-next" className="block text-sm font-medium mb-1">תאריך חיוב הבא</label>
            <input
              id="sto-next"
              type="date"
              className="box-border w-full min-w-0 max-w-full rounded-lg border border-gray-200 px-3 py-2"
              value={nextBillingDate}
              onChange={(e) => setNextBillingDate(e.target.value)}
            />
          </div>
          <div className="min-w-0">
            <label htmlFor="sto-end" className="block text-sm font-medium mb-1">תאריך סיום</label>
            <input
              id="sto-end"
              type="date"
              className="box-border w-full min-w-0 max-w-full rounded-lg border border-gray-200 px-3 py-2"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={handleClose} disabled={saving}>
              ביטול
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'שומר...' : 'שמור'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
