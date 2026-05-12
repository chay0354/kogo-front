'use client';

import { useState } from 'react';
import SignatureCanvas from './SignatureCanvas';

interface CourseRegistrationFormProps {
  courseName: string;
  onBack: () => void;
  onSubmit: (data: RegistrationData) => void;
}

export interface RegistrationData {
  firstName: string;
  lastName: string;
  idNumber: string;
  birthDate: string;
  gender: 'male' | 'female' | '';
  phone: string;
  healthConsent: boolean;
  termsConsent: boolean;
  signature: string | null;
  rulesConsent: boolean;
}

const emptyForm = (): RegistrationData => ({
  firstName: '',
  lastName: '',
  idNumber: '',
  birthDate: '',
  gender: '',
  phone: '',
  healthConsent: false,
  termsConsent: false,
  signature: null,
  rulesConsent: false,
});

export default function CourseRegistrationForm({
  courseName,
  onBack,
  onSubmit,
}: CourseRegistrationFormProps) {
  const [form, setForm] = useState<RegistrationData>(emptyForm);

  const set = <K extends keyof RegistrationData>(key: K, value: RegistrationData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  const inputClass =
    'w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500';
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1';

  return (
    <form onSubmit={handleSubmit} className="space-y-5" dir="rtl">
      <div className="flex items-center gap-3 mb-2">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-teal-600 underline hover:text-teal-800"
        >
          ← חזרה לפרטי החוג
        </button>
        <h3 className="text-base font-semibold">הרשמה לחוג: {courseName}</h3>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* First name */}
        <div>
          <label className={labelClass}>שם פרטי של הילד</label>
          <input
            required
            type="text"
            value={form.firstName}
            onChange={(e) => set('firstName', e.target.value)}
            className={inputClass}
          />
        </div>

        {/* Last name */}
        <div>
          <label className={labelClass}>שם משפחה של הילד</label>
          <input
            required
            type="text"
            value={form.lastName}
            onChange={(e) => set('lastName', e.target.value)}
            className={inputClass}
          />
        </div>

        {/* ID */}
        <div>
          <label className={labelClass}>ת.ז של הילד</label>
          <input
            required
            type="text"
            value={form.idNumber}
            onChange={(e) => set('idNumber', e.target.value)}
            className={inputClass}
          />
        </div>

        {/* Birth date */}
        <div>
          <label className={labelClass}>תאריך לידה</label>
          <input
            required
            type="date"
            value={form.birthDate}
            onChange={(e) => set('birthDate', e.target.value)}
            className={inputClass}
          />
        </div>

        {/* Gender */}
        <div>
          <label className={labelClass}>מין</label>
          <div className="flex gap-6 mt-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="gender"
                value="male"
                checked={form.gender === 'male'}
                onChange={() => set('gender', 'male')}
                className="accent-teal-600"
              />
              זכר
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="gender"
                value="female"
                checked={form.gender === 'female'}
                onChange={() => set('gender', 'female')}
                className="accent-teal-600"
              />
              נקבה
            </label>
          </div>
        </div>

        {/* Phone */}
        <div>
          <label className={labelClass}>טלפון נייד</label>
          <input
            required
            type="tel"
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      {/* Health consent */}
      <label className="flex items-start gap-3 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={form.healthConsent}
          onChange={(e) => set('healthConsent', e.target.checked)}
          className="mt-0.5 accent-teal-600"
          required
        />
        אני מתחייב להודיע על כל שינוי במצבי הבריאותי המשפיע על השתתפותי בפעילות.
      </label>

      {/* Terms consent */}
      <label className="flex items-start gap-3 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={form.termsConsent}
          onChange={(e) => set('termsConsent', e.target.checked)}
          className="mt-0.5 accent-teal-600"
          required
        />
        אני הנרשם/ההורה הרושם קראתי בעיון את כל הנהלים והתנאים בדף זה ואני מסכים/ה לכולם ומתחייב/ת לשלם את שכר הלימוד כנדרש על פי תנאי התקנון
      </label>

      {/* Signature */}
      <div>
        <label className={labelClass}>חתימה</label>
        <SignatureCanvas onChange={(val) => set('signature', val)} />
      </div>

      {/* Rules consent */}
      <label className="flex items-start gap-3 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={form.rulesConsent}
          onChange={(e) => set('rulesConsent', e.target.checked)}
          className="mt-0.5 accent-teal-600"
          required
        />
        מסכים עם התקנון
      </label>

      <button
        type="submit"
        className="w-full rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
      >
        שלח
      </button>
    </form>
  );
}
