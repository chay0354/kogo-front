'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowRight, Copy, Edit, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { TableSkeleton } from '@/components/ui/skeleton';
import PaymentLinkDialog from '@/components/dialogs/PaymentLinkDialog';
import {
  fetchPaymentLink,
  fetchPaymentLinkPayments,
  formatShekels,
  resolvePaymentLinkReview,
  type PaymentLink,
  type PaymentLinkPayment,
  type PublicPaymentStatus,
} from '@/lib/paymentLinksApi';

const STATUS_LABELS: Record<PublicPaymentStatus, { label: string; cls: string }> = {
  completed: { label: 'שולם', cls: 'border-green-300 bg-green-100 text-green-800' },
  pending: { label: 'לא הושלם', cls: 'border-gray-300 bg-gray-100 text-gray-700' },
  failed: { label: 'נכשל', cls: 'border-red-200 bg-red-50 text-red-700' },
  review: { label: 'לבדיקה', cls: 'border-red-300 bg-red-100 text-red-800' },
};

const FAILURE_LABELS: Record<string, string> = {
  handshake_failed: 'הסליקה לא הייתה זמינה (handshake)',
};

function failureLabel(raw: string) {
  return FAILURE_LABELS[raw] || raw;
}

function reviewLabel(raw: string) {
  if (raw.startsWith('unverified')) return 'לא אומת מול Tranzila';
  if (raw.startsWith('verification_unavailable')) return 'האימות מול Tranzila לא היה זמין';
  if (raw.startsWith('amount_mismatch')) return 'סכום שונה ממה שהקישור קבע';
  if (raw.startsWith('index_reused')) return 'מזהה עסקה שכבר שויך לתשלום אחר';
  if (raw.startsWith('second_charge')) return 'דווח חיוב שני על אותו תשלום';
  if (raw.startsWith('currency')) return 'מטבע שאינו שקל';
  return raw;
}

function whatsappShareUrl(link: PaymentLink) {
  return `https://wa.me/?text=${encodeURIComponent(`${link.title}\nלתשלום: ${link.public_url}`)}`;
}

/**
 * One payment link: the public URL to share, and every payment it received.
 * A "review" row is money that moved for a different sum than the row was
 * created for — a person decides whether to count it.
 */
