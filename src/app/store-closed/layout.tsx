import '../widget/widget-shell.css';

// Public, no CRM shell: the page brings its own header, like the card link page.
export default function StoreClosedLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
