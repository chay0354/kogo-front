import AppLayout from '@/components/AppLayout';
import { BroadcastRunProvider } from '@/components/broadcast/BroadcastRunProvider';
import { BriefRunProvider } from '@/components/brief/BriefRunProvider';
import PageTransition from '@/components/PageTransition';
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
 *
 * The dissolve between screens wraps the reveal rather than sitting inside it,
 * so the reveal's root stays the direct parent of the page and the depths it
 * counts down from are the ones the pages were written against.
 *
 * A WhatsApp broadcast is held here as well, so it keeps going — minimised to
 * the corner — while the office moves between screens.
 *
 * The admin's type is named here too: the mark on the wrapper is what turns the
 * round pair on (globals.css, "the admin's type") — for these screens and for
 * whatever they open over the page — and leaves every customer page in Heebo.
 * The wrapper takes no box of its own, so the shell is laid out as before.
 */
export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-app-font="round" className="contents">
      <AppLayout>
        <BroadcastRunProvider>
          {/* The daily brief runs check by check; held here it survives leaving the screen. */}
          <BriefRunProvider>
            <PageTransition>
              <RevealChildren depths={[1, 2]}>{children}</RevealChildren>
            </PageTransition>
          </BriefRunProvider>
        </BroadcastRunProvider>
      </AppLayout>
    </div>
  );
}
