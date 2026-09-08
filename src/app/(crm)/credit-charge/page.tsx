import { redirect } from 'next/navigation';

/** Moved under Settings; the old bookmark still lands there. */
export default function RedirectPage() {
  redirect('/settings/billing');
}
