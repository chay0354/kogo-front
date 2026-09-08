import { redirect } from 'next/navigation';

/** Discounts moved under Settings → כספים; the old bookmark still lands there. */
export default function DiscountsRedirectPage() {
  redirect('/settings/finance');
}
