'use client';

import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { ChevronDown, FileText } from 'lucide-react';
import SignatureCanvas from '@/app/widget/SignatureCanvas';
import { useReadToEnd } from '@/hooks/useReadToEnd';
import { israeliIdFieldError, sanitizeIsraeliIdInput } from '@/lib/israeliId';
import { fetchSigningContract, signingPdfUrl, submitContractSignature } from '@/lib/rentalSigningApi';
import card from '@/app/card-link/card-link.module.css';
import styles from '../signing.module.css';
import {
  GONE_COPY,
  INITIAL_SIGNING_STATE,
  billingDayText,
  canSubmitSignature,
  initialSigner,
  missingForSignature,
  missingLine,
  moneyText,
  periodText,
  shouldRecheckAfterSubmit,
  signaturePayload,
  signedAtText,
  signingReducer,
  telHref,
  vatPercentLabel,
  versionLine,
  type SignatureDraft,
} from '../signingFlow';

const ACCEPT_TEXT = 'קראתי את החוזה ואני מאשר/ת את תנאיו, ומסכים/ה לקבל חשבוניות וקבלות בדוא״ל כמסמך ממוחשב';

/**
 * The tenant's page for a rental contract the office sent (the tenant path,
 * phase 3), opened from WhatsApp on a phone: the details, the text — scrolled
 * to its end before it can be accepted — the PDF, the name and ID, a finger
 * signature and one tick. Where the contract stands is the server's to say;
 * signingFlow.ts maps each answer to a screen.
 */
