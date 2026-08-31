'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';

interface Credential {
  key: string;
  label: string;
  source: 'environment' | 'stored' | null;
}

/**
 * Credentials a manager can set when the hosting account is out of reach.
 *
 * A value entered here is only used while the deployment's own environment
 * carries none, so adding it there later takes over on its own. Nothing is ever
 * read back — the screen reports only whether something is present.
 */
export default function IntegrationCredentials() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/core/auth/integration-credentials/');
      setCredentials(res.data?.credentials ?? []);
    } catch {
      setError('שגיאה בטעינת ההגדרות');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async (key: string) => {
    const value = (values[key] || '').trim();
    if (!value) return;
    setBusyKey(key);
    setError('');
    setNotice('');
    try {
      await api.post('/core/auth/integration-credentials/', { key, value });
      setValues((prev) => ({ ...prev, [key]: '' }));
      setNotice('ההגדרה נשמרה');
      await load();
    } catch {
      setError('שמירת ההגדרה נכשלה');
    } finally {
      setBusyKey('');
    }
  };

  const clear = async (key: string) => {
    setBusyKey(key);
    setError('');
    setNotice('');
    try {
      await api.delete(`/core/auth/integration-credentials/?key=${encodeURIComponent(key)}`);
      await load();
    } catch {
      setError('הסרת ההגדרה נכשלה');
    } finally {
      setBusyKey('');
    }
  };

  if (loading) return null;
  if (credentials.length === 0) return null;

  return (
    <div className="card mt-4">
      <h2 className="text-base font-semibold">הגדרות חיבור</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        נדרש רק כאשר ההגדרה אינה מוגדרת בשרת עצמו. הערך נשמר ואינו מוצג שוב.
      </p>

      {error && (
        <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {notice && (
        <div className="mt-3 rounded-lg border px-4 py-3 text-sm text-muted-foreground">{notice}</div>
      )}

      <div className="mt-4 space-y-4">
        {credentials.map((c) => (
          <div key={c.key} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium">{c.label}</div>
                <div className="text-xs text-muted-foreground">
                  {c.source === 'environment'
                    ? 'מוגדר בשרת — אין צורך בפעולה'
                    : c.source === 'stored'
                      ? 'מוגדר כאן'
                      : 'לא מוגדר'}
                </div>
              </div>
              {c.source === 'stored' && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busyKey === c.key}
                  onClick={() => clear(c.key)}
                >
                  הסר
                </Button>
              )}
            </div>

            {c.source !== 'environment' && (
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="password"
                  className="h-9 flex-1 rounded-lg border border-gray-200 bg-white px-3 text-sm"
                  placeholder={c.source === 'stored' ? 'הזינו ערך חדש להחלפה' : 'הדביקו את הערך'}
                  value={values[c.key] || ''}
                  onChange={(e) => setValues((prev) => ({ ...prev, [c.key]: e.target.value }))}
                  aria-label={c.label}
                  autoComplete="off"
                />
                <Button
                  disabled={!(values[c.key] || '').trim() || busyKey === c.key}
                  onClick={() => save(c.key)}
                >
                  שמור
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