export default function PaymentLinkDetailPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  const [link, setLink] = useState<PaymentLink | null>(null);
  const [payments, setPayments] = useState<PaymentLinkPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | PublicPaymentStatus>('all');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [row, rows] = await Promise.all([fetchPaymentLink(id), fetchPaymentLinkPayments(id)]);
      setLink(row);
      setPayments(rows);
    } catch {
      toast.error('שגיאה בטעינת הקישור');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('הקישור הועתק');
    } catch {
      toast.error('ההעתקה נכשלה');
    }
  };

  const resolve = async (row: PaymentLinkPayment, decision: 'completed' | 'failed') => {
    if (!link) return;
    const question =
      decision === 'completed'
        ? `לספור את התשלום של ${row.payer_name} על סך ${formatShekels(row.reported_amount ?? row.amount)} כהכנסה?`
        : `לסמן את התשלום של ${row.payer_name} כלא תקין? (הכסף לא יוחזר אוטומטית)`;
    if (!window.confirm(question)) return;
    try {
      const updated = await resolvePaymentLinkReview(link.id, row.id, decision);
      setPayments((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      toast.success('עודכן');
      void load();
    } catch {
      toast.error('העדכון נכשל');
    }
  };

  const visible = payments.filter((p) => filter === 'all' || p.status === filter);
  const completed = payments.filter((p) => p.status === 'completed');
  const total = completed.reduce((sum, p) => sum + Number(p.amount), 0);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold">{link?.title ?? 'קישור תשלום'}</h2>
          {link && (
            <p className="text-sm text-muted-foreground">
              {link.business_name || 'ללא עסק'}{link.business_category_name ? ` · ${link.business_category_name}` : ''}{link.branch_name ? ` · ${link.branch_name}` : ''}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link href="/settings/payment-links" className="btn-secondary flex items-center gap-1">
            <ArrowRight className="w-4 h-4" />
            לכל הקישורים
          </Link>
          <button className="btn-secondary flex items-center gap-2" onClick={() => setEditOpen(true)} disabled={!link}>
            <Edit className="w-4 h-4" />
            עריכה
          </button>
        </div>
      </div>

      {link && (
        <div className="card mb-6 animate-slide-up">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div className="min-w-0">
              <div className="text-sm text-muted-foreground mb-1">הקישור לשיתוף</div>
              <a href={link.public_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all" dir="ltr">
                {link.public_url}
              </a>
              {!link.is_open && <span className="mr-2 text-xs rounded-full bg-gray-100 px-2 py-0.5">סגור</span>}
            </div>
            <div className="flex items-center gap-2">
              <button className="btn-secondary flex items-center gap-1" onClick={() => void copy(link.public_url)}>
                <Copy className="w-4 h-4" /> העתק
              </button>
              <a className="btn-primary flex items-center gap-1" href={whatsappShareUrl(link)} target="_blank" rel="noopener noreferrer">
                <Share2 className="w-4 h-4" /> שתף ב-WhatsApp
              </a>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div className="rounded-lg bg-muted/40 p-3">
              <div className="text-muted-foreground">שולם</div>
              <div className="text-lg font-semibold tabular-nums">{completed.length}</div>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <div className="text-muted-foreground">סה״כ התקבל</div>
              <div className="text-lg font-semibold tabular-nums">{formatShekels(total)}</div>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <div className="text-muted-foreground">לבדיקה</div>
              <div className={`text-lg font-semibold tabular-nums ${link.review_count ? 'text-red-700' : ''}`}>{link.review_count}</div>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <div className="text-muted-foreground">אפשרויות</div>
              <div className="text-sm">
                {link.options.filter((o) => o.is_active !== false).map((o) => `${o.label} ${formatShekels(o.amount)}`).join(' · ')}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="card animate-slide-up">
        <div className="mb-4 pb-3 border-b flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{visible.length} תשלומים</span>
          <select className="input w-40" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="סינון לפי סטטוס">
            <option value="all">כל הסטטוסים</option>
            <option value="completed">שולם</option>
            <option value="review">לבדיקה</option>
            <option value="failed">נכשל</option>
            <option value="pending">לא הושלם</option>
          </select>
        </div>
        {loading ? (
          <TableSkeleton columns={6} />
        ) : visible.length === 0 ? (
          <p className="text-center py-10 text-muted-foreground">אין תשלומים להצגה.</p>
        ) : (
          <div className="table-scroll">
            <table className="table table-compact">
              <thead>
                <tr className="bg-muted/50">
                  <th>משלם/ת</th>
                  <th className="col-hide-mobile">טלפון</th>
                  <th>אפשרות</th>
                  <th>סכום</th>
                  <th>סטטוס</th>
                  <th className="col-hide-mobile">מועד</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => {
                  const st = STATUS_LABELS[p.status];
                  return (
                    <tr key={p.id} className={p.status === 'review' ? 'bg-red-50/60' : ''}>
                      <td className="font-medium">{p.payer_name}{p.payer_email ? <span className="block text-xs text-muted-foreground">{p.payer_email}</span> : null}</td>
                      <td className="col-hide-mobile" dir="ltr">{p.payer_phone}</td>
                      <td>{p.option_label}</td>
                      <td className="tabular-nums">
                        {formatShekels(p.amount)}
                        {p.status === 'review' && p.reported_amount ? (
                          <span className="block text-xs text-red-700">חויב בפועל {formatShekels(p.reported_amount)}</span>
                        ) : null}
                        {p.card_last4 ? <span className="block text-xs text-muted-foreground" dir="ltr">•••• {p.card_last4}</span> : null}
                      </td>
                      <td>
                        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
                        {p.status === 'failed' && p.failure_reason ? <span className="block text-xs text-muted-foreground">{failureLabel(p.failure_reason)}</span> : null}
                        {p.review_reason ? <span className="block text-xs text-red-700">{reviewLabel(p.review_reason)}</span> : null}
                      </td>
                      <td className="col-hide-mobile text-sm tabular-nums">
                        {new Date(p.paid_at || p.created_at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="text-left whitespace-nowrap">
                        {p.status === 'review' && (
                          <div className="inline-flex gap-1">
                            <button className="btn-secondary text-xs px-2 py-1" onClick={() => void resolve(p, 'completed')}>לספור</button>
                            <button className="btn-secondary text-xs px-2 py-1 text-destructive" onClick={() => void resolve(p, 'failed')}>לא תקין</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {link && (
        <PaymentLinkDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          link={link}
          onSaved={(saved) => setLink(saved)}
        />
      )}
    </>
  );
}
