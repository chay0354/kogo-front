'use client';

import { useState, type ReactNode } from 'react';
import BodyPortal from '@/app/(crm)/invoices/BodyPortal';
import BusinessCustomerProfileDialog from '@/components/dialogs/BusinessCustomerProfileDialog';

/**
 * A business customer's name that opens their card (BusinessCustomerProfileDialog).
 *
 * Self-contained, so any list of merchants or tenants gets the card with one
 * line: `<BusinessCustomerCardButton customerId={id} name={name} />`. The
 * dialog mounts on the first click and stays mounted so its exit animation
 * plays, and it is drawn at the end of <body> (BodyPortal) so a table's
 * scroll box or an animated ancestor cannot clip it. Without an id it is just
 * the name.
 */
export default function BusinessCustomerCardButton({
  customerId,
  name,
  className,
  children,
}: {
  customerId: string | null | undefined;
  name: string;
  className?: string;
  /** What the button shows; the name when left out. */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const label = children ?? name;

  if (!customerId) return <span className={className}>{label}</span>;

  return (
    <>
      <button
        type="button"
        className={
          className
          ?? 'text-right font-semibold underline decoration-dotted underline-offset-4 hover:decoration-solid'
        }
        title="פתיחת כרטיס הלקוח"
        aria-haspopup="dialog"
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
      >
        {label}
        <span className="sr-only"> — פתיחת כרטיס הלקוח</span>
      </button>
      {mounted && (
        <BodyPortal>
          <BusinessCustomerProfileDialog
            customerId={customerId}
            isOpen={open}
            onClose={() => setOpen(false)}
            fallbackName={name}
          />
        </BodyPortal>
      )}
    </>
  );
}
