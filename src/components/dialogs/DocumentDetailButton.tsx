'use client';

import { useState, type ReactNode } from 'react';
import BodyPortal from '@/app/(crm)/invoices/BodyPortal';
import DocumentSettlementsDialog from '@/components/dialogs/DocumentSettlementsDialog';
import type { CreditPrefill } from '@/lib/draftsAndCredits';

/**
 * A document number that opens its detail — balance and settlements
 * (DocumentSettlementsDialog). Same shape as BusinessCustomerCardButton: the
 * dialog mounts on the first click, stays mounted for its exit animation, and
 * is drawn at the end of <body>. Without an id it is just the number.
 */
export default function DocumentDetailButton({
  documentId,
  number,
  className,
  onChanged,
  onCredit,
  children,
}: {
  documentId: string | null | undefined;
  number: string;
  className?: string;
  /** After a settlement was voided — the list behind reloads its balances. */
  onChanged?: () => void;
  /** "זיכוי" in the detail of a tax invoice or invoice-receipt (the page opens the credit note). */
  onCredit?: (prefill: CreditPrefill) => void;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const label = children ?? number;

  if (!documentId) return <span className={className}>{label}</span>;

  return (
    <>
      <button
        type="button"
        className={
          className
          ?? 'text-right font-semibold underline decoration-dotted underline-offset-4 hover:decoration-solid'
        }
        title="פירוט המסמך: יתרה ומה סגר אותו"
        aria-haspopup="dialog"
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
      >
        {label}
        <span className="sr-only"> — פירוט המסמך</span>
      </button>
      {mounted && (
        <BodyPortal>
          <DocumentSettlementsDialog
            documentId={documentId}
            isOpen={open}
            onClose={() => setOpen(false)}
            fallbackNumber={number}
            onChanged={onChanged}
            onCredit={onCredit}
          />
        </BodyPortal>
      )}
    </>
  );
}
