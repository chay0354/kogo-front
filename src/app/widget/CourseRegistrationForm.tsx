'use client';

import { useState } from 'react';
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
  courseName: string;
  lessons: CourseLesson[];
  onBack: () => void;
  onComplete: (paymentUrl?: string) => void;
}

type Step = 'details' | 'discount_confirm' | 'consents' | 'submitting' | 'error';

interface LookupResult {
  family_status: 'new' | 'existing';
  child_status: 'new' | 'active';
  child_id?: string;
  discount_type: 'sibling' | 'additional_lesson' | null;
  discount_question: string | null;
}

const inputClass =
  'w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';

export default function CourseRegistrationForm({ courseName, lessons, onBack, onComplete }: Props) {
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
  const [lessonId] = useState(lessons.length === 1 ? lessons[0].id : '');

  // Lookup result — used for discount step
  const [lookup, setLookup] = useState<LookupResult | null>(null);

  // Step 3 — consents
  const [healthConsent, setHealthConsent] = useState(false);
  const [termsConsent, setTermsConsent] = useState(false);
  const [rulesConsent, setRulesConsent] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);

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

    const successUrl  = `${window.location.origin}/widget/payment-success`;
    const errorUrl    = `${window.location.origin}/widget/payment-error`;
    const callbackUrl = `${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/v1/customers/payments/webhook/`;

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
        lesson_id: lessonId,
        signature: signature,
        discount_confirmed: discountConfirmed,
        existing_child_id: existingChildId,
        success_url: successUrl,
        error_url: errorUrl,
        callback_url: callbackUrl,
      });
      onComplete(res.data.tranzila_url);
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

  // ── Submitting ─────────────────────────────────────────────────────────────
  return (
    <div className="py-10 text-center text-sm text-gray-500" dir="rtl">
      שולח פרטים, אנא המתן...
    </div>
  );
}
