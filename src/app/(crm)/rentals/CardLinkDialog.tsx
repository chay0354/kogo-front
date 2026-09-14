'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Copy, Loader2, MessageCircle, RefreshCw, Send } from 'lucide-react';
import { useDialogExit } from '@/components/ui/motion';
import { createCardLink, sendCardLinkWhatsApp, type CardLinkInfo, type StandingOrder } from '@/lib/rentalBillingApi';
import type { Tenancy } from '@/lib/rentalsApi';
import DialogShell from './DialogShell';
import { ToneChip } from './StatusChips';
import {
  billingApiError,
  billingMoney,
  cardLinkAttemptsText,
  cardLinkStateText,
  cardLinkWhatsAppMessage,
  liveCardLink,
  orderActions,
  orderStatusLabel,
  orderStatusTone,
} from './billingUtils';
import { absoluteSigningUrl, signingExpiryText, whatsAppSendNote, whatsAppUrl } from './signingUtils';
import { billingDayLabel, isUnknownOutcome, tenantName } from './tenancyUtils';
import styles from './rentalsDialog.module.css';

/** What the dialog is waiting on while a request is out. */
type Busy = 'create' | 'rotate' | 'send';

interface CardLinkDialogProps {
  /** The row it was opened from — for the tenant's name, phone and branch. */
  tenancy: Tenancy;
  /** The order, as the list reads it now. */
  order: StandingOrder;
  billingEnabled: boolean;
  onClose: () => void;
  /** A link was made, or may have been — the list should read the server again. */
  onChanged: () => void;
}

/**
 * "קישור לכרטיס": the tenant's link to their card page (/rc/<token>), for the
 * office to send itself — copied, or typed into the office user's own WhatsApp
 * by a wa.me link. Nothing is sent from here.
 *
 * It opens on the live link when the order has one; otherwise it asks the
 * server for one at once, since that is what the office came for — except
 * while a try is running on the last link or waiting in review, which the
 * office should look at first. A new link is confirmed in place, because it
 * stops the one the tenant may already hold. Every refusal shows in the
 * server's words.
 */
