import '../widget/widget-shell.css';
import { linkPreview } from '@/lib/linkPreview';

export const metadata = linkPreview({
  kind: 'card',
  title: 'השלמת הרשמה ותשלום — קוגומלו',
  description: 'לחצו כדי לראות את פרטי החיוב ולהזין כרטיס בעמוד מאובטח.',
});

export default function ShortCardLinkLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
