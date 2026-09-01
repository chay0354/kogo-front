'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';

type StandingOrderDraft = {
  id: string;
  amount: unknown;
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
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!order || !isOpen) return;
    setAmount(String(order.amount ?? ''));
    setNextBillingDate(ymd(order.next_billing_date));
    setEndDate(ymd(order.end_date));
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
      await api.patch(`/customers/recurring-payments/${order.id}/`, {
        amount: parsed,
        next_billing_date: nextBillingDate || null,
        end_date: endDate || null,
      });
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
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>עריכת הוראת קבע</DialogTitle>
        </DialogHeader>
        <form className="space-y-4 pt-2" onSubmit={handleSubmit}>
          <p className="text-sm text-muted-foreground">{lessonName}</p>
          <div>
            <label htmlFor="sto-amount" className="block text-sm font-medium mb-1">סכום לחודש (₪)</label>
            <input
              id="sto-amount"
              type="number"
              min="0"
              step="0.01"
              required
              className="w-full rounded-lg border border-gray-200 px-3 py-2"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="sto-next" className="block text-sm font-medium mb-1">תאריך חיוב הבא</label>
            <input
              id="sto-next"
              type="date"
              className="w-full rounded-lg border border-gray-200 px-3 py-2"
              value={nextBillingDate}
              onChange={(e) => setNextBillingDate(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="sto-end" className="block text-sm font-medium mb-1">תאריך סיום</label>
            <input
              id="sto-end"
              type="date"
              className="w-full rounded-lg border border-gray-200 px-3 py-2"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
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