export default function CardLinkDialog({ tenancy, order, billingEnabled, onClose, onChanged }: CardLinkDialogProps) {
  const { closing, requestClose } = useDialogExit(onClose);
  // The server's answer to this dialog's own request is newer than the list it opened on.
  const [answered, setAnswered] = useState<CardLinkInfo | null>(null);
  const [busy, setBusy] = useState<Busy | null>(null);
  const busyRef = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState('');
  // What the last automatic send did — free text or a template is not the same thing.
  const [sendNote, setSendNote] = useState('');
  // Once the office has acted (or the first link was asked for), nothing is made without a click.
  const actedRef = useRef(false);
  const linkInputRef = useRef<HTMLInputElement>(null);

  const link = answered ?? order.card_link;
  const linkable = orderActions(order).cardLink;
  const live = linkable ? liveCardLink(link) : null;
  const url = live ? absoluteSigningUrl(live.url, typeof window === 'undefined' ? '' : window.location.origin) : '';
  const expiry = live ? signingExpiryText(live.expiresAt) : '';
  const attempts = cardLinkAttemptsText(link);
  const name = tenantName(tenancy.tenant);
  const phone = (tenancy.tenant?.phone || order.tenant?.phone || '').trim();
  const waUrl = url
    ? whatsAppUrl(
        phone,
        cardLinkWhatsAppMessage({
          tenant: tenancy.tenant,
          url,
          branchName: order.branch_name || tenancy.branch_name,
          monthlyTotal: order.monthly_total,
          expiresAt: live?.expiresAt,
        }),
      )
    : null;
  const needsLink = linkable && !live && link?.status !== 'processing' && link?.status !== 'review';

  async function run(action: Busy) {
    if (busyRef.current) return;
    busyRef.current = true;
    actedRef.current = true;
    setBusy(action);
    setProblem('');
    setConfirming(false);
    try {
      const next = await createCardLink(order.id);
      setAnswered(next);
      if (action === 'rotate') toast.success('נוצר קישור חדש. הקישור הקודם כבר לא נפתח');
    } catch (err) {
      // The list is read again below; an answer from before must not hide what the server holds now.
      setAnswered(null);
      setProblem(
        isUnknownOutcome(err)
          ? 'לא התקבלה תשובה מהשרת, ולכן לא ברור אם נוצר קישור. הפרטים מתרעננים — בדקו בהם לפני שמנסים שוב.'
          : billingApiError(err, 'יצירת הקישור נכשלה'),
      );
    } finally {
      busyRef.current = false;
      setBusy(null);
      onChanged();
    }
  }

  // Opened with no live link: make one, once. `run` is this render's; the ref keeps it to one.
  useEffect(() => {
    if (!needsLink || actedRef.current) return;
    void run('create');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsLink]);

  /**
   * The server sends the link itself, through ManyChat. It makes no link and
   * replaces none, so this is safe to press twice — the tenant gets the same
   * URL again. Everything the server refuses is shown in its own words.
   */
  async function send() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy('send');
    setProblem('');
    setSendNote('');
    try {
      const result = await sendCardLinkWhatsApp(order.id);
      setSendNote(whatsAppSendNote(result));
      toast.success('הקישור נשלח לשוכר בוואטסאפ');
    } catch (err) {
      setProblem(
        isUnknownOutcome(err)
          ? 'לא התקבלה תשובה מהשרת, ולכן לא ברור אם ההודעה נשלחה. בדקו מול השוכר לפני שליחה נוספת.'
          : billingApiError(err, 'שליחת ההודעה נכשלה'),
      );
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('הקישור הועתק');
    } catch {
      // No clipboard (an insecure page, a refused permission): leave it selected for a manual copy.
      linkInputRef.current?.focus();
      linkInputRef.current?.select();
      toast.error('לא הצלחנו להעתיק — הקישור מסומן, העתיקו אותו ידנית');
    }
  }

  function renderConfirm(): ReactNode {
    if (!confirming) return null;
    return (
      <div className={styles.savedNotice} role="group" aria-labelledby="card-link-confirm-title">
        <p id="card-link-confirm-title" className={styles.savedTitle}>
          ליצור קישור חדש?
        </p>
        <p className={styles.savedText}>
          הקישור הנוכחי יפסיק להיפתח מיד — גם אם כבר נשלח לשוכר — ואת החדש צריך לשלוח שוב.
        </p>
        <div className={styles.voidActions}>
          <button type="button" className={styles.secondaryBtn} onClick={() => setConfirming(false)}>
            חזרה
          </button>
          <button type="button" className={styles.primaryBtn} onClick={() => void run('rotate')} autoFocus>
            יצירת קישור חדש
          </button>
        </div>
      </div>
    );
  }

  function renderLink(): ReactNode {
    if (url) {
      return (
        <section className={styles.section} aria-labelledby="card-link-title">
          <h3 id="card-link-title" className={styles.sectionTitle}>
            הקישור לשוכר
          </h3>
          <div className={styles.linkRow}>
            <input
              ref={linkInputRef}
              readOnly
              value={url}
              className={`${styles.input} ${styles.ltr} ${styles.linkInput}`}
              aria-label="הקישור להזנת הכרטיס"
              aria-describedby={expiry ? 'card-link-expiry' : undefined}
              onFocus={(event) => event.currentTarget.select()}
            />
            <button type="button" className={styles.secondaryBtn} onClick={() => void copy()}>
              <Copy size={15} aria-hidden="true" />
              העתקה
            </button>
          </div>
          {expiry && (
            <p id="card-link-expiry" className={styles.help}>
              {expiry}
            </p>
          )}
          {attempts && <p className={styles.help}>{attempts}</p>}
          {waUrl ? (
            <div className={styles.waBlock}>
              <div className={styles.waRow}>
                <a className={styles.waBtn} href={waUrl} target="_blank" rel="noopener noreferrer">
                  <MessageCircle size={16} aria-hidden="true" />
                  פתיחה בוואטסאפ
                </a>
                <button type="button" className={styles.waSendBtn} onClick={() => void send()} disabled={Boolean(busy)}>
                  {busy === 'send' ? (
                    <Loader2 size={16} className={styles.spin} aria-hidden="true" />
                  ) : (
                    <Send size={16} aria-hidden="true" />
                  )}
                  שליחה אוטומטית
                </button>
              </div>
              <p className={styles.help}>
                &quot;פתיחה בוואטסאפ&quot; פותח את הוואטסאפ שלכם, בשיחה עם <bdi dir="ltr">{phone}</bdi>, עם הודעה מוכנה
                ובה הקישור — שום דבר לא נשלח עד שלוחצים שם על שליחה. &quot;שליחה אוטומטית&quot; שולחת מיד מהמערכת.
              </p>
              {sendNote && (
                <p className={styles.help} role="status">
                  {sendNote}
                </p>
              )}
            </div>
          ) : (
            <p className={styles.help}>
              {phone ? (
                <>
                  את המספר <bdi dir="ltr">{phone}</bdi> אי אפשר לפתוח בוואטסאפ
                </>
              ) : (
                'לשוכר לא הוזן טלפון'
              )}
              {' — העתיקו את הקישור ושלחו אותו בדרך אחרת, או תקנו את הטלפון בעריכת השוכר.'}
            </p>
          )}
        </section>
      );
    }
    if (busy) {
      return (
        <p className={styles.stateBox} role="status">
          יוצר קישור…
        </p>
      );
    }
    return (
      <div className={styles.stateBox} role="status">
        <p className={styles.stateTitle}>אין קישור פעיל</p>
        <p>{cardLinkStateText(link)}</p>
        {attempts && <p>{attempts}</p>}
        <button type="button" className={styles.primaryBtn} onClick={() => void run('create')} disabled={Boolean(busy)}>
          יצירת קישור
        </button>
      </div>
    );
  }

  return (
    <DialogShell
      id="card-link"
      title={`קישור לכרטיס — ${name}`}
      hint="הקישור פותח לשוכר את פרטי הוראת הקבע וטופס להזנת כרטיס. אפשר להעתיק אותו, לפתוח אותו בוואטסאפ שלכם, או לשלוח אותו מהמערכת — שליחה אוטומטית שולחת מיד."
      closing={closing}
      onRequestClose={requestClose}
      busy={busy !== null}
      footer={
        <>
          {url && !confirming && (
            <span className={styles.footStart}>
              <button type="button" className={styles.secondaryBtn} onClick={() => setConfirming(true)} disabled={Boolean(busy)}>
                <RefreshCw size={15} aria-hidden="true" />
                קישור חדש
              </button>
            </span>
          )}
          <button type="button" className={styles.secondaryBtn} onClick={requestClose} disabled={busy !== null}>
            סגירה
          </button>
        </>
      }
    >
      <div className={styles.signHead}>
        <ToneChip tone={orderStatusTone(order.status)}>{orderStatusLabel(order.status, order.status_label)}</ToneChip>
        <span className={styles.historyMeta}>
          {billingMoney(order.monthly_total)} לחודש כולל מע״מ · {billingDayLabel(order.billing_day)}
        </span>
      </div>

      {!billingEnabled && (
        <div className={styles.savedNotice} role="note">
          <p className={styles.savedTitle}>חיוב שוכרים כבוי</p>
          <p className={styles.savedText}>
            אפשר לשלוח את הקישור כבר עכשיו, אבל עד ההפעלה השוכר יראה בו שהתשלום עדיין לא זמין, ושום כרטיס לא יחויב.
          </p>
        </div>
      )}

      {order.status === 'failed' && linkable && (
        <p className={styles.help}>
          החיוב האחרון נכשל. כשהשוכר יזין כרטיס חדש בקישור, החודש שנכשל ייגבה ממנו, והכרטיס יחליף את הקודם.
        </p>
      )}

      {linkable ? (
        renderLink()
      ) : (
        <div className={styles.stateBox} role="status">
          <p className={styles.stateTitle}>הוראת הקבע לא ממתינה לכרטיס</p>
          <p>
            {order.status === 'active'
              ? 'הכרטיס כבר נקלט והוראת הקבע פעילה.'
              : 'קישור לכרטיס נוצר רק להוראת קבע שממתינה לכרטיס, או שהחיוב בה נכשל.'}
          </p>
        </div>
      )}

      {renderConfirm()}

      {problem && (
        <p className={styles.error} role="alert">
          {problem}
        </p>
      )}
    </DialogShell>
  );
}
