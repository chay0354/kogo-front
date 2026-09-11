'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, FileCheck2, Loader2, MessageCircle, RefreshCw } from 'lucide-react';
import { useDialogExit } from '@/components/ui/motion';
import {
  cancelSigningLink,
  createSigningLink,
  downloadSignedContractPdf,
  fetchTenancyContracts,
  type RentalContract,
  type Tenancy,
} from '@/lib/rentalsApi';
import DialogShell from './DialogShell';
import { SigningChips, ToneChip } from './StatusChips';
import {
  contractFileName,
  contractStatusLabel,
  contractStatusTone,
  contractVersionLabel,
  formatDateTime,
  isUnsignedContract,
} from './contractUtils';
import {
  absoluteSigningUrl,
  liveSigningLink,
  signedByText,
  signingExpiryText,
  signingWhatsAppMessage,
  whatsAppUrl,
} from './signingUtils';
import { isUnknownOutcome, tenancyApiError, tenantName } from './tenancyUtils';
import styles from './rentalsDialog.module.css';

/** What the dialog is waiting on while a request is out. */
type Busy = 'create' | 'rotate' | 'cancel' | 'download';

interface SigningLinkDialogProps {
  /** The row it was opened from — for the tenant's name, phone and branch. */
  tenancy: Tenancy;
  /** The version to send: the tenancy's current one. */
  contractId: string;
  onClose: () => void;
  /** A link was made or cancelled, or may have been — the list should read the server again. */
  onChanged: () => void;
}

/**
 * "שליחה לחתימה": the tenant's link to read and sign the version, for the
 * office to send itself — copied, or typed into the office user's own
 * WhatsApp by a wa.me link. Nothing is sent from here.
 *
 * It opens on the live link when the version has one; otherwise it asks the
 * server for one at once, since that is what the office came for. A new link
 * and a cancelled one are confirmed in place first — the shared ConfirmDialog
 * opens beneath this dialog's overlay — because either one stops a link the
 * tenant may already hold. Every refusal shows in the server's words.
 */
