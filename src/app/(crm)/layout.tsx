import AppLayout from '@/components/AppLayout';
import RevealChildren from '@/components/RevealChildren';

/**
 * The office shell, held above the pages that sit in it.
 *
 * A route group leaves every URL untouched, so the pages below keep the paths
 * the office has bookmarked. What changes is that React now keeps this subtree
 * mounted across a navigation: the sidebar is the same DOM node from one screen
 * to the next rather than being torn down and built again.
 *
 * The entrance motion is applied here too, so a page written from now on gets
 * it without having to ask. A page's own blocks sit one level below the wrapper
 * and the cards of a grid one below that.
 */
export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppLayout>
      <RevealChildren depths={[1, 2]}>{children}</RevealChildren>
    </AppLayout>
  );
}
