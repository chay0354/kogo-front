'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Link2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogCloseButton } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import api, { fetchBranchesList, fetchBusinesses, type Business } from '@/lib/api';
import type { ChildWithDetails } from '@/types/customer';
import {
  cardLinkAction,
  createCardLink,
  fetchCardLinks,
  formatShekels,
  type CardLink,
  type CardLinkKind,
} from '@/lib/paymentLinksApi';

interface SendCardLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  child: ChildWithDetails;
}

type LessonRow = {
  id: string;
  course_name?: string;
  day_of_week: number;
  start_time?: string | null;
  end_time?: string | null;
  instructor_name?: string | null;
  course?: string;
};

type BranchRow = { id: string; name: string };

const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

const STATUS_LABEL: Record<CardLink['status'], string> = {
  pending: 'ממתין להורה',
  processing: 'בעיבוד',
  completed: 'מומש',
  review: 'לבדיקה',
  cancelled: 'בוטל',
};

const REASON_LABELS: Record<string, string> = {
  no_parent_phone: 'אין טלפון להורה',
  manychat_not_configured: 'ManyChat לא מוגדר',
  no_token: 'הכרטיס לא נשמר (אין טוקן) — לטיפול המשרד',
  no_standing_order: 'הוראת הקבע לא נפתחה — לטיפול המשרד',
  gateway_uncertain: 'הסליקה לא ענתה בוודאות — לבדוק מול Tranzila',
  record_failed: 'החיוב עבר אך הרישום נכשל — לטיפול המשרד',
  stale_processing: 'חיוב שלא הסתיים — לבדוק מול Tranzila',
};

function reasonLabel(raw: string) {
  const key = raw.split(':')[0];
  if (REASON_LABELS[key]) return REASON_LABELS[key];
  return /[\u0590-\u05ff]/.test(raw) ? raw : 'שגיאת סליקה (פרטים ביומן)';
}

function lessonLabel(l: LessonRow) {
  const time = [l.start_time, l.end_time].filter(Boolean).map((t) => String(t).slice(0, 5)).join('–');
  return [l.course_name, DAYS[l.day_of_week], time, l.instructor_name].filter(Boolean).join(' · ');
}

/**
 * The office sends the parent a link to enter a card: either to open a
 * standing order for a lesson (priced like a signup) or to take a one-time
 * charge. Creating the link shows the quote and the URL; sending is a
 * separate, confirmed click.
 */
