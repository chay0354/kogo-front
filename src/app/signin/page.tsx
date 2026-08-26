'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import AuthScreen, {
  AuthAlert,
  AuthField,
  AuthScreenLoading,
  AuthSubmit,
} from '@/components/auth/AuthScreen';
import authStyles from '@/components/auth/AuthScreen.module.css';
import { useAuth } from '@/components/AuthProvider';

function SignInInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next');

  const { login, user, loading } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) return;
    if (user.role === 'worker') router.replace('/schedule');
    else router.replace(nextPath || '/');
  }, [loading, user, router, nextPath]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const me = await login(email, password);
      if (me.role === 'worker') {
        router.replace('/schedule');
        return;
      }
      router.replace(nextPath || '/');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'התחברות נכשלה';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthScreen
      title="ברוכים השבים"
      subtitle="התחבר/י עם שם המשתמש או האימייל והסיסמה שקיבלת מהנהלת קוגומלו"
    >
      {error && <AuthAlert variant="error">{error}</AuthAlert>}

      <form onSubmit={onSubmit} className={authStyles.form}>
        <AuthField
          id="email"
          label="שם משתמש או אימייל"
          type="text"
          value={email}
          onChange={setEmail}
          autoComplete="username"
          required
        />

        <AuthField
          id="password"
          label="סיסמה"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          required
          showPasswordToggle
          passwordVisible={showPassword}
          onTogglePassword={() => setShowPassword((v) => !v)}
          footer={
            <Link href="/forgot-password" className={authStyles.link}>
              שכחתי סיסמה
            </Link>
          }
        />

        <AuthSubmit disabled={submitting}>
          {submitting ? 'מתחבר...' : 'התחבר למערכת'}
        </AuthSubmit>
      </form>
    </AuthScreen>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<AuthScreenLoading />}>
      <SignInInner />
    </Suspense>
  );
}
