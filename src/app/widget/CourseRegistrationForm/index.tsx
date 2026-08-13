'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import SignatureCanvas from '../SignatureCanvas';
import styles from './index.module.css';
import type { Props, Step, LookupResult, PaymentResponse, TrialOccurrence } from './types';

export type { CourseLesson } from './types';

export default function CourseRegistrationForm({ courseId, courseName, isAdult = false, bundleId, lessonId, trialLessonOptions = [], isTrial = false, trialLessonIsPaid = false, trialLessonPrice, onBack, onComplete }: Props) {
  const [step, setStep] = useState<Step>('details');
  const [errorMsg, setErrorMsg] = useState('');

  // Step 1 — details
  const [parentIdNumber, setParentIdNumber] = useState('');
  const [parentFirstName, setParentFirstName] = useState('');
  const [parentLastName, setParentLastName] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [childFirstName, setChildFirstName] = useState('');
  const [childLastName, setChildLastName] = useState('');
  const [childIdNumber, setChildIdNumber] = useState('');
  const [childBirthDate, setChildBirthDate] = useState('');
  const [childGender, setChildGender] = useState<'male' | 'female' | ''>('');
  const [selfRegistering, setSelfRegistering] = useState(false);

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
  const [lookingUp, setLookingUp] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [termsContent, setTermsContent] = useState('');
  const [loadingTerms, setLoadingTerms] = useState(false);

  const [trialOccurrences, setTrialOccurrences] = useState<TrialOccurrence[]>([]);
  const [trialLessonDate, setTrialLessonDate] = useState('');
  const [selectedTrialLessonId, setSelectedTrialLessonId] = useState(lessonId ?? '');
  const [loadingTrialDates, setLoadingTrialDates] = useState(false);

  const effectiveTrialLessonId = lessonId || selectedTrialLessonId;
  const trialLessonIdsKey = lessonId ?? trialLessonOptions.map((option) => option.id).join(',');
  const trialLessonIds = lessonId
    ? [lessonId]
    : trialLessonOptions.map((option) => option.id);

  useEffect(() => {
    setSelectedTrialLessonId(lessonId ?? '');
  }, [lessonId]);

  useEffect(() => {
    if (!isTrial || trialLessonIds.length === 0) {
      setTrialOccurrences([]);
      setTrialLessonDate('');
      setSelectedTrialLessonId(lessonId ?? '');
      return;
    }

    setLoadingTrialDates(true);
    setTrialLessonDate('');
    setSelectedTrialLessonId(lessonId ?? '');

    const params =
      trialLessonIds.length === 1
        ? { lesson_id: trialLessonIds[0], count: 3 }
        : { lesson_ids: trialLessonIds.join(','), count: 3 };

    api.get('/customers/widget/lesson-occurrences/', { params })
      .then((res) => {
        const dates = Array.isArray(res.data) ? res.data as TrialOccurrence[] : [];
        setTrialOccurrences(dates);
        if (dates.length === 1) {
          setTrialLessonDate(dates[0].date);
          if (dates[0].lesson_id) setSelectedTrialLessonId(dates[0].lesson_id);
        }
      })
      .catch(() => setTrialOccurrences([]))
      .finally(() => setLoadingTrialDates(false));
  }, [isTrial, lessonId, trialLessonIdsKey, trialLessonOptions]);

  useEffect(() => {
    setLoadingTerms(true);
    api.get('/customers/widget/terms/')
      .then((res) => setTermsContent(res.data?.content || ''))
      .catch(() => setTermsContent(''))
      .finally(() => setLoadingTerms(false));
  }, []);

  const handleCardCharge = async () => {
    if (!paymentData || !cardNumber || !expiryMonth || !expiryYear || !cvv) return;
    setCharging(true);
    setErrorMsg('');
    try {
      const res = await api.post('/customers/widget/charge/', {
        ...(paymentData.payment_ids
          ? { payment_ids: paymentData.payment_ids }
          : { payment_id: paymentData.payment_id }),
        card_details: {
          card_number: cardNumber.replace(/\s/g, ''),
          expiry_month: parseInt(expiryMonth),
          expiry_year: parseInt(expiryYear),
          cvv,
          card_holder_id: cardHolderId,
        },
      });
      if (res.data.success) {
        setStep(isTrial ? 'trial_success' : 'payment_success');
        setTimeout(() => onComplete(), 3000);
      } else {
        const firstError = res.data.error
          ?? res.data.results?.find((r: { success: boolean; error?: string }) => !r.success)?.error;
        setErrorMsg(firstError || 'התשלום נכשל');
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

    if (isTrial) {
      if (!trialLessonDate || !effectiveTrialLessonId) {
        setErrorMsg('יש לבחור תאריך לשיעור הניסיון');
        return;
      }
      setStep('consents');
      return;
    }

    setLookingUp(true);
    const lookupChildFirstName = selfRegistering ? parentFirstName : childFirstName;
    const lookupChildLastName = selfRegistering ? parentLastName : childLastName;
    try {
      const res = await api.post('/customers/widget/lookup/', {
        parent_id_number: parentIdNumber,
        child_first_name: lookupChildFirstName,
        child_last_name: lookupChildLastName,
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
    } finally {
      setLookingUp(false);
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
    const existingChildId = discountConfirmed ? (lookup?.child_id ?? '') : '';

    const registerChildFirstName = selfRegistering ? parentFirstName : childFirstName;
    const registerChildLastName = selfRegistering ? parentLastName : childLastName;
    const registerChildIdNumber = selfRegistering ? parentIdNumber : childIdNumber;

    if (isTrial) {
      try {
        const res = await api.post('/customers/widget/trial-register/', {
          parent_id_number: parentIdNumber,
          parent_first_name: parentFirstName,
          parent_last_name: parentLastName,
          parent_phone: parentPhone,
          parent_email: parentEmail,
          child_first_name: registerChildFirstName,
          child_last_name: registerChildLastName,
          child_id_number: registerChildIdNumber,
          child_birth_date: childBirthDate,
          child_gender: childGender,
          course_id: courseId,
          lesson_id: effectiveTrialLessonId,
          trial_lesson_date: trialLessonDate,
        });
        if (res.data.requires_payment) {
          setPaymentData({
            payment_id: res.data.payment_id,
            final_amount: res.data.final_amount,
            base_amount: res.data.base_amount,
            discount_amount: res.data.discount_amount ?? 0,
            discounts_applied: [],
          });
          setStep('payment');
          return;
        }
        setStep('trial_success');
        setTimeout(() => onComplete(), 3000);
      } catch (err: unknown) {
        const msg =
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'אירעה שגיאה. נסה שנית.';
        setErrorMsg(msg);
        setStep('error');
      }
      return;
    }

    try {
      const res = await api.post('/customers/widget/register/', {
        parent_id_number: parentIdNumber,
        parent_first_name: parentFirstName,
        parent_last_name: parentLastName,
        parent_phone: parentPhone,
        parent_email: parentEmail,
        child_first_name: registerChildFirstName,
        child_last_name: registerChildLastName,
        child_id_number: registerChildIdNumber,
        child_birth_date: childBirthDate,
        child_gender: childGender,
        course_id: courseId,
        bundle_id: bundleId,
        lesson_id: lessonId,
        signature: signature,
        discount_confirmed: discountConfirmed,
        existing_child_id: existingChildId,
      });
      if (res.data.is_bundle) {
        setPaymentData({
          payment_id: res.data.payments[0].payment_id,
          payment_ids: res.data.payments.map((p: { payment_id: string }) => p.payment_id),
          final_amount: res.data.final_amount,
          base_amount: res.data.base_amount,
          discount_amount: res.data.discount_amount,
          prorated_amount: res.data.prorated_amount,
          registration_fee: res.data.registration_fee,
          discounts_applied: res.data.payments.flatMap((p: { discounts_applied?: Array<{ name: string; amount: number }> }) => p.discounts_applied ?? []),
        });
      } else {
        setPaymentData({
          payment_id: res.data.payment_id,
          final_amount: res.data.final_amount,
          base_amount: res.data.base_amount,
          discount_amount: res.data.discount_amount,
          prorated_amount: res.data.prorated_amount,
          registration_fee: res.data.registration_fee,
          discounts_applied: res.data.discounts_applied ?? [],
        });
      }
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
      <h3 className={styles.title}>{isTrial ? `הרשמה לשיעור ניסיון: ${courseName}` : `הרשמה לחוג: ${courseName}`}</h3>
    </div>
  );

  if (step === 'details') {
    return (
      <form onSubmit={handleDetailsSubmit} className={styles.form} dir="rtl">
        {header}

        {isAdult && (
          <label className={styles.selfRegToggle}>
            <input type="checkbox" checked={selfRegistering}
              onChange={(e) => setSelfRegistering(e.target.checked)}
              className={styles.selfRegCheckbox} />
            אני נרשם/ת עבור עצמי
          </label>
        )}

        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <span className={styles.sectionTitleLine} />
            <span className={styles.sectionTitleText}>פרטי הורה</span>
            <span className={styles.sectionTitleLine} />
          </div>
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
            <div className={styles.gridFull}>
              <label className={styles.label}>דוא&quot;ל *</label>
              <input required type="email" value={parentEmail}
                onChange={(e) => setParentEmail(e.target.value)} className={styles.input}
                autoComplete="email" dir="ltr" />
            </div>
            {selfRegistering && (
              <>
                <div className={styles.fadeIn}>
                  <label className={styles.label}>תאריך לידה *</label>
                  <input required type="date" value={childBirthDate}
                    onChange={(e) => setChildBirthDate(e.target.value)} className={styles.input} />
                </div>
                <div className={`${styles.fadeIn} ${styles.gridFull}`}>
                  <label className={styles.label}>מין *</label>
                  <div className={styles.genderOptions}>
                    {(['male', 'female'] as const).map((g) => (
                      <label key={g} className={styles.radioLabel}>
                        <input type="radio" name="gender" value={g}
                          checked={childGender === g} onChange={() => setChildGender(g)}
                          style={{ accentColor: '#2B3090' }} required />
                        {g === 'male' ? 'זכר' : 'נקבה'}
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {!selfRegistering && (
          <div className={`${styles.section} ${styles.fadeIn}`}>
            <div className={styles.sectionTitle}>
              <span className={styles.sectionTitleLine} />
              <span className={styles.sectionTitleText}>פרטי הילד</span>
              <span className={styles.sectionTitleLine} />
            </div>
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
                <label className={styles.label}>ת.ז. ילד *</label>
                <input required type="text" value={childIdNumber}
                  onChange={(e) => setChildIdNumber(e.target.value)} className={styles.input} />
              </div>
              <div>
                <label className={styles.label}>תאריך לידה *</label>
                <input required type="date" value={childBirthDate}
                  onChange={(e) => setChildBirthDate(e.target.value)} className={styles.input} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className={styles.label}>מין *</label>
                <div className={styles.genderOptions}>
                  {(['male', 'female'] as const).map((g) => (
                    <label key={g} className={styles.radioLabel}>
                      <input type="radio" name="gender" value={g}
                        checked={childGender === g} onChange={() => setChildGender(g)}
                        style={{ accentColor: '#2B3090' }} required />
                      {g === 'male' ? 'זכר' : 'נקבה'}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {isTrial && (
          <div className={`${styles.section} ${styles.fadeIn}`}>
            <div className={styles.sectionTitle}>
              <span className={styles.sectionTitleLine} />
              <span className={styles.sectionTitleText}>בחרו תאריך לשיעור הניסיון</span>
              <span className={styles.sectionTitleLine} />
            </div>
            {trialLessonIds.length === 0 ? (
              <p className={styles.helperText}>לא נבחר שיעור — חזרו ובחרו מפגש מהרשימה.</p>
            ) : loadingTrialDates ? (
              <p className={styles.helperText}>טוען תאריכים זמינים...</p>
            ) : trialOccurrences.length === 0 ? (
              <p className={styles.errorText}>אין תאריכים פנויים לשיעור ניסיון כרגע.</p>
            ) : (
              <div className={styles.trialDateList}>
                {trialOccurrences.map((occ) => (
                  <label
                    key={`${occ.lesson_id ?? 'lesson'}-${occ.date}`}
                    className={`${styles.trialDateOption} ${trialLessonDate === occ.date && effectiveTrialLessonId === (occ.lesson_id ?? effectiveTrialLessonId) ? styles.trialDateOptionSelected : ''}`}
                  >
                    <input
                      type="radio"
                      name="trialLessonDate"
                      value={occ.date}
                      checked={trialLessonDate === occ.date && effectiveTrialLessonId === (occ.lesson_id ?? effectiveTrialLessonId)}
                      onChange={() => {
                        setTrialLessonDate(occ.date);
                        if (occ.lesson_id) setSelectedTrialLessonId(occ.lesson_id);
                        setErrorMsg('');
                      }}
                      className={styles.trialDateRadio}
                      required
                    />
                    <span className={styles.trialDateLabel}>
                      {occ.day_name} · {occ.label}
                    </span>
                    <span className={styles.trialDateTime}>
                      {occ.start_time}–{occ.end_time}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {errorMsg && <p className={styles.errorText}>{errorMsg}</p>}

        <button type="submit" className={styles.submitButton} disabled={lookingUp}>
          {lookingUp ? <span className={styles.spinner} /> : 'המשך'}
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
          <button type="button" className={styles.termsLink} onClick={() => setShowTerms(true)}>
            תקנון
          </button>
        </label>

        {showTerms && (
          <div className={styles.termsOverlay} onClick={() => setShowTerms(false)}>
            <div className={styles.termsModal} onClick={(e) => e.stopPropagation()}>
              <div className={styles.termsHeader}>
                <span className={styles.termsModalTitle}>תקנון</span>
                <button type="button" className={styles.termsClose} onClick={() => setShowTerms(false)}>✕</button>
              </div>
              <div className={styles.termsBody}>
                {loadingTerms ? (
                  <p>טוען תקנון...</p>
                ) : termsContent ? (
                  <div dangerouslySetInnerHTML={{ __html: termsContent }} />
                ) : (
                  <p>לא ניתן לטעון את התקנון. נסו שוב מאוחר יותר.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {errorMsg && <p className={styles.errorText}>{errorMsg}</p>}

        <button type="submit" className={styles.submitButton}>
          {isTrial
            ? (trialLessonIsPaid ? 'שלח והמשך לתשלום' : 'שלח והרשם לניסיון')
            : 'שלח והמשך לתשלום'}
        </button>
      </form>
    );
  }

  if (step === 'payment' && paymentData) {
    return (
      <div className={styles.paymentContainer} dir="rtl">
        <h3 className={styles.title}>
          {isTrial ? `הרשמה לשיעור ניסיון: ${courseName}` : `הרשמה לחוג: ${courseName}`}
        </h3>

        <div className={styles.paymentSummary}>
          <p className={styles.summaryTitle}>{isTrial ? 'תשלום לשיעור ניסיון' : 'סיכום תשלום'}</p>
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
          {(paymentData.prorated_amount ?? 0) > 0 && (
            <div className={styles.summaryRow}>
              <span>מנוי חודשי (יחסי)</span>
              <span>₪{Number(paymentData.prorated_amount).toFixed(2)}</span>
            </div>
          )}
          {(paymentData.registration_fee ?? 0) > 0 && (
            <div className={styles.summaryRow}>
              <span>דמי רישום (חד-פעמי)</span>
              <span>₪{Number(paymentData.registration_fee).toFixed(2)}</span>
            </div>
          )}
          <div className={styles.totalRow}>
            <span>לתשלום</span>
            <span className={styles.totalAmount}>₪{Number(paymentData.final_amount).toFixed(2)}</span>
          </div>
        </div>

        <div className={styles.cardFields}>
          <p className={styles.cardSectionTitle}>פרטי כרטיס אשראי</p>
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

  if (step === 'trial_success') {
    return (
      <div className={styles.resultContainer} dir="rtl">
        <div className={styles.successIcon}>✓</div>
        <p className={styles.resultTitle}>נרשמתם לשיעור ניסיון!</p>
        <p className={styles.resultSubtext}>ניצור איתכם קשר בווטסאפ עם פרטי השיעור.</p>
        <button type="button" onClick={onComplete} className={styles.closeButton}>
          סגור
        </button>
      </div>
    );
  }

  if (step === 'payment_success') {
    return (
      <div className={styles.resultContainer} dir="rtl">
        <div className={styles.successIcon}>✓</div>
        <p className={styles.resultTitle}>התשלום בוצע בהצלחה!</p>
        <p className={styles.resultSubtext}>{selfRegistering ? parentFirstName : childFirstName} נרשמ/ה לחוג {courseName}.</p>
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
      <span className={styles.submittingSpinner} />
      שולח פרטים, אנא המתן...
    </div>
  );
}
