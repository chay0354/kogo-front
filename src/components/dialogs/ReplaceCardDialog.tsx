'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogCloseButton } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';
import { israeliIdFieldError, sanitizeIsraeliIdInput } from '@/lib/israeliId';
import type { ChildWithDetails } from '@/types/customer';

interface ReplaceCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  child: ChildWithDetails;
  onReplaced?: () => void;
}

type MonthDue = { month: string; label: string; amount: string };

type Target = {
  recurring_id: string;
  child_name: string;
  course_name: string;
  branch_name: string;
  status: string;
  monthly_amount: string;
  card_last4: string;
  months_due: MonthDue[];
  total_due: string;
  skip_reason: string;
  will_update_card: boolean;
};

type Quote = {
  family_id: string;
  family_name: string;
  targets: Target[];
  standing_orders: number;
  total_due: string;
  will_charge: boolean;
  link: string;
};

type ResultRow = { child_name: string; month: string; amount: string; status: string; reason?: string };

const RESULT_LABEL: Record<string, string> = {
  charged: 'נגבה',
  declined: 'נדחה',
  skipped: 'כבר היה משולם',
  uncertain: 'לא ודאי — לבדוק מול טרנזילה',
  charged_with_errors: 'נגבה, אך הרישום נכשל',
};

const money = (raw: string) => `₪${Number(raw || 0).toLocaleString('he-IL')}`;

