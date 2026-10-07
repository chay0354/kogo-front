'use client';

import { useEffect, useRef, useState } from 'react';
import { BadgeCheck, Download, ExternalLink, Loader2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { fetchDocumentPdf, fetchLessonReceiptCopy, saveBlob } from '@/lib/documentsApi';
import { fetchSignedOriginalFile } from '@/lib/signingApi';
import { fetchStoreInvoicePdf } from '@/lib/storeApi';
import { documentDownloadRoute } from './documentDownload';
import {
  COPY_HAS_NO_SEAL,
  hasSignedOriginal,
  signatureLine,
  viewFilename,
  type ViewEdition,
} from './documentView';
import styles from './documentsTab.module.css';
import type { DocumentRow } from './types';

interface DocumentViewDialogProps {
  /** The row to show, or null while the window is closed. */
  doc: DocumentRow | null;
  onClose: () => void;
}

/** The copy the page hands out for this row, as a file in hand. */
async function fetchCopy(doc: DocumentRow): Promise<Blob> {
  const route = documentDownloadRoute(doc);
  if (!route || route.kind === 'url') throw new Error('אין קובץ להצגה למסמך הזה');
  if (route.kind === 'store') return fetchStoreInvoicePdf(route.id);
  if (route.kind === 'lesson_receipt') return fetchLessonReceiptCopy(route.id);
  return fetchDocumentPdf(route.id);
}

/**
 * A document on the screen, without downloading it (owner, 7.10.2026).
 *
 * Opens on the copy. When the document was signed, the window says so with the
 * moment of signing, and "המקור החתום" shows the signed file itself — the one
 * that carries the seal. Either file can still be saved or opened in a tab of
 * its own from here.
 */
export default function DocumentViewDialog({ doc, onClose }: DocumentViewDialogProps) {
  const [edition, setEdition] = useState<ViewEdition>('copy');
  const [file, setFile] = useState<{ blob: Blob; url: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const latest = useRef(0);

  // Another row opens on its copy.
  useEffect(() => {
    setEdition('copy');
  }, [doc?.id]);

  useEffect(() => {
    if (!doc) {
      setFile(null);
      setError('');
      return undefined;
    }
    const request = ++latest.current;
    let url = '';
    setLoading(true);
    setError('');
    setFile(null);
    const wanted = edition === 'original' && doc.signed_original_id
      ? fetchSignedOriginalFile(doc.signed_original_id).then((signed) => signed.pdf)
      : fetchCopy(doc);
    wanted
      .then((blob) => {
        if (request !== latest.current) return;
        url = window.URL.createObjectURL(blob);
        setFile({ blob, url });
      })
      .catch((err: unknown) => {
        if (request !== latest.current) return;
        const message = err instanceof Error && err.message ? err.message : '';
        setError(message || 'לא הצלחנו לטעון את המסמך');
      })
      .finally(() => {
        if (request === latest.current) setLoading(false);
      });
    return () => {
      // The file was only ever in this window: let go of it with the window.
      latest.current += 1;
      if (url) window.URL.revokeObjectURL(url);
    };
    // The row is the same row while its id is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id, edition]);

  if (!doc) return null;
  const signed = hasSignedOriginal(doc);
  const line = signatureLine(doc);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className={`max-w-4xl ${styles.viewDialog}`}>
        <DialogHeader className={styles.viewHead}>
          <div className={styles.viewTitleRow}>
            <DialogTitle className={styles.viewTitle}>
              {doc.document_type} <span dir="ltr">{doc.document_number}</span>
            </DialogTitle>
            <button type="button" className={styles.iconBtn} aria-label="סגירה" title="סגירה" onClick={onClose}>
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          {line && (
            <p className={styles.viewSigned}>
              <BadgeCheck size={16} aria-hidden="true" />
              <span>{line}</span>
            </p>
          )}
          {signed && (
            <div className={styles.viewEditions} role="tablist" aria-label="איזה קובץ להציג">
              <button
                type="button"
                role="tab"
                aria-selected={edition === 'copy'}
                className={`${styles.viewEdition} ${edition === 'copy' ? styles.viewEditionOn : ''}`}
                onClick={() => setEdition('copy')}
              >
                העתק
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={edition === 'original'}
                className={`${styles.viewEdition} ${edition === 'original' ? styles.viewEditionOn : ''}`}
                onClick={() => setEdition('original')}
              >
                המקור החתום
              </button>
            </div>
          )}
          {signed && edition === 'copy' && <p className={styles.viewHint}>{COPY_HAS_NO_SEAL}</p>}
        </DialogHeader>

        <div className={styles.viewBody}>
          {loading && (
            <div className={styles.viewState} role="status">
              <Loader2 size={20} className="animate-spin" aria-hidden="true" />
              <span>טוען את המסמך…</span>
            </div>
          )}
          {!loading && error && (
            <div className={styles.viewState} role="alert">{error}</div>
          )}
          {!loading && !error && file && (
            <iframe
              key={file.url}
              className={styles.viewFrame}
              src={file.url}
              title={`${doc.document_type} ${doc.document_number}`}
            />
          )}
        </div>

        <div className={styles.viewFoot}>
          <button
            type="button"
            className={styles.viewAction}
            disabled={!file}
            onClick={() => file && window.open(file.url, '_blank', 'noopener,noreferrer')}
          >
            <ExternalLink size={15} aria-hidden="true" />
            פתיחה בלשונית
          </button>
          <button
            type="button"
            className={styles.viewAction}
            disabled={!file}
            onClick={() => file && saveBlob(file.blob, 'application/pdf', viewFilename(doc.document_number, edition))}
          >
            <Download size={15} aria-hidden="true" />
            הורדה
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
