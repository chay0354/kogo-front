import '../widget/widget-shell.css';
import { linkPreview } from '@/lib/linkPreview';

export const metadata = linkPreview({
  kind: 'card',
  title: 'השלמת הרשמה ותשלום — קוגומלו',
  description: 'לחצו כדי לראות את פרטי החיוב ולהזין כרטיס בעמוד מאובטח.',
});

// The page owns its own shell (header skirt, ground colour), so the layout only
// names the tab and brings the shared overflow/focus rules.
export default function CardLinkLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
