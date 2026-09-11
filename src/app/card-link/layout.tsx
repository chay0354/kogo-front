import '../widget/widget-shell.css';

export const metadata = { title: 'הזנת כרטיס — קוגומלו' };

// The page owns its own shell (header skirt, ground colour), so the layout only
// names the tab and brings the shared overflow/focus rules.
export default function CardLinkLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
