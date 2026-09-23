'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import {
  downloadCertificatePem,
  fetchSigningCertificate,
  type SigningCertificate,
} from '@/lib/signingApi';
import { formatFingerprint, formatValidity } from '@/lib/signingUtils';
import shell from '../card-link/card-link.module.css';
import styles from './signing-certificate.module.css';

/** The signer's name as the certificate carries it, and as Acrobat shows it. */
const SIGNER_NAME = 'קוגומלו גרופ בע"מ';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * The public page of our signing certificate. Anyone who received one of our
 * invoices, receipts or credit notes can see here what the signature on it
 * means, check that it is ours by its SHA-256 fingerprint, download the
 * certificate, and follow the steps to verify a PDF in Adobe Acrobat.
 *
 * No account and no token: the certificate is public by nature. Until one is
 * configured the page says only that.
 */
export default function SigningCertificatePage() {
  const [certificate, setCertificate] = useState<SigningCertificate | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    fetchSigningCertificate()
      .then((data) => {
        if (!live) return;
        setCertificate(data);
        setLoadState('ready');
      })
      .catch(() => {
        if (live) setLoadState('error');
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const fingerprint = formatFingerprint(certificate?.fingerprint_sha256);
  const validity = formatValidity(certificate?.not_before, certificate?.not_after);

  async function copyFingerprint() {
    if (!fingerprint) return;
    try {
      await navigator.clipboard.writeText(fingerprint);
      setCopied(true);
    } catch {
      // Nothing to add: the fingerprint is on screen to be read or selected.
    }
  }

  function renderCertificate() {
    if (loadState === 'loading') {
      return (
        <section className={shell.card} aria-busy="true">
          <p className={styles.state}>טוען את פרטי התעודה…</p>
        </section>
      );
    }

    if (loadState === 'error') {
      return (
        <section className={shell.card} role="alert">
          <p className={styles.state}>לא הצלחנו לטעון את פרטי התעודה</p>
          <p className={styles.stateNote}>נסו לרענן את העמוד בעוד רגע.</p>
        </section>
      );
    }

    if (!certificate?.configured || !certificate.pem) {
      return (
        <section className={shell.card} role="status">
          <h2 className={shell.cardTitle}>התעודה</h2>
          <p className={styles.state}>טרם הוגדר</p>
          <p className={styles.stateNote}>תעודת החתימה עוד לא הוגדרה. כשתוגדר, יופיעו כאן פרטיה וטביעת האצבע שלה.</p>
        </section>
      );
    }

    const pem = certificate.pem;
    return (
      <section className={shell.card} aria-labelledby="certificate-title">
        <h2 id="certificate-title" className={shell.cardTitle}>התעודה</h2>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>החותם</span>
          <div className={styles.fieldValue}>{SIGNER_NAME}</div>
          {certificate.subject && <div className={`${styles.fieldValue} ${styles.mono}`}>{certificate.subject}</div>}
        </div>

        {validity && (
          <div className={styles.field}>
            <span className={styles.fieldLabel}>בתוקף</span>
            <div className={styles.fieldValue}>{validity}</div>
          </div>
        )}

        {fingerprint && (
          <div className={styles.field}>
            <span className={styles.fieldLabel} id="fingerprint-label">טביעת אצבע (SHA-256)</span>
            <div className={styles.fingerprintRow}>
              <code className={`${styles.fieldValue} ${styles.mono}`} aria-labelledby="fingerprint-label">
                {fingerprint}
              </code>
              <button
                type="button"
                className={styles.copyBtn}
                onClick={() => void copyFingerprint()}
                aria-label="העתקת טביעת האצבע"
              >
                {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                {copied ? 'הועתק' : 'העתקה'}
              </button>
            </div>
          </div>
        )}

        <button type="button" className={styles.download} onClick={() => downloadCertificatePem(pem)}>
          <Download size={18} aria-hidden="true" />
          הורדת התעודה (PEM)
        </button>
      </section>
    );
  }

  const configured = loadState === 'ready' && Boolean(certificate?.configured && certificate.pem);

  return (
    <div className={shell.page} dir="rtl">
      <header className={shell.header}>
        <div className={shell.brand}>קוגומלו</div>
        <h1 className={shell.title}>תעודת החתימה האלקטרונית</h1>
        <p className={shell.headerNote}>{SIGNER_NAME}</p>
      </header>

      <main className={`${shell.body} ${styles.body}`}>
        <section className={shell.card} aria-labelledby="about-title">
          <h2 id="about-title" className={shell.cardTitle}>מהי חתימה אלקטרונית מאובטחת</h2>
          <p className={styles.lead}>
            החשבוניות, הקבלות והזיכויים שאנחנו שולחים במייל חתומים בחתימה אלקטרונית מאובטחת.
          </p>
          <p className={styles.lead}>
            החתימה נוצרת במפתח פרטי שנשמר ברכיב אבטחה ייעודי ואינו יוצא ממנו, כך שרק אנחנו יכולים לחתום בו.
            כל שינוי במסמך אחרי החתימה, אפילו תו אחד, מבטל אותה — ולכן אפשר לוודא שהמסמך שקיבלתם הוא בדיוק המסמך שהפקנו.
          </p>
        </section>

        {renderCertificate()}

        {configured && (
          <section className={shell.card} aria-labelledby="verify-title">
            <h2 id="verify-title" className={shell.cardTitle}>איך בודקים מסמך ב-Adobe Acrobat</h2>
            <ol className={styles.steps}>
              <li>
                פתחו את קובץ ה-PDF ב-Adobe Acrobat Reader במחשב. דפדפנים ואפליקציות מייל בטלפון לא מציגים חתימות.
              </li>
              <li>
                פתחו את חלונית החתימות <span className={styles.en}>(Signature Panel)</span>.
              </li>
              <li>
                ודאו שהחותם הוא <span className={styles.quote}>{SIGNER_NAME}</span>, ושכתוב{' '}
                <span className={styles.quote}>&quot;המסמך לא שונה מאז החתימה&quot;</span>{' '}
                <span className={styles.en}>(Document has not been modified since this signature was applied)</span>.
              </li>
              <li>
                בפרטי התעודה <span className={styles.en}>(Certificate Details)</span> ודאו שטביעת האצבע SHA-256 זהה
                לזו שבעמוד הזה.
              </li>
            </ol>
            <p className={styles.note}>
              התעודה הונפקה על ידינו ולא על ידי גורם מאשר, ולכן Acrobat עשוי לציין שזהות החותם לא אומתה. טביעת האצבע
              הזהה היא מה שמאמת שהחתימה שלנו.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
