'use client';

import { useEffect, useRef } from 'react';
import { FileText } from 'lucide-react';
import SignatureCanvas from '../SignatureCanvas';
import styles from './newLook.module.css';

type ConsentKey = 'health' | 'terms' | 'signature';

interface Props {
  healthConsent: boolean;
  onHealthChange: (checked: boolean) => void;
  termsReadComplete: boolean;
  termsOpenedOnce: boolean;
  termsConsent: boolean;
  onTermsChange: (checked: boolean) => void;
  onOpenTerms: () => void;
  signed: boolean;
  onSignature: (value: string | null) => void;
  errors: Partial<Record<ConsentKey, string>>;
  /** False for a free trial lesson: nothing is paid after these steps. */
  paymentFollows: boolean;
}

const Tick = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5 10 17.5 19 7" />
  </svg>
);

/**
 * The approvals before payment, as three numbered steps: the health
 * commitment, the terms, the signature. The step to do now stands out, a
 * finished one turns green, and the pad stays shut until the terms were read.
 * The wording and the conditions are the form's own; only the order on the
 * screen is new.
 */
export default function ConsentSteps({
  healthConsent,
  onHealthChange,
  termsReadComplete,
  termsOpenedOnce,
  termsConsent,
  onTermsChange,
  onOpenTerms,
  signed,
  onSignature,
  errors,
  paymentFollows,
}: Props) {
  const done = [healthConsent, termsReadComplete && termsConsent, signed];
  const count = done.filter(Boolean).length;
  const next = done.indexOf(false);
  const stepRefs = useRef<Array<HTMLElement | null>>([]);
  const lastCount = useRef(count);

  // After a step is finished the page moves on to the one that comes next.
  useEffect(() => {
    if (count > lastCount.current && next >= 0) {
      stepRefs.current[next]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    lastCount.current = count;
  }, [count, next]);

  const stepClass = (index: number, error?: string) => [
    styles.consStep,
    done[index] ? styles.consStepDone : '',
    index === next && !(index === 2 && !termsReadComplete) ? styles.consStepNow : '',
    index === 2 && !termsReadComplete ? styles.consStepLocked : '',
    error && !done[index] ? styles.consStepMissing : '',
  ].filter(Boolean).join(' ');

  const num = (index: number) => (
    <span className={styles.consNum} aria-hidden="true">{done[index] ? <Tick /> : index + 1}</span>
  );

  return (
    <>
      <div className={styles.consTop}>
        <span className={styles.consTopTitle}>
          {paymentFollows ? 'שלושה דברים קטנים לפני התשלום' : 'שלושה דברים קטנים לפני ההרשמה'}
        </span>
        <span className={`${styles.consCount}${count === 3 ? ` ${styles.consCountAll}` : ''}`}>
          {count === 3 ? 'הכול מוכן' : `${count} מתוך 3`}
        </span>
      </div>

      <div className={styles.consSteps}>
        <section className={stepClass(0, errors.health)} ref={(el) => { stepRefs.current[0] = el; }}>
          <div className={styles.consStepHead}>
            {num(0)}
            <span className={styles.consStepTitle}>הצהרת בריאות</span>
          </div>
          <label className={styles.consLabel}>
            <input
              type="checkbox"
              checked={healthConsent}
              onChange={(e) => onHealthChange(e.target.checked)}
              className={styles.consCheckbox}
            />
            <span>אני מתחייב להודיע על כל שינוי במצב הבריאותי המשפיע על השתתפות הילד בפעילות.</span>
          </label>
          {errors.health ? <p className={styles.consError}>{errors.health}</p> : null}
        </section>

        <section className={stepClass(1, errors.terms)} ref={(el) => { stepRefs.current[1] = el; }}>
          <div className={styles.consStepHead}>
            {num(1)}
            <span className={styles.consStepTitle}>תקנון ונהלים</span>
          </div>
          <button
            type="button"
            className={`${styles.consOpenTerms}${termsReadComplete ? ` ${styles.consOpenTermsAgain}` : ''}`}
            onClick={onOpenTerms}
          >
            <FileText size={18} aria-hidden="true" />
            {termsReadComplete ? 'פתחו שוב את התקנון' : 'פתחו את התקנון והנהלים'}
          </button>
          {termsReadComplete ? (
            <label className={styles.consLabel}>
              <input
                type="checkbox"
                checked={termsConsent}
                onChange={(e) => onTermsChange(e.target.checked)}
                className={styles.consCheckbox}
              />
              <span>
                אני מאשר/ת שקראתי בעיון את{' '}
                <button type="button" className={styles.consTermsLink} onClick={onOpenTerms}>
                  התקנון והנהלים
                </button>
                , אני מסכים/ה לכל התנאים ומתחייב/ת לשלם את שכר הלימוד כנדרש.
              </span>
            </label>
          ) : (
            <p className={styles.consNote}>
              {termsOpenedOnce
                ? 'גללו עד סוף התקנון ואשרו כדי להמשיך'
                : 'קוראים עד הסוף ומאשרים. אחר כך מופיע כאן האישור.'}
            </p>
          )}
          {errors.terms ? <p className={styles.consError}>{errors.terms}</p> : null}
        </section>

        <section className={stepClass(2, errors.signature)} ref={(el) => { stepRefs.current[2] = el; }}>
          <div className={styles.consStepHead}>
            {num(2)}
            <span className={styles.consStepTitle}>חתימה</span>
            <span className={styles.consStepHint}>
              {!termsReadComplete ? 'תיפתח אחרי קריאת התקנון' : signed ? '' : 'חותמים באצבע או בעכבר'}
            </span>
          </div>
          <div
            className={[
              styles.consSignature,
              !termsReadComplete ? styles.consSignatureLocked : '',
              errors.signature ? styles.consSignatureInvalid : '',
            ].filter(Boolean).join(' ')}
            aria-disabled={!termsReadComplete}
          >
            <SignatureCanvas onChange={onSignature} />
          </div>
          {errors.signature ? <p className={styles.consError}>{errors.signature}</p> : null}
        </section>
      </div>
    </>
  );
}
