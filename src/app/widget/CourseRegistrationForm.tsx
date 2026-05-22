'use client';

import { useState, useEffect, useRef } from 'react';
import api from '@/lib/api';
import SignatureCanvas from './SignatureCanvas';

export interface CourseLesson {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  instructor_name: string | null;
}

interface Props {
  courseId: string;
  courseName: string;
  onBack: () => void;
  onComplete: () => void;
}

type Step =
  | 'details'
  | 'discount_confirm'
  | 'consents'
  | 'submitting'
  | 'error'
  | 'payment'
  | 'payment_success'
  | 'payment_failed';

interface LookupResult {
  family_status: 'new' | 'existing';
  child_status: 'new' | 'active';
  child_id?: string;
  discount_type: 'sibling' | 'additional_lesson' | null;
  discount_question: string | null;
}

interface PaymentResponse {
  payment_id: string;
  tranzila_url: string;
  final_amount: number;
  base_amount: number;
  discount_amount: number;
  discounts_applied: Array<{ name: string; amount: number }>;
}

const inputClass =
  'w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';

const MAX_POLL_ATTEMPTS = 30;

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
  const [polling, setPolling] = useState(false);
  const pollAttemptsRef = useRef(0);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-poll when entering the payment step
  useEffect(() => {
    if (step !== 'payment' || !paymentData) return;

    pollAttemptsRef.current = 0;
    setPolling(true);

    const doPoll = async () => {
      try {
        const res = await api.get(`/customers/payments/${paymentData.payment_id}/`);
        const status: string = res.data.status;

        if (status === 'completed') {
          setPolling(false);
          setStep('payment_success');
          setTimeout(() => onComplete(), 3000);
          return;
        }
        if (status === 'failed' || status === 'cancelled') {
          setPolling(false);
          setErrorMsg('התשלום נכשל. אנא נסה שנית.');
          setStep('payment_failed');
          return;
        }
      } catch {
        // network error — keep polling
      }

      pollAttemptsRef.current += 1;
      if (pollAttemptsRef.current < MAX_POLL_ATTEMPTS) {
        pollTimeoutRef.current = setTimeout(doPoll, 10000);
      } else {
        setPolling(false);
        setErrorMsg('פג הזמן להמתנה לאישור תשלום. אם ביצעת תשלום, פנה לצוות.');
        setStep('payment_failed');
      }
    };

    doPoll();

    return () => {
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
  }, [step, paymentData?.payment_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleManualPoll = async () => {
    if (!paymentData || polling) return;
    if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    setPolling(true);
    try {
      const res = await api.get(`/customers/payments/${paymentData.payment_id}/`);
      const status: string = res.data.status;
      if (status === 'completed') {
        setPolling(false);
        setStep('payment_success');
        setTimeout(() => onComplete(), 3000);
        return;
      }
      if (status === 'failed' || status === 'cancelled') {
        setPolling(false);
        setErrorMsg('התשלום נכשל. אנא נסה שנית.');
        setStep('payment_failed');
        return;
      }
    } catch {
      // ignore
    }
    setPolling(false);
  };

  // ── Step 1 submit ──────────────────────────────────────────────────────────
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

  // ── Discount confirm ───────────────────────────────────────────────────────
  const handleDiscountAnswer = (confirmed: boolean) => {
    setLookup((prev) => prev ? { ...prev, _confirmed: confirmed } as LookupResult & { _confirmed: boolean } : prev);
    setStep('consents');
  };

  // ── Final submit ───────────────────────────────────────────────────────────
  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStep('submitting');
    setErrorMsg('');

    const discountConfirmed = (lookup as (LookupResult & { _confirmed?: boolean }) | null)?._confirmed ?? false;
    const existingChildId   = discountConfirmed ? (lookup?.child_id ?? '') : '';

    const webhookBase =
      process.env.NEXT_PUBLIC_WEBHOOK_BASE_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      'http://localhost:8000/api/v1';
    const callbackUrl = `${webhookBase.replace('/api/v1', '')}/api/v1/customers/payments/webhook/`;

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
        callback_url: callbackUrl,
      });
      setPaymentData({
        payment_id: res.data.payment_id,
        tranzila_url: res.data.tranzila_url,
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

  // ── Render ─────────────────────────────────────────────────────────────────
  const header = (
    <div className="flex items-center gap-3 mb-4">
      <button
        type="button"
        onClick={step === 'consents' || step === 'discount_confirm' ? () => setStep('details') : onBack}
        className="text-sm text-teal-600 underline hover:text-teal-800"
      >
        ← חזרה
      </button>
      <h3 className="text-base font-semibold">הרשמה לחוג: {courseName}</h3>
    </div>
  );

  // ── STEP 1: Details ────────────────────────────────────────────────────────
  if (step === 'details') {
    return (
      <form onSubmit={handleDetailsSubmit} className="space-y-5" dir="rtl">
        {header}

        {/* Parent section */}
        <fieldset className="border border-gray-200 rounded-md p-4 space-y-3">
          <legend className="text-sm font-semibold text-gray-700 px-1">פרטי הורה</legend>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>שם פרטי</label>
              <input required type="text" value={parentFirstName}
                onChange={(e) => setParentFirstName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>שם משפחה</label>
              <input required type="text" value={parentLastName}
                onChange={(e) => setParentLastName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>ת.ז. הורה *</label>
              <input required type="text" value={parentIdNumber}
                onChange={(e) => setParentIdNumber(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>טלפון נייד</label>
              <input required type="tel" value={parentPhone}
                onChange={(e) => setParentPhone(e.target.value)} className={inputClass} />
            </div>
          </div>
        </fieldset>

        {/* Child section */}
        <fieldset className="border border-gray-200 rounded-md p-4 space-y-3">
          <legend className="text-sm font-semibold text-gray-700 px-1">פרטי הילד</legend>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>שם פרטי *</label>
              <input required type="text" value={childFirstName}
                onChange={(e) => setChildFirstName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>שם משפחה *</label>
              <input required type="text" value={childLastName}
                onChange={(e) => setChildLastName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>ת.ז. ילד</label>
              <input type="text" value={childIdNumber}
                onChange={(e) => setChildIdNumber(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>תאריך לידה *</label>
              <input required type="date" value={childBirthDate}
                onChange={(e) => setChildBirthDate(e.target.value)} className={inputClass} />
            </div>
            <div className="col-span-2">
              <label className={labelClass}>מין *</label>
              <div className="flex gap-6 mt-1">
                {(['male', 'female'] as const).map((g) => (
                  <label key={g} className="flex items-center gap-2 text-sm cursor-pointer">
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

        {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

        <button type="submit"
          className="w-full rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
          המשך
        </button>
      </form>
    );
  }

  // ── STEP 2: Discount confirmation ──────────────────────────────────────────
  if (step === 'discount_confirm' && lookup?.discount_question) {
    return (
      <div className="space-y-5" dir="rtl">
        {header}
        <div className="rounded-lg border border-teal-200 bg-teal-50 p-5 text-sm leading-relaxed text-gray-700">
          {lookup.discount_question}
        </div>
        <div className="flex gap-3">
          <button onClick={() => handleDiscountAnswer(true)}
            className="flex-1 rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
            כן
          </button>
          <button onClick={() => handleDiscountAnswer(false)}
            className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            לא
          </button>
        </div>
      </div>
    );
  }

  // ── STEP 3: Consents + signature ───────────────────────────────────────────
  if (step === 'consents' || step === 'error') {
    return (
      <form onSubmit={handleFinalSubmit} className="space-y-5" dir="rtl">
        {header}

        <label className="flex items-start gap-3 text-sm cursor-pointer">
          <input type="checkbox" checked={healthConsent}
            onChange={(e) => setHealthConsent(e.target.checked)}
            className="mt-0.5 accent-teal-600" required />
          אני מתחייב להודיע על כל שינוי במצב הבריאותי המשפיע על השתתפות הילד בפעילות.
        </label>

        <label className="flex items-start gap-3 text-sm cursor-pointer">
          <input type="checkbox" checked={termsConsent}
            onChange={(e) => setTermsConsent(e.target.checked)}
            className="mt-0.5 accent-teal-600" required />
          אני הנרשם/ההורה הרושם קראתי בעיון את כל הנהלים והתנאים ואני מסכים/ה לכולם ומתחייב/ת לשלם את שכר הלימוד כנדרש.
        </label>

        <div className="w-1/2">
          <label className={labelClass}>חתימה</label>
          <SignatureCanvas onChange={setSignature} />
        </div>

        <label className="flex items-start gap-3 text-sm cursor-pointer">
          <input type="checkbox" checked={rulesConsent}
            onChange={(e) => setRulesConsent(e.target.checked)}
            className="mt-0.5 accent-teal-600" required />
          מסכים עם התקנון
        </label>

        {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

        <button type="submit"
          className="w-full rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50">
          שלח והמשך לתשלום
        </button>
      </form>
    );
  }

  // ── STEP 4: Payment iframe ─────────────────────────────────────────────────
  if (step === 'payment' && paymentData) {
    return (
      <div className="space-y-4" dir="rtl">
        <h3 className="text-base font-semibold">הרשמה לחוג: {courseName}</h3>

        {/* Payment summary */}
        <div className="rounded-lg border border-teal-200 bg-teal-50 p-4 text-sm space-y-2">
          <p className="font-semibold text-gray-800 mb-1">סיכום תשלום</p>
          <div className="flex justify-between text-gray-600">
            <span>מחיר בסיס</span>
            <span>₪{Number(paymentData.base_amount).toFixed(2)}</span>
          </div>
          {paymentData.discount_amount > 0 && (
            <div className="flex justify-between text-green-700">
              <span>הנחה</span>
              <span>-₪{Number(paymentData.discount_amount).toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold border-t border-teal-300 pt-2 text-gray-900">
            <span>לתשלום</span>
            <span className="text-teal-700">₪{Number(paymentData.final_amount).toFixed(2)}</span>
          </div>
        </div>

        {/* Tranzila iframe */}
        <div className="border border-gray-300 rounded-lg overflow-hidden" style={{ height: '480px' }}>
          <iframe
            src={paymentData.tranzila_url}
            className="w-full h-full"
            title="Tranzila Payment"
            allow="payment"
            sandbox="allow-forms allow-scripts allow-same-origin allow-top-navigation"
          />
        </div>

        {polling && (
          <p className="text-xs text-center text-gray-400">ממתין לאישור תשלום...</p>
        )}

        <button
          type="button"
          onClick={handleManualPoll}
          disabled={polling}
          className="w-full rounded-md border border-teal-600 text-teal-700 px-4 py-2 text-sm font-medium hover:bg-teal-50 disabled:opacity-50"
        >
          בדוק סטטוס תשלום
        </button>
      </div>
    );
  }

  // ── STEP 5: Payment success ────────────────────────────────────────────────
  if (step === 'payment_success') {
    return (
      <div className="py-12 text-center space-y-4" dir="rtl">
        <div className="text-green-500 text-6xl">✓</div>
        <p className="text-lg font-semibold text-gray-800">התשלום בוצע בהצלחה!</p>
        <p className="text-sm text-gray-600">{childFirstName} נרשמ/ה לחוג {courseName}.</p>
        <button
          type="button"
          onClick={onComplete}
          className="rounded-md bg-teal-600 px-6 py-2 text-sm font-medium text-white hover:bg-teal-700"
        >
          סגור
        </button>
      </div>
    );
  }

  // ── STEP 5: Payment failed ─────────────────────────────────────────────────
  if (step === 'payment_failed') {
    return (
      <div className="py-12 text-center space-y-4" dir="rtl">
        <div className="text-red-500 text-6xl">✗</div>
        <p className="text-lg font-semibold text-gray-800">התשלום נכשל</p>
        <p className="text-sm text-gray-500">{errorMsg || 'אנא נסה שנית או פנה לצוות.'}</p>
        <div className="flex gap-3 justify-center">
          <button
            type="button"
            onClick={() => { setErrorMsg(''); pollAttemptsRef.current = 0; setStep('payment'); }}
            className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
          >
            נסה שנית
          </button>
          <button
            type="button"
            onClick={onBack}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            סגור
          </button>
        </div>
      </div>
    );
  }

  // ── Submitting ─────────────────────────────────────────────────────────────
  return (
    <div className="py-10 text-center text-sm text-gray-500" dir="rtl">
      שולח פרטים, אנא המתן...
    </div>
  );
}
