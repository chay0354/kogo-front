'use client';

import Link from 'next/link';
import { Contact } from 'lucide-react';
import { CUSTOMER_CARD_HINT, CUSTOMER_CARD_LABEL } from '@/lib/wahub/customerCard';
import s from '../wahub.module.css';
import { cx } from './tones';

/**
 * "לכרטיס הלקוח": one clear button that leaves the WhatsApp section for the
 * customer's card in the customers section. A link of the app's own router, so
 * the browser's "back" returns to the very conversation, lead or list it was
 * pressed from — each of them is in the address.
 *
 * Drawn only for somebody Kogo knows: whoever uses it passes the address, and
 * with none there is nothing to pass (lib/wahub/customerCard.ts).
 */
export default function CustomerCardLink({
  href,
  className,
  onClick,
}: {
  href: string;
  /** In place of the small button it is by default — a wider one among a lead's actions, a row of a menu. */
  className?: string;
  onClick?: () => void;
}) {
  return (
    <Link href={href} title={CUSTOMER_CARD_HINT} onClick={onClick} className={className ?? cx(s.btn, s.btnSm)}>
      <Contact aria-hidden="true" />
      {CUSTOMER_CARD_LABEL}
    </Link>
  );
}
