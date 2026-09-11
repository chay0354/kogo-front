'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Download, FileSignature, Loader2, RefreshCw } from 'lucide-react';

import { Dialog, DialogCloseButton, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { downloadSignaturePdf, fetchSignature } from '@/lib/signaturesApi';
import {
  consentRows,
  formatSignedAt,
  safeSignatureImage,
  signatureChildrenLabel,
  signatureKindLabel,
  signatureParagraphs,
  signaturePdfError,
  signatureTitle,
  type ConsentRow,
} from '@/lib/signatureUtils';
import type { SignatureDetail, SignatureSummary } from '@/types/signature';

type LoadStatus = 'loading' | 'ready' | 'error';

interface SignatureViewDialogProps {
  /**
   * The row it was opened from, or null to close. Its own fields show at once;
   * the text, the image and where it was signed from load behind them.
   */
  signature: SignatureSummary | null;
  onClose: () => void;
}

const MARK_CLASS: Record<ConsentRow['state'], string> = {
  given: 'bg-emerald-50 text-emerald-700',
  refused: 'bg-rose-50 text-rose-700',
  absent: 'bg-muted text-muted-foreground',
};

const STATE_TEXT: Record<ConsentRow['state'], string> = {
  given: 'אושר',
  refused: 'לא אושר',
  absent: 'לא נכלל במסמך',
};

/**
 * One signature as it was signed: the text, the drawn signature, the consents
 * and the moment — and its PDF. The customer card and the history page open
 * the same dialog, so what the office sees does not depend on where it asked.
 */
export default function SignatureViewDialog({ signature, onClose }: SignatureViewDialogProps) {
  const open = Boolean(signature);
  const id = signature?.id ?? '';
  const [detail, setDetail] = useState<SignatureDetail | null>(null);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const request = useRef(0);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  // An answer that lands after another signature was opened — or after this
  // one was closed — is dropped, so one signature's text never shows under
  // another's name.
  const load = useCallback(async (signatureId: string) => {
    const current = ++request.current;
    setStatus('loading');
    try {
      const next = await fetchSignature(signatureId);
      if (current !== request.current) return;
      setDetail(next);
      setStatus('ready');
    } catch (error) {
      if (current !== request.current) return;
      console.error('Error loading the signature:', error);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    if (!open || !id) {
      request.current += 1;
      return;
    }
    setDownloadError('');
    void load(id);
  }, [open, id, load]);

  const loaded = detail && detail.id === id ? detail : null;
  const head: SignatureSummary | null = loaded ?? signature;

  const handleDownload = async () => {
    if (!head || downloading) return;
    setDownloading(true);
    setDownloadError('');
    try {
      await downloadSignaturePdf(head);
    } catch (error) {
      setDownloadError(signaturePdfError(error));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="max-w-2xl" dir="rtl">
        {head && (
          <>
            <div className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-6 sm:pt-6">
              <DialogHeader className="min-w-0">
                <DialogTitle className="flex items-center gap-2 text-lg">
                  <FileSignature className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  <span className="break-words">{signatureTitle(head)}</span>
                </DialogTitle>
                <DialogDescription>
                  {signatureKindLabel(head)} · נחתם {formatSignedAt(head.signed_at) || '—'}
                </DialogDescription>
              </DialogHeader>
              <DialogCloseButton />
            </div>

            <div className="space-y-5 px-4 py-4 sm:px-6">
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-lg bg-muted/50 p-4 text-sm sm:grid-cols-2">
                <Fact label="חתם/ה">
                  {head.signer_name || '—'}
                  {head.signer_id_number && (
                    <span className="mr-1 text-muted-foreground">· ת״ז {head.signer_id_number}</span>
                  )}
                </Fact>
                <Fact label="מועד החתימה">
                  <span className="tabular-nums">{formatSignedAt(head.signed_at) || '—'}</span>
                </Fact>
                <Fact label="משפחה">{head.family_name || '—'}</Fact>
                <Fact label="ילדים">{signatureChildrenLabel(head.children)}</Fact>
                <Fact label="סניף">{head.branch_name || '—'}</Fact>
              </dl>

              <section aria-labelledby="signature-consents-title">
                <h3 id="signature-consents-title" className="mb-2 font-semibold">
                  הסכמות
                </h3>
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {consentRows(head.consents).map((row) => (
                    <li
                      key={row.key}
                      className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                      title={row.description}
                    >
                      <span
                        aria-hidden="true"
                        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-bold ${MARK_CLASS[row.state]}`}
                      >
                        {row.mark}
                      </span>
                      <span className="font-medium">{row.label}</span>
                      <span className="sr-only">: {STATE_TEXT[row.state]}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section aria-labelledby="signature-text-title">
                <h3 id="signature-text-title" className="mb-2 font-semibold">
                  הטקסט כפי שנחתם
                </h3>
                {status === 'error' && !loaded ? (
                  <LoadFailed onRetry={() => void load(id)} />
                ) : !loaded ? (
                  <div className="space-y-2 rounded-lg border p-4" aria-busy="true" aria-label="טוען את הטקסט">
                    <Skeleton className="h-4 w-11/12" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-10/12" />
                    <Skeleton className="h-4 w-9/12" />
                  </div>
                ) : (
                  <SignedText paragraphs={signatureParagraphs(loaded.document_text)} />
                )}
              </section>

              <section aria-labelledby="signature-image-title">
                <h3 id="signature-image-title" className="mb-2 font-semibold">
                  החתימה
                </h3>
                {status === 'error' && !loaded ? null : !loaded ? (
                  <Skeleton className="h-32 w-full rounded-lg" />
                ) : (
                  <SignatureImage src={safeSignatureImage(loaded.signature_image)} signer={head.signer_name} />
                )}
              </section>

              {loaded && (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer select-none font-medium">פרטים טכניים</summary>
                  <dl className="mt-2 space-y-1.5">
                    <div className="flex flex-wrap gap-x-2">
                      <dt>כתובת IP:</dt>
                      <dd dir="ltr" className="font-mono">{loaded.ip_address || '—'}</dd>
                    </div>
                    <div className="flex flex-wrap gap-x-2">
                      <dt>דפדפן:</dt>
                      <dd dir="ltr" className="break-all">{loaded.user_agent || '—'}</dd>
                    </div>
                    <div className="flex flex-wrap gap-x-2">
                      <dt>טביעת המסמך (SHA-256):</dt>
                      <dd dir="ltr" className="break-all font-mono">{loaded.document_sha256 || '—'}</dd>
                    </div>
                  </dl>
                </details>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t px-4 py-3 sm:px-6">
              {downloadError && (
                <p role="alert" className="ml-auto text-sm text-rose-700">
                  {downloadError}
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={downloading ? 'cursor-progress' : ''}
                onClick={() => void handleDownload()}
                aria-busy={downloading || undefined}
              >
                {downloading ? (
                  <Loader2 className="ml-1 h-3 w-3 animate-spin" aria-hidden="true" />
                ) : (
                  <Download className="ml-1 h-3 w-3" aria-hidden="true" />
                )}
                הורד PDF
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 sm:block">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

/** Each paragraph a text node — the signed text is never markup, whatever it contains. */
function SignedText({ paragraphs }: { paragraphs: string[] }) {
  if (paragraphs.length === 0) {
    return (
      <div className="rounded-lg border px-4 py-6 text-center text-sm text-muted-foreground">
        הטקסט לא נשמר עם החתימה
      </div>
    );
  }
  return (
    <div
      className="max-h-80 space-y-3 overflow-y-auto rounded-lg border bg-white p-4 text-sm leading-relaxed"
      tabIndex={0}
      aria-label="הטקסט שנחתם"
    >
      {paragraphs.map((paragraph, index) => (
        <p key={index} className="whitespace-pre-line break-words">
          {paragraph}
        </p>
      ))}
    </div>
  );
}

function SignatureImage({ src, signer }: { src: string | null; signer: string }) {
  if (!src) {
    return (
      <div className="rounded-lg border px-4 py-6 text-center text-sm text-muted-foreground">
        תמונת החתימה לא נשמרה
      </div>
    );
  }
  return (
    <div className="flex justify-center rounded-lg border bg-white p-3">
      {/* A data URL drawn in the widget: next/image has nothing to optimise here. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={signer ? `החתימה של ${signer}` : 'החתימה'} className="max-h-40 w-auto max-w-full" />
    </div>
  );
}

function LoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-lg border px-4 py-6 text-center" role="alert">
      <p className="text-sm text-muted-foreground">לא ניתן היה לטעון את החתימה</p>
      <Button type="button" size="sm" variant="outline" className="mt-3" onClick={onRetry}>
        <RefreshCw className="ml-1 h-3 w-3" aria-hidden="true" />
        נסה שוב
      </Button>
    </div>
  );
}