export default function ReplaceCardDialog({ open, onOpenChange, child, onReplaced }: ReplaceCardDialogProps) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<ResultRow[] | null>(null);

  const [cardNumber, setCardNumber] = useState('');
  const [expiryMonth, setExpiryMonth] = useState('');
  const [expiryYear, setExpiryYear] = useState('');
  const [cvv, setCvv] = useState('');
  const [holderId, setHolderId] = useState('');
  const [idError, setIdError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/customers/children/${child.id}/family-card/`);
      setQuote(res.data as Quote);
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'שגיאה בטעינת הוראות הקבע');
    } finally {
      setLoading(false);
    }
  }, [child.id]);

  useEffect(() => {
    if (!open) return;
    setResults(null);
    setCardNumber('');
    setExpiryMonth('');
    setExpiryYear('');
    setCvv('');
    setHolderId('');
    setIdError('');
    void load();
  }, [open, load]);

  const submit = async () => {
    if (!quote || busy) return;
    const idErr = israeliIdFieldError(holderId);
    if (idErr) {
      setIdError(idErr);
      return;
    }
    if (!cardNumber || !expiryMonth || !expiryYear || !cvv) {
      setError('יש למלא את כל פרטי הכרטיס');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await api.post(
        `/customers/families/${quote.family_id}/card/replace/`,
        {
          card_details: {
            card_number: cardNumber.replace(/\s/g, ''),
            expiry_month: parseInt(expiryMonth, 10),
            expiry_year: parseInt(expiryYear, 10),
            cvv,
            card_holder_id: holderId.replace(/\D/g, ''),
          },
        },
        { timeout: 120_000 },
      );
      setResults((res.data?.results || []) as ResultRow[]);
      toast.success(
        `הכרטיס הוחלף ב-${res.data.standing_orders_updated} הוראות קבע · נגבה ${money(res.data.charged_total)}`,
      );
      onReplaced?.();
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'החלפת הכרטיס נכשלה');
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!quote?.link) return;
    await navigator.clipboard.writeText(quote.link);
    toast.success('הקישור הועתק — אפשר לשלוח להורה');
  };

  const chargeable = quote?.targets.filter((t) => t.will_update_card) ?? [];
  const blocked = quote?.targets.filter((t) => !t.will_update_card) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary" aria-hidden="true" />
            החלפת כרטיס אשראי — {quote?.family_name || child.full_name}
          </DialogTitle>
          <DialogCloseButton />
        </DialogHeader>

        {loading && <p className="text-sm text-muted-foreground py-6 text-center">טוען הוראות קבע...</p>}

        {!loading && results && (
          <div className="space-y-3">
            <p className="font-medium">הכרטיס נשמר בכל הוראות הקבע.</p>
            {results.length === 0 ? (
              <p className="text-sm text-muted-foreground">לא היה חוב פתוח, ולכן לא נגבה דבר.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-right text-muted-foreground">
                    <th className="py-1">ילד/ה</th><th>חודש</th><th>סכום</th><th>תוצאה</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((row, i) => (
                    <tr key={`${row.month}-${i}`} className="border-t">
                      <td className="py-1">{row.child_name}</td>
                      <td>{row.month?.slice(0, 7)}</td>
                      <td>{money(row.amount)}</td>
                      <td className={row.status === 'charged' ? 'text-green-700' : 'text-red-700'}>
                        {RESULT_LABEL[row.status] || row.status}
                        {row.reason ? ` — ${row.reason}` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="flex justify-end">
              <Button type="button" onClick={() => onOpenChange(false)}>סגור</Button>
            </div>
          </div>
        )}

        {!loading && !results && quote && (
          <div className="space-y-4">
            {chargeable.length === 0 ? (
              <p className="text-sm text-muted-foreground">אין למשפחה הזאת הוראת קבע שניתן לעדכן.</p>
            ) : (
              <>
                <div className="rounded-lg border p-3 space-y-2">
                  <p className="text-sm font-medium">הכרטיס החדש יחליף את הישן בכל אלה:</p>
                  {chargeable.map((t) => (
                    <div key={t.recurring_id} className="flex justify-between text-sm">
                      <span>
                        {t.child_name} · {t.course_name}
                        {t.card_last4 ? <span className="text-muted-foreground"> · כרטיס נוכחי ••{t.card_last4}</span> : null}
                      </span>
                      <span className="text-muted-foreground">
                        {t.months_due.length > 0
                          ? `${t.months_due.map((m) => m.label).join(', ')} · ${money(t.total_due)}`
                          : 'אין חוב'}
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between border-t pt-2 font-semibold">
                    <span>{quote.will_charge ? 'לחיוב עכשיו' : 'אין מה לגבות'}</span>
                    <span>{money(quote.total_due)}</span>
                  </div>
                </div>

                {blocked.length > 0 && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
                    <p className="font-medium text-amber-900">לא ניתן לעדכן מכאן:</p>
                    {blocked.map((t) => (
                      <p key={t.recurring_id} className="text-amber-800">
                        {t.child_name} · {t.course_name} — {t.skip_reason}
                      </p>
                    ))}
                  </div>
                )}

                <div className="space-y-3">
                  <p className="text-sm font-medium">פרטי הכרטיס החדש</p>
                  <input
                    className="input w-full" inputMode="numeric" placeholder="מספר כרטיס"
                    aria-label="מספר כרטיס"
                    value={cardNumber} onChange={(e) => setCardNumber(e.target.value)}
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <input className="input" inputMode="numeric" placeholder="חודש" aria-label="חודש תפוגה"
                      value={expiryMonth} onChange={(e) => setExpiryMonth(e.target.value)} />
                    <input className="input" inputMode="numeric" placeholder="שנה" aria-label="שנת תפוגה"
                      value={expiryYear} onChange={(e) => setExpiryYear(e.target.value)} />
                    <input className="input" inputMode="numeric" placeholder="CVV" aria-label="CVV"
                      value={cvv} onChange={(e) => setCvv(e.target.value)} />
                  </div>
                  <input
                    className={`input w-full ${idError ? 'border-red-500' : ''}`} inputMode="numeric"
                    placeholder="ת.ז. בעל הכרטיס" aria-label="תעודת זהות בעל הכרטיס"
                    value={holderId}
                    onChange={(e) => { setHolderId(sanitizeIsraeliIdInput(e.target.value)); setIdError(''); }}
                  />
                  {idError && <p className="text-xs text-red-600">{idError}</p>}
                  <p className="text-xs text-muted-foreground">
                    דיינרס לא מתקבל. מספר הכרטיס אינו נשמר במערכת — רק ארבע הספרות האחרונות.
                  </p>
                </div>
              </>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-between items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void copyLink()}>
                <Copy className="w-4 h-4 ml-1" aria-hidden="true" />
                העתק קישור להורה
              </Button>
              {chargeable.length > 0 && (
                <Button type="button" onClick={() => void submit()} disabled={busy}>
                  {busy
                    ? 'מעבד...'
                    : quote.will_charge
                      ? `החלף כרטיס וגבה ${money(quote.total_due)}`
                      : 'החלף כרטיס'}
                </Button>
              )}
            </div>
          </div>
        )}

        {!loading && !quote && error && <p className="text-sm text-red-600">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
