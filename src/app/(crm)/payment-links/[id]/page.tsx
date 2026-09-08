import { redirect } from 'next/navigation';

export default function PaymentLinkRedirectPage({ params }: { params: { id: string } }) {
  redirect(`/settings/payment-links/${params.id}`);
}
