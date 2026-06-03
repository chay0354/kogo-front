'use client';

import { useState } from 'react';
import api from '@/lib/api';
import SignatureCanvas from '../SignatureCanvas';
import styles from './index.module.css';
import type { Props, Step, LookupResult, PaymentResponse } from './types';

export type { CourseLesson } from './types';

export default function CourseRegistrationForm({ courseId, courseName, onBack, onComplete }: Props) {
  const [step, setStep] = useState<Step>('details');
  const [errorMsg, setErrorMsg] = useState('');

  // Step 1 — details
  const [parentIdNumber, setParentIdNumber] = useState('');
  const [parentFirstName, setParentFirstName] = useState('');
  const [parentLastName, setParentLastName] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [childFirstName, setChildFirstName] = useState('');
  const [childLastName, setChildLastName] = useState('');
  const [childIdNumber, setChildIdNumber] = useState('');
  const [childBirthDate, setChildBirthDate] = useState('');
  const [childGender, setChildGender] = useState<'male' | 'female' | ''>('');

  // Lookup result — used for discount step
  const [lookup, setLookup] = useState<LookupResult | null>(null);

  // Step 3 — consents
  const [healthConsent, setHealthConsent] = useState(false);
  const [termsConsent, setTermsConsent] = useState(false);
  const [rulesConsent, setRulesConsent] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);

  // Payment step
  const [paymentData, setPaymentData] = useState<PaymentResponse | null>(null);
  const [cardNumber, setCardNumber] = useState('');
  const [expiryMonth, setExpiryMonth] = useState('');
  const [expiryYear, setExpiryYear] = useState('');
  const [cvv, setCvv] = useState('');
  const [cardHolderId, setCardHolderId] = useState('');
  const [charging, setCharging] = useState(false);

  const handleCardCharge = async () => {
    if (!paymentData || !cardNumber || !expiryMonth || !expiryYear || !cvv) return;
    setCharging(true);
    setErrorMsg('');
    try {
      const res = await api.post('/customers/widget/charge/', {
        payment_id: paymentData.payment_id,
        card_details: {
          card_number: cardNumber.replace(/\s/g, ''),
          expiry_month: parseInt(expiryMonth),
          expiry_year: parseInt(expiryYear),
          cvv,
          card_holder_id: cardHolderId,
        },
      });
      if (res.data.success) {
        setStep('payment_success');
        setTimeout(() => onComplete(), 3000);
      } else {
        setErrorMsg(res.data.error || 'התשלום נכשל');
        setStep('payment_failed');
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'שגיאה בסליקה';
      setErrorMsg(msg);
      setStep('payment_failed');
    } finally {
      setCharging(false);
    }
  };

  const handleDetailsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      const res = await api.post('/customers/widget/lookup/', {
        parent_id_number: parentIdNumber,
        child_first_name: childFirstName,
        child_last_name: childLastName,
      });
      const data: LookupResult = res.data;
      setLookup(data);
      if (data.discount_type) {
        setStep('discount_confirm');
      } else {
        setStep('consents');
      }
    } catch {
      setStep('consents'); // proceed even if lookup fails
    }
  };

  const handleDiscountAnswer = (confirmed: boolean) => {
    setLookup((prev) => prev ? { ...prev, _confirmed: confirmed } as LookupResult & { _confirmed: boolean } : prev);
    setStep('consents');
  };

  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStep('submitting');
    setErrorMsg('');

    const discountConfirmed = (lookup as (LookupResult & { _confirmed?: boolean }) | null)?._confirmed ?? false;
    const existingChildId   = discountConfirmed ? (lookup?.child_id ?? '') : '';

    try {
      const res = await api.post('/customers/widget/register/', {
        parent_id_number: parentIdNumber,
        parent_first_name: parentFirstName,
        parent_last_name: parentLastName,
        parent_phone: parentPhone,
        child_first_name: childFirstName,
        child_last_name: childLastName,
        child_id_number: childIdNumber,
        child_birth_date: childBirthDate,
        child_gender: childGender,
        course_id: courseId,
        signature: signature,
        discount_confirmed: discountConfirmed,
        existing_child_id: existingChildId,
      });
      setPaymentData({
        payment_id: res.data.payment_id,
        final_amount: res.data.final_amount,
        base_amount: res.data.base_amount,
        discount_amount: res.data.discount_amount,
        discounts_applied: res.data.discounts_applied ?? [],
      });
      setStep('payment');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'אירעה שגיאה. נסה שנית.';
      setErrorMsg(msg);
      setStep('error');
    }
  };

  const header = (
    <div className={styles.header}>
      <button
        type="button"
        onClick={step === 'consents' || step === 'discount_confirm' ? () => setStep('details') : onBack}
        className={styles.backLink}
      >
        ← חזרה
      </button>
      <h3 className={styles.title}>הרשמה לחוג: {courseName}</h3>
    </div>
  );

  if (step === 'details') {
    return (
      <form onSubmit={handleDetailsSubmit} className={styles.form} dir="rtl">
        {header}

        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>פרטי הורה</legend>
          <div className={styles.grid2}>
            <div>
              <label className={styles.label}>שם פרטי</label>
              <input required type="text" value={parentFirstName}
                onChange={(e) => setParentFirstName(e.target.value)} className={styles.input} />
            </div>
            <div>
              <label className={styles.label}>שם משפחה</label>
              <input required type="text" value={parentLastName}
                onChange={(e) => setParentLastName(e.target.value)} className={styles.input} />
            </div>
            <div>
              <label className={styles.label}>ת.ז. הורה *</label>
              <input required type="text" value={parentIdNumber}
                onChange={(e) => setParentIdNumber(e.target.value)} className={styles.input} />
            </div>
            <div>
              <label className={styles.label}>טלפון נייד</label>
              <input required type="tel" value={parentPhone}
                onChange={(e) => setParentPhone(e.target.value)} className={styles.input} />
            </div>
          </div>
        </fieldset>

        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>פרטי הילד</legend>
          <div className={styles.grid2}>
            <div>
              <label className={styles.label}>שם פרטי *</label>
              <input required type="text" value={childFirstName}
                onChange={(e) => setChildFirstName(e.target.value)} className={styles.input} />
            </div>
            <div>
              <label className={styles.label}>שם משפחה *</label>
              <input required type="text" value={childLastName}
                onChange={(e) => setChildLastName(e.target.value)} className={styles.input} />
            </div>
            <div>
              <label className={styles.label}>ת.ז. ילד</label>
              <input type="text" value={childIdNumber}
                onChange={(e) => setChildIdNumber(e.target.value)} className={styles.input} />
            </div>
            <div>
              <label className={styles.label}>תאריך לידה *</label>
              <input required type="date" value={childBirthDate}
                onChange={(e) => setChildBirthDate(e.target.value)} className={styles.input} />
            </div>
            <div className="col-span-2">
              <label className={styles.label}>מין *</label>
              <div className={styles.genderOptions}>
                {(['male', 'female'] as const).map((g) => (
                  <label key={g} className={styles.radioLabel}>
                    <input type="radio" name="gender" value={g}
                      checked={childGender === g} onChange={() => setChildGender(g)}
                      className="accent-teal-600" required />
                    {g === 'male' ? 'זכר' : 'נקבה'}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </fieldset>

        {errorMsg && <p className={styles.errorText}>{errorMsg}</p>}

        <button type="submit" className={styles.submitButton}>
          המשך
        </button>
      </form>
    );
  }

  if (step === 'discount_confirm' && lookup?.discount_question) {
    return (
      <div className={styles.form} dir="rtl">
        {header}
        <div className={styles.discountBox}>
          {lookup.discount_question}
        </div>
        <div className={styles.buttonRow}>
          <button onClick={() => handleDiscountAnswer(true)} className={styles.primaryButton}>
            כן
          </button>
          <button onClick={() => handleDiscountAnswer(false)} className={styles.secondaryButton}>
            לא
          </button>
        </div>
      </div>
    );
  }

  if (step === 'consents' || step === 'error') {
    return (
      <form onSubmit={handleFinalSubmit} className={styles.form} dir="rtl">
        {header}

        <label className={styles.consentLabel}>
          <input type="checkbox" checked={healthConsent}
            onChange={(e) => setHealthConsent(e.target.checked)}
            className={styles.checkbox} required />
          אני מתחייב להודיע על כל שינוי במצב הבריאותי המשפיע על השתתפות הילד בפעילות.
        </label>

        <label className={styles.consentLabel}>
          <input type="checkbox" checked={termsConsent}
            onChange={(e) => setTermsConsent(e.target.checked)}
            className={styles.checkbox} required />
          אני הנרשם/ההורה הרושם קראתי בעיון את כל הנהלים והתנאים ואני מסכים/ה לכולם ומתחייב/ת לשלם את שכר הלימוד כנדרש.
        </label>

        <div className={styles.signatureWrapper}>
          <label className={styles.label}>חתימה</label>
          <SignatureCanvas onChange={setSignature} />
        </div>

        <label className={styles.consentLabel}>
          <input type="checkbox" checked={rulesConsent}
            onChange={(e) => setRulesConsent(e.target.checked)}
            className={styles.checkbox} required />
          מסכים עם התקנון
        </label>

        {errorMsg && <p className={styles.errorText}>{errorMsg}</p>}

        <button type="submit" className={styles.submitButton}>
          שלח והמשך לתשלום
        </button>
      </form>
    );
  }

  if (step === 'payment' && paymentData) {
    return (
      <div className={styles.paymentContainer} dir="rtl">
        <h3 className={styles.title}>הרשמה לחוג: {courseName}</h3>

        <div className={styles.paymentSummary}>
          <p className={styles.summaryTitle}>סיכום תשלום</p>
          <div className={styles.summaryRow}>
            <span>מחיר בסיס</span>
            <span>₪{Number(paymentData.base_amount).toFixed(2)}</span>
          </div>
          {paymentData.discount_amount > 0 && (
            <div className={styles.discountRow}>
              <span>הנחה</span>
              <span>-₪{Number(paymentData.discount_amount).toFixed(2)}</span>
            </div>
          )}
          <div className={styles.totalRow}>
            <span>לתשלום</span>
            <span className={styles.totalAmount}>₪{Number(paymentData.final_amount).toFixed(2)}</span>
          </div>
        </div>

        <div className={styles.cardFields}>
          <p className={styles.sectionTitle}>פרטי כרטיס אשראי</p>
          <div>
            <label className={styles.label}>מספר כרטיס</label>
            <input
              className={styles.input}
              placeholder="4580 4580 4580 4580"
              value={cardNumber}
              onChange={e => setCardNumber(e.target.value)}
            />
          </div>
          <div className={styles.grid3}>
            <div>
              <label className={styles.label}>חודש תפוגה</label>
              <input className={styles.input} placeholder="12" value={expiryMonth} onChange={e => setExpiryMonth(e.target.value)} />
            </div>
            <div>
              <label className={styles.label}>שנת תפוגה</label>
              <input className={styles.input} placeholder="2026" value={expiryYear} onChange={e => setExpiryYear(e.target.value)} />
            </div>
            <div>
              <label className={styles.label}>CVV</label>
              <input className={styles.input} placeholder="123" value={cvv} onChange={e => setCvv(e.target.value)} />
            </div>
          </div>
          <div>
            <label className={styles.label}>תעודת זהות בעל הכרטיס</label>
            <input className={styles.input} placeholder="012345678" value={cardHolderId} onChange={e => setCardHolderId(e.target.value)} />
          </div>
        </div>

        {errorMsg && <p className={styles.errorText}>{errorMsg}</p>}

        <button
          type="button"
          onClick={handleCardCharge}
          disabled={charging || !cardNumber || !expiryMonth || !expiryYear || !cvv}
          className={styles.submitButton}
        >
          {charging ? 'מעבד...' : `שלם ₪${Number(paymentData.final_amount).toFixed(2)}`}
        </button>
      </div>
    );
  }

  if (step === 'payment_success') {
    return (
      <div className={styles.resultContainer} dir="rtl">
        <div className={styles.successIcon}>✓</div>
        <p className={styles.resultTitle}>התשלום בוצע בהצלחה!</p>
        <p className={styles.resultSubtext}>{childFirstName} נרשמ/ה לחוג {courseName}.</p>
        <button type="button" onClick={onComplete} className={styles.closeButton}>
          סגור
        </button>
      </div>
    );
  }

  if (step === 'payment_failed') {
    return (
      <div className={styles.resultContainer} dir="rtl">
        <div className={styles.failIcon}>✗</div>
        <p className={styles.resultTitle}>התשלום נכשל</p>
        <p className={styles.resultSubtext}>{errorMsg || 'אנא נסה שנית או פנה לצוות.'}</p>
        <div className={styles.resultActions}>
          <button
            type="button"
            onClick={() => { setErrorMsg(''); setStep('payment'); }}
            className={styles.primaryButton}
          >
            נסה שנית
          </button>
          <button type="button" onClick={onBack} className={styles.outlineButton}>
            סגור
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.submittingContainer} dir="rtl">
      שולח פרטים, אנא המתן...
    </div>
  );
}
