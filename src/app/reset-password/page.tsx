'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import AuthScreen, {
  AuthAlert,
  AuthField,
  AuthScreenLoading,
  AuthSubmit,
} from '@/components/auth/AuthScreen';
import authStyles from '@/components/auth/AuthScreen.module.css';
import * as authApi from '@/lib/auth';

function ResetPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const uid = searchParams.get('uid') || '';
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!uid || !token) {
      setError('קישור איפוס לא תקין. בקש/י קישור חדש.');
      return;
    }
    if (password !== confirmPassword) {
      setError('הסיסמאות אינן תואמות');
      return;
    }

    setSubmitting(true);
    try {
      const text = await authApi.resetPassword(uid, token, password);
      setMessage(text);
      setTimeout(() => router.replace('/signin'), 2500);
    } catch (err: unknown) {
      const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
      const tokenErr = data?.token;
      const passwordErr = data?.password;
      const msg = (typeof tokenErr === 'string' && tokenErr)
        || (Array.isArray(tokenErr) && tokenErr[0])
        || (typeof passwordErr === 'string' && passwordErr)
        || (Array.isArray(passwordErr) && passwordErr[0])
        || (typeof data?.error === 'string' && data.error)
        || 'איפוס הסיסמה נכשל. ייתכן שפג תוקף הקישור.';
      setError(String(msg));
    } finally {
      setSubmitting(false);
    }
  };

  if (!uid || !token) {
    return (
      <AuthScreen
        title="קישור לא תקין"
        subtitle="הקישור לאיפוס הסיסמה חסר או לא תקין."
        backHref="/forgot-password"
        backLabel="בקש/י קישור חדש"
        showLogo={false}
      >
        <p className={authStyles.cardSubtitle} style={{ textAlign: 'center' }}>
          <Link href="/forgot-password" className={authStyles.link}>
            שליחת קישור חדש לאיפוס סיסמה
          </Link>
        </p>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      title="איפוס סיסמה"
      subtitle="בחר/י סיסמה חדשה לחשבון שלך."
      backHref="/signin"
      backLabel="חזרה להתחברות"
    >
      {error && <AuthAlert variant="error">{error}</AuthAlert>}
      {message && <AuthAlert variant="success">{message}</AuthAlert>}

      <form onSubmit={onSubmit} className={authStyles.form}>
        <AuthField
          id="password"
          label="סיסמה חדשה"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          required
          disabled={!!message}
          showPasswordToggle
          passwordVisible={showPassword}
          onTogglePassword={() => setShowPassword((v) => !v)}
        />

        <AuthField
          id="confirmPassword"
          label="אימות סיסמה"
          value={confirmPassword}
          onChange={setConfirmPassword}
          autoComplete="new-password"
          required
          disabled={!!message}
          showPasswordToggle
          passwordVisible={showPassword}
          onTogglePassword={() => setShowPassword((v) => !v)}
        />

        <AuthSubmit disabled={submitting || !!message}>
          {submitting ? 'מעדכן...' : 'עדכן סיסמה'}
        </AuthSubmit>
      </form>
    </AuthScreen>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthScreenLoading />}>
      <ResetPasswordInner />
    </Suspense>
  );
}