export default function RentalSigningPage() {
  const params = useParams();
  const token = typeof params?.token === 'string' ? params.token : '';
  const [state, dispatch] = useReducer(signingReducer, INITIAL_SIGNING_STATE);
  const { view, contract, message } = state;
  const version = contract?.version ?? 0;
  const reader = useReadToEnd(version);

  const [signerName, setSignerName] = useState('');
  const [signerId, setSignerId] = useState('');
  const [idTouched, setIdTouched] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const alive = useRef(true);
  const prefilled = useRef(false);
  const lastVersion = useRef(version);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(
    async ({ keepMessage = false, recheck = false }: { keepMessage?: boolean; recheck?: boolean } = {}) => {
      try {
        const data = await fetchSigningContract(token);
        if (alive.current) dispatch({ type: 'loaded', contract: data, keepMessage });
      } catch (error) {
        if (alive.current) dispatch({ type: 'loadFailed', error, recheck });
      }
    },
    [token],
  );

  useEffect(() => {
    if (!token) {
      dispatch({ type: 'noToken' });
      return;
    }
    void load();
  }, [token, load]);

  // The form starts from the tenant as the office entered them — once, so a
  // correction the tenant typed survives the contract being read again.
  useEffect(() => {
    if (!contract || prefilled.current) return;
    prefilled.current = true;
    const initial = initialSigner(contract);
    setSignerName(initial.name);
    setSignerId(initial.id);
  }, [contract]);

  // A different version (the office changed it after a 409) is read, ticked and signed afresh.
  useEffect(() => {
    if (lastVersion.current === version) return;
    lastVersion.current = version;
    setAccepted(false);
    setSignature(null);
  }, [version]);

  // The result screens are one card at the top; the tenant's thumb is at the bottom of a long form.
  useEffect(() => {
    if (view !== 'open' && view !== 'loading') window.scrollTo({ top: 0 });
  }, [view]);

  const draft: SignatureDraft = { signerName, signerId, signature, readToEnd: reader.reachedEnd, accepted };
  const missing = missingForSignature(draft);
  const canSubmit = canSubmitSignature(draft, { view, submitting });
  const idError = idTouched ? israeliIdFieldError(signerId) : null;

  async function submit() {
    if (!canSubmit || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    dispatch({ type: 'submitStarted' });
    const payload = signaturePayload(draft);
    try {
      const result = await submitContractSignature(token, payload);
      if (alive.current) dispatch({ type: 'signed', result, signerName: payload.signer_name });
    } catch (error) {
      if (!alive.current) return;
      dispatch({ type: 'submitFailed', error });
      // Signed already, changed, or no answer: show what the server holds now, keeping its words.
      if (shouldRecheckAfterSubmit(error)) await load({ keepMessage: true, recheck: true });
    } finally {
      submittingRef.current = false;
      if (alive.current) setSubmitting(false);
    }
  }

  function retry() {
    dispatch({ type: 'reload' });
    void load();
  }

  const headerNote = view === 'open' || view === 'signed' ? versionLine(contract) : '';

  function renderOpen(): ReactNode {
    if (!contract) return null;
    const { tenant, studio } = contract;
    const vat = vatPercentLabel(contract.vat_rate);
    const lessor = [studio.name, studio.company_number ? `ח.פ ${studio.company_number}` : ''].filter(Boolean).join(' · ');

    return (
      <>
        <section className={card.card} aria-labelledby="tenant-title">
          <h2 id="tenant-title" className={card.cardTitle}>
            פרטי השוכר
          </h2>
          <Row label="שם" value={tenant.name} />
          <Row label="תעודת זהות" value={tenant.id_number} ltr />
          <Row label="טלפון" value={tenant.phone} ltr />
          <Row label="דוא״ל" value={tenant.email} ltr />
          <Row label="המשכיר" value={lessor} />
        </section>

        <section className={card.card} aria-labelledby="slots-title">
          <h2 id="slots-title" className={card.cardTitle}>
            המשבצות והתשלום
          </h2>
          {contract.slots.length > 0 && (
            <ul className={styles.slots}>
              {contract.slots.map((slot, index) => (
                <li key={`${slot.label}-${index}`} className={styles.slot}>
                  <div className={styles.slotMain}>
                    <span className={styles.slotLabel}>{slot.label || 'משבצת'}</span>
                    <span className={styles.slotWhen}>{[slot.weekday_or_date, slot.hours].filter(Boolean).join(' · ')}</span>
                  </div>
                  <div className={styles.slotMoney}>
                    <span className={styles.slotMonthly}>
                      {moneyText(slot.monthly)} {slot.one_time ? 'סה״כ' : 'לחודש'}
                    </span>
                    {slot.rate && <span className={styles.slotRate}>{moneyText(slot.rate)} למפגש</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Row label="לחודש, לפני מע״מ" value={moneyText(contract.monthly_amount)} />
          <Row label={vat ? `מע״מ (${vat})` : 'מע״מ'} value={moneyText(contract.vat_amount)} />
          <div className={card.total}>
            <span className={card.totalLabel}>סה״כ לחודש</span>
            <span className={card.totalAmount}>{moneyText(contract.monthly_total)}</span>
          </div>
        </section>

        <section className={card.card} aria-labelledby="terms-title">
          <h2 id="terms-title" className={card.cardTitle}>
            החיוב והתקופה
          </h2>
          <Row label="יום החיוב" value={billingDayText(contract.billing_day)} />
          <Row label="תקופת השכירות" value={periodText(contract.start_date, contract.end_date)} />
        </section>

        <section className={card.card} aria-labelledby="text-title">
          <h2 id="text-title" className={card.cardTitle}>
            נוסח החוזה
          </h2>
          <div className={styles.docWrap}>
            <div
              ref={reader.attach}
              onScroll={reader.onScroll}
              className={styles.doc}
              // A keyboard reader scrolls it with the arrows.
              tabIndex={0}
              role="region"
              aria-labelledby="text-title"
            >
              <div>
                {contract.document.length ? (
                  contract.document.map((paragraph, index) => (
                    <p key={index} className={styles.docPara}>
                      {paragraph}
                    </p>
                  ))
                ) : (
                  <p className={styles.docEmpty}>הנוסח המלא נמצא בקובץ ה־PDF.</p>
                )}
              </div>
            </div>
            {reader.canJump && (
              <button type="button" className={styles.docJump} onClick={reader.jumpToEnd} aria-label="מעבר לסוף החוזה">
                <ChevronDown size={20} aria-hidden="true" />
              </button>
            )}
          </div>
          {!reader.reachedEnd && (
            <p className={styles.readHint} id="read-hint">
              יש לגלול את החוזה עד הסוף — רק אז אפשר לסמן את האישור ולחתום.
            </p>
          )}
          <a className={styles.pdfLink} href={signingPdfUrl(token)} target="_blank" rel="noopener noreferrer">
            <FileText size={17} aria-hidden="true" />
            הורדת החוזה (PDF)
          </a>
        </section>

        <section className={card.card} aria-labelledby="sign-title">
          <h2 id="sign-title" className={card.cardTitle}>
            חתימה
          </h2>
          <div className={card.fields}>
            <div>
              <label className={card.label} htmlFor="signer-name">
                שם מלא
              </label>
              <input
                id="signer-name"
                className={card.input}
                autoComplete="name"
                value={signerName}
                onChange={(event) => setSignerName(event.target.value)}
                disabled={submitting}
              />
            </div>

            <div>
              <label className={card.label} htmlFor="signer-id">
                תעודת זהות
              </label>
              <input
                id="signer-id"
                className={`${card.input} ${idError ? card.inputInvalid : ''}`}
                inputMode="numeric"
                autoComplete="off"
                value={signerId}
                onChange={(event) => setSignerId(sanitizeIsraeliIdInput(event.target.value))}
                onBlur={() => setIdTouched(true)}
                aria-invalid={Boolean(idError)}
                aria-describedby={idError ? 'signer-id-error' : undefined}
                disabled={submitting}
              />
              {idError && (
                <p className={card.fieldError} id="signer-id-error">
                  {idError}
                </p>
              )}
            </div>

            <div>
              <span className={card.label} id="pad-label">
                חתימה באצבע
              </span>
              <div role="group" aria-labelledby="pad-label">
                {/* A new version gets a clean pad. */}
                <SignatureCanvas key={version} onChange={setSignature} clearLabel="ניקוי" />
              </div>
              <p className={styles.padNote}>חתמו בתוך המסגרת. אפשר לנקות ולחתום שוב.</p>
            </div>

            <label
              className={[styles.check, accepted && reader.reachedEnd ? styles.checkOn : '', reader.reachedEnd ? '' : styles.checkLocked]
                .filter(Boolean)
                .join(' ')}
            >
              <input
                type="checkbox"
                checked={accepted && reader.reachedEnd}
                disabled={!reader.reachedEnd || submitting}
                onChange={(event) => setAccepted(event.target.checked)}
                aria-describedby={reader.reachedEnd ? undefined : 'read-hint'}
              />
              <span>{ACCEPT_TEXT}</span>
            </label>
          </div>
        </section>

        {message && (
          <p className={`${card.errorBox} ${styles.message}`} role="alert">
            {message}
          </p>
        )}

        <button type="button" className={card.submit} disabled={!canSubmit} onClick={() => void submit()}>
          {submitting ? 'שולח את החתימה…' : 'חתימה ואישור'}
        </button>
        {!submitting && missing.length > 0 && <p className={styles.missing}>{missingLine(missing)}</p>}
      </>
    );
  }

  function renderSigned(): ReactNode {
    const when = signedAtText(contract?.signed_at);
    const who = contract?.signer_name ? `, על ידי ${contract.signer_name}` : '';
    return (
      <div className={card.card}>
        <div className={card.result} role="status">
          <p className={styles.signedTitle}>החוזה נחתם ✓</p>
          {when && (
            <p className={card.resultText}>
              נחתם ב־{when}
              {who}
            </p>
          )}
          <a
            className={`${styles.pdfLink} ${styles.resultLink}`}
            href={signingPdfUrl(token, { signed: true })}
            target="_blank"
            rel="noopener noreferrer"
          >
            <FileText size={17} aria-hidden="true" />
            הורדת העותק החתום (PDF)
          </a>
          {/* Neutral until the card step exists: the office arranges payment for now. */}
          <p className={styles.nextStep}>המשרד ייצור איתכם קשר להסדרת התשלום החודשי</p>
        </div>
      </div>
    );
  }

  function renderGone(kind: 'expired' | 'cancelled'): ReactNode {
    const phone = contract?.studio.phone ?? '';
    const href = telHref(phone);
    return (
      <div className={card.card}>
        <div className={card.result} role="alert">
          <div className={`${card.resultIcon} ${card.iconFail}`} aria-hidden="true">
            !
          </div>
          <p className={card.resultTitle}>{GONE_COPY[kind].title}</p>
          <p className={`${card.resultText} ${styles.message}`}>{message || GONE_COPY[kind].text}</p>
          <p className={styles.askOffice}>בקשו מהמשרד קישור חדש</p>
          {href && (
            <a className={styles.phoneLink} href={href}>
              <bdi dir="ltr">{phone}</bdi>
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={card.page} dir="rtl">
      <header className={card.header}>
        <div className={card.brand}>קוגומלו</div>
        <h1 className={card.title}>חוזה שכירות</h1>
        {headerNote && <p className={card.headerNote}>{headerNote}</p>}
      </header>

      <main className={card.body}>
        {view === 'loading' && (
          <div className={card.card}>
            <div className={card.result} role="status">
              <div className={card.spinner} />
              <p className={card.resultText}>טוען את החוזה…</p>
            </div>
          </div>
        )}

        {view === 'invalid' && (
          <div className={card.card}>
            <div className={card.result} role="alert">
              <div className={`${card.resultIcon} ${card.iconFail}`} aria-hidden="true">
                !
              </div>
              <p className={card.resultTitle}>לא ניתן לפתוח את הקישור</p>
              <p className={`${card.resultText} ${styles.message}`}>{message}</p>
            </div>
          </div>
        )}

        {view === 'unavailable' && (
          <div className={card.card}>
            <div className={card.result} role="alert">
              <div className={`${card.resultIcon} ${card.iconFail}`} aria-hidden="true">
                !
              </div>
              <p className={card.resultTitle}>לא הצלחנו לטעון את החוזה</p>
              <p className={`${card.resultText} ${styles.message}`}>{message}</p>
              <button type="button" className={styles.retry} onClick={retry}>
                נסו שוב
              </button>
            </div>
          </div>
        )}

        {(view === 'expired' || view === 'cancelled') && renderGone(view)}
        {view === 'signed' && renderSigned()}
        {view === 'open' && renderOpen()}
      </main>
    </div>
  );
}

/** A summary line; nothing at all when there is no value, so the tenant never reads an empty field. */
function Row({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) {
  if (!value) return null;
  return (
    <div className={card.row}>
      <span className={card.rowLabel}>{label}</span>
      <span className={`${card.rowValue} ${ltr ? styles.ltr : ''}`}>{value}</span>
    </div>
  );
}
