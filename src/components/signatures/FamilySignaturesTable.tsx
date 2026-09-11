'use client';

import { Download, Eye, Loader2, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  FAMILY_SIGNATURES_EMPTY,
  formatSignedDate,
  formatSignedTime,
  signatureKindLabel,
  signatureTitle,
} from '@/lib/signatureUtils';
import type { SignatureSummary } from '@/types/signature';

export type FamilySignaturesStatus = 'loading' | 'ready' | 'error';

interface FamilySignaturesTableProps {
  status: FamilySignaturesStatus;
  signatures: ReadonlyArray<SignatureSummary>;
  /** The child whose card this is — named in bold among the children a signature covered. */
  childId: string;
  /** Signatures whose PDF is on its way down. */
  downloadingIds: ReadonlyArray<string>;
  onView: (signature: SignatureSummary) => void;
  onDownload: (signature: SignatureSummary) => void;
  onRetry: () => void;
}

/**
 * What the child's family signed, newest first: when, which document, and the
 * children it covered. Built like the card's documents table beside it, so the
 * two read as one section.
 */
export default function FamilySignaturesTable({
  status,
  signatures,
  childId,
  downloadingIds,
  onView,
  onDownload,
  onRetry,
}: FamilySignaturesTableProps) {
  if (status === 'error') {
    return (
      <div className="border rounded-lg px-4 py-6 text-center" role="alert">
        <p className="text-sm text-muted-foreground">לא ניתן היה לטעון את החתימות</p>
        <Button type="button" size="sm" variant="outline" className="mt-3" onClick={onRetry}>
          <RefreshCw className="h-3 w-3 ml-1" aria-hidden="true" />
          נסה שוב
        </Button>
      </div>
    );
  }
  if (status === 'ready' && signatures.length === 0) {
    return (
      <div className="border rounded-lg px-4 py-8 text-center text-muted-foreground">{FAMILY_SIGNATURES_EMPTY}</div>
    );
  }
  const loading = status === 'loading';
  return (
    <div className="border rounded-lg overflow-x-auto" aria-busy={loading || undefined}>
      <table className="w-full text-sm">
        <caption className="sr-only">{loading ? 'טוען חתימות' : 'מה המשפחה חתמה, מהחדש לישן'}</caption>
        <thead className="bg-muted/50">
          <tr>
            <th scope="col" className="p-3 text-right font-medium">נחתם</th>
            <th scope="col" className="p-3 text-right font-medium">מסמך</th>
            <th scope="col" className="p-3 text-right font-medium">ילדים</th>
            <th scope="col" className="p-3 text-right font-medium">חתם/ה</th>
            <th scope="col" className="p-3">
              <span className="sr-only">פעולות</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 2 }).map((_, row) => (
                <tr key={row} className="border-t">
                  <td className="px-3 py-2"><Skeleton className="h-4 w-24" /></td>
                  <td className="px-3 py-2"><Skeleton className="h-4 w-40" /></td>
                  <td className="px-3 py-2"><Skeleton className="h-4 w-28" /></td>
                  <td className="px-3 py-2"><Skeleton className="h-4 w-24" /></td>
                  <td className="px-3 py-2"><Skeleton className="h-9 w-40 rounded-lg" /></td>
                </tr>
              ))
            : signatures.map((signature) => {
                const downloading = downloadingIds.includes(signature.id);
                const title = signatureTitle(signature);
                const kind = signatureKindLabel(signature);
                return (
                  <tr key={signature.id} className="border-t">
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                      <div>{formatSignedDate(signature.signed_at) || '-'}</div>
                      <div className="text-xs text-muted-foreground">{formatSignedTime(signature.signed_at)}</div>
                    </td>
                    <td className="px-3 py-2 min-w-[10rem] break-words">
                      <div className="font-medium">{title}</div>
                      {kind !== title && <div className="text-xs text-muted-foreground">{kind}</div>}
                    </td>
                    <td className="px-3 py-2 min-w-[8rem] break-words">
                      {signature.children.length === 0
                        ? '-'
                        : signature.children.map((covered, index) => (
                            <span key={covered.id || index}>
                              {index > 0 && ', '}
                              <span className={covered.id === childId ? 'font-semibold' : undefined}>
                                {covered.full_name}
                              </span>
                            </span>
                          ))}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{signature.signer_name || '-'}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => onView(signature)}
                          title={`צפייה ב${title}`}
                        >
                          <Eye className="h-3 w-3 ml-1" aria-hidden="true" />
                          צפייה
                          <span className="sr-only"> ב{title}</span>
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className={`whitespace-nowrap ${downloading ? 'cursor-progress' : ''}`}
                          onClick={() => onDownload(signature)}
                          aria-busy={downloading || undefined}
                          title={`הורדת ${title} כ־PDF`}
                        >
                          {downloading ? (
                            <Loader2 className="h-3 w-3 ml-1 animate-spin" aria-hidden="true" />
                          ) : (
                            <Download className="h-3 w-3 ml-1" aria-hidden="true" />
                          )}
                          הורד PDF
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
        </tbody>
      </table>
    </div>
  );
}
