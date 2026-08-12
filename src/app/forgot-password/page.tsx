'use client';

import { useState } from 'react';

import AuthScreen, {
  AuthAlert,
  AuthField,
  AuthSubmit,
} from '@/components/auth/AuthScreen';
import authStyles from '@/components/auth/AuthScreen.module.css';
import * as authApi from '@/lib/auth';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);
    try {
      const text = await authApi.requestPasswordReset(email.trim());
      setMessage(text);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'שליחת המייל נכשלה. נסה שנית.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthScreen
      title="שכחתי סיסמה"
      subtitle="הזן/י את כתובת האימייל שלך. אם היא קיימת במערכת, נשלח קישור לאיפוס סיסמה."
      backHref="/signin"
      backLabel="חזרה להתחברות"
    >
      {error && <AuthAlert variant="error">{error}</AuthAlert>}
      {message && <AuthAlert variant="success">{message}</AuthAlert>}

      <form onSubmit={onSubmit} className={authStyles.form}>
        <AuthField
          id="email"
          label="אימייל"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          required
          disabled={!!message}
        />

        <AuthSubmit disabled={submitting || !!message}>
          {submitting ? 'שולח...' : 'שלח קישור לאיפוס'}
        </AuthSubmit>
      </form>
    </AuthScreen>
  );
}
