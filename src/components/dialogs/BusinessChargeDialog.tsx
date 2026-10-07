'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, ExternalLink, MessageCircle, X } from 'lucide-react';
import { createBusinessCustomer, fetchBusinesses, searchBusinessCustomers, type Business } from '@/lib/api';
import { createBusinessCharge } from '@/lib/paymentLinksApi';
import { fetchOpenInvoices } from '@/lib/documentsApi';
import { readableError } from '@/lib/apiError';
import { setBusinessCustomerConsent } from '@/lib/signingApi';
import { useScopedBranches } from '@/hooks/useScopedBranches';
import type { BusinessCustomer } from '@/components/dialogs/NewDocumentDialog/types';
import type { OpenInvoice } from '@/lib/settlements';
import {
  VAT_PERCENT,
  agorotAmount,
  agorotShekels,
  chargeBreakdown,
  chargeWhatsAppMessage,
  chargeWhatsAppUrl,
  copyText,
  type VatMode,
} from './businessCharge';
import { branchMissing, categoryNeeded, pickedBranchesBusiness } from './incomePlace';
import styles from './BusinessChargeDialog.module.css';

type Mode = 'new' | 'invoice';

/** The link that was just made, and what the buttons under it need. */
type CreatedCharge = { url: string; customerName: string; phone: string; total: string };

const COPIED_FOR_MS = 2000;

const EMPTY = {
  first_name: '', last_name: '', email: '', phone: '', id_number: '', company_number: '', address: '',
};

