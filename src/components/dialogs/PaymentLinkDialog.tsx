'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogCloseButton } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { fetchBranchesList, fetchBusinesses, type Business } from '@/lib/api';
import {
  createPaymentLink,
  updatePaymentLink,
  type PaymentLink,
  type PaymentLinkInput,
  type PaymentLinkOption,
} from '@/lib/paymentLinksApi';

interface PaymentLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit an existing link; omit to create one. */
  link?: PaymentLink | null;
  onSaved: (link: PaymentLink) => void;
}

type BranchRow = { id: string; name: string };

const EMPTY_OPTION: PaymentLinkOption = { label: '', amount: '', is_active: true };

/** DRF nests option errors as {options: [{}, {amount: ['…']}]}; dig out the first human string. */
function firstErrorMessage(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstErrorMessage(item);
      if (found) return found;
    }
    return '';
  }
  if (typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) {
      const found = firstErrorMessage(item);
      if (found) return found;
    }
  }
  return '';
}

/**
 * Create / edit a payment link: what it is for, which business and category
 * the money belongs to, and the price options the payer chooses from.
 * A removed option is deactivated on the server (payments may reference it).
 */
export default function PaymentLinkDialog({ open, onOpenChange, link, onSaved }: PaymentLinkDialogProps) {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [business, setBusiness] = useState('');
  const [category, setCategory] = useState('');
  const [branch, setBranch] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [options, setOptions] = useState<PaymentLinkOption[]>([{ ...EMPTY_OPTION }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setTitle(link?.title ?? '');
    setDescription(link?.description ?? '');
    setBusiness(link?.business ?? '');
    setCategory(link?.business_category ?? '');
    setBranch(link?.branch ?? '');
    setExpiresAt(link?.expires_at ? link.expires_at.slice(0, 10) : '');
    setIsActive(link ? link.is_active : true);
    setOptions(
      link?.options?.length
        ? link.options.map((o) => ({ id: o.id, label: o.label, amount: String(o.amount), is_active: o.is_active ?? true }))
        : [{ ...EMPTY_OPTION }],
    );
    (async () => {
      try {
        const [bizRows, branchRows] = await Promise.all([fetchBusinesses(), fetchBranchesList()]);
        setBusinesses(bizRows.filter((b) => b.is_active));
        setBranches((branchRows as BranchRow[]) ?? []);
      } catch {
        toast.error('שגיאה בטעינת עסקים וסניפים');
      }
    })();
  }, [open, link]);

  const categories = useMemo(
    () => businesses.find((b) => b.id === business)?.categories.filter((c) => c.is_active) ?? [],
    [businesses, business],
  );

  const activeOptions = options.filter((o) => o.is_active !== false);

  const updateOption = (index: number, patch: Partial<PaymentLinkOption>) => {
    setOptions((prev) => prev.map((o, i) => (i === index ? { ...o, ...patch } : o)));
  };

  const removeOption = (index: number) => {
    setOptions((prev) => {
      const row = prev[index];
      // Known on the server → deactivate; new and unsaved → drop.
      if (row.id) return prev.map((o, i) => (i === index ? { ...o, is_active: false } : o));
      return prev.filter((_, i) => i !== index);
    });
  };

  const submit = async () => {
    setError('');
    if (title.trim().length < 2) {
      setError('יש להזין כותרת');
      return;
    }
    if (!business) {
      setError('יש לבחור עסק — כל תשלום משויך לעסק');
      return;
    }
    if (activeOptions.length === 0) {
      setError('נדרשת לפחות אפשרות תשלום אחת');
      return;
    }
    for (const o of activeOptions) {
      if (!o.label.trim()) {
        setError('לכל אפשרות נדרש שם');
        return;
      }
      const n = Number(o.amount);
      if (!Number.isFinite(n) || n < 1 || n > 50000) {
        setError(`סכום לא תקין באפשרות "${o.label}" (₪1–₪50,000)`);
        return;
      }
    }
    const payload: PaymentLinkInput = {
      title: title.trim(),
      description: description.trim(),
      business,
      business_category: category || null,
      branch: branch || null,
      is_active: isActive,
      expires_at: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null,
      options: options.map((o, i) => ({
        ...(o.id ? { id: o.id } : {}),
        label: o.label.trim(),
        amount: Number(o.amount).toFixed(2),
        sort_order: i,
        is_active: o.is_active !== false,
      })),
    };
    setSaving(true);
    try {
      const saved = link ? await updatePaymentLink(link.id, payload) : await createPaymentLink(payload);
      toast.success(link ? 'הקישור עודכן' : 'הקישור נוצר');
      onSaved(saved);
      onOpenChange(false);
    } catch (err: unknown) {
      const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
      setError(firstErrorMessage(data) || 'השמירה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>{link ? 'עריכת קישור תשלום' : 'קישור תשלום חדש'}</DialogTitle>
        </DialogHeader>
        <DialogCloseButton />

        <div className="space-y-4 py-2">
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="pl-title">למה משלמים</label>
            <input
              id="pl-title"
              className="input w-full"
              placeholder="לדוגמה: מופע סוף שנה 2026"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="pl-desc">הסבר להורים (יופיע בעמוד התשלום)</label>
            <textarea
              id="pl-desc"
              className="input w-full min-h-[72px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="pl-business">עסק *</label>
              <select
                id="pl-business"
                className="input w-full"
                value={business}
                onChange={(e) => {
                  setBusiness(e.target.value);
                  setCategory('');
                }}
              >
                <option value="">בחרו עסק</option>
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="pl-category">קטגוריה</label>
              <select
                id="pl-category"
                className="input w-full"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={!business || categories.length === 0}
              >
                <option value="">{categories.length ? 'ללא קטגוריה' : 'אין קטגוריות לעסק'}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="pl-branch">סניף (לא חובה)</label>
              <select id="pl-branch" className="input w-full" value={branch} onChange={(e) => setBranch(e.target.value)}>
                <option value="">ללא סניף</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium">אפשרויות תשלום *</span>
              <button
                type="button"
                className="text-sm text-primary inline-flex items-center gap-1 hover:underline"
                onClick={() => setOptions((prev) => [...prev, { ...EMPTY_OPTION }])}
              >
                <Plus className="h-4 w-4" /> הוסף אפשרות
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              אפשרות אחת = סכום קבוע. כמה אפשרויות = המשלם בוחר (למשל: כרטיס בודד ₪50, זוג ₪90).
            </p>
            <div className="space-y-2">
              {options.map((o, index) =>
                o.is_active === false ? null : (
                  <div key={o.id ?? `new-${index}`} className="flex items-center gap-2">
                    <input
                      className="input flex-1"
                      placeholder="שם האפשרות"
                      value={o.label}
                      onChange={(e) => updateOption(index, { label: e.target.value })}
                      aria-label={`שם אפשרות ${index + 1}`}
                    />
                    <div className="relative w-32">
                      <span className="absolute inset-y-0 right-2 flex items-center text-muted-foreground text-sm">₪</span>
                      <input
                        className="input w-full pr-6"
                        inputMode="decimal"
                        placeholder="0"
                        value={o.amount}
                        onChange={(e) => updateOption(index, { amount: e.target.value })}
                        aria-label={`סכום אפשרות ${index + 1}`}
                      />
                    </div>
                    <button
                      type="button"
                      className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => removeOption(index)}
                      aria-label="הסר אפשרות"
                      disabled={activeOptions.length <= 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ),
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="pl-expires">תוקף עד (לא חובה)</label>
              <input id="pl-expires" type="date" className="input w-full" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm mt-6">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              הקישור פעיל (אפשר לשלם)
            </label>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex justify-start gap-2 pt-2">
            <Button type="button" onClick={submit} disabled={saving}>
              {saving ? 'שומר…' : link ? 'שמור' : 'צור קישור'}
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              ביטול
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
