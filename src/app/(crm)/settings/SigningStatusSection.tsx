'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/components/AuthProvider';
import { fetchSigningStatus, type SigningStatus } from '@/lib/signingApi';
import {
  formatFingerprint,
  formatSigningStamp,
  isSigningConfigured,
  isSigningOn,
  signingBackendLabel,
} from '@/lib/signingUtils';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * The secured electronic signature on the fiscal documents, as it stands: on
 * or off, which key signs, the certificate the public can check it against,
 * the last signature and what is waiting. Read only — the key and the switch
 * live in the server's environment, not here. Managers only.
 */
export default function SigningStatusSection() {
  const { user } = useAuth();
  const isManager = user?.role === 'manager';
  const [status, setStatus] = useState<SigningStatus | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isManager) return undefined;
    let live = true;
    setLoadState('loading');
    fetchSigningStatus()
      .then((data) => {
        if (!live) return;
        setStatus(data);
        setLoadState('ready');
      })
      .catch(() => {
        if (!live) return;
        setStatus(null);
        setLoadState('error');
      });
    return () => {
      live = false;
    };
  }, [isManager]);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (!isManager) return null;

  const on = isSigningOn(status);
  const configured = isSigningConfigured(status);
  const fingerprint = formatFingerprint(status?.cert_fingerprint);

  async function copyFingerprint() {
    if (!fingerprint) return;
    try {
      await navigator.clipboard.writeText(fingerprint);
      setCopied(true);
      toast.success('טביעת האצבע הועתקה');
    } catch {
      toast.error('ההעתקה נכשלה');
    }
  }

  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">חתימה אלקטרונית</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            חתימה אלקטרונית מאובטחת על החשבוניות, הקבלות והזיכויים, לפי הוראה 18ב להוראות ניהול פנקסי חשבונות
          </p>
        </div>
        {loadState === 'ready' && (on ? (
          <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
            פעילה
          </span>
        ) : (
          <Badge variant="secondary">כבויה</Badge>
        ))}
      </div>

      {loadState === 'loading' && (
        <div className="mt-3 space-y-2" aria-busy="true" aria-label="טוען את מצב החתימה">
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
      )}

      {loadState === 'error' && (
        <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          לא ניתן לטעון את מצב החתימה
        </div>
      )}

      {loadState === 'ready' && !on && (
        <p className="mt-3 text-sm">
          החתימה כבויה — המסמכים נשלחים כמו היום, בלי חתימה אלקטרונית.
          {configured && ' המפתח מוגדר, והחתימה תופעל בהגדרת השרת.'}
        </p>
      )}

      {loadState === 'ready' && status && (on || configured) && (
        <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]">
          <dt className="text-muted-foreground">מפתח החתימה</dt>
          <dd className="min-w-0">
            <div>{signingBackendLabel(status.backend)}</div>
            {status.key_id && (
              <div dir="ltr" className="mt-1 break-all text-right font-mono text-xs text-muted-foreground">
                {status.key_id}
              </div>
            )}
          </dd>

          <dt className="text-muted-foreground">התעודה</dt>
          <dd className="min-w-0">
            {status.cert_subject ? (
              <div dir="ltr" className="break-words text-right font-mono text-xs">{status.cert_subject}</div>
            ) : (
              <span className="text-muted-foreground">לא הוגדרה</span>
            )}
          </dd>

          <dt className="text-muted-foreground">טביעת אצבע (SHA-256)</dt>
          <dd className="min-w-0">
            {fingerprint ? (
              <div className="flex items-start gap-2">
                <code dir="ltr" className="min-w-0 flex-1 break-all text-left font-mono text-xs leading-5">
                  {fingerprint}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 gap-1 px-2 text-xs"
                  onClick={() => void copyFingerprint()}
                  aria-label="העתקת טביעת האצבע"
                >
                  {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                  {copied ? 'הועתק' : 'העתקה'}
                </Button>
              </div>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </dd>

          <dt className="text-muted-foreground">חתימה אחרונה</dt>
          <dd>{formatSigningStamp(status.last_signed_at) || 'עוד לא נחתם מסמך'}</dd>

          <dt className="text-muted-foreground">הסכמה למסמך ממוחשב</dt>
          <dd>
            {status.consent_enforced
              ? 'נאכפת — מסמך ללקוח בלי הסכמה רשומה לא נשלח במייל'
              : 'רק מדווחת — מסמך נשלח גם ללקוח בלי הסכמה רשומה'}
          </dd>

          {on && (
            <>
              <dt className="text-muted-foreground">מסמכים</dt>
              <dd className="flex flex-wrap gap-x-4 gap-y-1">
                <span>נחתמו היום: <b>{status.counts.signed_today.toLocaleString('he-IL')}</b></span>
                <span className={status.counts.held ? 'text-destructive' : ''}>
                  ממתינים לחתימה או להסכמה: <b>{status.counts.held.toLocaleString('he-IL')}</b>
                </span>
                <span className={status.counts.paper_pending ? 'text-destructive' : ''}>
                  למסירה על נייר: <b>{status.counts.paper_pending.toLocaleString('he-IL')}</b>
                </span>
              </dd>
            </>
          )}
        </dl>
      )}

      {loadState === 'ready' && (on || configured) && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/signing-certificate" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-1">
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              עמוד התעודה הציבורי
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