export default function BusinessChargeDialog({ open, onClose, onCreated }: {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const { branches } = useScopedBranches();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BusinessCustomer[]>([]);
  const [customer, setCustomer] = useState<BusinessCustomer | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [businessId, setBusinessId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [mode, setMode] = useState<Mode>('new');
  const [invoices, setInvoices] = useState<OpenInvoice[]>([]);
  const [invoiceId, setInvoiceId] = useState('');
  const [amount, setAmount] = useState('');
  const [vatMode, setVatMode] = useState<VatMode>('gross');
  const [description, setDescription] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<CreatedCharge | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const linkInputRef = useRef<HTMLInputElement>(null);
  const copyTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    setCreated(null);
    setCopyState('idle');
    setError('');
    void fetchBusinesses().then((rows) => setBusinesses(rows.filter((row) => row.is_active))).catch(() => setError('טעינת העסקים נכשלה'));
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open, busy, onClose]);

  useEffect(() => {
    if (!open || customer || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void searchBusinessCustomers(query.trim()).then(setResults).catch(() => setResults([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [open, query, customer]);

  useEffect(() => {
    if (!customer || mode !== 'invoice') {
      setInvoices([]);
      setInvoiceId('');
      return;
    }
    let live = true;
    void Promise.all([
      fetchOpenInvoices({ businessCustomerId: customer.id, payerType: 'receipt' }),
      fetchOpenInvoices({ businessCustomerId: customer.id, payerType: 'combined' }),
    ]).then(([tax, transaction]) => {
      if (live) setInvoices([...tax.results, ...transaction.results].sort((a, b) => a.document_date.localeCompare(b.document_date)));
    }).catch(() => {
      if (live) setError('טעינת החשבוניות הפתוחות נכשלה');
    });
    return () => { live = false; };
  }, [customer, mode]);

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  // An open invoice is collected by its balance, which already includes VAT.
  const breakdown = useMemo(
    () => chargeBreakdown(amount, mode === 'invoice' ? 'gross' : vatMode),
    [amount, mode, vatMode],
  );

  const categories = useMemo(
    () => businesses.find((business) => business.id === businessId)?.categories.filter((row) => row.is_active) ?? [],
    [businesses, businessId],
  );

  // Under the business סניפים the charge is a branch's: the branch is asked
  // for right after the business and must be named; a category is an extra.
  const branchesBusiness = pickedBranchesBusiness(businesses, businessId);

  function chooseCustomer(row: BusinessCustomer) {
    setCustomer(row);
    setQuery(row.full_name);
    setResults([]);
    setBusinessId(row.business_id ?? '');
    setCategoryId(row.business_category_id ?? '');
    setBranchId(row.branch_id ?? '');
    setConsent(Boolean(row.accepts_computerized_documents));
  }

  function chooseInvoice(id: string) {
    setInvoiceId(id);
    const row = invoices.find((invoice) => invoice.id === id);
    if (!row) return;
    setAmount(row.open.toFixed(2));
    setDescription(`תשלום עבור ${row.document_type_label} ${row.document_number}`);
  }

  async function submit() {
    setError('');
    if (!businessId || (categoryNeeded(branchesBusiness, true) && !categoryId)) return setError('יש לבחור עסק וקטגוריה');
    const noBranch = branchMissing(branchesBusiness, branchId);
    if (noBranch) return setError(noBranch);
    if (!breakdown || breakdown.gross < 100) return setError('יש להזין סכום תקין');
    if (!description.trim()) return setError('יש להזין תיאור לחיוב');
    if (mode === 'invoice' && !invoiceId) return setError('יש לבחור חשבונית פתוחה');
    if (!customer && !form.first_name.trim()) return setError('יש לבחור לקוח קיים או להזין לקוח חדש');
    setBusy(true);
    try {
      let customerId = customer?.id;
      if (!customerId) {
        const created = await createBusinessCustomer({
          ...form,
          business_type: '', category: '', notes: '',
          business_id: businessId,
          business_category_id: categoryId || null,
          branch_id: branchId || null,
        });
        customerId = created.id;
        if (consent) await setBusinessCustomerConsent(created.id, true);
      }
      const link = await createBusinessCharge({
        business_customer_id: customerId,
        business_id: businessId,
        business_category_id: categoryId || null,
        branch_id: branchId || null,
        target_invoice_id: mode === 'invoice' ? invoiceId : null,
        // Always the total the customer pays, VAT included, to the agora.
        amount: agorotAmount(breakdown.gross),
        description: description.trim(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
      setCopyState('idle');
      setCreated({
        url: link.public_url,
        customerName: customer?.full_name ?? `${form.first_name} ${form.last_name}`.trim(),
        phone: customer?.phone ?? form.phone,
        total: agorotShekels(breakdown.gross),
      });
      onCreated?.();
    } catch (err: unknown) {
      setError(readableError(err, 'יצירת הגבייה נכשלה. בדקו את הפרטים ונסו שוב.'));
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!created) return;
    const input = linkInputRef.current;
    const copied = await copyText(created.url, () => {
      if (!input) return false;
      input.focus();
      input.select();
      return document.execCommand('copy');
    });
    window.clearTimeout(copyTimer.current);
    if (copied) {
      setCopyState('copied');
      copyTimer.current = window.setTimeout(() => setCopyState('idle'), COPIED_FOR_MS);
      return;
    }
    // No clipboard at all: leave the link selected for a manual copy.
    input?.focus();
    input?.select();
    setCopyState('failed');
  }

  if (!open) return null;
  return (
    <div className={styles.overlay} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="business-charge-title" dir="rtl">
        <header className={styles.head}>
          <div><h2 id="business-charge-title">גבייה עסקית חד־פעמית</h2><p>קישור אישי לתשלום מאובטח ב־Cogolive, עם מסמך כספי אוטומטי.</p></div>
          <button className={styles.close} type="button" onClick={onClose} aria-label="סגירה"><X size={18} /></button>
        </header>

        {created ? (
          <>
            <div className={styles.body}>
              <div className={styles.success}>
                <span className={styles.successMark} aria-hidden="true"><Check size={22} /></span>
                <h3>הגבייה מוכנה</h3>
                <p className={styles.successSum}>{created.customerName ? `${created.customerName} · ` : ''}{created.total} כולל מע״מ</p>
                <p className={styles.hint}>
                  זה קישור חד־פעמי. שולם בתוך יממה — תופק חשבונית מס/קבלה. לא שולם בתוך יממה — תישלח ללקוח
                  חשבונית מס פתוחה, והתשלום יסגור אותה בקבלה.
                </p>
                <input
                  ref={linkInputRef}
                  className={styles.linkInput}
                  readOnly
                  dir="ltr"
                  value={created.url}
                  aria-label="קישור התשלום"
                  onFocus={(event) => event.currentTarget.select()}
                  onClick={(event) => event.currentTarget.select()}
                />
                <div className={styles.linkActions}>
                  <button
                    type="button"
                    className={`${styles.action} ${styles.actionPrimary}${copyState === 'copied' ? ` ${styles.actionDone}` : ''}`}
                    onClick={() => void copyLink()}
                  >
                    {copyState === 'copied' ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                    {copyState === 'copied' ? 'הועתק' : 'העתקת קישור'}
                  </button>
                  <a
                    className={`${styles.action} ${styles.actionWhatsApp}`}
                    href={chargeWhatsAppUrl(created.phone, chargeWhatsAppMessage({ customerName: created.customerName, amount: created.total, url: created.url }))}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle size={16} aria-hidden="true" />
                    שליחה בוואטסאפ
                  </a>
                  <a className={styles.action} href={created.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink size={16} aria-hidden="true" />
                    פתיחה
                  </a>
                </div>
                <p className={`${styles.copyNote}${copyState === 'failed' ? ` ${styles.copyNoteFailed}` : ''}`} role="status" aria-live="polite">
                  {copyState === 'copied' && 'הקישור הועתק ✓'}
                  {copyState === 'failed' && 'לא הצלחנו להעתיק — הקישור מסומן, העתיקו אותו ידנית.'}
                </p>
              </div>
            </div>
            <footer className={styles.footer}><button className={styles.secondary} type="button" onClick={onClose}>סגירה</button></footer>
          </>
        ) : (
          <>
            <div className={styles.body}>
              <div className={styles.section}>
                <h3>1. לקוח עסקי</h3>
                {customer ? (
                  <div className={styles.selected}><span>{customer.full_name}{customer.company_number ? ` · ח.פ. ${customer.company_number}` : ''}</span><button type="button" className={styles.close} onClick={() => { setCustomer(null); setQuery(''); }}>×</button></div>
                ) : (
                  <div className={styles.grid}>
                    <div className={`${styles.field} ${styles.fieldFull}`}><label htmlFor="charge-customer-search">חיפוש לקוח קיים או שם לקוח חדש</label><input id="charge-customer-search" value={query} onChange={(e) => { setQuery(e.target.value); const [first, ...rest] = e.target.value.trim().split(/\s+/); setForm((old) => ({ ...old, first_name: first ?? '', last_name: rest.join(' ') })); }} placeholder="שם, טלפון, אימייל, ת.ז או ח.פ" /></div>
                    {results.length > 0 && <ul className={`${styles.results} ${styles.fieldFull}`}>{results.slice(0, 6).map((row) => <li key={row.id}><button className={styles.result} type="button" onClick={() => chooseCustomer(row)}><strong>{row.full_name}</strong><span>{row.company_number || row.phone}</span></button></li>)}</ul>}
                    <div className={styles.field}><label>שם פרטי / עסק</label><input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></div>
                    <div className={styles.field}><label>שם משפחה</label><input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></div>
                    <div className={styles.field}><label>ח.פ / ע.מ</label><input value={form.company_number} onChange={(e) => setForm({ ...form, company_number: e.target.value })} /></div>
                    <div className={styles.field}><label>טלפון</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                    <div className={styles.field}><label>אימייל</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                    <div className={styles.field}><label>כתובת</label><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
                    <label className={`${styles.consent} ${styles.fieldFull}`}><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />הלקוח הסכים לקבל מסמכים ממוחשבים במייל. בלי הסכמה, המקור ימתין למסירה ידנית.</label>
                  </div>
                )}
              </div>

              <div className={styles.section}>
                <h3>2. שיוך ההכנסה</h3>
                <div className={styles.grid}>
                  <div className={styles.field}><label htmlFor="charge-business">עסק</label><select id="charge-business" value={businessId} onChange={(e) => { setBusinessId(e.target.value); setCategoryId(''); }}><option value="">בחירה</option>{businesses.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div>
                  {branchesBusiness ? (
                    <>
                      <div className={styles.field}><label htmlFor="charge-branch">סניף</label><select id="charge-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)}><option value="">בחירה</option>{branches.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div>
                      <div className={`${styles.field} ${styles.fieldFull}`}><label htmlFor="charge-category">קטגוריה (לא חובה)</label><select id="charge-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}><option value="">בלי קטגוריה</option>{categories.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div>
                    </>
                  ) : (
                    <>
                      <div className={styles.field}><label htmlFor="charge-category">קטגוריה</label><select id="charge-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={!businessId}><option value="">בחירה</option>{categories.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div>
                      <div className={`${styles.field} ${styles.fieldFull}`}><label htmlFor="charge-branch">סניף (אופציונלי)</label><select id="charge-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)}><option value="">ללא סניף</option>{branches.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div>
                    </>
                  )}
                </div>
                {branchesBusiness && <p className={styles.hint}>ההכנסה תירשם בסניף שנבחר.</p>}
              </div>

              <div className={styles.section}>
                <h3>3. מה גובים</h3>
                <div className={styles.mode}><button type="button" aria-pressed={mode === 'new'} className={mode === 'new' ? styles.active : ''} onClick={() => setMode('new')}>עסקה חדשה</button><button type="button" aria-pressed={mode === 'invoice'} className={mode === 'invoice' ? styles.active : ''} onClick={() => { setMode('invoice'); setVatMode('gross'); }} disabled={!customer}>חשבונית פתוחה</button></div>
                {mode === 'invoice' && <div className={styles.field}><label>חשבונית</label><select value={invoiceId} onChange={(e) => chooseInvoice(e.target.value)}><option value="">בחירה</option>{invoices.map((row) => <option key={row.id} value={row.id}>{row.document_type_label} {row.document_number} · נותר ₪{row.open.toLocaleString('he-IL', { minimumFractionDigits: 2 })}</option>)}</select>{invoices.length === 0 && <p className={styles.hint}>אין ללקוח חשבוניות פתוחות מהסוגים שניתנים לגבייה.</p>}</div>}
                <div className={styles.grid}>
                  {mode === 'invoice' ? (
                    <div className={styles.field}><label htmlFor="charge-amount">סכום כולל מע״מ</label><input id="charge-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={Boolean(invoiceId)} /></div>
                  ) : (
                    <div className={`${styles.field} ${styles.fieldFull}`}>
                      <label htmlFor="charge-amount">סכום</label>
                      <div className={styles.amountRow}>
                        <input id="charge-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-describedby="charge-breakdown" />
                        <div className={styles.vatToggle} role="group" aria-label="הסכום שהוזן">
                          <button type="button" aria-pressed={vatMode === 'gross'} className={vatMode === 'gross' ? styles.active : ''} onClick={() => setVatMode('gross')}>כולל מע״מ</button>
                          <button type="button" aria-pressed={vatMode === 'net'} className={vatMode === 'net' ? styles.active : ''} onClick={() => setVatMode('net')}>לפני מע״מ</button>
                        </div>
                      </div>
                      <dl id="charge-breakdown" className={styles.breakdown}>
                        <div><dt>לפני מע״מ</dt><dd>{breakdown ? agorotShekels(breakdown.net) : '—'}</dd></div>
                        <div><dt>מע״מ ({VAT_PERCENT}%)</dt><dd>{breakdown ? agorotShekels(breakdown.vat) : '—'}</dd></div>
                        <div className={styles.breakdownTotal}><dt>סה״כ לתשלום</dt><dd>{breakdown ? agorotShekels(breakdown.gross) : '—'}</dd></div>
                      </dl>
                    </div>
                  )}
                  <div className={`${styles.field} ${styles.fieldFull}`}><label>תיאור שיופיע במסמך</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} /></div>
                </div>
                <p className={styles.warning}>התשלום יתבצע רק בעמוד Cogolive. בחיוב מעל סף מספר ההקצאה, המסמך יירשם אך המקור יוחזק עד הזנת המספר.</p>
              </div>
              {error && <p className={styles.error}>{error}</p>}
            </div>
            <footer className={styles.footer}><button className={styles.primary} type="button" disabled={busy} onClick={() => void submit()}>{busy ? 'יוצר גבייה…' : 'יצירת קישור גבייה'}</button><button className={styles.secondary} type="button" disabled={busy} onClick={onClose}>ביטול</button></footer>
          </>
        )}
      </section>
    </div>
  );
}
