import '../widget/widget-shell.css';
import { linkPreview } from '@/lib/linkPreview';

// Reached only by its token; linkPreview keeps it out of search engines.
export const metadata = linkPreview({
  kind: 'sign',
  title: 'חוזה שכירות לחתימה — קוגומלו',
  description: 'לחצו כדי לקרוא את החוזה ולחתום עליו.',
});

/**
 * The tenant's contract page sits outside the office shell, as /c/ does: no
 * AppLayout (so no login redirect) and no sidebar. The page owns its own shell
 * (header skirt, ground colour); the layout names the tab and brings the shared
 * overflow and focus rules.
 */
export default function SigningLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
