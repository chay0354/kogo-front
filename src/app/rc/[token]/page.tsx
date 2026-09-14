'use client';

import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { FileText } from 'lucide-react';
import CardFields, { type CardField } from '@/app/card-link/CardFields';
import card from '@/app/card-link/card-link.module.css';
import signing from '@/app/s/signing.module.css';
import { billingDayText, moneyText, periodText, signedContractToken } from '@/app/s/signingFlow';
import { israeliIdFieldError } from '@/lib/israeliId';
import { fetchCardPage, submitCardPage } from '@/lib/rentalBillingApi';
import { signingPdfUrl } from '@/lib/rentalSigningApi';
import styles from '../cardPage.module.css';
import {
  BLOCKED_TITLE,
  DISABLED_TITLE,
  EMPTY_CARD_DRAFT,
  GONE_COPY,
  INITIAL_CARD_STATE,
  REVIEW_TITLE,
  canSubmitCard,
  cardHeaderNote,
  cardMissingLine,
  cardPayload,
  cardProblems,
  cardReducer,
  chargePlanText,
  shouldRecheckAfterCardSubmit,
  submitLabel,
  successLines,
  type CardDraft,
} from '../cardFlow';

/**
 * The tenant's page for their studio's monthly standing order (the tenant
 * path, phase 4), opened on a phone from the link the office sent, or straight
 * after signing the contract: what they pay a month, the billing day and the
 * dates, what today's card does — charges the month it owes, or only checks
 * the card — and the card form. Where the order and the link stand is the
 * server's to say; cardFlow.ts maps each answer to a screen.
 *
 * A tenant who arrived straight from the signing is told so at the top, with
 * the signed copy one tap away: they were moved on without a click, and must
 * never feel the contract was left behind.
 */
