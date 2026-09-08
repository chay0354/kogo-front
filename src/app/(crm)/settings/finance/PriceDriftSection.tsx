'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import api from '@/lib/api';

type DriftRow = {
  recurring_payment_id: string;
  child_id: string;
  child_name: string;
  family_name: string;
  unit_label: string;
  current_amount: string;
  expected_amount: string;
  difference: string;
  direction: 'up' | 'down';
  pending_amount: string | null;
  next_billing_date: string | null;
};

/**
 * Read-only: standing orders whose monthly amount no longer matches what the
 * child's current lessons cost. Until 2026-09-08 a lesson change never touched
 * the amount, so a child moved onto a dearer unit kept paying the old price.
 */
export default function PriceDriftSection() {
  const [rows, setRows] = useState<DriftRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/customers/recurring-payments/price-drift/');
      setRows(res.data?.results ?? []);
    } catch {
      setError('לא ניתן לטעון את הדוח');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">הוראות קבע שסכומן שונה ממחיר החוג</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            קריאה בלבד. ילד שהועבר בעבר ליחידה יקרה או זולה יותר בלי שהסכום עודכן — או חוג שמחירו השתנה. המחיר הצפוי מחושב לפי ההנחות שבתוקף היום (הנחה שפגה מאז ההרשמה תופיע כאן כסטייה). תיקון: דרך "החלפת חוג" בדף הלקוחות (הצעת מחיר ואישור) או עריכת הוראת הקבע בכרטיס הילד.
          </p>
        </div>
        <button type="button" className="btn-secondary flex items-center gap-1 text-sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          רענן
        </button>
      </div>
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      {rows && rows.length === 0 && !loading ? (
        <p className="mt-3 text-sm text-muted-foreground">כל הוראות הקבע תואמות למחיר החוג.</p>
      ) : null}
      {rows && rows.length > 0 ? (
        <div className="table-scroll mt-3">
          <table className="table table-compact">
            <thead>
              <tr className="bg-muted/50">
                <th>ילד/ה</th>
                <th>היחידה היום</th>
                <th>משלם</th>
                <th>מחיר החוג</th>
                <th>הפרש</th>
                <th className="col-hide-mobile">החיוב הבא</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.recurring_payment_id}>
                  <td className="font-medium">{row.child_name}<span className="block text-xs text-muted-foreground">{row.family_name}</span></td>
                  <td className="text-sm">{row.unit_label}</td>
                  <td className="tabular-nums">₪{row.current_amount}{row.pending_amount ? <span className="block text-xs text-muted-foreground">מתוזמן: ₪{row.pending_amount}</span> : null}</td>
                  <td className="tabular-nums">₪{row.expected_amount}</td>
                  <td className={`tabular-nums font-medium ${row.direction === 'up' ? 'text-red-700' : 'text-sky-700'}`}>
                    {row.direction === 'up' ? 'משלם פחות ב־' : 'משלם יותר ב־'}₪{Math.abs(Number(row.difference)).toLocaleString('he-IL')}
                  </td>
                  <td className="col-hide-mobile text-sm">{row.next_billing_date ? row.next_billing_date.split('-').reverse().join('.') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
