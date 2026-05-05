'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/AuthProvider';

function SignInInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next');

  const { login, user, loading } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    } catch (err: any) {
      setError(err?.response?.data?.error || 'התחברות נכשלה');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md card">
        <h1 className="text-2xl font-bold mb-2">התחברות</h1>
        <p className="text-sm text-muted-foreground mb-6">מערכת פנימית — אין הרשמה עצמית</p>

        {error && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">אימייל</label>
            <input
              type="email"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 bg-white"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">סיסמה</label>
            <input
              type="password"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 bg-white"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <Button className="w-full" variant="gradient" disabled={submitting}>
            {submitting ? 'מתחבר...' : 'התחבר'}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center px-4">
          <p className="text-muted-foreground">טוען...</p>
        </div>
      }
    >
      <SignInInner />
    </Suspense>
  );
}
