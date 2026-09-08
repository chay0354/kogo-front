import { redirect } from 'next/navigation';

export default function PaymentLinksRedirectPage() {
  redirect('/settings/payment-links');
}