export default function RentalCardPage() {
  const params = useParams();
  const token = typeof params?.token === 'string' ? params.token : '';
  const [state, dispatch] = useReducer(cardReducer, INITIAL_CARD_STATE);
  const { view, preview, result, message } = state;

  const [draft, setDraft] = useState<CardDraft>(EMPTY_CARD_DRAFT);
  const [idTouched, setIdTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // The contract the tenant signed on the way here, when the signing page named it.
  const [signedToken, setSignedToken] = useState('');
  // Read by a second tap before the state has re-rendered, so it sends nothing.
  const submittingRef = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(
    async ({ keepMessage = false, recheck = false }: { keepMessage?: boolean; recheck?: boolean } = {}) => {
      try {
        const data = await fetchCardPage(token);
        if (alive.current) dispatch({ type: 'loaded', preview: data, keepMessage });
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

  // Read once, from the address itself: nothing renders it on the server.
  useEffect(() => {
    setSignedToken(signedContractToken(window.location.search));
  }, []);

  // The card is not kept a moment past the form that asked for it, and the
  // result screens are one card at the top while the tenant's thumb is at the bottom.
  useEffect(() => {
    if (view === 'form' || view === 'loading') return;
    setDraft(EMPTY_CARD_DRAFT);
    setIdTouched(false);
    window.scrollTo({ top: 0 });
  }, [view]);

  const problems = cardProblems(draft);
  const canSubmit = canSubmitCard(draft, { view, submitting });
  const idError = idTouched ? israeliIdFieldError(draft.cardHolderId) : null;

  function setField(field: CardField, value: string) {
    setDraft((prev) => ({ ...prev, [field]: value }));
  }

  async function submit() {
    if (!canSubmit || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    dispatch({ type: 'submitStarted' });
    try {
      const answer = await submitCardPage(token, cardPayload(draft));
      if (alive.current) dispatch({ type: 'submitted', result: answer });
    } catch (error) {
      if (!alive.current) return;
      dispatch({ type: 'submitFailed', error });
      // No answer, or a server that broke on the way: the card may have gone in. Show what the server holds now.
      if (shouldRecheckAfterCardSubmit(error)) await load({ keepMessage: true, recheck: true });
    } finally {
      submittingRef.current = false;
      if (alive.current) setSubmitting(false);
    }
  }

  function retry() {
    dispatch({ type: 'reload' });
    void load();
  }

  function renderForm(): ReactNode {
    if (!preview) return null;
    const plan = chargePlanText(preview);
    return (
      <>
        <section className={card.card} aria-labelledby="order-title">
          <h2 id="order-title" className={card.cardTitle}>
            הוראת הקבע
          </h2>
          <Row label="שוכר" value={preview.tenant_name} />
          <Row label="סניף" value={preview.branch_name} />
          <Row label="לחודש, לפני מע״מ" value={moneyText(preview.amount_before_vat)} />
          <Row label="מע״מ" value={moneyText(preview.vat_amount)} />
          <div className={card.total}>
            <span className={card.totalLabel}>סה״כ לחודש</span>
            <span className={card.totalAmount}>{moneyText(preview.monthly_total)}</span>
          </div>
        </section>

        <section className={card.card} aria-labelledby="terms-title">
          <h2 id="terms-title" className={card.cardTitle}>
            החיוב והתקופה
          </h2>
          <Row label="יום החיוב" value={billingDayText(preview.billing_day)} />
          <Row label="תקופה" value={periodText(preview.start_date, preview.end_date)} />
          {plan.chargesToday ? (
            <div className={card.total}>
              <span className={card.totalLabel}>{plan.title}</span>
              <span className={card.totalAmount}>{plan.amount}</span>
            </div>
          ) : (
            <div className={styles.verify}>
              <span className={styles.verifyTitle}>{plan.title}</span>
            </div>
          )}
          {plan.note && <p className={card.note}>{plan.note}</p>}
        </section>

        <CardFields
          values={draft}
          onChange={setField}
          idError={idError}
          onIdBlur={() => setIdTouched(true)}
          disabled={submitting}
        />

        {message && (
          <p className={`${card.errorBox} ${signing.message}`} role="alert">
            {message}
          </p>
        )}

        <button type="button" className={card.submit} disabled={!canSubmit} onClick={() => void submit()}>
          {submitLabel(preview, submitting)}
        </button>
        {!submitting && problems.length > 0 && <p className={signing.missing}>{cardMissingLine(problems)}</p>}
        <p className={card.secure}>התשלום מאובטח ומעובד בטרנזילה</p>
      </>
    );
  }

  function renderSuccess(): ReactNode {
    const lines = successLines(result);
    return (
      <div className={card.card}>
        <div className={card.result} role="status">
          <p className={signing.signedTitle}>{lines.title}</p>
          <div className={styles.resultLines}>
            <p className={card.resultText}>{lines.charged}</p>
            {lines.next && <p className={card.resultText}>{lines.next}</p>}
          </div>
        </div>
      </div>
    );
  }

  function renderGone(kind: 'expired' | 'cancelled' | 'closed'): ReactNode {
    return (
      <ResultCard icon="!" iconClass={card.iconFail} title={GONE_COPY[kind].title} alert>
        <p className={`${card.resultText} ${signing.message}`}>{message || GONE_COPY[kind].text}</p>
        <p className={signing.askOffice}>בקשו מהמשרד קישור חדש</p>
      </ResultCard>
    );
  }

  const headerNote = view === 'form' || view === 'success' ? cardHeaderNote(preview) : '';

  return (
    <div className={card.page} dir="rtl">
      <header className={card.header}>
        <div className={card.brand}>קוגומלו</div>
        <h1 className={card.title}>הוראת קבע לשכירות</h1>
        {headerNote && <p className={card.headerNote}>{headerNote}</p>}
      </header>

      <main className={card.body}>
        {signedToken && (
          <div className={styles.signedNote} role="status">
            <span>החוזה נחתם ✓ והעותק החתום נשלח אליכם בדוא״ל.</span>
            <a
              className={styles.signedNoteLink}
              href={signingPdfUrl(signedToken, { signed: true })}
              target="_blank"
              rel="noopener noreferrer"
            >
              <FileText size={15} aria-hidden="true" />
              הורדת העותק החתום
            </a>
          </div>
        )}

        {view === 'loading' && (
          <div className={card.card}>
            <div className={card.result} role="status">
              <div className={card.spinner} />
              <p className={card.resultText}>טוען את פרטי התשלום…</p>
            </div>
          </div>
        )}

        {view === 'form' && renderForm()}
        {view === 'success' && renderSuccess()}

        {view === 'disabled' && <ResultCard icon="!" iconClass={styles.iconWait} title={DISABLED_TITLE} />}

        {view === 'review' && (
          <ResultCard icon="!" iconClass={styles.iconWait} title={REVIEW_TITLE}>
            {message && <p className={`${card.resultText} ${signing.message}`}>{message}</p>}
          </ResultCard>
        )}

        {view === 'used' && (
          <ResultCard icon="✓" iconClass={card.iconOk} title={GONE_COPY.used.title}>
            <p className={`${card.resultText} ${signing.message}`}>{message || GONE_COPY.used.text}</p>
          </ResultCard>
        )}

        {(view === 'expired' || view === 'cancelled' || view === 'closed') && renderGone(view)}

        {view === 'blocked' && (
          <ResultCard icon="!" iconClass={card.iconFail} title={BLOCKED_TITLE} alert>
            <p className={`${card.resultText} ${signing.message}`}>{message}</p>
          </ResultCard>
        )}

        {view === 'invalid' && (
          <ResultCard icon="!" iconClass={card.iconFail} title="לא ניתן לפתוח את הקישור" alert>
            <p className={`${card.resultText} ${signing.message}`}>{message}</p>
          </ResultCard>
        )}

        {view === 'unavailable' && (
          <ResultCard icon="!" iconClass={card.iconFail} title="לא הצלחנו לטעון את פרטי התשלום" alert>
            <p className={`${card.resultText} ${signing.message}`}>{message}</p>
            <button type="button" className={signing.retry} onClick={retry}>
              נסו שוב
            </button>
          </ResultCard>
        )}
      </main>
    </div>
  );
}

/** One result screen: its mark, its title, and what it says. */
function ResultCard({
  icon,
  iconClass,
  title,
  alert = false,
  children,
}: {
  icon: string;
  iconClass: string;
  title: string;
  alert?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={card.card}>
      <div className={card.result} role={alert ? 'alert' : 'status'}>
        <div className={`${card.resultIcon} ${iconClass}`} aria-hidden="true">
          {icon}
        </div>
        <p className={card.resultTitle}>{title}</p>
        {children}
      </div>
    </div>
  );
}

/** A summary line; nothing at all when there is no value, so the tenant never reads an empty field. */
function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className={card.row}>
      <span className={card.rowLabel}>{label}</span>
      <span className={card.rowValue}>{value}</span>
    </div>
  );
}
