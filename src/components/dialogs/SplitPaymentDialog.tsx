'use client';

/**
 * חלוקת התשלום בין כמה משלמים (owner, 15.10.2026).
 *
 * One child, one class, one month — paid in parts on up to three cards, for
 * parents who each pay their share. The office picks the payers, sees each
 * one's part of the month and of the registration fee, and gets a card link
 * per payer to copy or send. Two ways in:
 *   - `unit`: a sign-up (a lesson or a track) — every payer pays from now;
 *   - `standingOrder`: a child who already pays on one card — that card stays
 *     the first payer, the others join from the next billing date.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, Loader2, Send, Split, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

import { Dialog, DialogCloseButton, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  cardLinkAction,
  createPaymentSplit,
  formatShekels,
  previewPaymentSplit,
  splitStandingOrder,
  type CardLink,
  type PaymentSplitCreated,
  type SplitPreview,
} from '@/lib/paymentLinksApi';
import {
  MAX_PAYERS,
  OTHER_PAYER,
  amountsProblem,
  defaultPayers,
  duplicateParent,
  payerInput,
  payerProblem,
  type PayerDraft,
} from '@/lib/paymentSplit';
import type { ChildWithDetails } from '@/types/customer';

export type SplitUnit = {
  lessonId?: string | null;
  bundleId?: string | null;
  label: string;
  specialPrice?: string | null;
  includeFee?: boolean;
};

export type SplitStandingOrder = { id: string; label: string; amount: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  child: Pick<ChildWithDetails, 'id' | 'first_name' | 'full_name'>;
  unit?: SplitUnit | null;
  standingOrder?: SplitStandingOrder | null;
  onDone?: () => void;
};

function errorText(err: unknown, fallback: string) {
  const data = (err as { response?: { data?: { error?: string; detail?: string } } })?.response?.data;
  return data?.error || data?.detail || fallback;
}

function hebrewDay(iso?: string | null) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('he-IL');
}

export default function SplitPaymentDialog({ open, onOpenChange, child, unit, standingOrder, onDone }: Props) {
  const existing = Boolean(standingOrder);
  const [parts, setParts] = useState(2);
  const [preview, setPreview] = useState<SplitPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [payers, setPayers] = useState<PayerDraft[]>([]);
  const [ownAmounts, setOwnAmounts] = useState(false);
  const [amounts, setAmounts] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<PaymentSplitCreated | null>(null);
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState('');

  // The rows the office fills: every payer of a sign-up; only the new ones of an existing order.
  const newPayers = existing ? parts - 1 : parts;

  const load = useCallback(async (count: number, wanted: string[] | null) => {
    setLoading(true);
    setError('');
    try {
      const base = standingOrder
        ? { recurring_payment_id: standingOrder.id }
        : {
            child_id: child.id,
            lesson_id: unit?.lessonId || null,
            bundle_id: unit?.bundleId || null,
            special_monthly_price: unit?.specialPrice || null,
            include_registration_fee: unit?.includeFee ?? true,
          };
      const data = await previewPaymentSplit({ ...base, parts: count, amounts: wanted });
      setPreview(data);
      return data;
    } catch (err) {
      setError(errorText(err, 'לא ניתן לחשב את החלוקה'));
      return null;
    } finally {
      setLoading(false);
    }
  }, [child.id, standingOrder, unit?.bundleId, unit?.includeFee, unit?.lessonId, unit?.specialPrice]);

  // A fresh start each time the window opens.
  useEffect(() => {
    if (!open) return;
    setParts(2);
    setOwnAmounts(false);
    setCreated(null);
    setSent({});
    setError('');
    void load(2, null).then((data) => {
      if (!data) return;
      const skip = existing ? data.parents.filter((p) => p.name === data.first_payer?.name).map((p) => p.id) : [];
      setPayers(defaultPayers(data.parents, existing ? 1 : 2, skip));
      setAmounts(data.shares.map((s) => Number(s.monthly_amount).toFixed(2)));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const changeParts = (count: number) => {
    if (count === parts || !preview) return;
    setParts(count);
    setOwnAmounts(false);
    const want = existing ? count - 1 : count;
    const skip = existing ? preview.parents.filter((p) => p.name === preview.first_payer?.name).map((p) => p.id) : [];
    setPayers((prev) => {
      const fresh = defaultPayers(preview.parents, want, [...skip, ...prev.map((p) => p.choice)]);
      return Array.from({ length: want }, (_, i) => prev[i] || fresh[i - prev.length] || fresh[0]);
    });
    void load(count, null).then((data) => {
      if (data) setAmounts(data.shares.map((s) => Number(s.monthly_amount).toFixed(2)));
    });
  };

  const total = preview?.monthly_total ?? '0';
  const amountsIssue = ownAmounts ? amountsProblem(amounts, total) : '';

  // Own figures that add up: ask the server for each payer's part of the registration fee too.
  useEffect(() => {
    if (!open || !ownAmounts || amountsIssue || !preview) return;
    const timer = window.setTimeout(() => void load(parts, amounts), 450);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amounts.join('|'), ownAmounts]);

  const parents = useMemo(() => preview?.parents ?? [], [preview]);
  const firstPayerSkip = existing ? parents.filter((p) => p.name === preview?.first_payer?.name).map((p) => p.id) : [];
  const payerIssues = payers.map((payer) => payerProblem(payer, parents));
  const twice = duplicateParent(payers, firstPayerSkip);
  const ready = Boolean(preview) && !loading && payers.length === newPayers && payerIssues.every((x) => !x) && !twice && !amountsIssue;

  const setPayer = (index: number, patch: Partial<PayerDraft>) => {
    setPayers((prev) => prev.map((payer, i) => (i === index ? { ...payer, ...patch } : payer)));
    setError('');
  };

  const create = async () => {
    if (!ready) return;
    setBusy(true);
    setError('');
    try {
      const body = { payers: payers.map(payerInput), amounts: ownAmounts ? amounts : null };
      const result = standingOrder
        ? await splitStandingOrder({ recurring_payment_id: standingOrder.id, ...body })
        : await createPaymentSplit({
            child_id: child.id,
            lesson_id: unit?.lessonId || null,
            bundle_id: unit?.bundleId || null,
            special_monthly_price: unit?.specialPrice || null,
            include_registration_fee: unit?.includeFee ?? true,
            ...body,
          });
      setCreated(result);
      toast.success(result.links.length === 1 ? 'הקישור נוצר' : `נוצרו ${result.links.length} קישורים`);
      onDone?.();
    } catch (err) {
      setError(errorText(err, 'החלוקה לא נשמרה'));
    } finally {
      setBusy(false);
    }
  };

  const copy = async (link: CardLink) => {
    try {
      await navigator.clipboard.writeText(link.public_url);
      setCopied(link.id);
      toast.success('הקישור הועתק');
      window.setTimeout(() => setCopied((value) => (value === link.id ? '' : value)), 1800);
    } catch {
      toast.error('ההעתקה נכשלה');
    }
  };

  const send = async (link: CardLink) => {
    const who = link.split ? `${link.split.payer_name} (${link.split.payer_phone})` : 'ההורה';
    if (!window.confirm(`לשלוח את הקישור ב-WhatsApp ל${who}?`)) return;
    setBusy(true);
    try {
      const updated = await cardLinkAction(link.id, 'send');
      if (updated.whatsapp?.sent) {
        setSent((prev) => ({ ...prev, [link.id]: true }));
        toast.success('נשלח ב-WhatsApp');
      } else {
        toast.error(`לא נשלח: ${updated.whatsapp?.error || updated.whatsapp?.reason || 'שגיאה'}`);
      }
    } catch (err) {
      toast.error(errorText(err, 'השליחה נכשלה'));
    } finally {
      setBusy(false);
    }
  };

  const shareFor = (index: number) => preview?.shares[existing ? index + 1 : index];

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-w-lg min-w-0 max-h-[90vh] overflow-hidden p-0 flex flex-col" overlayClassName="z-[70]" dir="rtl">
        <div className="absolute left-3 top-3 z-10">
          <DialogCloseButton />
        </div>
        <DialogHeader className="px-5 pt-5 pe-12 sm:px-6">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-violet-700">
            <Split className="h-3.5 w-3.5" aria-hidden />
            חלוקת התשלום בין כמה משלמים
          </p>
          <DialogTitle className="text-lg">{child.full_name}</DialogTitle>
          <p className="text-sm text-muted-foreground">{standingOrder?.label || unit?.label}</p>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-4 sm:px-6">
          {created ? (
            <div className="space-y-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
              <p className="text-sm">
                {existing
                  ? 'הכרטיס הקיים ממשיך לשלם הכול עד שהמשלם החדש שומר כרטיס. אחר כך כל אחד משלם את החלק שלו מהחיוב הבא.'
                  : `${child.first_name} נרשם/ת לחוג ברגע שהמשלם הראשון משלם. כל משלם מחויב בכרטיס שלו ומקבל קבלה על שמו.`}
              </p>
              <ul className="space-y-2">
                {created.links.map((link) => (
                  <li key={link.id} className="rounded-xl border bg-white px-3 py-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-semibold">
                        {link.split?.payer_name}
                        <span className="ms-1.5 text-xs font-normal text-muted-foreground">
                          משלם {link.split?.position} מתוך {link.split?.parts}
                        </span>
                      </p>
                      <bdi dir="ltr" className="text-xs text-muted-foreground">{link.split?.payer_phone}</bdi>
                    </div>
                    {link.quote ? (
                      <p className="mt-1 text-sm">
                        <b className="text-base">{formatShekels(link.quote.monthly_amount)}</b> לחודש ·{' '}
                        {Number(link.quote.first_charge) > 0
                          ? <>עכשיו <b>{formatShekels(link.quote.first_charge)}</b></>
                          : <>בלי חיוב עכשיו — מ־{hebrewDay(link.quote.next_billing_date)}</>}
                      </p>
                    ) : link.quote_error ? (
                      <p className="mt-1 text-sm text-destructive">{link.quote_error}</p>
                    ) : null}
                    <div className="mt-2 flex gap-2">
                      <button type="button" className="btn-secondary flex-1 gap-1.5" onClick={() => void copy(link)}>
                        {copied === link.id ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                        העתק
                      </button>
                      <button type="button" className="btn-primary flex-1 gap-1.5" disabled={busy || sent[link.id]} onClick={() => void send(link)}>
                        {sent[link.id] ? <Check className="h-4 w-4" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
                        {sent[link.id] ? 'נשלח' : 'שלח ב-WhatsApp'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <div>
                <p className="mb-1.5 text-sm font-medium">בין כמה משלמים?</p>
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted/60 p-1 text-sm" role="radiogroup" aria-label="מספר משלמים">
                  {Array.from({ length: MAX_PAYERS - 1 }, (_, i) => i + 2).map((count) => (
                    <button
                      key={count}
                      type="button"
                      role="radio"
                      aria-checked={parts === count}
                      onClick={() => changeParts(count)}
                      className={`rounded-lg px-3 py-1.5 font-medium transition-all duration-200 ${
                        parts === count ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {count === 2 ? 'שניים' : 'שלושה'}
                    </button>
                  ))}
                </div>
              </div>

              {loading && !preview ? (
                <div className="space-y-2" aria-busy="true">
                  <Skeleton className="h-16 w-full rounded-xl" />
                  <Skeleton className="h-16 w-full rounded-xl" />
                </div>
              ) : preview ? (
                <>
                  <div className="rounded-xl bg-violet-50 px-3 py-2 text-sm text-violet-950">
                    <p>
                      סה״כ <b className="text-base">{formatShekels(preview.monthly_total)}</b> לחודש
                      {Number(preview.registration_fee_total) > 0 ? <> · דמי רישום <b>{formatShekels(preview.registration_fee_total)}</b></> : null}
                    </p>
                    {preview.discounts?.length ? (
                      <p className="mt-0.5 text-xs text-violet-900/80">כולל {preview.discounts.map((d) => d.name).join(' · ')}</p>
                    ) : null}
                  </div>

                  <ol className="space-y-2">
                    {existing ? (
                      <li className="rounded-xl border bg-muted/30 px-3 py-2.5">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-sm font-semibold">משלם 1 · {preview.first_payer?.name}</p>
                          <p className="text-sm"><b>{formatShekels(ownAmounts ? amounts[0] || '0' : preview.shares[0]?.monthly_amount)}</b> לחודש</p>
                        </div>
                        <p className="text-xs text-muted-foreground">הכרטיס שכבר משלם · ממשיך לשלם הכול עד שהמשלם החדש שומר כרטיס</p>
                      </li>
                    ) : null}
                    {payers.map((payer, index) => {
                      const position = existing ? index + 2 : index + 1;
                      const share = shareFor(index);
                      const issue = payerIssues[index];
                      return (
                        <li key={index} className="rounded-xl border bg-white px-3 py-2.5 transition-shadow focus-within:shadow-sm">
                          <div className="flex items-center justify-between gap-2">
                            <label className="text-sm font-semibold" htmlFor={`split-payer-${index}`}>משלם {position}</label>
                            {share && !ownAmounts ? (
                              <p className="text-sm">
                                <b>{formatShekels(share.monthly_amount)}</b> לחודש
                                {Number(share.registration_fee) > 0 ? <span className="text-xs text-muted-foreground"> + {formatShekels(share.registration_fee)} דמי רישום</span> : null}
                              </p>
                            ) : null}
                          </div>
                          <select
                            id={`split-payer-${index}`}
                            className="input mt-1.5 w-full"
                            value={payer.choice}
                            onChange={(e) => setPayer(index, { choice: e.target.value })}
                          >
                            {parents.map((parent) => (
                              <option key={parent.id} value={parent.id}>
                                {parent.name}{parent.phone ? ` · ${parent.phone}` : ' · אין טלפון'}
                              </option>
                            ))}
                            <option value={OTHER_PAYER}>משלם אחר…</option>
                          </select>
                          {payer.choice === OTHER_PAYER ? (
                            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3 motion-safe:animate-in motion-safe:fade-in">
                              <input className="input w-full" placeholder="שם" value={payer.name} onChange={(e) => setPayer(index, { name: e.target.value })} />
                              <input className="input w-full" placeholder="טלפון" inputMode="tel" dir="ltr" value={payer.phone} onChange={(e) => setPayer(index, { phone: e.target.value })} />
                              <input className="input w-full" placeholder="מייל לקבלה (לא חובה)" inputMode="email" dir="ltr" value={payer.email} onChange={(e) => setPayer(index, { email: e.target.value })} />
                            </div>
                          ) : null}
                          {ownAmounts ? (
                            <div className="mt-2 flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">סכום חודשי</span>
                              <input
                                className="input w-28"
                                inputMode="decimal"
                                dir="ltr"
                                value={amounts[existing ? index + 1 : index] ?? ''}
                                onChange={(e) => {
                                  const at = existing ? index + 1 : index;
                                  setAmounts((prev) => prev.map((value, i) => (i === at ? e.target.value : value)));
                                }}
                              />
                            </div>
                          ) : null}
                          {issue && (payer.choice !== OTHER_PAYER || payer.name || payer.phone) ? (
                            <p className="mt-1 text-xs text-amber-700">{issue}</p>
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>

                  {existing && ownAmounts ? (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-xs text-muted-foreground">משלם 1 — סכום חודשי</span>
                      <input
                        className="input w-28"
                        inputMode="decimal"
                        dir="ltr"
                        value={amounts[0] ?? ''}
                        onChange={(e) => setAmounts((prev) => prev.map((value, i) => (i === 0 ? e.target.value : value)))}
                      />
                    </div>
                  ) : null}

                  <button
                    type="button"
                    className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                    onClick={() => {
                      setOwnAmounts((value) => !value);
                      setAmounts(preview.shares.map((s) => Number(s.monthly_amount).toFixed(2)));
                    }}
                  >
                    {ownAmounts ? 'חזרה לחלוקה שווה' : 'לחלק אחרת (סכומים לבחירה)'}
                  </button>
                  {amountsIssue ? <p className="text-xs text-amber-700">{amountsIssue}</p> : null}
                  {twice ? <p className="text-xs text-amber-700">אותו הורה נבחר פעמיים</p> : null}
                  <p className="text-xs text-muted-foreground">
                    {existing
                      ? `המשלם החדש מזין כרטיס בלי חיוב עכשיו, ומשלם את החלק שלו מהחיוב הבא${preview.next_billing_date ? ` (${hebrewDay(preview.next_billing_date)})` : ''}.`
                      : 'כל משלם מקבל קישור משלו, מזין כרטיס, ומשלם עכשיו את החלק שלו מהחודש ומדמי הרישום. ההנחות כבר בפנים.'}
                  </p>
                </>
              ) : null}
            </>
          )}
        </div>

        <div className="border-t bg-background px-5 py-4 sm:px-6">
          {error ? <p className="mb-2 text-sm text-destructive" role="alert">{error}</p> : null}
          {created ? (
            <button type="button" className="btn-secondary w-full" onClick={() => onOpenChange(false)}>סגירה</button>
          ) : (
            <div className="flex gap-2">
              <button type="button" className="btn-secondary flex-1" onClick={() => onOpenChange(false)} disabled={busy}>ביטול</button>
              <button type="button" className="btn-primary flex-1 gap-1.5 transition-opacity disabled:cursor-not-allowed disabled:opacity-50" disabled={!ready || busy} onClick={() => void create()}>
                {busy ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden /> : <UserPlus className="h-4 w-4" aria-hidden />}
                {busy ? 'יוצר…' : newPayers === 1 ? 'צור קישור למשלם' : `צור ${newPayers} קישורים`}
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
