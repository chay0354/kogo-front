import { linkPreview } from '@/lib/linkPreview';

// The tenant's standing-order page, reached only by its token. The page owns
// its shell and styles; the layout only names the tab and the link's preview.
export const metadata = linkPreview({
  kind: 'card',
  title: 'הסדרת תשלום שכירות — קוגומלו',
  description: 'לחצו כדי לראות את פרטי התשלום החודשי ולהזין כרטיס בעמוד מאובטח.',
});

export default function RentalCardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
