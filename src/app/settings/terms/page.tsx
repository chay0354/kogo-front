'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import AppLayout from '@/components/AppLayout';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/components/AuthProvider';
import api from '@/lib/api';

export default function TermsEditorPage() {
  const { user } = useAuth();
  const isManager = user?.role === 'manager';

  const [content, setContent] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!isManager) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    api
      .get('/core/registration-terms/')
      .then((res) => {
        setContent(res.data?.content || '');
        setUpdatedAt(res.data?.updated_at || null);
      })
      .catch(() => setError('שגיאה בטעינת התקנון'))
      .finally(() => setLoading(false));
  }, [isManager]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await api.put('/core/registration-terms/', { content });
      setContent(res.data?.content || content);
      setUpdatedAt(res.data?.updated_at || null);
      setSaved(true);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'שמירה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout>
      <PageHeader
        title="עריכת תקנון"
        description="תקנון הרישום שמוצג בווידג'ט ובטופס ההרשמה"
        actions={
          isManager ? (
            <>
              <Link href="/settings">
                <Button variant="outline">חזרה להגדרות</Button>
              </Link>
              <Button variant="gradient" onClick={save} disabled={saving || loading}>
                {saving ? 'שומר...' : 'שמור'}
              </Button>
            </>
          ) : undefined
        }
      />

      <div className="card">
        {!isManager ? (
          <p className="text-muted-foreground">אין הרשאה</p>
        ) : loading ? (
          <div className="space-y-4" aria-busy="true" aria-label="טוען תקנון">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-[420px] rounded-lg" />
            <Skeleton className="h-10 w-32 rounded-lg" />
          </div>
        ) : (
          <div className="space-y-4">
            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}
            {saved && !error && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                התקנון נשמר בהצלחה
              </div>
            )}
            {updatedAt && (
              <p className="text-sm text-muted-foreground">
                עודכן לאחרונה: {new Date(updatedAt).toLocaleString('he-IL')}
              </p>
            )}

            <div>
              <label className="block text-sm font-medium mb-2">תוכן HTML</label>
              <textarea
                className="w-full min-h-[420px] rounded-lg border border-gray-200 px-3 py-2 bg-white font-mono text-sm leading-relaxed"
                dir="rtl"
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  setSaved(false);
                }}
                spellCheck={false}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                ניתן להשתמש בתגיות HTML כמו &lt;p&gt;, &lt;strong&gt;, &lt;ul&gt;, &lt;li&gt;.
              </p>
            </div>

            <div>
              <h2 className="text-sm font-medium mb-2">תצוגה מקדימה</h2>
              <div
                className="rounded-lg border border-gray-200 bg-white p-4 text-sm leading-relaxed space-y-2 [&_.terms-badge]:inline-block [&_.terms-badge]:rounded-full [&_.terms-badge]:bg-amber-100 [&_.terms-badge]:px-3 [&_.terms-badge]:py-1 [&_.terms-badge]:text-amber-900 [&_.terms-badge]:font-semibold"
                dir="rtl"
                dangerouslySetInnerHTML={{ __html: content }}
              />
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