export default function SigningLinkDialog({ tenancy, contractId, onClose, onChanged }: SigningLinkDialogProps) {
  const { closing, requestClose } = useDialogExit(onClose);
  const contractsQuery = useQuery({
    queryKey: ['rentals', 'tenancy-contracts', tenancy.id],
    queryFn: () => fetchTenancyContracts(tenancy.id),
    staleTime: 0,
    // Nothing kept between openings: a link made or cancelled since must never show as it was.
    gcTime: 0,
  });
  // The server's answer to this dialog's own request is newer than the list it opened on.
  const [answered, setAnswered] = useState<RentalContract | null>(null);
  const [busy, setBusy] = useState<Busy | null>(null);
  const busyRef = useRef(false);
  const [confirming, setConfirming] = useState<'rotate' | 'cancel' | null>(null);
  const [problem, setProblem] = useState('');
  // Cancelled here: no link is shown, whatever a copy says, until the office asks for a new one.
  const [cancelledHere, setCancelledHere] = useState(false);
  // Once the office has acted (or the first link was asked for), nothing is made without a click.
  const actedRef = useRef(false);
  const linkInputRef = useRef<HTMLInputElement>(null);

  const listed = contractsQuery.data?.find((item) => item.id === contractId) ?? null;
  const contract = answered ?? listed;
  const name = tenantName(tenancy.tenant);
  const phone = (tenancy.tenant?.phone ?? '').trim();
  const unsigned = isUnsignedContract(contract);
  const live = cancelledHere ? null : liveSigningLink(contract);
  const url = live ? absoluteSigningUrl(live.url, typeof window === 'undefined' ? '' : window.location.origin) : '';
  const expiry = live ? signingExpiryText(live.expiresAt) : '';
  const waUrl = url
    ? whatsAppUrl(
        phone,
        signingWhatsAppMessage({
          tenant: tenancy.tenant,
          url,
          version: contract?.version,
          branchName: tenancy.branch_name,
          expiresAt: live?.expiresAt,
        }),
      )
    : null;
  const requesting = busy === 'create' || busy === 'rotate' || busy === 'cancel';
  const needsLink = Boolean(contract) && unsigned && !live && !cancelledHere;

  async function run(action: 'create' | 'rotate' | 'cancel') {
    if (busyRef.current) return;
    busyRef.current = true;
    actedRef.current = true;
    setBusy(action);
    setProblem('');
    setConfirming(null);
    try {
      const next = action === 'cancel' ? await cancelSigningLink(contractId) : await createSigningLink(contractId);
      setAnswered(next);
      setCancelledHere(action === 'cancel');
      if (action === 'cancel') toast.success('הקישור בוטל — השוכר כבר לא יכול לפתוח אותו');
      if (action === 'rotate') toast.success('נוצר קישור חדש. הקישור הקודם כבר לא נפתח');
    } catch (err) {
      // The list is read again below; an answer from before must not hide what the server holds now.
      setAnswered(null);
      setProblem(
        isUnknownOutcome(err)
          ? 'לא התקבלה תשובה מהשרת, ולכן לא ברור אם הפעולה בוצעה. הפרטים מתרעננים — בדקו בהם לפני שמנסים שוב.'
          : tenancyApiError(err, action === 'cancel' ? 'ביטול הקישור נכשל' : 'יצירת הקישור נכשלה'),
      );
    } finally {
      busyRef.current = false;
      setBusy(null);
      void contractsQuery.refetch();
      onChanged();
    }
  }

  // Opened on a version with no live link: make one, once. `run` is this render's; the ref keeps it to one.
  useEffect(() => {
    if (!needsLink || actedRef.current) return;
    void run('create');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsLink]);

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

  async function downloadSigned(target: RentalContract) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy('download');
    setProblem('');
    try {
      await downloadSignedContractPdf(
        target.id,
        contractFileName({ tenantName: name, version: target.version, signed: true }),
      );
    } catch (err) {
      setProblem(tenancyApiError(err, 'הורדת העותק החתום נכשלה'));
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  function renderConfirm(): ReactNode {
    if (!confirming) return null;
    const rotate = confirming === 'rotate';
    return (
      <div className={styles.savedNotice} role="group" aria-labelledby="signing-confirm-title">
        <p id="signing-confirm-title" className={styles.savedTitle}>
          {rotate ? 'ליצור קישור חדש?' : 'לבטל את הקישור?'}
        </p>
        <p className={styles.savedText}>
          {rotate
            ? 'הקישור הנוכחי יפסיק להיפתח מיד — גם אם כבר נשלח לשוכר — ואת החדש צריך לשלוח שוב.'
            : 'השוכר לא יוכל לפתוח את הקישור יותר. הגרסה עצמה לא משתנה, ואפשר ליצור קישור חדש מתי שרוצים.'}
        </p>
        <div className={styles.voidActions}>
          <button type="button" className={styles.secondaryBtn} onClick={() => setConfirming(null)}>
            חזרה
          </button>
          <button
            type="button"
            className={rotate ? styles.primaryBtn : styles.dangerBtn}
            onClick={() => void run(confirming)}
            autoFocus
          >
            {rotate ? 'יצירת קישור חדש' : 'ביטול הקישור'}
          </button>
        </div>
      </div>
    );
  }

  function renderLink(): ReactNode {
    if (url) {
      return (
        <section className={styles.section} aria-labelledby="signing-link-title">
          <h3 id="signing-link-title" className={styles.sectionTitle}>
            הקישור לשוכר
          </h3>
          <div className={styles.linkRow}>
            <input
              ref={linkInputRef}
              readOnly
              value={url}
              className={`${styles.input} ${styles.ltr} ${styles.linkInput}`}
              aria-label="הקישור לחתימה"
              aria-describedby={expiry ? 'signing-link-expiry' : undefined}
              onFocus={(event) => event.currentTarget.select()}
            />
            <button type="button" className={styles.secondaryBtn} onClick={() => void copy()}>
              <Copy size={15} aria-hidden="true" />
              העתקה
            </button>
          </div>
          {expiry && (
            <p id="signing-link-expiry" className={styles.help}>
              {expiry}
            </p>
          )}
          {waUrl ? (
            <div className={styles.waBlock}>
              <a className={styles.waBtn} href={waUrl} target="_blank" rel="noopener noreferrer">
                <MessageCircle size={16} aria-hidden="true" />
                פתיחה בוואטסאפ
              </a>
              <p className={styles.help}>
                נפתח הוואטסאפ שלכם, בשיחה עם <bdi dir="ltr">{phone}</bdi>, עם הודעה מוכנה ובה הקישור. שום דבר לא נשלח עד
                שלוחצים שם על שליחה.
              </p>
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
    if (busy === 'create' || busy === 'rotate') {
      return (
        <p className={styles.stateBox} role="status">
          יוצר קישור…
        </p>
      );
    }
    const lapsed = !cancelledHere && contract?.signing_url ? signingExpiryText(contract.signing_expires_at) : '';
    return (
      <div className={styles.stateBox} role="status">
        <p className={styles.stateTitle}>{cancelledHere ? 'הקישור בוטל' : 'אין קישור פעיל'}</p>
        <p>{cancelledHere ? 'השוכר כבר לא יכול לפתוח אותו.' : lapsed || 'לגרסה הזאת עדיין אין קישור לחתימה.'}</p>
        <button type="button" className={styles.primaryBtn} onClick={() => void run('create')} disabled={Boolean(busy)}>
          יצירת קישור
        </button>
      </div>
    );
  }

  function renderBody(): ReactNode {
    if (!contract) {
      if (contractsQuery.isLoading) {
        return (
          <p className={styles.stateBox} role="status">
            טוען את פרטי החוזה…
          </p>
        );
      }
      if (contractsQuery.isError) {
        return (
          <div className={styles.stateBox} role="alert">
            <p className={styles.stateTitle}>לא הצלחנו לטעון את פרטי החוזה</p>
            <p>אפשר לנסות שוב בעוד רגע.</p>
            <button type="button" className={styles.secondaryBtn} onClick={() => void contractsQuery.refetch()}>
              נסו שוב
            </button>
          </div>
        );
      }
      return (
        <div className={styles.stateBox} role="status">
          <p className={styles.stateTitle}>הגרסה לא נמצאה</p>
          <p>ייתכן שהופקה גרסה חדשה במקומה. סגרו ופתחו שוב מהשורה ברשימה.</p>
        </div>
      );
    }

    const signedLine = [signedByText(contract.signer_name), formatDateTime(contract.signed_at)].filter(Boolean).join(' · ');

    return (
      <>
        <div className={styles.signHead}>
          <span className={styles.historyTitle}>{contractVersionLabel(contract.version)}</span>
          <ToneChip tone={contractStatusTone(contract.status)}>
            {contractStatusLabel(contract.status, contract.status_label)}
          </ToneChip>
          <SigningChips contract={contract} />
        </div>

        {contract.status === 'signed' ? (
          <div className={styles.stateBox} role="status">
            <p className={styles.stateTitle}>החוזה נחתם</p>
            {signedLine && <p>{signedLine}</p>}
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => void downloadSigned(contract)}
              disabled={Boolean(busy)}
            >
              {busy === 'download' ? (
                <Loader2 size={15} className={styles.spin} aria-hidden="true" />
              ) : (
                <FileCheck2 size={15} aria-hidden="true" />
              )}
              הורדת עותק חתום
            </button>
          </div>
        ) : contract.status === 'void' ? (
          <div className={styles.stateBox} role="status">
            <p className={styles.stateTitle}>הגרסה בוטלה</p>
            <p>לגרסה מבוטלת אין קישור לחתימה. הפיקו גרסה חדשה מהשורה ברשימה.</p>
          </div>
        ) : (
          renderLink()
        )}

        {renderConfirm()}

        {problem && (
          <p className={styles.error} role="alert">
            {problem}
          </p>
        )}
      </>
    );
  }

  return (
    <DialogShell
      id="signing-link"
      title={`שליחה לחתימה — ${name}`}
      hint="הקישור פותח לשוכר את החוזה לקריאה ולחתימה באצבע. שולחים אותו בעצמכם — בהעתקה או בוואטסאפ שלכם; שום דבר לא נשלח אוטומטית."
      closing={closing}
      onRequestClose={requestClose}
      busy={requesting}
      footer={
        <>
          {url && !confirming && (
            <span className={styles.footStart}>
              <button
                type="button"
                className={styles.voidBtn}
                onClick={() => setConfirming('cancel')}
                disabled={Boolean(busy)}
              >
                ביטול קישור
              </button>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setConfirming('rotate')}
                disabled={Boolean(busy)}
              >
                <RefreshCw size={15} aria-hidden="true" />
                קישור חדש
              </button>
            </span>
          )}
          <button type="button" className={styles.secondaryBtn} onClick={requestClose} disabled={requesting}>
            סגירה
          </button>
        </>
      }
    >
      {renderBody()}
    </DialogShell>
  );
}
