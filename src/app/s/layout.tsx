import type { Metadata } from 'next';
import '../widget/widget-shell.css';

export const metadata: Metadata = {
  title: 'חוזה שכירות — קוגומלו',
  // Reached only by its token; no search engine should list one.
  robots: { index: false, follow: false },
};

/**
 * The tenant's contract page sits outside the office shell, as /c/ does: no
 * AppLayout (so no login redirect) and no sidebar. The page owns its own shell
 * (header skirt, ground colour); the layout names the tab and brings the shared
 * overflow and focus rules.
 */
export default function SigningLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