export default function SendCardLinkDialog({ open, onOpenChange, child }: SendCardLinkDialogProps) {
  const [kind, setKind] = useState<CardLinkKind>('standing_order');
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [lessonId, setLessonId] = useState('');
  const [includeFee, setIncludeFee] = useState(true);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [branchId, setBranchId] = useState('');
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [businessId, setBusinessId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [links, setLinks] = useState<CardLink[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<CardLink | null>(null);

  const loadLinks = useCallback(async () => {
    try {
      setLinks(await fetchCardLinks(child.id));
    } catch {
      /* the list is informational */
    }
  }, [child.id]);

  useEffect(() => {
    if (!open) return;
    setError('');
    setCreated(null);
    setAmount('');
    setDescription('');
    setKind('standing_order');
    void loadLinks();
    (async () => {
      try {
        const [lessonRes, bizRows, branchRows] = await Promise.all([
          api.get('/courses/lessons/'),
          fetchBusinesses(),
          fetchBranchesList(),
        ]);
        const rows: LessonRow[] = lessonRes.data?.results ?? lessonRes.data ?? [];
        setLessons(rows);
        setBusinesses(bizRows.filter((b) => b.is_active));
        setBranches((branchRows as BranchRow[]) ?? []);
        // Default to a lesson the child is already on; otherwise the office picks —
        // never an arbitrary lesson from the whole system.
        const enrolled = (child.enrollments || []).map((e) => e.lesson_id).filter(Boolean) as string[];
        const first = rows.find((l) => enrolled.includes(l.id));
        setLessonId(first?.id ?? '');
      } catch {
        toast.error('שגיאה בטעינת שיעורים ועסקים');
      }
    })();
  }, [open, child.id, child.enrollments, loadLinks]);

  const categories = useMemo(
    () => businesses.find((b) => b.id === businessId)?.categories.filter((c) => c.is_active) ?? [],
    [businesses, businessId],
  );

  const enrolledIds = useMemo(
    () => new Set((child.enrollments || []).map((e) => e.lesson_id).filter(Boolean) as string[]),
    [child.enrollments],
  );
  const sortedLessons = useMemo(
    () => [...lessons].sort((a, b) => Number(enrolledIds.has(b.id)) - Number(enrolledIds.has(a.id))),
    [lessons, enrolledIds],
  );

  const create = async () => {
    setError('');
    setBusy(true);
    try {
      let saved: CardLink;
      if (kind === 'standing_order') {
        if (!lessonId) {
          setError('יש לבחור שיעור');
          return;
        }
        saved = await createCardLink({ kind, child_id: child.id, lesson_id: lessonId, include_registration_fee: includeFee });
      } else {
        const n = Number(amount);
        if (!Number.isFinite(n) || n < 1) {
          setError('סכום לא תקין');
          return;
        }
        if (description.trim().length < 2) {
          setError('יש להזין תיאור לחיוב');
          return;
        }
        saved = await createCardLink({
          kind,
          child_id: child.id,
          amount: n.toFixed(2),
          description: description.trim(),
          branch_id: branchId || null,
          business_id: businessId || null,
          business_category_id: categoryId || null,
        });
      }
      setCreated(saved);
      await loadLinks();
      toast.success('הקישור נוצר');
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'יצירת הקישור נכשלה');
    } finally {
      setBusy(false);
    }
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('הקישור הועתק');
    } catch {
      toast.error('ההעתקה נכשלה');
    }
  };

  const send = async (link: CardLink) => {
    if (!window.confirm(`לשלוח את הקישור ב-WhatsApp להורה של ${child.full_name}?`)) return;
    setBusy(true);
    try {
      const updated = await cardLinkAction(link.id, 'send');
      if (updated.whatsapp?.sent) toast.success('נשלח ב-WhatsApp');
      else toast.error(`לא נשלח: ${updated.whatsapp?.error || updated.whatsapp?.reason || 'ManyChat לא מוגדר'}`);
      // The send answer carries no quote; keep what the create answer showed.
      setCreated((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
      await loadLinks();
    } catch {
      toast.error('השליחה נכשלה');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (link: CardLink) => {
    if (!window.confirm('לבטל את הקישור? ההורה לא יוכל להשתמש בו יותר.')) return;
    try {
      await cardLinkAction(link.id, 'cancel');
      if (created?.id === link.id) setCreated(null);
      await loadLinks();
    } catch {
      toast.error('הביטול נכשל');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            קישור להזנת כרטיס — {child.full_name}
          </DialogTitle>
        </DialogHeader>
        <DialogCloseButton />

        <div className="space-y-4 py-2">
          <div className="flex gap-2" role="radiogroup" aria-label="סוג הקישור">
            {(['standing_order', 'one_time'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm ${kind === k ? 'border-primary bg-primary/5 font-medium' : 'hover:bg-muted/40'}`}
                onClick={() => { setKind(k); setCreated(null); setError(''); }}
              >
                {k === 'standing_order' ? 'הוראת קבע לחוג' : 'חיוב חד-פעמי'}
              </button>
            ))}
          </div>

          {kind === 'standing_order' ? (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="cl-lesson">שיעור</label>
                <select id="cl-lesson" className="input w-full" value={lessonId} onChange={(e) => setLessonId(e.target.value)}>
                  <option value="" disabled>בחרו שיעור</option>
                  {sortedLessons.map((l) => (
                    <option key={l.id} value={l.id}>
                      {enrolledIds.has(l.id) ? '★ ' : ''}{lessonLabel(l)}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mt-1">★ = הילד רשום לשיעור. אם כבר יש לו הוראת קבע לשיעור — השרת ידחה. המחיר מחושב כמו בהרשמה רגילה: יחסי לחודש + דמי רישום אם עוד לא שולמו.</p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={includeFee} onChange={(e) => setIncludeFee(e.target.checked)} />
                לגבות דמי רישום (אם עוד לא שולמו לילד)
              </label>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1" htmlFor="cl-amount">סכום (₪)</label>
                  <input id="cl-amount" className="input w-full" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" htmlFor="cl-desc">עבור מה</label>
                  <input id="cl-desc" className="input w-full" placeholder="לדוגמה: חולצת קבוצה" value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1" htmlFor="cl-branch">סניף</label>
                  <select id="cl-branch" className="input w-full" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                    <option value="">סניף המשפחה</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" htmlFor="cl-business">עסק</label>
                  <select id="cl-business" className="input w-full" value={businessId} onChange={(e) => { setBusinessId(e.target.value); setCategoryId(''); }}>
                    <option value="">ללא (סניף)</option>
                    {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" htmlFor="cl-category">קטגוריה</label>
                  <select id="cl-category" className="input w-full" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={!businessId || categories.length === 0}>
                    <option value="">{categories.length ? 'ללא קטגוריה' : '—'}</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {!created && (
            <div className="flex justify-start">
              <Button type="button" onClick={create} disabled={busy}>
                {busy ? 'יוצר…' : 'צור קישור'}
              </Button>
            </div>
          )}

          {created && (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              {created.quote && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                  <div><div className="text-muted-foreground">לחיוב עכשיו</div><div className="font-semibold">{formatShekels(created.quote.first_charge)}</div></div>
                  <div><div className="text-muted-foreground">חודשי</div><div className="font-semibold">{formatShekels(created.quote.monthly_amount)}</div></div>
                  <div><div className="text-muted-foreground">דמי רישום</div><div className="font-semibold">{formatShekels(created.quote.registration_fee)}</div></div>
                  <div><div className="text-muted-foreground">החיוב הבא</div><div className="font-semibold">{new Date(`${created.quote.next_billing_date}T00:00:00`).toLocaleDateString('he-IL')}</div></div>
                </div>
              )}
              {created.quote_error && <p className="text-sm text-destructive">{created.quote_error}</p>}
              <a href={created.public_url} target="_blank" rel="noopener noreferrer" className="block text-primary hover:underline break-all text-sm" dir="ltr">
                {created.public_url}
              </a>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => void copy(created.public_url)}>
                  <Copy className="h-4 w-4 ml-1" /> העתק קישור
                </Button>
                <Button type="button" onClick={() => void send(created)} disabled={busy}>
                  <Send className="h-4 w-4 ml-1" /> שלח ב-WhatsApp
                </Button>
              </div>
              {created.whatsapp && (
                <p className="text-xs text-muted-foreground">
                  {created.whatsapp.sent
                    ? created.whatsapp.method === 'text' ? 'נשלח כהודעת טקסט (ללא תבנית)' : 'נשלח ב-WhatsApp'
                    : `לא נשלח: ${reasonLabel(created.whatsapp.error || created.whatsapp.reason || '')}`}
                </p>
              )}
            </div>
          )}

          {links.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">קישורים קודמים של הילד</h4>
              <div className="rounded-lg border divide-y text-sm">
                {links.map((l) => (
                  <div key={l.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <span className="font-medium">{l.kind === 'standing_order' ? 'הוראת קבע' : 'חד-פעמי'}</span>
                      <span className="text-muted-foreground"> · {l.kind === 'standing_order' ? l.lesson_label : `${l.description} · ${formatShekels(l.amount || 0)}`}</span>
                      <span className="block text-xs text-muted-foreground">
                        {new Date(l.created_at).toLocaleDateString('he-IL')}
                        {l.sent_at ? ` · נשלח ${new Date(l.sent_at).toLocaleDateString('he-IL')}` : ''}
                        {l.last_error ? ` · ${reasonLabel(l.last_error)}` : ''}
                        {l.review_reason ? ` · ${reasonLabel(l.review_reason)}` : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`rounded-full border px-2 py-0.5 text-xs ${l.status === 'completed' ? 'bg-green-100 text-green-800 border-green-300' : l.status === 'review' ? 'bg-red-100 text-red-800 border-red-300' : 'bg-muted'}`}>
                        {STATUS_LABEL[l.status]}
                      </span>
                      {l.status === 'pending' && (
                        <>
                          <button type="button" className="text-primary text-xs hover:underline" onClick={() => void copy(l.public_url)}>העתק</button>
                          <button type="button" className="text-primary text-xs hover:underline" onClick={() => void send(l)} disabled={busy}>שלח</button>
                          <button type="button" className="text-destructive text-xs hover:underline" onClick={() => void cancel(l)}>בטל</button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
